import * as GLOBAL_CONSTANTS from '@/constants'

const SMART_LAYOUTS = {
  1: GLOBAL_CONSTANTS.LAYOUT_1X1,
  2: GLOBAL_CONSTANTS.LAYOUT_1x2,
  3: GLOBAL_CONSTANTS.LAYOUT_1X3,
  4: GLOBAL_CONSTANTS.LAYOUT_2X2
}

export function getSmartLayout(size, fallbackLayout) {
  return SMART_LAYOUTS[Number(size)] || fallbackLayout
}

export function getLayoutMetrics(layout = GLOBAL_CONSTANTS.DEFAULT_LAYOUTS[0]) {
  const [rows = 1, columns = 1] = String(layout)
    .split('x')
    .map((value) => Number.parseInt(value, 10) || 1)

  return {
    rows,
    columns,
    groupCount: rows * columns
  }
}

export function getGridStyle(layout, gap = 0) {
  const { rows, columns } = getLayoutMetrics(layout)

  return {
    display: 'grid',
    gridTemplateRows: `repeat(${rows}, 1fr)`,
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: `${gap} ${gap}`
  }
}

export function ensureUniqueCanvasNames(canvasList = [], delimiter = GLOBAL_CONSTANTS.DELIMITER) {
  if (!Array.isArray(canvasList) || canvasList.length < 2) {
    return canvasList
  }

  const hasUniqueNames = () => new Set(canvasList.map((canvas) => canvas.name)).size === canvasList.length

  let depth = 2
  while (!hasUniqueNames()) {
    canvasList.forEach((canvas) => {
      canvas.name = canvas.path.split(delimiter).slice(-depth).join('-')
    })
    depth += 1
  }

  return canvasList
}
