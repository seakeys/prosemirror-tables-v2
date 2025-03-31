// 此文件定义了许多表格相关的命令。

import { Fragment, Node, NodeType, ResolvedPos, Slice } from 'prosemirror-model'
import { Command, EditorState, TextSelection, Transaction } from 'prosemirror-state'

import { CellSelection } from './cellselection'
import type { Direction } from './input'
import { tableNodeTypes, TableRole } from './schema'
import { Rect, TableMap } from './tablemap'
import { addColSpan, cellAround, CellAttrs, cellWrapping, columnIsHeader, isInTable, moveCellForward, removeColSpan, selectionCell } from './util'
import { baseKeymap } from 'prosemirror-commands'

/**
 * @public
 */
export type TableRect = Rect & {
  tableStart: number
  map: TableMap
  table: Node
}

/**
 * 用于获取表格中选中的矩形区域（如果有）。
 * 为了方便，在返回的对象中添加了表格映射、表格节点和表格起始偏移量。
 *
 * @public
 */
export function selectedRect(state: EditorState): TableRect {
  const sel = state.selection
  const $pos = selectionCell(state)
  const table = $pos.node(-1)
  const tableStart = $pos.start(-1)
  const map = TableMap.get(table)
  const rect = sel instanceof CellSelection ? map.rectBetween(sel.$anchorCell.pos - tableStart, sel.$headCell.pos - tableStart) : map.findCell($pos.pos - tableStart)
  return { ...rect, tableStart, map, table }
}

/**
 * 在表格的指定位置添加一列。
 *
 * @public
 */
export function addColumn(tr: Transaction, { map, tableStart, table }: TableRect, col: number): Transaction {
  let refColumn: number | null = col > 0 ? -1 : 0
  if (columnIsHeader(map, table, col + refColumn)) {
    refColumn = col == 0 || col == map.width ? null : 0
  }

  for (let row = 0; row < map.height; row++) {
    const index = row * map.width + col
    // 如果这个位置在一个跨列单元格内
    if (col > 0 && col < map.width && map.map[index - 1] == map.map[index]) {
      const pos = map.map[index]
      const cell = table.nodeAt(pos)!
      tr.setNodeMarkup(tr.mapping.map(tableStart + pos), null, addColSpan(cell.attrs as CellAttrs, col - map.colCount(pos)))
      // 如果行跨度 > 1，则跳过剩余行
      row += cell.attrs.rowspan - 1
    } else {
      const type = refColumn == null ? tableNodeTypes(table.type.schema).cell : table.nodeAt(map.map[index + refColumn])!.type
      const pos = map.positionAt(row, col, table)
      tr.insert(tr.mapping.map(tableStart + pos), type.createAndFill()!)
    }
  }
  return tr
}

/**
 * 在选中列之前添加一列的命令。
 *
 * @public
 */
export function addColumnBefore(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!isInTable(state)) return false
  if (dispatch) {
    const rect = selectedRect(state)
    dispatch(addColumn(state.tr, rect, rect.left))
  }
  return true
}

/**
 * 在选中列之后添加一列的命令。
 *
 * @public
 */
export function addColumnAfter(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!isInTable(state)) return false
  if (dispatch) {
    const rect = selectedRect(state)
    dispatch(addColumn(state.tr, rect, rect.right))
  }
  return true
}

/**
 * 从表格中移除指定列。
 *
 * @public
 */
export function removeColumn(tr: Transaction, { map, table, tableStart }: TableRect, col: number) {
  const mapStart = tr.mapping.maps.length
  for (let row = 0; row < map.height; ) {
    const index = row * map.width + col
    const pos = map.map[index]
    const cell = table.nodeAt(pos)!
    const attrs = cell.attrs as CellAttrs
    // 如果这是跨列单元格的一部分
    if ((col > 0 && map.map[index - 1] == pos) || (col < map.width - 1 && map.map[index + 1] == pos)) {
      tr.setNodeMarkup(tr.mapping.slice(mapStart).map(tableStart + pos), null, removeColSpan(attrs, col - map.colCount(pos)))
    } else {
      const start = tr.mapping.slice(mapStart).map(tableStart + pos)
      tr.delete(start, start + cell.nodeSize)
    }
    row += attrs.rowspan
  }
}

/**
 * 删除表格中选中列的命令函数。
 *
 * @public
 */
