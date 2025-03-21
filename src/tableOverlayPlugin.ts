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
  activeCellRect: CellRect | null
  selectionRects: CellRect[] // 存储选择的多个单元格
}

// 默认配置
interface OverlayConfig {
  selectionBorderColor: string
  selectionBorderWidth: number
  handleSize: number
  handleBorderColor: string
  handleBackgroundColor: string
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

  // DOM元素引用
  let overlayContainer: HTMLElement | null = null
  let selectionBackgroundOverlay: HTMLElement | null = null
  let selectionBorderOverlay: HTMLElement | null = null
  let topLeftHandle: HTMLElement | null = null
  let bottomRightHandle: HTMLElement | null = null

  return new Plugin<TableOverlayState>({
    key: tableOverlayPluginKey,

    state: {
      // 初始化状态
      init() {
        return { activeCellRect: null, selectionRects: [] }
      },

      // 应用状态变更
      apply(tr, prev) {
        // 检查插件的元数据更新
        const overlayMeta = tr.getMeta(tableOverlayPluginKey)

        if (overlayMeta) return overlayMeta

        return prev
      },
    },

    view(editorView) {
      // 创建覆盖层容器
      overlayContainer = document.createElement('div')
      overlayContainer.className = 'table-selection-overlay'
      overlayContainer.style.position = 'absolute'
      overlayContainer.style.top = '0'
      overlayContainer.style.left = '0'
      overlayContainer.style.right = '0'
      overlayContainer.style.bottom = '0'
      overlayContainer.style.pointerEvents = 'none'
      overlayContainer.style.zIndex = '2'

      // 创建背景覆盖层
      selectionBackgroundOverlay = document.createElement('div')
      selectionBackgroundOverlay.style.position = 'absolute'
      selectionBackgroundOverlay.style.left = '0px'
      selectionBackgroundOverlay.style.top = '0px'
      selectionBackgroundOverlay.style.width = '0px'
      selectionBackgroundOverlay.style.height = '0px'
      selectionBackgroundOverlay.style.zIndex = '2'
      selectionBackgroundOverlay.style.borderRadius = '2px'
      selectionBackgroundOverlay.style.display = 'none'

      // 创建带边框和手柄的覆盖层
      selectionBorderOverlay = document.createElement('div')
      selectionBorderOverlay.style.position = 'absolute'
      selectionBorderOverlay.style.left = '0px'
      selectionBorderOverlay.style.top = '0px'
      selectionBorderOverlay.style.width = '0px'
      selectionBorderOverlay.style.height = '0px'
      selectionBorderOverlay.style.border = `${config.selectionBorderWidth}px solid ${config.selectionBorderColor}`
      selectionBorderOverlay.style.borderRadius = '2px'
      selectionBorderOverlay.style.zIndex = '3'
      selectionBorderOverlay.style.display = 'none'
      selectionBorderOverlay.style.boxSizing = 'border-box'

      // 创建左上角手柄
      topLeftHandle = createHandle('nwse-resize')
      topLeftHandle.style.top = `-${config.handleSize / 2}px`
      topLeftHandle.style.left = `-${config.handleSize / 2}px`

      // 创建右下角手柄
      bottomRightHandle = createHandle('nwse-resize')
      bottomRightHandle.style.bottom = `-${config.handleSize / 2}px`
      bottomRightHandle.style.right = `-${config.handleSize / 2}px`

      // 将手柄添加到边框覆盖层
      selectionBorderOverlay.appendChild(topLeftHandle)
      selectionBorderOverlay.appendChild(bottomRightHandle)

      // 将覆盖层添加到容器
      overlayContainer.appendChild(selectionBackgroundOverlay)
      overlayContainer.appendChild(selectionBorderOverlay)

      // 将覆盖层容器添加到编辑器
      const editorContainer = editorView.dom.parentNode
      if (editorContainer) editorContainer.appendChild(overlayContainer)

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

      return {
        update(view) {
          updateOverlay(view)
        },
        destroy() {
          // 清理
          if (overlayContainer && overlayContainer.parentNode) {
            overlayContainer.parentNode.removeChild(overlayContainer)
          }
          overlayContainer = null
          selectionBackgroundOverlay = null
          selectionBorderOverlay = null
          topLeftHandle = null
          bottomRightHandle = null
        },
      }
    },

    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          // 1. 获取鼠标坐标对应的文档位置
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (!pos) return false // 如果鼠标不在编辑器上，则退出

          // 2. 使用 cellAround 函数查找该位置是否在单元格内
          const $cell = cellAround(view.state.doc.resolve(pos.pos))
          if ($cell) {
            const cellPos = $cell.pos
            const cellRect = getCellRect(view, cellPos)

            // 更新覆盖层状态
            if (cellRect) {
              view.dispatch(
                view.state.tr.setMeta(tableOverlayPluginKey, {
                  activeCellRect: cellRect,
                  selectionRects: [],
                }),
              )
            }
          }
        },
        mousemove(view) {
          const currentState = tableOverlayPluginKey.getState(view.state)
          if (currentState.activeCellRect) {
            const cellRect = getCellRect(view, currentState.activeCellRect.cellPos)
            if (cellRect) {
              view.dispatch(
                view.state.tr.setMeta(tableOverlayPluginKey, {
                  activeCellRect: cellRect,
                  selectionRects: currentState.selectionRects,
                }),
              )
            }
          } else {
            // console.log(currentState)
          }
        },
      },
    },
  })

  // 更新覆盖层位置和可见性
  function updateOverlay(view: EditorView) {
    if (!selectionBackgroundOverlay || !selectionBorderOverlay) return

    const selection = view.state.selection

    // 如果是单元格选择
    if (selection instanceof CellSelection) {
      const selRect = getSelectionRect(view, selection)

      if (selRect) {
        // 更新背景覆盖层
        selectionBackgroundOverlay.style.left = `${selRect.left}px`
        selectionBackgroundOverlay.style.top = `${selRect.top}px`
        selectionBackgroundOverlay.style.width = `${selRect.width}px`
        selectionBackgroundOverlay.style.height = `${selRect.height}px`
        selectionBackgroundOverlay.style.display = 'block'

        // 更新边框覆盖层和手柄
        selectionBorderOverlay.style.left = `${selRect.left}px`
        selectionBorderOverlay.style.top = `${selRect.top}px`
        selectionBorderOverlay.style.width = `${selRect.width}px`
        selectionBorderOverlay.style.height = `${selRect.height}px`
        selectionBorderOverlay.style.display = 'block'
      } else {
        selectionBackgroundOverlay.style.display = 'none'
        selectionBorderOverlay.style.display = 'none'
      }
    } else {
      // 如果不是单元格选择
      const state = tableOverlayPluginKey.getState(view.state)

      if (state && state.activeCellRect) {
        const rect = state.activeCellRect

        // 更新背景覆盖层
        selectionBackgroundOverlay.style.left = `${rect.left}px`
        selectionBackgroundOverlay.style.top = `${rect.top}px`
        selectionBackgroundOverlay.style.width = `${rect.width}px`
        selectionBackgroundOverlay.style.height = `${rect.height}px`
        selectionBackgroundOverlay.style.display = 'block'

        // 更新边框覆盖层和手柄
        selectionBorderOverlay.style.left = `${rect.left}px`
        selectionBorderOverlay.style.top = `${rect.top}px`
        selectionBorderOverlay.style.width = `${rect.width}px`
        selectionBorderOverlay.style.height = `${rect.height}px`
        selectionBorderOverlay.style.display = 'block'
      } else {
        selectionBackgroundOverlay.style.display = 'none'
        selectionBorderOverlay.style.display = 'none'
      }
    }
  }

  // 获取单元格的位置和尺寸
  function getCellRect(view: EditorView, cellPos: number): CellRect | null {
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

  // 获取选择区域的矩形
  function getSelectionRect(view: EditorView, selection: CellSelection): { left: number; top: number; width: number; height: number } | null {
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
}
