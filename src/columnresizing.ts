import { Attrs, Node as ProsemirrorNode } from 'prosemirror-model'
import { EditorState, Plugin, PluginKey, Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView, NodeView } from 'prosemirror-view'
import { tableNodeTypes } from './schema'
import { TableMap } from './tablemap'
import { TableView, updateColumnsOnResize } from './tableview'
import { cellAround, CellAttrs, pointsAtCell } from './util'
import { updateTableOverlay } from './tableOverlayPlugin'

/**
 * @public
 * 表格列调整插件的键
 */
export const columnResizingPluginKey = new PluginKey<ResizeState>('tableColumnResizing')

/**
 * @public
 * 列调整选项接口
 */
export type ColumnResizingOptions = {
  /**
   * 调整手柄的宽度
   */
  handleWidth?: number
  /**
   * 单元格/列的最小宽度。列不能被调整得比这个值更小。
   */
  cellMinWidth?: number
  /**
   * 当单元格/列没有显式宽度时的默认最小宽度（即：尚未手动调整大小）
   */
  defaultCellMinWidth?: number
  /**
   * 最后一列是否可调整大小
   */
  lastColumnResizable?: boolean
  /**
   * 用于渲染表格节点的自定义节点视图。默认情况下，插件
   * 使用 {@link TableView} 类。您可以显式地将其设置为 `null`
   * 以不使用自定义节点视图。
   */
  View?: (new (node: ProsemirrorNode, cellMinWidth: number, view: EditorView) => NodeView) | null
}

/**
 * @public
 * 拖动状态接口
 */
export type Dragging = { startX: number; startWidth: number }

/**
 * @public
 * 创建列调整插件的函数
 */
export function columnResizing({
  handleWidth = 5,
  cellMinWidth = 25,
  defaultCellMinWidth = 100,
  View = TableView,
  lastColumnResizable = true,
}: ColumnResizingOptions = {}): Plugin {
  const plugin = new Plugin<ResizeState>({
    key: columnResizingPluginKey,
    state: {
      init(_, state) {
        const nodeViews = plugin.spec?.props?.nodeViews
        const tableName = tableNodeTypes(state.schema).table.name
        if (View && nodeViews) {
          nodeViews[tableName] = (node, view) => {
            return new View(node, defaultCellMinWidth, view)
          }
        }
        return new ResizeState(-1, false)
      },
      apply(tr, prev) {
        return prev.apply(tr)
      },
    },
    props: {
      attributes: (state): Record<string, string> => {
        const pluginState = columnResizingPluginKey.getState(state)
        return pluginState && pluginState.activeHandle > -1 ? { class: 'resize-cursor' } : {}
      },

      handleDOMEvents: {
        mousemove: (view, event) => {
          handleMouseMove(view, event, handleWidth, lastColumnResizable)
        },
        mouseleave: (view) => {
          handleMouseLeave(view)
        },
        mousedown: (view, event) => {
          handleMouseDown(view, event, cellMinWidth, defaultCellMinWidth)
        },
      },

      decorations: (state) => {
        const pluginState = columnResizingPluginKey.getState(state)
        if (pluginState && pluginState.activeHandle > -1) {
          return handleDecorations(state, pluginState.activeHandle)
        }
      },

      nodeViews: {},
    },
  })
  return plugin
}

/**
 * @public
 * 调整状态类，用于跟踪列调整的状态
 */
export class ResizeState {
  constructor(
    public activeHandle: number,
    public dragging: Dragging | false,
  ) {}

  apply(tr: Transaction): ResizeState {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const state = this
    const action = tr.getMeta(columnResizingPluginKey)
    if (action && action.setHandle != null) return new ResizeState(action.setHandle, false)
    if (action && action.setDragging !== undefined) return new ResizeState(state.activeHandle, action.setDragging)
    if (state.activeHandle > -1 && tr.docChanged) {
      let handle = tr.mapping.map(state.activeHandle, -1)
      if (!pointsAtCell(tr.doc.resolve(handle))) {
        handle = -1
      }
      return new ResizeState(handle, state.dragging)
    }
    return state
  }
}

/**
 * 处理鼠标移动事件，检测调整手柄的位置
 * @param view 编辑器视图
 * @param event 鼠标事件
 * @param handleWidth 调整手柄宽度
 * @param lastColumnResizable 最后一列是否可调整
 */
function handleMouseMove(view: EditorView, event: MouseEvent, handleWidth: number, lastColumnResizable: boolean): void {
  if (!view.editable) return

  const pluginState = columnResizingPluginKey.getState(view.state)
  if (!pluginState) return

  if (!pluginState.dragging) {
    const target = domCellAround(event.target as HTMLElement)
    let cell = -1
    if (target) {
      const { left, right } = target.getBoundingClientRect()
      if (event.clientX - left <= handleWidth) cell = edgeCell(view, event, 'left', handleWidth)
      else if (right - event.clientX <= handleWidth) cell = edgeCell(view, event, 'right', handleWidth)
    }

    if (cell != pluginState.activeHandle) {
      if (!lastColumnResizable && cell !== -1) {
        const $cell = view.state.doc.resolve(cell)
        const table = $cell.node(-1)
        const map = TableMap.get(table)
        const tableStart = $cell.start(-1)
        const col = map.colCount($cell.pos - tableStart) + $cell.nodeAfter!.attrs.colspan - 1

        if (col == map.width - 1) {
          return
        }
      }

      updateHandle(view, cell)
    }
  }
}

