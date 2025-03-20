// 处理表格的各种辅助函数

import { EditorState, NodeSelection, PluginKey } from 'prosemirror-state'

import { Attrs, Node, ResolvedPos } from 'prosemirror-model'
import { CellSelection } from './cellselection'
import { tableNodeTypes } from './schema'
import { Rect, TableMap } from './tablemap'

/**
 * @public
 * 可变属性类型定义
 */
export type MutableAttrs = Record<string, unknown>

/**
 * @public
 * 单元格属性接口
 */
export interface CellAttrs {
  colspan: number // 列跨度
  rowspan: number // 行跨度
  colwidth: number[] | null // 列宽度数组
}

/**
 * @public
 * 表格编辑的插件键
 */
export const tableEditingKey = new PluginKey<number>('selectingCells')

/**
 * @public
 * 查找给定位置周围的单元格
 *
 * 从当前位置向上遍历文档结构，寻找包含当前位置的单元格
 */
export function cellAround($pos: ResolvedPos): ResolvedPos | null {
  for (let d = $pos.depth - 1; d > 0; d--) if ($pos.node(d).type.spec.tableRole == 'row') return $pos.node(0).resolve($pos.before(d + 1))
  return null
}

/**
 * 查找包裹当前位置的单元格节点
 *
 * 从当前位置开始向上遍历文档结构，寻找类型为单元格或标题单元格的节点
 */
export function cellWrapping($pos: ResolvedPos): null | Node {
  for (let d = $pos.depth; d > 0; d--) {
    // 有时单元格可能在相同深度
    const role = $pos.node(d).type.spec.tableRole
    if (role === 'cell' || role === 'header_cell') return $pos.node(d)
  }
  return null
}

/**
 * @public
 * 检查当前选择是否在表格内
 */
export function isInTable(state: EditorState): boolean {
  const $head = state.selection.$head
  for (let d = $head.depth; d > 0; d--) if ($head.node(d).type.spec.tableRole == 'row') return true
  return false
}

/**
 * @internal
 * 获取当前选中的单元格
 *
 * 根据当前选择状态返回相应的单元格位置
 */
export function selectionCell(state: EditorState): ResolvedPos {
  const sel = state.selection as CellSelection | NodeSelection
  if ('$anchorCell' in sel && sel.$anchorCell) {
    return sel.$anchorCell.pos > sel.$headCell.pos ? sel.$anchorCell : sel.$headCell
  } else if ('node' in sel && sel.node && sel.node.type.spec.tableRole == 'cell') {
    return sel.$anchor
  }
  const $cell = cellAround(sel.$head) || cellNear(sel.$head)
  if ($cell) {
    return $cell
  }
  throw new RangeError(`No cell found around position ${sel.head}`)
}

/**
 * @public
 * 查找给定位置附近的单元格
 *
 * 首先查找位置后的节点，然后查找位置前的节点
 */
export function cellNear($pos: ResolvedPos): ResolvedPos | undefined {
  for (let after = $pos.nodeAfter, pos = $pos.pos; after; after = after.firstChild, pos++) {
    const role = after.type.spec.tableRole
    if (role == 'cell' || role == 'header_cell') return $pos.doc.resolve(pos)
  }
  for (let before = $pos.nodeBefore, pos = $pos.pos; before; before = before.lastChild, pos--) {
    const role = before.type.spec.tableRole
    if (role == 'cell' || role == 'header_cell') return $pos.doc.resolve(pos - before.nodeSize)
  }
}

/**
 * @public
 * 检查给定位置是否指向一个单元格
 */
export function pointsAtCell($pos: ResolvedPos): boolean {
  return $pos.parent.type.spec.tableRole == 'row' && !!$pos.nodeAfter
}

/**
 * @public
 * 移动到下一个单元格
 *
 * 获取当前单元格后面的单元格位置
 */
export function moveCellForward($pos: ResolvedPos): ResolvedPos {
  return $pos.node(0).resolve($pos.pos + $pos.nodeAfter!.nodeSize)
}

/**
 * @internal
 * 检查两个单元格是否在同一个表格中
 */
export function inSameTable($cellA: ResolvedPos, $cellB: ResolvedPos): boolean {
  return $cellA.depth == $cellB.depth && $cellA.pos >= $cellB.start(-1) && $cellA.pos <= $cellB.end(-1)
}

/**
 * @public
 * 找到给定位置所在的单元格矩形区域
 */
export function findCell($pos: ResolvedPos): Rect {
  return TableMap.get($pos.node(-1)).findCell($pos.pos - $pos.start(-1))
}

/**
 * @public
 * 获取给定位置的列数
 */
export function colCount($pos: ResolvedPos): number {
  return TableMap.get($pos.node(-1)).colCount($pos.pos - $pos.start(-1))
}

/**
 * @public
 * 获取给定方向上的下一个单元格
 *
 * @param $pos 当前位置
 * @param axis 移动轴向 ('horiz' 水平 或 'vert' 垂直)
 * @param dir 移动方向 (正数或负数)
 */
export function nextCell($pos: ResolvedPos, axis: 'horiz' | 'vert', dir: number): ResolvedPos | null {
  const table = $pos.node(-1)
  const map = TableMap.get(table)
  const tableStart = $pos.start(-1)

  const moved = map.nextCell($pos.pos - tableStart, axis, dir)
  return moved == null ? null : $pos.node(0).resolve(tableStart + moved)
}

/**
 * @public
 * 减少单元格的列跨度
 *
 * @param attrs 当前单元格属性
 * @param pos 要减少的列位置
 * @param n 要减少的列数量
 */
export function removeColSpan(attrs: CellAttrs, pos: number, n = 1): CellAttrs {
  const result: CellAttrs = { ...attrs, colspan: attrs.colspan - n }

  if (result.colwidth) {
    result.colwidth = result.colwidth.slice()
    result.colwidth.splice(pos, n)
    if (!result.colwidth.some((w) => w > 0)) result.colwidth = null
  }
  return result
}

/**
 * @public
 * 增加单元格的列跨度
 *
 * @param attrs 当前单元格属性
 * @param pos 要增加的列位置
 * @param n 要增加的列数量
 */
export function addColSpan(attrs: CellAttrs, pos: number, n = 1): Attrs {
  const result = { ...attrs, colspan: attrs.colspan + n }
  if (result.colwidth) {
    result.colwidth = result.colwidth.slice()
    for (let i = 0; i < n; i++) result.colwidth.splice(pos, 0, 0)
  }
  return result
}

/**
 * @public
 * 检查指定列是否为表头列
 *
 * 通过检查该列的所有单元格是否都是表头单元格类型来判断
 */
export function columnIsHeader(map: TableMap, table: Node, col: number): boolean {
  const headerCell = tableNodeTypes(table.type.schema).header_cell
  for (let row = 0; row < map.height; row++) if (table.nodeAt(map.map[col + row * map.width])!.type != headerCell) return false
  return true
}
