// 这个文件定义了一些帮助函数，用于将用户输入连接到表格相关的功能。

import { keydownHandler } from 'prosemirror-keymap'
import { Fragment, ResolvedPos, Slice } from 'prosemirror-model'
import { Command, EditorState, Selection, TextSelection, Transaction } from 'prosemirror-state'

import { EditorView } from 'prosemirror-view'
import { CellSelection } from './cellselection'
import { deleteCellSelection } from './commands'
import { clipCells, fitSlice, insertCells, pastedCells } from './copypaste'
import { tableNodeTypes } from './schema'
import { TableMap } from './tablemap'
import { cellAround, inSameTable, isInTable, nextCell, selectionCell, tableEditingKey } from './util'

type Axis = 'horiz' | 'vert'

/**
 * @public
 */
export type Direction = -1 | 1

/**
 * 处理键盘按键事件的映射处理器
 * 管理表格编辑中的箭头键、Shift+箭头键和删除键行为
 */
export const handleKeyDown = keydownHandler({
  ArrowLeft: arrow('horiz', -1),
  ArrowRight: arrow('horiz', 1),
  ArrowUp: arrow('vert', -1),
  ArrowDown: arrow('vert', 1),

  'Shift-ArrowLeft': shiftArrow('horiz', -1),
  'Shift-ArrowRight': shiftArrow('horiz', 1),
  'Shift-ArrowUp': shiftArrow('vert', -1),
  'Shift-ArrowDown': shiftArrow('vert', 1),

  Backspace: deleteCellSelection,
  'Mod-Backspace': deleteCellSelection,
  Delete: deleteCellSelection,
  'Mod-Delete': deleteCellSelection,
})

/**
 * 尝试设置新的选择，如果选择已经存在则不做处理
 * @param state 当前编辑器状态
 * @param dispatch 分发事务的函数
 * @param selection 新的选择
 * @returns 是否成功设置选择
 */
function maybeSetSelection(state: EditorState, dispatch: undefined | ((tr: Transaction) => void), selection: Selection): boolean {
  if (selection.eq(state.selection)) return false
  if (dispatch) dispatch(state.tr.setSelection(selection).scrollIntoView())
  return true
}

/**
 * 处理表格中的箭头键导航
 * 根据不同的轴（水平/垂直）和方向控制单元格间的移动
 * @param axis 移动轴向 'horiz' 或 'vert'
 * @param dir 移动方向 -1（左/上）或 1（右/下）
 * @returns 处理箭头键导航的命令
 */
export function arrow(axis: Axis, dir: Direction): Command {
  return (state, dispatch, view) => {
    if (!view) return false
    const sel = state.selection
    // 如果当前是单元格选择，移动到相邻单元格
    if (sel instanceof CellSelection) {
      return maybeSetSelection(state, dispatch, Selection.near(sel.$headCell, dir))
    }
    // 非水平轴且选择非空，不处理
    if (axis != 'horiz' && !sel.empty) return false
    const end = atEndOfCell(view, axis, dir)
    if (end == null) return false
    // 水平轴移动
    if (axis == 'horiz') {
      return maybeSetSelection(state, dispatch, Selection.near(state.doc.resolve(sel.head + dir), dir))
    } else {
      // 垂直轴移动
      const $cell = state.doc.resolve(end)
      const $next = nextCell($cell, axis, dir)
      let newSel
      if ($next) newSel = Selection.near($next, 1)
      else if (dir < 0) newSel = Selection.near(state.doc.resolve($cell.before(-1)), -1)
      else newSel = Selection.near(state.doc.resolve($cell.after(-1)), 1)
      return maybeSetSelection(state, dispatch, newSel)
    }
  }
}

/**
 * 处理按住Shift的箭头键，实现单元格选择扩展
 * @param axis 移动轴向 'horiz' 或 'vert'
 * @param dir 移动方向 -1（左/上）或 1（右/下）
 * @returns 处理Shift+箭头键的命令
 */
function shiftArrow(axis: Axis, dir: Direction): Command {
  return (state, dispatch, view) => {
    if (!view) return false
    const sel = state.selection
    let cellSel: CellSelection
    // 如果已经是单元格选择，直接使用
    if (sel instanceof CellSelection) {
      cellSel = sel
    } else {
      // 否则从当前单元格创建单元格选择
      const end = atEndOfCell(view, axis, dir)
      if (end == null) return false
      cellSel = new CellSelection(state.doc.resolve(end))
    }

    const $head = nextCell(cellSel.$headCell, axis, dir)
    if (!$head) return false
    // 创建新的单元格选择，扩展到下一个单元格
    return maybeSetSelection(state, dispatch, new CellSelection(cellSel.$anchorCell, $head))
  }
}

/**
 * 处理三击事件，选中整个单元格
 * @param view 编辑器视图
 * @param pos 点击位置
 * @returns 是否成功处理三击事件
 */
export function handleTripleClick(view: EditorView, pos: number): boolean {
  const doc = view.state.doc,
    $cell = cellAround(doc.resolve(pos))
  if (!$cell) return false
  view.dispatch(view.state.tr.setSelection(new CellSelection($cell)))
  return true
}

/**
 * 处理表格中的粘贴事件
 * @param view 编辑器视图
 * @param _ 剪贴板事件（未使用）
 * @param slice 要粘贴的内容片段
 * @returns 是否成功处理粘贴事件
 */
