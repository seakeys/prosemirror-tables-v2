// tableOverlayPlugin.ts
import { Plugin, PluginKey } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { cellAround } from './util'
import { CellSelection } from './cellselection'
import { TableMap } from './tablemap'

// 创建插件键
export const tableOverlayPluginKey = new PluginKey('tableOverlay')

// 定义单元格位置和尺寸信息
interface CellRect {
  left: number
  top: number
  width: number
  height: number
  cellPos: number
}

// 定义拖拽状态
interface DragState {
  startX: number
  startY: number
  handle: 'topLeft' | 'bottomRight'
  cellPos?: number
}

// 定义插件状态
interface TableOverlayState {
  activeCellPos: number | null
  overlayContainer: HTMLElement | null
  selectionBackgroundOverlay: HTMLElement | null
  selectionBorderOverlay: HTMLElement | null
  topLeftHandle: HTMLElement | null
  bottomRightHandle: HTMLElement | null
  dragging: DragState | null
}

/**
 * 高亮表格中的行或列
 * @param view 编辑器视图
 * @param type 高亮类型：'row'表示行，'column'表示列
 * @param index 行号或列号（从0开始）
 */
export function highlightRowOrColumn(view: EditorView, type: 'row' | 'column', index: number): void {
  const $pos = view.state.selection.$head
  // 查找最近的表格
  let tablePos = -1
  let tableNode = null

  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth)
    if (node.type.spec.tableRole === 'table') {
      tablePos = $pos.before(depth)
      tableNode = node
      break
    }
  }

  if (tablePos === -1 || !tableNode) {
    console.error('未找到表格')
    return
  }

  const map = TableMap.get(tableNode)
  const start = tablePos + 1 // 表格内容的起始位置

  if (type === 'row') {
    if (index < 0 || index >= map.height) {
      console.error(`行索引 ${index} 超出范围`)
      return
    }

    // 获取该行第一个单元格和最后一个单元格
    const firstCellPos = map.map[index * map.width]
    const lastCellPos = map.map[index * map.width + map.width - 1]

    // 创建单元格选择
    const $anchor = view.state.doc.resolve(start + firstCellPos)
    const $head = view.state.doc.resolve(start + lastCellPos)

    // 设置选择
    const cellSelection = new CellSelection($anchor, $head)
    view.dispatch(view.state.tr.setSelection(cellSelection))
  } else if (type === 'column') {
    if (index < 0 || index >= map.width) {
      console.error(`列索引 ${index} 超出范围`)
      return
    }

    // 获取该列第一个单元格和最后一个单元格
    const firstCellPos = map.map[index]
    const lastCellPos = map.map[(map.height - 1) * map.width + index]

    // 创建单元格选择
    const $anchor = view.state.doc.resolve(start + firstCellPos)
    const $head = view.state.doc.resolve(start + lastCellPos)

    // 设置选择
    const cellSelection = new CellSelection($anchor, $head)
    view.dispatch(view.state.tr.setSelection(cellSelection))
  }
}

// 暴露更新函数
export function updateTableOverlay(view: EditorView): void {
  const state = tableOverlayPluginKey.getState(view.state)
  if (!state || !state.selectionBackgroundOverlay || !state.selectionBorderOverlay) return

  const selection = view.state.selection

  // 如果是单元格选择
  if (selection instanceof CellSelection) {
    const selRect = getSelectionRect(view, selection)

    if (selRect) {
      // 更新背景覆盖层
      state.selectionBackgroundOverlay.style.left = `${selRect.left}px`
      state.selectionBackgroundOverlay.style.top = `${selRect.top}px`
      state.selectionBackgroundOverlay.style.width = `${selRect.width}px`
      state.selectionBackgroundOverlay.style.height = `${selRect.height}px`
      state.selectionBackgroundOverlay.style.display = 'block'

      // 更新边框覆盖层和手柄
      state.selectionBorderOverlay.style.left = `${selRect.left}px`
      state.selectionBorderOverlay.style.top = `${selRect.top}px`
      state.selectionBorderOverlay.style.width = `${selRect.width}px`
      state.selectionBorderOverlay.style.height = `${selRect.height}px`
      state.selectionBorderOverlay.style.display = 'block'
    } else {
      state.selectionBackgroundOverlay.style.display = 'none'
      state.selectionBorderOverlay.style.display = 'none'
    }
  } else if (state.activeCellPos) {
    // 如果不是单元格选择但有活动单元格
    const cellRect = getCellRect(view, state.activeCellPos)

    if (cellRect) {
      // 更新背景覆盖层
      state.selectionBackgroundOverlay.style.left = `${cellRect.left}px`
      state.selectionBackgroundOverlay.style.top = `${cellRect.top}px`
      state.selectionBackgroundOverlay.style.width = `${cellRect.width}px`
      state.selectionBackgroundOverlay.style.height = `${cellRect.height}px`
      state.selectionBackgroundOverlay.style.display = 'block'

      // 更新边框覆盖层和手柄
      state.selectionBorderOverlay.style.left = `${cellRect.left}px`
      state.selectionBorderOverlay.style.top = `${cellRect.top}px`
      state.selectionBorderOverlay.style.width = `${cellRect.width}px`
      state.selectionBorderOverlay.style.height = `${cellRect.height}px`
      state.selectionBorderOverlay.style.display = 'block'
    } else {
      state.selectionBackgroundOverlay.style.display = 'none'
      state.selectionBorderOverlay.style.display = 'none'
    }
  } else {
    state.selectionBackgroundOverlay.style.display = 'none'
    state.selectionBorderOverlay.style.display = 'none'
  }
}