export function deleteColumn(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!isInTable(state)) return false
  if (dispatch) {
    const rect = selectedRect(state)
    const tr = state.tr
    if (rect.left == 0 && rect.right == rect.map.width) return false
    for (let i = rect.right - 1; ; i--) {
      removeColumn(tr, rect, i)
      if (i == rect.left) break
      const table = rect.tableStart ? tr.doc.nodeAt(rect.tableStart - 1) : tr.doc
      if (!table) {
        throw RangeError('没有找到表格')
      }
      rect.table = table
      rect.map = TableMap.get(table)
    }
    dispatch(tr)
  }
  return true
}

/**
 * 检查指定行是否为表头行。
 *
 * @public
 */
export function rowIsHeader(map: TableMap, table: Node, row: number): boolean {
  const headerCell = tableNodeTypes(table.type.schema).header_cell
  for (let col = 0; col < map.width; col++) if (table.nodeAt(map.map[col + row * map.width])?.type != headerCell) return false
  return true
}

/**
 * 在表格的指定位置添加一行。
 *
 * @public
 */
export function addRow(tr: Transaction, { map, tableStart, table }: TableRect, row: number): Transaction {
  let rowPos = tableStart
  for (let i = 0; i < row; i++) rowPos += table.child(i).nodeSize
  const cells = []
  let refRow: number | null = row > 0 ? -1 : 0
  if (rowIsHeader(map, table, row + refRow)) refRow = row == 0 || row == map.height ? null : 0
  for (let col = 0, index = map.width * row; col < map.width; col++, index++) {
    // 被行跨度单元格覆盖
    if (row > 0 && row < map.height && map.map[index] == map.map[index - map.width]) {
      const pos = map.map[index]
      const attrs = table.nodeAt(pos)!.attrs
      tr.setNodeMarkup(tableStart + pos, null, {
        ...attrs,
        rowspan: attrs.rowspan + 1,
      })
      col += attrs.colspan - 1
    } else {
      const type = refRow == null ? tableNodeTypes(table.type.schema).cell : table.nodeAt(map.map[index + refRow * map.width])?.type
      const node = type?.createAndFill()
      if (node) cells.push(node)
    }
  }
  tr.insert(rowPos, tableNodeTypes(table.type.schema).row.create(null, cells))
  return tr
}

/**
 * 在选中位置之前添加表格行。
 *
 * @public
 */
export function addRowBefore(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!isInTable(state)) return false
  if (dispatch) {
    const rect = selectedRect(state)
    dispatch(addRow(state.tr, rect, rect.top))
  }
  return true
}

/**
 * 在选中位置之后添加表格行。
 *
 * @public
 */
export function addRowAfter(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!isInTable(state)) return false
  if (dispatch) {
    const rect = selectedRect(state)
    dispatch(addRow(state.tr, rect, rect.bottom))
  }
  return true
}

/**
 * 从表格中移除指定行。
 *
 * @public
 */
export function removeRow(tr: Transaction, { map, table, tableStart }: TableRect, row: number): void {
  let rowPos = 0
  for (let i = 0; i < row; i++) rowPos += table.child(i).nodeSize
  const nextRow = rowPos + table.child(row).nodeSize

  const mapFrom = tr.mapping.maps.length
  tr.delete(rowPos + tableStart, nextRow + tableStart)

  const seen = new Set<number>()

  for (let col = 0, index = row * map.width; col < map.width; col++, index++) {
    const pos = map.map[index]

    // 跳过已检查的单元格
    if (seen.has(pos)) continue
    seen.add(pos)

    if (row > 0 && pos == map.map[index - map.width]) {
      // 如果这个单元格从上一行开始，只需减少其行跨度
      const attrs = table.nodeAt(pos)!.attrs as CellAttrs
      tr.setNodeMarkup(tr.mapping.slice(mapFrom).map(pos + tableStart), null, {
        ...attrs,
        rowspan: attrs.rowspan - 1,
      })
      col += attrs.colspan - 1
    } else if (row < map.height && pos == map.map[index + map.width]) {
      // 否则，如果它在下一行继续，则必须向下移动
      const cell = table.nodeAt(pos)!
      const attrs = cell.attrs as CellAttrs
      const copy = cell.type.create({ ...attrs, rowspan: cell.attrs.rowspan - 1 }, cell.content)
      const newPos = map.positionAt(row + 1, col, table)
      tr.insert(tr.mapping.slice(mapFrom).map(tableStart + newPos), copy)
      col += attrs.colspan - 1
    }
  }
}

/**
 * 从表格中删除选中的行。
 *
 * @public
 */
export function deleteRow(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!isInTable(state)) return false
  if (dispatch) {
    const rect = selectedRect(state),
      tr = state.tr
    if (rect.top == 0 && rect.bottom == rect.map.height) return false
    for (let i = rect.bottom - 1; ; i--) {
      removeRow(tr, rect, i)
      if (i == rect.top) break
      const table = rect.tableStart ? tr.doc.nodeAt(rect.tableStart - 1) : tr.doc
      if (!table) {
        throw RangeError('没有找到表格')
      }
      rect.table = table
      rect.map = TableMap.get(rect.table)
    }
    dispatch(tr)
  }
  return true
}

