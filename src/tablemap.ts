// 由于处理跨行和跨列的单元格并不简单，
// 这段代码为给定的表格节点构建一个描述性结构。
// 这些结构以（持久的）表格节点为键进行缓存，
// 这样只有在表格内容发生变化时才需要重新计算。
//
// 这意味着它们必须存储相对于表格的位置，而不是相对于文档的位置。
// 因此使用这些结构的代码通常会计算表格的起始位置，
// 并通过该数值偏移传递给此结构或从此结构获取的位置。
import { Attrs, Node } from 'prosemirror-model'
import { CellAttrs } from './util'

/**
 * @public
 */
export type ColWidths = number[]

/**
 * @public
 */
export type Problem =
  | {
      type: 'colwidth mismatch' // 列宽不匹配
      pos: number
      colwidth: ColWidths
    }
  | {
      type: 'collision' // 单元格碰撞
      pos: number
      row: number
      n: number
    }
  | {
      type: 'missing' // 缺失单元格
      row: number
      n: number
    }
  | {
      type: 'overlong_rowspan' // 行跨度过长
      pos: number
      n: number
    }
  | {
      type: 'zero_sized' // 零尺寸表格
    }

let readFromCache: (key: Node) => TableMap | undefined
let addToCache: (key: Node, value: TableMap) => TableMap

// 优先使用弱映射缓存表格映射。如果不支持，则回退到固定大小的缓存。
if (typeof WeakMap != 'undefined') {
  // eslint-disable-next-line
  let cache = new WeakMap<Node, TableMap>()
  readFromCache = (key) => cache.get(key)
  addToCache = (key, value) => {
    cache.set(key, value)
    return value
  }
} else {
  const cache: (Node | TableMap)[] = []
  const cacheSize = 10
  let cachePos = 0
  readFromCache = (key) => {
    for (let i = 0; i < cache.length; i += 2) if (cache[i] == key) return cache[i + 1] as TableMap
  }
  addToCache = (key, value) => {
    if (cachePos == cacheSize) cachePos = 0
    cache[cachePos++] = key
    return (cache[cachePos++] = value)
  }
}

/**
 * @public
 */
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * 表格映射描述给定表格的结构。为避免
 * 频繁重新计算，它们按表格节点进行缓存。为了
 * 能够做到这一点，保存在映射中的位置是相对于表格的开始，
 * 而不是相对于文档的开始。
 *
 * @public
 */
export class TableMap {
  constructor(
    /**
     * 列数
     */
    public width: number,
    /**
     * 行数
     */
    public height: number,
    /**
     * 一个 width * height 大小的数组，每个位置存储
     * 覆盖表格该部分的单元格的起始位置
     */
    public map: number[],
    /**
     * 表格的可选问题数组（单元格重叠或非矩形形状），
     * 用于表格规范化器。
     */
    public problems: Problem[] | null,
  ) {}

  /**
   * 查找给定位置的单元格的尺寸。
   * @param pos 单元格位置
   * @returns 单元格的矩形区域
   */
  findCell(pos: number): Rect {
    for (let i = 0; i < this.map.length; i++) {
      const curPos = this.map[i]
      if (curPos != pos) continue

      const left = i % this.width
      const top = (i / this.width) | 0
      let right = left + 1
      let bottom = top + 1

      for (let j = 1; right < this.width && this.map[i + j] == curPos; j++) {
        right++
      }
      for (let j = 1; bottom < this.height && this.map[i + this.width * j] == curPos; j++) {
        bottom++
      }

      return { left, top, right, bottom }
    }
    throw new RangeError(`No cell with offset ${pos} found`)
  }

  /**
   * 查找给定位置单元格的左侧位置（列索引）。
   * @param pos 单元格位置
   * @returns 列索引
   */
  colCount(pos: number): number {
    for (let i = 0; i < this.map.length; i++) {
      if (this.map[i] == pos) {
        return i % this.width
      }
    }
    throw new RangeError(`No cell with offset ${pos} found`)
  }

