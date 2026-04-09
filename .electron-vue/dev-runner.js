'use strict';

process.env.NODE_ENV = 'development';

require('./node22-compat');

const chalk = require('chalk');
const electron = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const config = require('../config');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const webpackHotMiddleware = require('webpack-hot-middleware');
const Portfinder = require('portfinder');

const mainConfig = require('./webpack.main.config');
const rendererConfig = require('./webpack.renderer.config');

let electronProcess = null;
let manualRestart = false;
let hotMiddleware;
const verboseLogs = process.env.MEGSPOT_VERBOSE_LOGS === '1';

function formatStatsSummary(stats) {
  const info = stats.toJson({
    all: false,
    builtAt: true,
    errors: true,
    timings: true,
    warnings: true
  });

  const summary = [];
  if (typeof info.time === 'number') {
    summary.push(`built in ${info.time}ms`);
  }
  if (info.errors && info.errors.length) {
    summary.push(`${info.errors.length} error(s)`);
  }
  if (info.warnings && info.warnings.length) {
    summary.push(`${info.warnings.length} warning(s)`);
  }

  return {
    errors: info.errors || [],
    summary: summary.join(', ') || 'build finished',
    warnings: info.warnings || []
  };
}

function logStats(proc, data) {
  let log = '';

  log += chalk.yellow.bold(
    `┏ ${proc} ${config.dev.chineseLog ? '编译过程' : 'Process'} ${new Array(
      19 - proc.length + 1
    ).join('-')}`
  );
  log += '\n\n';

  if (typeof data === 'object') {
    const { errors, summary, warnings } = formatStatsSummary(data);

    log += `  ${summary}\n`;

    if (verboseLogs || errors.length || warnings.length) {
      log += '\n';
      data
        .toString({
          assets: false,
          children: false,
          chunks: false,
          colors: true,
          entrypoints: false,
          modules: false
        })
        .split(/\r?\n/)
        .forEach(line => {
          if (line.trim()) {
            log += '  ' + line + '\n';
          }
        });
    }
  } else {
    log += `  ${data}\n`;
  }

  log += '\n' + chalk.yellow.bold(`┗ ${new Array(28 + 1).join('-')}`) + '\n';
  console.log(log);
}

function removeJunk(chunk) {
  if (config.dev.removeElectronJunk) {
    // Example: 2018-08-10 22:48:42.866 Electron[90311:4883863] *** WARNING: Textured window <AtomNSWindow: 0x7fb75f68a770>
    if (
      /\d+-\d+-\d+ \d+:\d+:\d+\.\d+ Electron(?: Helper)?\[\d+:\d+] /.test(chunk)
    ) {
      return false;
    }

    // Example: [90789:0810/225804.894349:ERROR:CONSOLE(105)] "Uncaught (in promise) Error: Could not instantiate: ProductRegistryImpl.Registry", source: chrome-devtools://devtools/bundled/inspector.js (105)
    if (/\[\d+:\d+\/|\d+\.\d+:ERROR:CONSOLE\(\d+\)\]/.test(chunk)) {
      return false;
    }

    // Example: ALSA lib confmisc.c:767:(parse_card) cannot find card '0'
    if (/ALSA lib [a-z]+\.c:\d+:\([a-z_]+\)/.test(chunk)) {
      return false;
    }

    if (/Debugger listening on ws:\/\//.test(chunk)) {
      return false;
    }

    if (/For help, see: https:\/\/nodejs\.org\/en\/docs\/inspector/.test(chunk)) {
      return false;
    }

    if (/ExtensionLoadWarning/.test(chunk)) {
      return false;
    }

    if (/Manifest version 2 is deprecated/.test(chunk)) {
      return false;
    }

    if (/electron --trace-warnings/.test(chunk)) {
      return false;
    }

    if (/MESA-LOADER: failed to open dri:/.test(chunk)) {
      return false;
    }
  }

  return chunk;
}

function startRenderer() {
  return new Promise((resolve, reject) => {
    rendererConfig.mode = 'development';
    Portfinder.basePort = config.dev.port || 9080;
    Portfinder.getPort((err, port) => {
      if (err) {
        reject('PortError:' + err);
      } else {
        const compiler = webpack(rendererConfig);
        hotMiddleware = webpackHotMiddleware(compiler, {
          log: false,
          heartbeat: 2500
        });

        compiler.hooks.afterEmit.tap('afterEmit', () => {
          hotMiddleware.publish({
            action: 'reload'
          });
        });

        compiler.hooks.done.tap('done', stats => {
          logStats('Renderer', stats);
        });

        const server = new WebpackDevServer(compiler, {
          clientLogLevel: 'silent',
          contentBase: path.join(__dirname, '../'),
          noInfo: true,
          quiet: true,
          stats: 'errors-only',
          before(app, ctx) {
            app.use(hotMiddleware);
            ctx.middleware.waitUntilValid(() => {
              resolve();
            });
          }
        });

        process.env.PORT = port;
        server.listen(port);
      }
    });
  });
}

function startMain() {
  return new Promise(resolve => {
    mainConfig.mode = 'development';
    const compiler = webpack(mainConfig);

    compiler.hooks.watchRun.tapAsync('watch-run', (compilation, done) => {
      logStats(
        `${config.dev.chineseLog ? '主进程' : 'Main'}`,
        chalk.white.bold(
          `${config.dev.chineseLog ? '正在处理资源文件...' : 'compiling...'}`
        )
      );
      hotMiddleware.publish({
        action: 'compiling'
      });
      done();
    });

    compiler.watch({}, (err, stats) => {
      if (err) {
        console.log(err);
        return;
      }

      logStats(`${config.dev.chineseLog ? '主进程' : 'Main'}`, stats);

      if (electronProcess && electronProcess.kill) {
        manualRestart = true;
        process.kill(electronProcess.pid);
        electronProcess = null;
        startElectron();

        setTimeout(() => {
          manualRestart = false;
        }, 5000);
      }

      resolve();
    });
  });
}

function startElectron() {
  var args = [
    '--inspect=5858',
    path.join(__dirname, '../dist/electron/main.js')
  ];
  // detect yarn or npm and process commandline args accordingly
  if (process.env.npm_execpath.endsWith('yarn.js')) {
    args = args.concat(process.argv.slice(3));
  } else if (process.env.npm_execpath.endsWith('npm-cli.js')) {
    args = args.concat(process.argv.slice(2));
  }

  const childEnv = { ...process.env };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  electronProcess = spawn(electron, args, { env: childEnv });

  electronProcess.stdout.on('data', data => {
    electronLog(removeJunk(data), 'blue');
  });
  electronProcess.stderr.on('data', data => {
    electronLog(removeJunk(data), 'red');
  });

  electronProcess.on('close', () => {
    if (!manualRestart) process.exit();
  });
}

function electronLog(data, color) {
  if (data) {
    let log = '';
    data = data.toString().split(/\r?\n/);
    data.forEach(line => {
      log += `  ${line}\n`;
    });
    if (/[0-9A-z]+/.test(log)) {
      console.log(
        chalk[color].bold(
          `┏ ${
            config.dev.chineseLog ? '主程序日志' : 'Electron'
          } -------------------`
        ) +
          '\n\n' +
          log +
          chalk[color].bold('┗ ----------------------------') +
          '\n'
      );
    }
  }
}

async function init() {
  try {
    await startRenderer();
    await startMain();
    await startElectron();
  } catch (error) {
    console.error(error);
  }
}

init();