export function handlePaste(view: EditorView, _: ClipboardEvent, slice: Slice): boolean {
  if (!isInTable(view.state)) return false
  let cells = pastedCells(slice)
  const sel = view.state.selection
  // 处理单元格选择的粘贴
  if (sel instanceof CellSelection) {
    if (!cells)
      cells = {
        width: 1,
        height: 1,
        rows: [Fragment.from(fitSlice(tableNodeTypes(view.state.schema).cell, slice))],
      }
    const table = sel.$anchorCell.node(-1)
    const start = sel.$anchorCell.start(-1)
    const rect = TableMap.get(table).rectBetween(sel.$anchorCell.pos - start, sel.$headCell.pos - start)
    cells = clipCells(cells, rect.right - rect.left, rect.bottom - rect.top)
    insertCells(view.state, view.dispatch, start, rect, cells)
    return true
  } else if (cells) {
    // 处理普通单元格的粘贴
    const $cell = selectionCell(view.state)
    const start = $cell.start(-1)
    insertCells(view.state, view.dispatch, start, TableMap.get($cell.node(-1)).findCell($cell.pos - start), cells)
    return true
  } else {
    return false
  }
}

/**
 * 处理鼠标按下事件，实现单元格选择的拖拽和扩展
 * @param view 编辑器视图
 * @param startEvent 鼠标按下的初始事件
 */
export function handleMouseDown(view: EditorView, startEvent: MouseEvent): void {
  // 忽略Ctrl和Meta键
  if (startEvent.ctrlKey || startEvent.metaKey) return

  const startDOMCell = domInCell(view, startEvent.target as Node)
  let $anchor
  // 处理Shift键按下的情况
  if (startEvent.shiftKey && view.state.selection instanceof CellSelection) {
    // 添加到现有的单元格选择
    setCellSelection(view.state.selection.$anchorCell, startEvent)
    startEvent.preventDefault()
  } else if (startEvent.shiftKey && startDOMCell && ($anchor = cellAround(view.state.selection.$anchor)) != null && cellUnderMouse(view, startEvent)?.pos != $anchor.pos) {
    // 添加到从另一个单元格开始的选择
    setCellSelection($anchor, startEvent)
    startEvent.preventDefault()
  } else if (!startDOMCell) {
    // 不在单元格中，让默认行为发生
    return
  }

  // 在给定的锚点和鼠标下的位置之间创建并分发单元格选择
  function setCellSelection($anchor: ResolvedPos, event: MouseEvent): void {
    let $head = cellUnderMouse(view, event)
    const starting = tableEditingKey.getState(view.state) == null
    if (!$head || !inSameTable($anchor, $head)) {
      if (starting) $head = $anchor
      else return
    }
    const selection = new CellSelection($anchor, $head)
    if (starting || !view.state.selection.eq(selection)) {
      const tr = view.state.tr.setSelection(selection)
      if (starting) tr.setMeta(tableEditingKey, $anchor.pos)
      view.dispatch(tr)
    }
  }

  // 停止监听鼠标移动事件
  function stop(): void {
    view.root.removeEventListener('mouseup', stop)
    view.root.removeEventListener('dragstart', stop)
    view.root.removeEventListener('mousemove', move)
    if (tableEditingKey.getState(view.state) != null) view.dispatch(view.state.tr.setMeta(tableEditingKey, -1))
  }

  function move(_event: Event): void {
    const event = _event as MouseEvent
    const anchor = tableEditingKey.getState(view.state)
    let $anchor
    if (anchor != null) {
      // 继续现有的跨单元格选择
      $anchor = view.state.doc.resolve(anchor)
    } else if (domInCell(view, event.target as Node) != startDOMCell) {
      // 移出初始单元格 -- 开始新的单元格选择
      $anchor = cellUnderMouse(view, startEvent)
      if (!$anchor) return stop()
    }
    if ($anchor) setCellSelection($anchor, event)
  }

  view.root.addEventListener('mouseup', stop)
  view.root.addEventListener('dragstart', stop)
  view.root.addEventListener('mousemove', move)
}

/**
 * 检查光标是否位于单元格的末尾（因此进一步移动将移出单元格）
 * @param view 编辑器视图
 * @param axis 移动轴向
 * @param dir 移动方向
 * @returns 单元格末尾的位置，如果不在末尾则返回null
 */
function atEndOfCell(view: EditorView, axis: Axis, dir: number): null | number {
  if (!(view.state.selection instanceof TextSelection)) return null
  const { $head } = view.state.selection
  for (let d = $head.depth - 1; d >= 0; d--) {
    const parent = $head.node(d),
      index = dir < 0 ? $head.index(d) : $head.indexAfter(d)
    if (index != (dir < 0 ? 0 : parent.childCount)) return null
    if (parent.type.spec.tableRole == 'cell' || parent.type.spec.tableRole == 'header_cell') {
      const cellPos = $head.before(d)
      const dirStr: 'up' | 'down' | 'left' | 'right' = axis == 'vert' ? (dir > 0 ? 'down' : 'up') : dir > 0 ? 'right' : 'left'
      return view.endOfTextblock(dirStr) ? cellPos : null
    }
  }
  return null
}

/**
 * 检查给定的DOM节点是否在表格单元格内
 * @param view 编辑器视图
 * @param dom 要检查的DOM节点
 * @returns 如果在单元格内，返回单元格节点；否则返回null
 */
function domInCell(view: EditorView, dom: Node | null): Node | null {
  for (; dom && dom != view.dom; dom = dom.parentNode) {
    if (dom.nodeName == 'TD' || dom.nodeName == 'TH') {
      return dom
    }
  }
  return null
}

/**
 * 获取鼠标位置下的单元格
 * @param view 编辑器视图
 * @param event 鼠标事件
 * @returns 鼠标位置下的单元格（如果存在）
 */
function cellUnderMouse(view: EditorView, event: MouseEvent): ResolvedPos | null {
  const mousePos = view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  })
  if (!mousePos) return null
  return mousePos ? cellAround(view.state.doc.resolve(mousePos.pos)) : null
}