/**
 * 处理鼠标离开事件，在鼠标离开时重置调整手柄
 * @param view 编辑器视图
 */
function handleMouseLeave(view: EditorView): void {
  if (!view.editable) return

  const pluginState = columnResizingPluginKey.getState(view.state)
  if (pluginState && pluginState.activeHandle > -1 && !pluginState.dragging) updateHandle(view, -1)
}

/**
 * 处理鼠标按下事件，开始列宽调整过程
 * @param view 编辑器视图
 * @param event 鼠标事件
 * @param cellMinWidth 单元格最小宽度
 * @param defaultCellMinWidth 默认单元格最小宽度
 * @returns 是否已处理事件
 */
function handleMouseDown(view: EditorView, event: MouseEvent, cellMinWidth: number, defaultCellMinWidth: number): boolean {
  if (!view.editable) return false

  const win = view.dom.ownerDocument.defaultView || window

  const pluginState = columnResizingPluginKey.getState(view.state)
  if (!pluginState || pluginState.activeHandle == -1 || pluginState.dragging) return false

  const cell = view.state.doc.nodeAt(pluginState.activeHandle)!
  const width = currentColWidth(view, pluginState.activeHandle, cell.attrs)
  view.dispatch(
    view.state.tr.setMeta(columnResizingPluginKey, {
      setDragging: { startX: event.clientX, startWidth: width },
    }),
  )

  /**
   * 完成拖动操作的处理函数
   * @param event 鼠标事件
   */
  function finish(event: MouseEvent) {
    win.removeEventListener('mouseup', finish)
    win.removeEventListener('mousemove', move)
    const pluginState = columnResizingPluginKey.getState(view.state)
    if (pluginState?.dragging) {
      updateColumnWidth(view, pluginState.activeHandle, draggedWidth(pluginState.dragging, event, cellMinWidth))
      view.dispatch(view.state.tr.setMeta(columnResizingPluginKey, { setDragging: null }))
    }
  }

  /**
   * 处理鼠标移动的函数，用于拖动调整过程中
   * @param event 鼠标事件
   */
  function move(event: MouseEvent): void {
    if (!event.which) return finish(event)
    const pluginState = columnResizingPluginKey.getState(view.state)
    if (!pluginState) return
    if (pluginState.dragging) {
      const dragged = draggedWidth(pluginState.dragging, event, cellMinWidth)
      displayColumnWidth(view, pluginState.activeHandle, dragged, defaultCellMinWidth)
    }
  }

  displayColumnWidth(view, pluginState.activeHandle, width, defaultCellMinWidth)

  win.addEventListener('mouseup', finish)
  win.addEventListener('mousemove', move)
  event.preventDefault()
  return true
}

/**
 * 获取当前列的宽度
 * @param view 编辑器视图
 * @param cellPos 单元格位置
 * @param attrs 单元格属性
 * @returns 列宽度
 */
function currentColWidth(view: EditorView, cellPos: number, { colspan, colwidth }: Attrs): number {
  const width = colwidth && colwidth[colwidth.length - 1]
  if (width) return width
  const dom = view.domAtPos(cellPos)
  const node = dom.node.childNodes[dom.offset] as HTMLElement
  let domWidth = node.offsetWidth,
    parts = colspan
  if (colwidth)
    for (let i = 0; i < colspan; i++)
      if (colwidth[i]) {
        domWidth -= colwidth[i]
        parts--
      }
  return domWidth / parts
}

/**
 * 寻找目标元素周围的DOM单元格
 * @param target 目标HTML元素
 * @returns 找到的单元格元素或null
 */
function domCellAround(target: HTMLElement | null): HTMLElement | null {
  while (target && target.nodeName != 'TD' && target.nodeName != 'TH')
    target = target.classList && target.classList.contains('ProseMirror') ? null : (target.parentNode as HTMLElement)
  return target
}

/**
 * 获取边缘单元格的位置
 * @param view 编辑器视图
 * @param event 鼠标事件
 * @param side 边侧（'left'或'right'）
 * @param handleWidth 调整手柄宽度
 * @returns 边缘单元格位置
 */
function edgeCell(view: EditorView, event: MouseEvent, side: 'left' | 'right', handleWidth: number): number {
  // posAtCoords在光标移动到折叠的表格边框时返回不一致的位置
  // 使用偏移量来调整目标视口坐标，使其远离表格边框
  const offset = side == 'right' ? -handleWidth : handleWidth
  const found = view.posAtCoords({
    left: event.clientX + offset,
    top: event.clientY,
  })
  if (!found) return -1
  const { pos } = found
  const $cell = cellAround(view.state.doc.resolve(pos))
  if (!$cell) return -1
  if (side == 'right') return $cell.pos
  const map = TableMap.get($cell.node(-1)),
    start = $cell.start(-1)
  const index = map.map.indexOf($cell.pos - start)
  return index % map.width == 0 ? -1 : start + map.map[index - 1]
}

