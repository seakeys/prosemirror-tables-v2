// 这个文件定义了一个插件，用于处理单元格选择的绘制和基本的用户交互。
// 它还确保在每个事务后，表格的形状被规范化为矩形，且不包含重叠的单元格。

import { Plugin } from 'prosemirror-state'

import { drawCellSelection, normalizeSelection } from './cellselection'
import { fixTables, fixTablesKey } from './fixtables'
import { handleKeyDown, handleMouseDown, handlePaste, handleTripleClick } from './input'
import { tableEditingKey } from './util'

export { CellBookmark, CellSelection } from './cellselection'
export type { CellSelectionJSON } from './cellselection'
export { columnResizing, columnResizingPluginKey, ResizeState } from './columnresizing'
export type { ColumnResizingOptions, Dragging } from './columnresizing'
export * from './commands'
export { clipCells as __clipCells, insertCells as __insertCells, pastedCells as __pastedCells } from './copypaste'
export type { Area as __Area } from './copypaste'
export type { Direction } from './input'
export { tableNodes, tableNodeTypes } from './schema'
export type { CellAttributes, getFromDOM, setDOMAttr, TableNodes, TableNodesOptions, TableRole } from './schema'
export { TableMap } from './tablemap'
export type { ColWidths, Problem, Rect } from './tablemap'
export { TableView, updateColumnsOnResize } from './tableview'
export {
  addColSpan,
  cellAround,
  cellNear,
  colCount,
  columnIsHeader,
  findCell,
  inSameTable,
  isInTable,
  moveCellForward,
  nextCell,
  pointsAtCell,
  removeColSpan,
  selectionCell,
} from './util'
export type { MutableAttrs } from './util'
export { fixTables, handlePaste, fixTablesKey }
export { tableEditingKey }

/**
 * @public
 */
export type TableEditingOptions = {
  allowTableNodeSelection?: boolean
}

/**
 * 创建一个[插件](http://prosemirror.net/docs/ref/#state.Plugin)，
 * 当添加到编辑器时，启用单元格选择，处理基于单元格的复制/粘贴，
 * 并确保表格保持良好的格式（每一行具有相同的宽度，且单元格不重叠）。
 *
 * 你应该将这个插件放在插件数组的末尾，因为它以相当广泛的方式处理
 * 表格中的鼠标和箭头键事件，其他插件，如间隙光标或列宽拖动插件，
 * 可能希望先执行更具体的行为。
 *
 * @public
 */
export function tableEditing({ allowTableNodeSelection = false }: TableEditingOptions = {}): Plugin {
  return new Plugin({
    key: tableEditingKey,

    // 这个状态用于记住鼠标拖动单元格选择正在发生，
    // 以便即使在事务（可能移动其锚定单元格）到来时也能继续。
    state: {
      init() {
        return null
      },
      apply(tr, cur) {
        const set = tr.getMeta(tableEditingKey)
        if (set != null) return set == -1 ? null : set
        if (cur == null || !tr.docChanged) return cur
        const { deleted, pos } = tr.mapping.mapResult(cur)
        return deleted ? null : pos
      },
    },

    props: {
      decorations: drawCellSelection,

      handleDOMEvents: {
        mousedown: handleMouseDown,
      },

      createSelectionBetween(view) {
        return tableEditingKey.getState(view.state) != null ? view.state.selection : null
      },

      handleTripleClick,

      handleKeyDown,

      handlePaste,
    },

    appendTransaction(_, oldState, state) {
      return normalizeSelection(state, fixTables(state, oldState), allowTableNodeSelection)
    },
  })
}