/**
 * 检查单元格是否为空。
 * 判断单元格是否仅包含一个空的文本块。
 */
function isEmpty(cell: Node): boolean {
  const c = cell.content

  return c.childCount == 1 && c.child(0).isTextblock && c.child(0).childCount == 0
}

/**
 * 检查单元格是否与矩形区域重叠。
 * 判断矩形区域的边界是否与某些跨行或跨列的单元格相交。
 */
function cellsOverlapRectangle({ width, height, map }: TableMap, rect: Rect) {
  let indexTop = rect.top * width + rect.left,
    indexLeft = indexTop
  let indexBottom = (rect.bottom - 1) * width + rect.left,
    indexRight = indexTop + (rect.right - rect.left - 1)
  for (let i = rect.top; i < rect.bottom; i++) {
    if ((rect.left > 0 && map[indexLeft] == map[indexLeft - 1]) || (rect.right < width && map[indexRight] == map[indexRight + 1])) return true
    indexLeft += width
    indexRight += width
  }
  for (let i = rect.left; i < rect.right; i++) {
    if ((rect.top > 0 && map[indexTop] == map[indexTop - width]) || (rect.bottom < height && map[indexBottom] == map[indexBottom + width])) return true
    indexTop++
    indexBottom++
  }
  return false
}

/**
 * 合并选中的单元格为单个单元格。
 * 仅当选中的单元格轮廓形成矩形时可用。
 *
 * @public
 */
export function mergeCells(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const sel = state.selection
  if (!(sel instanceof CellSelection) || sel.$anchorCell.pos == sel.$headCell.pos) return false
  const rect = selectedRect(state),
    { map } = rect
  if (cellsOverlapRectangle(map, rect)) return false
  if (dispatch) {
    const tr = state.tr
    const seen: Record<number, boolean> = {}
    let content = Fragment.empty
    let mergedPos: number | undefined
    let mergedCell: Node | undefined
    for (let row = rect.top; row < rect.bottom; row++) {
      for (let col = rect.left; col < rect.right; col++) {
        const cellPos = map.map[row * map.width + col]
        const cell = rect.table.nodeAt(cellPos)
        if (seen[cellPos] || !cell) continue
        seen[cellPos] = true
        if (mergedPos == null) {
          mergedPos = cellPos
          mergedCell = cell
        } else {
          if (!isEmpty(cell)) content = content.append(cell.content)
          const mapped = tr.mapping.map(cellPos + rect.tableStart)
          tr.delete(mapped, mapped + cell.nodeSize)
        }
      }
    }
    if (mergedPos == null || mergedCell == null) {
      return true
    }

    tr.setNodeMarkup(mergedPos + rect.tableStart, null, {
      ...addColSpan(mergedCell.attrs as CellAttrs, mergedCell.attrs.colspan, rect.right - rect.left - mergedCell.attrs.colspan),
      rowspan: rect.bottom - rect.top,
    })
    if (content.size) {
      const end = mergedPos + 1 + mergedCell.content.size
      const start = isEmpty(mergedCell) ? mergedPos + 1 : end
      tr.replaceWith(start + rect.tableStart, end + rect.tableStart, content)
    }
    tr.setSelection(new CellSelection(tr.doc.resolve(mergedPos + rect.tableStart)))
    dispatch(tr)
  }
  return true
}

/**
 * 拆分选中的单元格，其行跨度或列跨度大于1，
 * 拆分为较小的单元格。使用第一个单元格类型作为新单元格的类型。
 *
 * @public
 */
export function splitCell(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const nodeTypes = tableNodeTypes(state.schema)
  return splitCellWithType(({ node }) => {
    return nodeTypes[node.type.spec.tableRole as TableRole]
  })(state, dispatch)
}

/**
 * @public
 */
export interface GetCellTypeOptions {
  node: Node
  row: number
  col: number
}

/**
 * 拆分选中的单元格，其行跨度或列跨度大于1，
 * 拆分为具有由getType函数返回的单元格类型（th，td）的较小单元格。
 *
 * @public
 */