// 获取选择区域的矩形
export function getSelectionRect(view: EditorView, selection: CellSelection): { left: number; top: number; width: number; height: number } | null {
  try {
    // 获取锚点和头部单元格的DOM元素
    const anchorDom = view.nodeDOM(selection.$anchorCell.pos) as HTMLElement
    const headDom = view.nodeDOM(selection.$headCell.pos) as HTMLElement

    if (!anchorDom || !headDom) return null

    // 获取位置
    const anchorRect = anchorDom.getBoundingClientRect()
    const headRect = headDom.getBoundingClientRect()
    const editorRect = view.dom.getBoundingClientRect()

    // 计算选择区域的边界
    const left = Math.min(anchorRect.left, headRect.left) - editorRect.left
    const top = Math.min(anchorRect.top, headRect.top) - editorRect.top
    const right = Math.max(anchorRect.right, headRect.right) - editorRect.left
    const bottom = Math.max(anchorRect.bottom, headRect.bottom) - editorRect.top

    return { left, top, width: right - left, height: bottom - top }
  } catch (e) {
    console.error('Error getting selection rect:', e)
    return null
  }
}

// 获取单元格的位置和尺寸
export function getCellRect(view: EditorView, cellPos: number): CellRect | null {
  try {
    // 获取单元格DOM元素
    const dom = view.nodeDOM(cellPos) as HTMLElement
    if (!dom) return null

    // 获取单元格位置
    const cellRect = dom.getBoundingClientRect()
    const editorRect = view.dom.getBoundingClientRect()

    // 相对于编辑器的位置
    return {
      left: cellRect.left - editorRect.left,
      top: cellRect.top - editorRect.top,
      width: cellRect.width,
      height: cellRect.height,
      cellPos,
    }
  } catch (e) {
    console.error('Error getting cell rect:', e)
    return null
  }
}

/**
 * 确保选择是 CellSelection
 * 如果当前不是 CellSelection，则将当前单元格位置转换为 CellSelection
 */
function ensureCellSelection(view: EditorView): boolean {
  const selection = view.state.selection

  // 如果已经是 CellSelection，不需要处理
  if (selection instanceof CellSelection) {
    return true
  }

  // 获取当前光标位置周围的单元格
  const $cell = cellAround(selection.$head)
  if (!$cell) {
    return false
  }

  // 创建单元格选择
  const cellSelection = new CellSelection($cell)

  // 应用选择
  view.dispatch(view.state.tr.setSelection(cellSelection))
  return true
}

/**
 * 创建表格选择覆盖层插件
 */