/**
 * 计算拖动后的宽度
 * @param dragging 拖动状态
 * @param event 鼠标事件
 * @param resizeMinWidth 调整的最小宽度
 * @returns 计算后的宽度
 */
function draggedWidth(dragging: Dragging, event: MouseEvent, resizeMinWidth: number): number {
  const offset = event.clientX - dragging.startX
  return Math.max(resizeMinWidth, dragging.startWidth + offset)
}

/**
 * 更新调整手柄的位置状态
 * @param view 编辑器视图
 * @param value 新的手柄位置值
 */
function updateHandle(view: EditorView, value: number): void {
  view.dispatch(view.state.tr.setMeta(columnResizingPluginKey, { setHandle: value }))
}

/**
 * 更新列宽度到文档中
 * @param view 编辑器视图
 * @param cell 单元格位置
 * @param width 新的宽度
 */
function updateColumnWidth(view: EditorView, cell: number, width: number): void {
  const $cell = view.state.doc.resolve(cell)
  const table = $cell.node(-1),
    map = TableMap.get(table),
    start = $cell.start(-1)
  const col = map.colCount($cell.pos - start) + $cell.nodeAfter!.attrs.colspan - 1
  const tr = view.state.tr
  for (let row = 0; row < map.height; row++) {
    const mapIndex = row * map.width + col
    // 已经处理过的跨行单元格
    if (row && map.map[mapIndex] == map.map[mapIndex - map.width]) continue
    const pos = map.map[mapIndex]
    const attrs = table.nodeAt(pos)!.attrs as CellAttrs
    const index = attrs.colspan == 1 ? 0 : col - map.colCount(pos)
    if (attrs.colwidth && attrs.colwidth[index] == width) continue
    const colwidth = attrs.colwidth ? attrs.colwidth.slice() : zeroes(attrs.colspan)
    colwidth[index] = width
    tr.setNodeMarkup(start + pos, null, { ...attrs, colwidth: colwidth })
  }
  if (tr.docChanged) view.dispatch(tr)
}

/**
 * 在DOM中显示列宽度的变化
 * @param view 编辑器视图
 * @param cell 单元格位置
 * @param width 宽度
 * @param defaultCellMinWidth 默认单元格最小宽度
 */
function displayColumnWidth(view: EditorView, cell: number, width: number, defaultCellMinWidth: number): void {
  const $cell = view.state.doc.resolve(cell)
  const table = $cell.node(-1),
    start = $cell.start(-1)
  const col = TableMap.get(table).colCount($cell.pos - start) + $cell.nodeAfter!.attrs.colspan - 1
  let dom: Node | null = view.domAtPos($cell.start(-1)).node
  while (dom && dom.nodeName != 'TABLE') {
    dom = dom.parentNode
  }
  if (!dom) return
  updateColumnsOnResize(table, dom.firstChild as HTMLTableColElement, dom as HTMLTableElement, defaultCellMinWidth, col, width)
  updateTableOverlay(view)
}

/**
 * 创建指定长度的零数组
 * @param n 数组长度
 * @returns 填充了0的数组
 */
function zeroes(n: number): 0[] {
  return Array(n).fill(0)
}

/**
 * 创建列调整手柄装饰
 * @param state 编辑器状态
 * @param cell 单元格位置
 * @returns 装饰集合
 */
export function handleDecorations(state: EditorState, cell: number): DecorationSet {
  const decorations = []
  const $cell = state.doc.resolve(cell)
  const table = $cell.node(-1)
  if (!table) {
    return DecorationSet.empty
  }
  const map = TableMap.get(table)
  const start = $cell.start(-1)
  const col = map.colCount($cell.pos - start) + $cell.nodeAfter!.attrs.colspan - 1
  for (let row = 0; row < map.height; row++) {
    const index = col + row * map.width
    // 对于右侧有不同单元格或表格末尾，
    // 且上方有表格顶部或不同单元格的位置，添加装饰
    if ((col == map.width - 1 || map.map[index] != map.map[index + 1]) && (row == 0 || map.map[index] != map.map[index - map.width])) {
      const cellPos = map.map[index]
      const pos = start + cellPos + table.nodeAt(cellPos)!.nodeSize - 1
      const dom = document.createElement('div')
      dom.className = 'column-resize-handle'
      if (columnResizingPluginKey.getState(state)?.dragging) {
        decorations.push(
          Decoration.node(start + cellPos, start + cellPos + table.nodeAt(cellPos)!.nodeSize, {
            class: 'column-resize-dragging',
          }),
        )
      }

      decorations.push(Decoration.widget(pos, dom))
    }
  }
  return DecorationSet.create(state.doc, decorations)
}