export function splitCellWithType(getCellType: (options: GetCellTypeOptions) => NodeType): Command {
  return (state, dispatch) => {
    const sel = state.selection
    let cellNode: Node | null | undefined
    let cellPos: number | undefined
    if (!(sel instanceof CellSelection)) {
      cellNode = cellWrapping(sel.$from)
      if (!cellNode) return false
      cellPos = cellAround(sel.$from)?.pos
    } else {
      if (sel.$anchorCell.pos != sel.$headCell.pos) return false
      cellNode = sel.$anchorCell.nodeAfter
      cellPos = sel.$anchorCell.pos
    }
    if (cellNode == null || cellPos == null) {
      return false
    }
    if (cellNode.attrs.colspan == 1 && cellNode.attrs.rowspan == 1) {
      return false
    }
    if (dispatch) {
      let baseAttrs = cellNode.attrs
      const attrs = []
      const colwidth = baseAttrs.colwidth
      if (baseAttrs.rowspan > 1) baseAttrs = { ...baseAttrs, rowspan: 1 }
      if (baseAttrs.colspan > 1) baseAttrs = { ...baseAttrs, colspan: 1 }
      const rect = selectedRect(state),
        tr = state.tr
      for (let i = 0; i < rect.right - rect.left; i++)
        attrs.push(
          colwidth
            ? {
                ...baseAttrs,
                colwidth: colwidth && colwidth[i] ? [colwidth[i]] : null,
              }
            : baseAttrs,
        )
      let lastCell
      for (let row = rect.top; row < rect.bottom; row++) {
        let pos = rect.map.positionAt(row, rect.left, rect.table)
        if (row == rect.top) pos += cellNode.nodeSize
        for (let col = rect.left, i = 0; col < rect.right; col++, i++) {
          if (col == rect.left && row == rect.top) continue
          tr.insert((lastCell = tr.mapping.map(pos + rect.tableStart, 1)), getCellType({ node: cellNode, row, col }).createAndFill(attrs[i])!)
        }
      }
      tr.setNodeMarkup(cellPos, getCellType({ node: cellNode, row: rect.top, col: rect.left }), attrs[0])
      if (sel instanceof CellSelection) tr.setSelection(new CellSelection(tr.doc.resolve(sel.$anchorCell.pos), lastCell ? tr.doc.resolve(lastCell) : undefined))
      dispatch(tr)
    }
    return true
  }
}

/**
 * 返回一个命令，该命令将给定属性设置为给定值，
 * 并且仅当当前选中的单元格尚未将该属性设置为该值时才可用。
 *
 * @public
 */
export function setCellAttr(name: string, value: unknown): Command {
  return function (state, dispatch) {
    if (!isInTable(state)) return false
    const $cell = selectionCell(state)
    if ($cell.nodeAfter!.attrs[name] === value) return false
    if (dispatch) {
      const tr = state.tr
      if (state.selection instanceof CellSelection)
        state.selection.forEachCell((node, pos) => {
          if (node.attrs[name] !== value)
            tr.setNodeMarkup(pos, null, {
              ...node.attrs,
              [name]: value,
            })
        })
      else
        tr.setNodeMarkup($cell.pos, null, {
          ...$cell.nodeAfter!.attrs,
          [name]: value,
        })
      dispatch(tr)
    }
    return true
  }
}

/**
 * 已弃用的切换表头函数，根据类型切换表头。
 */
function deprecated_toggleHeader(type: ToggleHeaderType): Command {
  return function (state, dispatch) {
    if (!isInTable(state)) return false
    if (dispatch) {
      const types = tableNodeTypes(state.schema)
      const rect = selectedRect(state),
        tr = state.tr
      const cells = rect.map.cellsInRect(
        type == 'column'
          ? {
              left: rect.left,
              top: 0,
              right: rect.right,
              bottom: rect.map.height,
            }
          : type == 'row'
            ? {
                left: 0,
                top: rect.top,
                right: rect.map.width,
                bottom: rect.bottom,
              }
            : rect,
      )
      const nodes = cells.map((pos) => rect.table.nodeAt(pos)!)
      for (
        let i = 0;
        i < cells.length;
        i++ // 移除表头（如果有）
      )
        if (nodes[i].type == types.header_cell) tr.setNodeMarkup(rect.tableStart + cells[i], types.cell, nodes[i].attrs)
      if (tr.steps.length == 0)
        for (
          let i = 0;
          i < cells.length;
          i++ // 没有移除表头，则添加
        )
          tr.setNodeMarkup(rect.tableStart + cells[i], types.header_cell, nodes[i].attrs)
      dispatch(tr)
    }
    return true
  }
}

/**
 * 根据类型检查表头是否启用。
 * 检查第一行或第一列的单元格是否都是表头单元格。
 */