  /**
   * 从位置 `pos` 处的单元格开始，查找给定方向上的下一个单元格（如果有）。
   * @param pos 当前单元格位置
   * @param axis 轴向 ('horiz'水平 或 'vert'垂直)
   * @param dir 方向（负数表示左/上，正数表示右/下）
   * @returns 下一个单元格的位置或null
   */
  nextCell(pos: number, axis: 'horiz' | 'vert', dir: number): null | number {
    const { left, right, top, bottom } = this.findCell(pos)
    if (axis == 'horiz') {
      if (dir < 0 ? left == 0 : right == this.width) return null
      return this.map[top * this.width + (dir < 0 ? left - 1 : right)]
    } else {
      if (dir < 0 ? top == 0 : bottom == this.height) return null
      return this.map[left + this.width * (dir < 0 ? top - 1 : bottom)]
    }
  }

  /**
   * 获取跨越两个给定单元格的矩形区域。
   * @param a 第一个单元格位置
   * @param b 第二个单元格位置
   * @returns 包含两个单元格的矩形区域
   */
  rectBetween(a: number, b: number): Rect {
    const { left: leftA, right: rightA, top: topA, bottom: bottomA } = this.findCell(a)
    const { left: leftB, right: rightB, top: topB, bottom: bottomB } = this.findCell(b)
    return {
      left: Math.min(leftA, leftB),
      top: Math.min(topA, topB),
      right: Math.max(rightA, rightB),
      bottom: Math.max(bottomA, bottomB),
    }
  }

  /**
   * 返回给定矩形区域内左上角的所有单元格的位置。
   * @param rect 矩形区域
   * @returns 单元格位置数组
   */
  cellsInRect(rect: Rect): number[] {
    const result: number[] = []
    const seen: Record<number, boolean> = {}
    for (let row = rect.top; row < rect.bottom; row++) {
      for (let col = rect.left; col < rect.right; col++) {
        const index = row * this.width + col
        const pos = this.map[index]

        if (seen[pos]) continue
        seen[pos] = true

        if ((col == rect.left && col && this.map[index - 1] == pos) || (row == rect.top && row && this.map[index - this.width] == pos)) {
          continue
        }
        result.push(pos)
      }
    }
    return result
  }

  /**
   * 返回给定行和列处的单元格开始的位置，或者如果单元格在那里开始，会是什么位置。
   * @param row 行索引
   * @param col 列索引
   * @param table 表格节点
   * @returns 单元格的位置
   */
  positionAt(row: number, col: number, table: Node): number {
    for (let i = 0, rowStart = 0; ; i++) {
      const rowEnd = rowStart + table.child(i).nodeSize
      if (i == row) {
        let index = col + row * this.width
        const rowEndIndex = (row + 1) * this.width
        // 跳过来自前面行的单元格（通过rowspan）
        while (index < rowEndIndex && this.map[index] < rowStart) index++
        return index == rowEndIndex ? rowEnd - 1 : this.map[index]
      }
      rowStart = rowEnd
    }
  }

  /**
   * 查找给定表格节点的表格映射。
   * @param table 表格节点
   * @returns 表格映射
   */
  static get(table: Node): TableMap {
    return readFromCache(table) || addToCache(table, computeMap(table))
  }
}

/**
 * 计算表格映射。
 * @param table 表格节点
 * @returns 表格映射
 */