export function tableOverlayPlugin() {
  return new Plugin<TableOverlayState>({
    key: tableOverlayPluginKey,

    state: {
      // 初始化状态
      init() {
        return {
          activeCellPos: null,
          overlayContainer: null,
          selectionBackgroundOverlay: null,
          selectionBorderOverlay: null,
          topLeftHandle: null,
          bottomRightHandle: null,
          dragging: null,
        }
      },

      // 应用状态变更
      apply(tr, prev) {
        // 检查插件的元数据更新
        const overlayMeta = tr.getMeta(tableOverlayPluginKey)

        if (overlayMeta) {
          // 保留DOM元素引用
          return {
            ...prev,
            ...overlayMeta,
          }
        }

        return prev
      },
    },

    view(editorView) {
      // 获取插件状态
      const pluginState = tableOverlayPluginKey.getState(editorView.state)

      // 创建覆盖层容器
      pluginState.overlayContainer = document.createElement('div')
      pluginState.overlayContainer.className = 'table-selection-overlay'

      // 创建背景覆盖层
      pluginState.selectionBackgroundOverlay = document.createElement('div')
      pluginState.selectionBackgroundOverlay.className = 'table-background-overlay'

      // 创建带边框和手柄的覆盖层
      pluginState.selectionBorderOverlay = document.createElement('div')
      pluginState.selectionBorderOverlay.className = 'table-border-overlay'

      // 创建手柄的辅助函数
      function createHandle(className: string): HTMLElement {
        const handle = document.createElement('div')
        handle.className = `table-handle ${className}`

        const handleInner = document.createElement('div')
        handleInner.className = 'table-handle-inner'

        handle.appendChild(handleInner)
        return handle
      }

      // 创建左上角手柄
      pluginState.topLeftHandle = createHandle('table-handle-top-left')

      // 创建右下角手柄
      pluginState.bottomRightHandle = createHandle('table-handle-bottom-right')

      // 将手柄添加到边框覆盖层
      pluginState.selectionBorderOverlay.appendChild(pluginState.topLeftHandle)
      pluginState.selectionBorderOverlay.appendChild(pluginState.bottomRightHandle)

      // 将覆盖层添加到容器
      pluginState.overlayContainer.appendChild(pluginState.selectionBackgroundOverlay)
      pluginState.overlayContainer.appendChild(pluginState.selectionBorderOverlay)

      // 将覆盖层容器添加到编辑器
      const editorContainer = editorView.dom.parentNode
      if (editorContainer) editorContainer.appendChild(pluginState.overlayContainer)

      // scroll 更新表格覆盖层
      const tableWrapper = editorContainer?.querySelector('.tableWrapper')
      const handleScroll = () => updateTableOverlay(editorView)

      // 添加手柄的鼠标按下事件处理
      if (pluginState.topLeftHandle) {
        const handleTopLeftHandle = (e: MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()

          // 确保选择是 CellSelection
          if (!ensureCellSelection(editorView)) return

          const selection = editorView.state.selection as CellSelection

          // 创建拖拽状态
          const dragState: DragState = {
            startX: e.clientX,
            startY: e.clientY,
            handle: 'topLeft',
            cellPos: selection.$anchorCell.pos,
          }

          // 更新插件状态
          editorView.dispatch(
            editorView.state.tr.setMeta(tableOverlayPluginKey, {
              ...pluginState,
              dragging: dragState,
            }),
          )

          // 添加拖拽时的样式
          document.body.classList.add('resize-cursor')
          pluginState.selectionBorderOverlay.classList.add('dragging')
        }
        pluginState.topLeftHandle.addEventListener('mousedown', handleTopLeftHandle)
        pluginState.topLeftHandle.addEventListener('mouseup', () => {
          if (pluginState.activeCellPos) {
            pluginState.topLeftHandle.removeEventListener('mousedown', handleTopLeftHandle)
          }
        })
      }

      if (pluginState.bottomRightHandle) {
        const handleBottomRightHandle = (e: MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()

          // 确保选择是 CellSelection
          if (!ensureCellSelection(editorView)) return

          const selection = editorView.state.selection as CellSelection

          // 创建拖拽状态
          const dragState: DragState = {
            startX: e.clientX,
            startY: e.clientY,
            handle: 'bottomRight',
            cellPos: selection.$headCell.pos,
          }

          // 更新插件状态
          editorView.dispatch(
            editorView.state.tr.setMeta(tableOverlayPluginKey, {
              ...pluginState,
              dragging: dragState,
            }),
          )

          // 添加拖拽时的样式
          document.body.classList.add('resize-cursor')
          pluginState.selectionBorderOverlay.classList.add('dragging')
        }
        pluginState.bottomRightHandle.addEventListener('mousedown', handleBottomRightHandle)
        pluginState.bottomRightHandle.addEventListener('mouseup', () => {
          if (pluginState.activeCellPos) {
            pluginState.bottomRightHandle.removeEventListener('mousedown', handleBottomRightHandle)
          }
        })
      }

      return {
        update(view) {
          updateTableOverlay(view) // 使用导出的函数
          tableWrapper?.addEventListener('scroll', handleScroll)
        },
        destroy() {
          // 清理
          const state = tableOverlayPluginKey.getState(editorView.state)
          if (state.overlayContainer && state.overlayContainer.parentNode) {
            state.overlayContainer.parentNode.removeChild(state.overlayContainer)
            tableWrapper?.removeEventListener('scroll', handleScroll)
          }

          // 将状态中的DOM引用设为null
          editorView.dispatch(
            editorView.state.tr.setMeta(tableOverlayPluginKey, {
              ...state,
              overlayContainer: null,
              selectionBackgroundOverlay: null,
              selectionBorderOverlay: null,
              topLeftHandle: null,
              bottomRightHandle: null,
              dragging: null,
            }),
          )
        },
      }
    },

    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (!pos) return false
          const $cell = cellAround(view.state.doc.resolve(pos.pos))
          if ($cell) {
            // 当点击单元格时，更新活动单元格位置
            view.dispatch(
              view.state.tr.setMeta(tableOverlayPluginKey, {
                activeCellPos: $cell.pos,
              }),
            )

            // 可选：直接设置为 CellSelection
            // ensureCellSelection(view);
          }
        },
        mousemove(view, event) {
          // 处理拖拽状态
          const state = tableOverlayPluginKey.getState(view.state)
          if (state && state.dragging) {
            // 获取拖拽的距离
            const deltaX = event.clientX - state.dragging.startX
            const deltaY = event.clientY - state.dragging.startY

            // 获取当前选中的单元格
            const selection = view.state.selection
            if (!(selection instanceof CellSelection)) return false

            // 根据拖拽方向和距离实时更新选择区域
            if (state.dragging.handle === 'topLeft') {
              // 向左上方向拖拽，选择应该向左上扩展
              handleTopLeftDrag(view, state, deltaX, deltaY)
            } else {
              // 向右下方向拖拽，选择应该向右下扩展
              handleBottomRightDrag(view, state, deltaX, deltaY)
            }

            return true
          }
          return false
        },
        mouseup(view) {
          // 处理拖拽结束
          const state = tableOverlayPluginKey.getState(view.state)
          if (!state || !state.dragging) return false

          // 重置拖拽状态
          view.dispatch(
            view.state.tr.setMeta(tableOverlayPluginKey, {
              ...state,
              dragging: null,
            }),
          )
          document.body.classList.remove('resize-cursor')
          if (state.selectionBorderOverlay) {
            state.selectionBorderOverlay.classList.remove('dragging')
          }

          return true
        },
      },
    },
  })
}