function isHeaderEnabledByType(type: 'row' | 'column', rect: TableRect, types: Record<string, NodeType>): boolean {
  // 获取第一行或第一列的单元格位置
  const cellPositions = rect.map.cellsInRect({
    left: 0,
    top: 0,
    right: type == 'row' ? rect.map.width : 1,
    bottom: type == 'column' ? rect.map.height : 1,
  })

  for (let i = 0; i < cellPositions.length; i++) {
    const cell = rect.table.nodeAt(cellPositions[i])
    if (cell && cell.type !== types.header_cell) {
      return false
    }
  }

  return true
}

/**
 * @public
 */
export type ToggleHeaderType = 'column' | 'row' | 'cell'

/**
 * 在行/列表头和普通单元格之间切换（仅适用于第一行/列）。
 * 对于已弃用的行为，在选项中传递 `useDeprecatedLogic` 为 true。
 *
 * @public
 */
export function toggleHeader(type: ToggleHeaderType, options?: { useDeprecatedLogic: boolean } | undefined): Command {
  options = options || { useDeprecatedLogic: false }

  if (options.useDeprecatedLogic) return deprecated_toggleHeader(type)

  return function (state, dispatch) {
    if (!isInTable(state)) return false
    if (dispatch) {
      const types = tableNodeTypes(state.schema)
      const rect = selectedRect(state),
        tr = state.tr

      const isHeaderRowEnabled = isHeaderEnabledByType('row', rect, types)
      const isHeaderColumnEnabled = isHeaderEnabledByType('column', rect, types)

      const isHeaderEnabled = type === 'column' ? isHeaderRowEnabled : type === 'row' ? isHeaderColumnEnabled : false

      const selectionStartsAt = isHeaderEnabled ? 1 : 0

      const cellsRect =
        type == 'column'
          ? {
              left: 0,
              top: selectionStartsAt,
              right: 1,
              bottom: rect.map.height,
            }
          : type == 'row'
            ? {
                left: selectionStartsAt,
                top: 0,
                right: rect.map.width,
                bottom: 1,
              }
            : rect

      const newType =
        type == 'column' ? (isHeaderColumnEnabled ? types.cell : types.header_cell) : type == 'row' ? (isHeaderRowEnabled ? types.cell : types.header_cell) : types.cell

      rect.map.cellsInRect(cellsRect).forEach((relativeCellPos) => {
        const cellPos = relativeCellPos + rect.tableStart
        const cell = tr.doc.nodeAt(cellPos)

        if (cell) {
          tr.setNodeMarkup(cellPos, newType, cell.attrs)
        }
      })

      dispatch(tr)
    }
    return true
  }
}

/**
 * 切换选中行是否包含表头单元格。
 *
 * @public
 */
export const toggleHeaderRow: Command = toggleHeader('row', {
  useDeprecatedLogic: false,
})

/**
 * 切换选中列是否包含表头单元格。
 *
 * @public
 */
export const toggleHeaderColumn: Command = toggleHeader('column', {
  useDeprecatedLogic: false,
})

/**
 * 切换选中单元格是否为表头单元格。
 *
 * @public
 */
export const toggleHeaderCell: Command = toggleHeader('cell', {
  useDeprecatedLogic: false,
})

/**
 * 根据给定方向查找下一个单元格。
 * 在表格中向前或向后导航时使用。
 */
function findNextCell($cell: ResolvedPos, dir: Direction): number | null {
  if (dir < 0) {
    const before = $cell.nodeBefore
    if (before) return $cell.pos - before.nodeSize
    for (let row = $cell.index(-1) - 1, rowEnd = $cell.before(); row >= 0; row--) {
      const rowNode = $cell.node(-1).child(row)
      const lastChild = rowNode.lastChild
      if (lastChild) {
        return rowEnd - 1 - lastChild.nodeSize
      }
      rowEnd -= rowNode.nodeSize
    }
  } else {
    if ($cell.index() < $cell.parent.childCount - 1) {
      return $cell.pos + $cell.nodeAfter!.nodeSize
    }
    const table = $cell.node(-1)
    for (let row = $cell.indexAfter(-1), rowStart = $cell.after(); row < table.childCount; row++) {
      const rowNode = table.child(row)
      if (rowNode.childCount) return rowStart + 1
      rowStart += rowNode.nodeSize
    }
  }
  return null
}

/**
 * 返回用于选择表格中下一个(direction=1)或上一个(direction=-1)单元格的命令。
 *
 * @public
 */
export function goToNextCell(direction: Direction): Command {
  return function (state, dispatch) {
    if (!isInTable(state)) return false
    const cell = findNextCell(selectionCell(state), direction)
    if (cell == null) return false
    if (dispatch) {
      const $cell = state.doc.resolve(cell)
      dispatch(state.tr.setSelection(TextSelection.between($cell, moveCellForward($cell))).scrollIntoView())
    }
    return true
  }
}

