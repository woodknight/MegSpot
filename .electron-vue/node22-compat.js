'use strict';

const crypto = require('crypto');

const originalCreateHash = crypto.createHash;
const nodeMajor = Number(process.versions.node.split('.')[0]);

if (nodeMajor >= 17) {
  crypto.createHash = function patchedCreateHash(algorithm, options) {
    if (algorithm === 'md4') {
      return originalCreateHash.call(this, 'sha256', options);
    }

    return originalCreateHash.call(this, algorithm, options);
  };
}