// 获取鼠标位置下方的单元格
function getCellAtCoords(view: EditorView, x: number, y: number) {
  const pos = view.posAtCoords({ left: x, top: y })
  if (!pos) return null
  return cellAround(view.state.doc.resolve(pos.pos))
}

// 处理左上角拖拽
function handleTopLeftDrag(view: EditorView, state: TableOverlayState, deltaX: number, deltaY: number) {
  if (!state.dragging) return

  const selection = view.state.selection
  if (!(selection instanceof CellSelection)) return

  // 获取当前鼠标坐标下的单元格
  const mousePos = {
    x: state.dragging.startX + deltaX,
    y: state.dragging.startY + deltaY,
  }

  // 获取鼠标下方的单元格
  const $cellAtMouse = getCellAtCoords(view, mousePos.x, mousePos.y)
  if (!$cellAtMouse) return

  // 确保单元格在同一个表格内
  if (!$cellAtMouse.node(-1).eq(selection.$headCell.node(-1))) return

  // 如果是同一个单元格，不做处理
  if ($cellAtMouse.pos === selection.$anchorCell.pos) return

  // 创建新的选择
  const newCellSelection = new CellSelection($cellAtMouse, selection.$headCell)

  // 应用新的选择
  view.dispatch(view.state.tr.setSelection(newCellSelection))
}

// 处理右下角拖拽
function handleBottomRightDrag(view: EditorView, state: TableOverlayState, deltaX: number, deltaY: number) {
  if (!state.dragging) return

  const selection = view.state.selection
  if (!(selection instanceof CellSelection)) return

  // 获取当前鼠标坐标下的单元格
  const mousePos = {
    x: state.dragging.startX + deltaX,
    y: state.dragging.startY + deltaY,
  }

  // 获取鼠标下方的单元格
  const $cellAtMouse = getCellAtCoords(view, mousePos.x, mousePos.y)
  if (!$cellAtMouse) return

  // 确保单元格在同一个表格内
  if (!$cellAtMouse.node(-1).eq(selection.$anchorCell.node(-1))) return

  // 如果是同一个单元格，不做处理
  if ($cellAtMouse.pos === selection.$headCell.pos) return

  // 创建新的选择
  const newCellSelection = new CellSelection(selection.$anchorCell, $cellAtMouse)

  // 应用新的选择
  view.dispatch(view.state.tr.setSelection(newCellSelection))
}