/**
 * 删除选区周围的表格（如果有）。
 *
 * @public
 */
export function deleteTable(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const $pos = state.selection.$anchor
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d)
    if (node.type.spec.tableRole == 'table') {
      if (dispatch) dispatch(state.tr.delete($pos.before(d), $pos.after(d)).scrollIntoView())
      return true
    }
  }
  return false
}

/**
 * 删除选中单元格的内容（如果它们不为空）。
 *
 * @public
 */
export function deleteCellSelection(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const sel = state.selection
  if (!(sel instanceof CellSelection)) return false
  if (dispatch) {
    const tr = state.tr
    const baseContent = tableNodeTypes(state.schema).cell.createAndFill()!.content
    sel.forEachCell((cell, pos) => {
      if (!cell.content.eq(baseContent)) tr.replace(tr.mapping.map(pos + 1), tr.mapping.map(pos + cell.nodeSize - 1), new Slice(baseContent, 0, 0))
    })
    if (tr.docChanged) dispatch(tr)
  }
  return true
}

/**
 * 在文档中查找第一个表格
 */
function findFirstTable(state: EditorState): { tablePos: number; tableNode: Node } | null {
  interface TableInfo {
    tablePos: number
    tableNode: Node
  }

  let foundTable: TableInfo | null = null

  state.doc.descendants((node, pos) => {
    if (foundTable) return false // 已找到表格，停止遍历
    if (node.type.spec.tableRole === 'table') {
      foundTable = { tablePos: pos, tableNode: node }
      return false // 找到表格后停止遍历
    }
    return true // 继续遍历
  })

  return foundTable
}

/**
 * 在文档中的第一个表格末尾添加一行
 */
export function addRowToFirstTable(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  const tableInfo = findFirstTable(state)

  if (!tableInfo) return false

  const { tablePos, tableNode } = tableInfo
  const map = TableMap.get(tableNode)

  const rect = {
    tableStart: tablePos + 1,
    table: tableNode,
    map: map,
    left: 0,
    right: map.width,
    top: map.height,
    bottom: map.height,
  }

  if (dispatch) {
    dispatch(addRow(state.tr, rect, map.height))
  }

  return true
}

/**
 * 在文档中的第一个表格末尾添加一列
 */
export function addColumnToFirstTable(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  // 查找文档中的第一个表格
  const tableInfo = findFirstTable(state)

  if (!tableInfo) return false

  const { tablePos, tableNode } = tableInfo
  const map = TableMap.get(tableNode)

  // 构造addColumn需要的rect参数
  const rect = {
    tableStart: tablePos + 1,
    table: tableNode,
    map: map,
    left: 0,
    right: map.width,
    top: 0,
    bottom: map.height,
  }

  // 调用addColumn函数在表格最右侧添加列
  if (dispatch) {
    dispatch(addColumn(state.tr, rect, map.width))
  }

  return true
}

/**
 * 在文档中的第一个表格末尾同时添加行和列（使用一个事务）
 */
export function addRowAndColumnToFirstTable(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  // 查找文档中的第一个表格
  const tableInfo = findFirstTable(state)

  if (!tableInfo) return false

  const { tablePos, tableNode } = tableInfo
  const map = TableMap.get(tableNode)

  // 构造需要的rect参数
  const rect = {
    tableStart: tablePos + 1,
    table: tableNode,
    map: map,
    left: 0,
    right: map.width,
    top: 0,
    bottom: map.height,
  }

  if (dispatch) {
    // 创建事务
    let tr = state.tr

    // 第一步：添加列
    tr = addColumn(tr, rect, map.width)

    // 更新表格信息（因为添加列后表格结构已变化）
    const newTableNode = tr.doc.nodeAt(tablePos)
    if (!newTableNode) return false

    const newMap = TableMap.get(newTableNode)
    const newRect = {
      ...rect,
      table: newTableNode,
      map: newMap,
      right: newMap.width,
    }

    // 第二步：添加行
    tr = addRow(tr, newRect, newMap.height)

    // 分发事务
    dispatch(tr)
  }

  return true
}

