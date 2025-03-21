// tableOverlayPlugin.ts
import { Plugin, PluginKey } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { cellAround } from './util'
import { CellSelection } from './cellselection'

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

// 定义插件状态
interface TableOverlayState {
  activeCellPos: number | null
  overlayContainer: HTMLElement | null
  selectionBackgroundOverlay: HTMLElement | null
  selectionBorderOverlay: HTMLElement | null
  topLeftHandle: HTMLElement | null
  bottomRightHandle: HTMLElement | null
}

// 默认配置
interface OverlayConfig {
  selectionBorderColor: string
  selectionBorderWidth: number
  handleSize: number
  handleBorderColor: string
  handleBackgroundColor: string
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
 * 创建表格选择覆盖层插件
 */
export function tableOverlayPlugin(options: Partial<OverlayConfig> = {}) {
  // 默认配置
  const config: OverlayConfig = {
    selectionBorderColor: '#3E9DFE',
    selectionBorderWidth: 2,
    handleSize: 8,
    handleBorderColor: '#3E9DFE',
    handleBackgroundColor: 'white',
    ...options,
  }

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
      pluginState.overlayContainer.style.position = 'absolute'
      pluginState.overlayContainer.style.top = '0'
      pluginState.overlayContainer.style.left = '0'
      pluginState.overlayContainer.style.right = '0'
      pluginState.overlayContainer.style.bottom = '0'
      pluginState.overlayContainer.style.pointerEvents = 'none'
      pluginState.overlayContainer.style.zIndex = '2'

      // 创建背景覆盖层
      pluginState.selectionBackgroundOverlay = document.createElement('div')
      pluginState.selectionBackgroundOverlay.style.position = 'absolute'
      pluginState.selectionBackgroundOverlay.style.left = '0px'
      pluginState.selectionBackgroundOverlay.style.top = '0px'
      pluginState.selectionBackgroundOverlay.style.width = '0px'
      pluginState.selectionBackgroundOverlay.style.height = '0px'
      pluginState.selectionBackgroundOverlay.style.zIndex = '2'
      pluginState.selectionBackgroundOverlay.style.borderRadius = '2px'
      pluginState.selectionBackgroundOverlay.style.display = 'none'

      // 创建带边框和手柄的覆盖层
      pluginState.selectionBorderOverlay = document.createElement('div')
      pluginState.selectionBorderOverlay.style.position = 'absolute'
      pluginState.selectionBorderOverlay.style.left = '0px'
      pluginState.selectionBorderOverlay.style.top = '0px'
      pluginState.selectionBorderOverlay.style.width = '0px'
      pluginState.selectionBorderOverlay.style.height = '0px'
      pluginState.selectionBorderOverlay.style.border = `${config.selectionBorderWidth}px solid ${config.selectionBorderColor}`
      pluginState.selectionBorderOverlay.style.borderRadius = '2px'
      pluginState.selectionBorderOverlay.style.zIndex = '3'
      pluginState.selectionBorderOverlay.style.display = 'none'
      pluginState.selectionBorderOverlay.style.boxSizing = 'border-box'

      // 创建手柄的辅助函数
      function createHandle(cursor: string): HTMLElement {
        const handle = document.createElement('div')
        handle.style.position = 'absolute'
        handle.style.width = `${config.handleSize}px`
        handle.style.height = `${config.handleSize}px`
        handle.style.background = 'transparent'
        handle.style.pointerEvents = 'auto'
        handle.style.cursor = cursor
        handle.style.zIndex = '10'

        const handleInner = document.createElement('div')
        handleInner.style.width = `${config.handleSize}px`
        handleInner.style.height = `${config.handleSize}px`
        handleInner.style.border = `2px solid ${config.handleBorderColor}`
        handleInner.style.background = config.handleBackgroundColor
        handleInner.style.borderRadius = '50%'
        handleInner.style.boxSizing = 'border-box'

        handle.appendChild(handleInner)
        return handle
      }

      // 创建左上角手柄
      pluginState.topLeftHandle = createHandle('nwse-resize')
      pluginState.topLeftHandle.style.top = `-${config.handleSize / 2}px`
      pluginState.topLeftHandle.style.left = `-${config.handleSize / 2}px`

      // 创建右下角手柄
      pluginState.bottomRightHandle = createHandle('nwse-resize')
      pluginState.bottomRightHandle.style.bottom = `-${config.handleSize / 2}px`
      pluginState.bottomRightHandle.style.right = `-${config.handleSize / 2}px`

      // 将手柄添加到边框覆盖层
      pluginState.selectionBorderOverlay.appendChild(pluginState.topLeftHandle)
      pluginState.selectionBorderOverlay.appendChild(pluginState.bottomRightHandle)

      // 将覆盖层添加到容器
      pluginState.overlayContainer.appendChild(pluginState.selectionBackgroundOverlay)
      pluginState.overlayContainer.appendChild(pluginState.selectionBorderOverlay)

      // 将覆盖层容器添加到编辑器
      const editorContainer = editorView.dom.parentNode
      if (editorContainer) editorContainer.appendChild(pluginState.overlayContainer)

      return {
        update(view) {
          updateTableOverlay(view) // 使用导出的函数
        },
        destroy() {
          // 清理
          const state = tableOverlayPluginKey.getState(editorView.state)
          if (state.overlayContainer && state.overlayContainer.parentNode) {
            state.overlayContainer.parentNode.removeChild(state.overlayContainer)
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
            view.dispatch(
              view.state.tr.setMeta(tableOverlayPluginKey, {
                activeCellPos: $cell.pos,
              }),
            )
          }
          return false
        },
      },
    },
  })
}