function computeMap(table: Node): TableMap {
  if (table.type.spec.tableRole != 'table') throw new RangeError('Not a table node: ' + table.type.name)
  const width = findWidth(table),
    height = table.childCount
  const map = []
  let mapPos = 0
  let problems: Problem[] | null = null
  const colWidths: ColWidths = []
  for (let i = 0, e = width * height; i < e; i++) map[i] = 0

  for (let row = 0, pos = 0; row < height; row++) {
    const rowNode = table.child(row)
    pos++
    for (let i = 0; ; i++) {
      while (mapPos < map.length && map[mapPos] != 0) mapPos++
      if (i == rowNode.childCount) break
      const cellNode = rowNode.child(i)
      const { colspan, rowspan, colwidth } = cellNode.attrs
      for (let h = 0; h < rowspan; h++) {
        if (h + row >= height) {
          if (!problems) {
            problems = []
          }
          problems.push({
            type: 'overlong_rowspan',
            pos,
            n: rowspan - h,
          })
          break
        }
        const start = mapPos + h * width
        for (let w = 0; w < colspan; w++) {
          if (map[start + w] == 0) map[start + w] = pos
          else
            (problems || (problems = [])).push({
              type: 'collision',
              row,
              pos,
              n: colspan - w,
            })
          const colW = colwidth && colwidth[w]
          if (colW) {
            const widthIndex = ((start + w) % width) * 2,
              prev = colWidths[widthIndex]
            if (prev == null || (prev != colW && colWidths[widthIndex + 1] == 1)) {
              colWidths[widthIndex] = colW
              colWidths[widthIndex + 1] = 1
            } else if (prev == colW) {
              colWidths[widthIndex + 1]++
            }
          }
        }
      }
      mapPos += colspan
      pos += cellNode.nodeSize
    }
    const expectedPos = (row + 1) * width
    let missing = 0
    while (mapPos < expectedPos) if (map[mapPos++] == 0) missing++
    if (missing) (problems || (problems = [])).push({ type: 'missing', row, n: missing })
    pos++
  }

  if (width === 0 || height === 0) (problems || (problems = [])).push({ type: 'zero_sized' })

  const tableMap = new TableMap(width, height, map, problems)
  let badWidths = false

  // 对于有定义宽度的列，但其宽度在不同行之间不一致，
  // 修复那些宽度与计算出的宽度不匹配的单元格。
  for (let i = 0; !badWidths && i < colWidths.length; i += 2) if (colWidths[i] != null && colWidths[i + 1] < height) badWidths = true
  if (badWidths) findBadColWidths(tableMap, colWidths, table)

  return tableMap
}

/**
 * 查找表格的宽度（列数）。
 * @param table 表格节点
 * @returns 表格宽度
 */
function findWidth(table: Node): number {
  let width = -1
  let hasRowSpan = false
  for (let row = 0; row < table.childCount; row++) {
    const rowNode = table.child(row)
    let rowWidth = 0
    if (hasRowSpan)
      for (let j = 0; j < row; j++) {
        const prevRow = table.child(j)
        for (let i = 0; i < prevRow.childCount; i++) {
          const cell = prevRow.child(i)
          if (j + cell.attrs.rowspan > row) rowWidth += cell.attrs.colspan
        }
      }
    for (let i = 0; i < rowNode.childCount; i++) {
      const cell = rowNode.child(i)
      rowWidth += cell.attrs.colspan
      if (cell.attrs.rowspan > 1) hasRowSpan = true
    }
    if (width == -1) width = rowWidth
    else if (width != rowWidth) width = Math.max(width, rowWidth)
  }
  return width
}

/**
 * 查找并记录列宽不匹配的问题。
 * @param map 表格映射
 * @param colWidths 列宽数组
 * @param table 表格节点
 */
function findBadColWidths(map: TableMap, colWidths: ColWidths, table: Node): void {
  if (!map.problems) map.problems = []
  const seen: Record<number, boolean> = {}
  for (let i = 0; i < map.map.length; i++) {
    const pos = map.map[i]
    if (seen[pos]) continue
    seen[pos] = true
    const node = table.nodeAt(pos)
    if (!node) {
      throw new RangeError(`No cell with offset ${pos} found`)
    }

    let updated = null
    const attrs = node.attrs as CellAttrs
    for (let j = 0; j < attrs.colspan; j++) {
      const col = (i + j) % map.width
      const colWidth = colWidths[col * 2]
      if (colWidth != null && (!attrs.colwidth || attrs.colwidth[j] != colWidth)) (updated || (updated = freshColWidth(attrs)))[j] = colWidth
    }
    if (updated)
      map.problems.unshift({
        type: 'colwidth mismatch',
        pos,
        colwidth: updated,
      })
  }
}

/**
 * 创建一个新的列宽数组，基于给定的属性。
 * @param attrs 单元格属性
 * @returns 新的列宽数组
 */
function freshColWidth(attrs: Attrs): ColWidths {
  if (attrs.colwidth) return attrs.colwidth.slice()
  const result: ColWidths = []
  for (let i = 0; i < attrs.colspan; i++) result.push(0)
  return result
}