// 复制行
export function duplicateRow(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!isInTable(state)) return false

  if (dispatch) {
    // 1. 先找到表格和选择的行
    const $cell = selectionCell(state)
    const table = $cell.node(-1)
    const tablePos = $cell.start(-1) - 1
    const tableStart = $cell.start(-1)
    const map = TableMap.get(table)

    // 获取当前选择的单元格所在的行
    const cellPos = $cell.pos - tableStart
    const cellIndex = map.map.indexOf(cellPos)
    const rowIndex = Math.floor(cellIndex / map.width)

    // 2. 构建重写的表格 - 创建带有新行的副本
    const tr = state.tr
    const rows = []

    for (let row = 0; row < map.height; row++) {
      // 添加原始行
      const originalRow = table.child(row)
      rows.push(originalRow)

      // 在选择行后添加副本
      if (row === rowIndex) {
        // 创建相同类型和属性的行，使用相同的单元格内容
        rows.push(originalRow.type.create(originalRow.attrs, originalRow.content))
      }
    }

    // 创建新表格
    const newTable = table.type.create(table.attrs, Fragment.from(rows))

    // 3. 用新表格替换旧表格
    tr.replaceWith(tablePos, tablePos + table.nodeSize, newTable)

    // 4. 保持原来的选择状态 - 选择原始行（而不是新复制的行）
    const newMap = TableMap.get(newTable)

    // 映射到新表格中原始行的位置
    const origLeftCellPos = newMap.map[rowIndex * newMap.width]
    const origRightCellPos = newMap.map[rowIndex * newMap.width + newMap.width - 1]

    // 创建单元格选择，选中原始行
    const $anchor = tr.doc.resolve(tablePos + 1 + origLeftCellPos)
    const $head = tr.doc.resolve(tablePos + 1 + origRightCellPos)
    tr.setSelection(new CellSelection($anchor, $head))

    dispatch(tr)
  }

  return true
}

// 复制列
export function duplicateColumn(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!isInTable(state)) return false

  if (dispatch) {
    // 1. 先找到表格和选择的列
    const $cell = selectionCell(state)
    const table = $cell.node(-1)
    const tablePos = $cell.start(-1) - 1
    const tableStart = $cell.start(-1)
    const map = TableMap.get(table)

    // 获取当前选择的单元格所在的列
    const cellPos = $cell.pos - tableStart
    const cellIndex = map.map.indexOf(cellPos)
    const colIndex = cellIndex % map.width

    // 2. 构建重写的表格 - 创建带有新列的副本
    const tr = state.tr
    const rows = []

    for (let row = 0; row < map.height; row++) {
      const cells = []

      for (let col = 0; col < map.width; col++) {
        // 找到当前单元格
        const cellPos = map.map[row * map.width + col]
        const cell = table.nodeAt(cellPos)

        if (!cell) continue

        // 添加原始单元格
        cells.push(cell)

        // 在选择列后添加副本
        if (col === colIndex) {
          // 创建相同类型和属性的单元格，使用相同的内容
          cells.push(cell.type.create(cell.attrs, cell.content))
        }
      }

      // 创建新行
      const rowNode = table.child(row)
      rows.push(rowNode.type.create(rowNode.attrs, Fragment.from(cells)))
    }

    // 创建新表格
    const newTable = table.type.create(table.attrs, Fragment.from(rows))

    // 3. 用新表格替换旧表格
    tr.replaceWith(tablePos, tablePos + table.nodeSize, newTable)

    // 4. 保持原来的选择状态 - 选择整列
    const newMap = TableMap.get(newTable)

    // 映射到新表格中的位置
    const newTopCellPos = newMap.map[colIndex]
    const newBottomCellPos = newMap.map[(newMap.height - 1) * newMap.width + colIndex]

    // 创建单元格选择
    const $anchor = tr.doc.resolve(tablePos + 1 + newTopCellPos)
    const $head = tr.doc.resolve(tablePos + 1 + newBottomCellPos)
    tr.setSelection(new CellSelection($anchor, $head))

    dispatch(tr)
  }

  return true
}

// 清除行内容
export function clearRowContent(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!isInTable(state)) return false

  if (dispatch) {
    // 1. 找到表格和选择的行
    const $cell = selectionCell(state)
    const table = $cell.node(-1)
    const tablePos = $cell.start(-1) - 1
    const tableStart = $cell.start(-1)
    const map = TableMap.get(table)

    // 获取当前选择的单元格所在的行
    const cellPos = $cell.pos - tableStart
    const cellIndex = map.map.indexOf(cellPos)
    const rowIndex = Math.floor(cellIndex / map.width)

    // 2. 构建一个相同结构但行内容为空的新表格
    const tr = state.tr
    const rows = []
    const schema = state.schema

    for (let row = 0; row < map.height; row++) {
      const originalRow = table.child(row)

      if (row == rowIndex) {
        // 创建一个内容为空的行
        const emptyCells = []
        for (let i = 0; i < originalRow.childCount; i++) {
          const origCell = originalRow.child(i)
          // 创建一个属性相同但内容为空的单元格
          const emptyCell = origCell.type.create(origCell.attrs, Fragment.from(schema.nodes.paragraph.create()))
          emptyCells.push(emptyCell)
        }

        // 添加内容为空的行
        rows.push(originalRow.type.create(originalRow.attrs, Fragment.from(emptyCells)))
      } else {
        // 保留原始行
        rows.push(originalRow)
      }
    }

    // 创建新表格
    const newTable = table.type.create(table.attrs, Fragment.from(rows))

    // 3. 用新表格替换旧表格
    tr.replaceWith(tablePos, tablePos + table.nodeSize, newTable)

    // 4. 保持原来的选择状态
    const newMap = TableMap.get(newTable)

    // 映射到新表格中的位置
    const leftCellPos = newMap.map[rowIndex * newMap.width]
    const rightCellPos = newMap.map[rowIndex * newMap.width + newMap.width - 1]

    // 创建单元格选择
    const $anchor = tr.doc.resolve(tablePos + 1 + leftCellPos)
    const $head = tr.doc.resolve(tablePos + 1 + rightCellPos)
    tr.setSelection(new CellSelection($anchor, $head))

    dispatch(tr)
  }

  return true
}

// 清除列内容
export function clearColumnContent(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!isInTable(state)) return false

  if (dispatch) {
    // 1. 找到表格和选择的列
    const $cell = selectionCell(state)
    const table = $cell.node(-1)
    const tablePos = $cell.start(-1) - 1
    const tableStart = $cell.start(-1)
    const map = TableMap.get(table)

    // 获取当前选择的单元格所在的列
    const cellPos = $cell.pos - tableStart
    const cellIndex = map.map.indexOf(cellPos)
    const colIndex = cellIndex % map.width

    // 2. 构建一个相同结构但该列内容为空的新表格
    const tr = state.tr
    const rows = []
    const schema = state.schema

    for (let row = 0; row < map.height; row++) {
      const originalRow = table.child(row)
      const cells = []

      for (let i = 0; i < originalRow.childCount; i++) {
        const origCell = originalRow.child(i)
        // 确定这个单元格是否覆盖了目标列
        const cellStart = map.map[row * map.width + (i % map.width)]
        const cellRect = map.findCell(cellStart)

        if (colIndex >= cellRect.left && colIndex < cellRect.right) {
          // 这个单元格覆盖了目标列，清空其内容
          const emptyCell = origCell.type.create(origCell.attrs, Fragment.from(schema.nodes.paragraph.create()))
          cells.push(emptyCell)
        } else {
          // 这个单元格不覆盖目标列，保持原样
          cells.push(origCell)
        }
      }

      // 添加行
      rows.push(originalRow.type.create(originalRow.attrs, Fragment.from(cells)))
    }

    // 创建新表格
    const newTable = table.type.create(table.attrs, Fragment.from(rows))

    // 3. 用新表格替换旧表格
    tr.replaceWith(tablePos, tablePos + table.nodeSize, newTable)

    // 4. 保持原来的选择状态
    const newMap = TableMap.get(newTable)

    // 映射到新表格中的位置
    const topCellPos = newMap.map[colIndex]
    const bottomCellPos = newMap.map[(newMap.height - 1) * newMap.width + colIndex]

    // 创建单元格选择
    const $anchor = tr.doc.resolve(tablePos + 1 + topCellPos)
    const $head = tr.doc.resolve(tablePos + 1 + bottomCellPos)
    tr.setSelection(new CellSelection($anchor, $head))

    dispatch(tr)
  }

  return true
}

// 删除表格中的行或列
export function deleteTableRowOrColumn(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  // 检查是否在表格中
  if (!isInTable(state)) return false

  const sel = state.selection

  // 检查是否是单元格选择
  if (sel instanceof CellSelection) {
    // 判断是整行还是整列选择
    if (sel.isRowSelection()) {
      return deleteRow(state, dispatch)
    } else if (sel.isColSelection()) {
      return deleteColumn(state, dispatch)
    }
  }

  // 如果不是整行或整列选择，使用默认的删除行为
  return baseKeymap['Backspace'](state, dispatch)
}

// 复制表格中的行或列
export function duplicateTableRowOrColumn(state: EditorState, dispatch?: (tr: Transaction) => void): boolean {
  if (!isInTable(state)) return false

  const sel = state.selection

  // 检查是否是单元格选择
  if (sel instanceof CellSelection) {
    // 判断是整行还是整列选择
    if (sel.isRowSelection()) {
      return duplicateRow(state, dispatch)
    } else if (sel.isColSelection()) {
      return duplicateColumn(state, dispatch)
    }
  }

  return false
}
