// tableOverlayPlugin.ts
import { Plugin, PluginKey } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { cellAround } from './util'
import { CellSelection } from './cellselection'

// 创建插件键以标识我们的插件
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

// 定义偏移配置
interface OffsetConfig {
  horizontal: number
  vertical: number
  borderWidth: number
}

/**
 * 创建表格覆盖层插件
 * 支持单击高亮单元格和按住左键框选多个单元格
 */
export function tableOverlayPlugin(options: Partial<OffsetConfig> = {}) {
  // 默认配置
  const config: OffsetConfig = {
    horizontal: -1, // 水平方向的偏移量
    vertical: -2, // 垂直方向的偏移量
    borderWidth: 2, // 边框宽度
    ...options,
  }

  // 用于存储覆盖层DOM元素的引用
  let overlayContainer: HTMLElement | null = null
  let cellOverlay: HTMLElement | null = null

  return new Plugin<TableOverlayState>({
    key: tableOverlayPluginKey,

    state: {
      // 初始化状态
      init() {
        return { activeCellRect: null, selectionRects: [] }
      },

      // 应用状态变更
      apply(tr, prev) {
        // 如果是我们插件的元数据更新
        const overlayMeta = tr.getMeta(tableOverlayPluginKey)
        if (overlayMeta !== undefined) {
          return overlayMeta
        }

        // 如果文档变化，重新计算位置
        if (tr.docChanged) {
          return { activeCellRect: null, selectionRects: [] }
        }

        // 如果选择改变了
        if (tr.selectionSet) {
          const selection = tr.selection
          if (selection instanceof CellSelection) {
            // 当出现CellSelection时，清除activeCellRect
            return {
              activeCellRect: null,
              selectionRects: [],
            }
          }
        }

        return prev
      },
    },

    view(editorView) {
      // 创建覆盖层容器
      overlayContainer = document.createElement('div')
      overlayContainer.style.position = 'absolute'
      overlayContainer.style.top = '0'
      overlayContainer.style.left = '0'
      overlayContainer.style.pointerEvents = 'none' // 避免干扰用户操作
      overlayContainer.className = 'table-overlay-container'

      // 创建单元格覆盖层（用于单击和框选）
      cellOverlay = document.createElement('div')
      cellOverlay.className = 'table-cell-overlay'
      cellOverlay.style.position = 'absolute'
      cellOverlay.style.zIndex = '3'
      cellOverlay.style.boxSizing = 'content-box'
      cellOverlay.style.border = `${config.borderWidth}px solid rgb(255, 50, 50)` // 红色边框
      cellOverlay.style.background = 'rgba(255, 50, 50, 0.1)' // 淡红色背景
      cellOverlay.style.display = 'none' // 初始隐藏

      overlayContainer.appendChild(cellOverlay)

      // 将覆盖层容器添加到编辑器外部容器中
      const editorContainer = editorView.dom.parentNode
      if (editorContainer && editorContainer instanceof HTMLElement) {
        // 确保编辑器容器有定位样式，以便绝对定位正常工作
        if (getComputedStyle(editorContainer).position === 'static') {
          editorContainer.style.position = 'relative'
        }
        editorContainer.appendChild(overlayContainer)
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
          cellOverlay = null
        },
      }
    },

    props: {
      // 处理鼠标点击事件
      handleClick(view, pos, event) {
        // 检查是否是鼠标左键点击
        if (event.button !== 0) return false

        // 查找点击位置所在的单元格
        const $cell = cellAround(view.state.doc.resolve(pos))

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

          return false // 不阻止事件传播
        }

        // 如果不在单元格中点击，清除活动单元格
        const state = tableOverlayPluginKey.getState(view.state)
        if (state && (state.activeCellRect || state.selectionRects.length > 0)) {
          view.dispatch(
            view.state.tr.setMeta(tableOverlayPluginKey, {
              activeCellRect: null,
              selectionRects: [],
            }),
          )
        }

        return false
      },
    },
  })

  // 更新覆盖层位置和可见性
  function updateOverlay(view: EditorView) {
    if (!cellOverlay) return

    const state = tableOverlayPluginKey.getState(view.state)
    if (!state) return

    // 处理单元格选择 - 检查当前选择是否是CellSelection
    const selection = view.state.selection
    if (selection instanceof CellSelection) {
      // 获取选择范围的所有单元格
      const selRect = getSelectionRect(view, selection)
      if (selRect) {
        // 显示选择区域
        cellOverlay.style.left = `${selRect.left + config.horizontal}px`
        cellOverlay.style.top = `${selRect.top + config.vertical}px`
        cellOverlay.style.width = `${selRect.width}px`
        cellOverlay.style.height = `${selRect.height}px`
        cellOverlay.style.display = 'block'
      } else {
        cellOverlay.style.display = 'none'
      }
    }
    // 如果不是CellSelection但有活动单元格，则显示单个单元格高亮
    else if (state.activeCellRect) {
      const rect = state.activeCellRect
      cellOverlay.style.left = `${rect.left + config.horizontal}px`
      cellOverlay.style.top = `${rect.top + config.vertical}px`
      cellOverlay.style.width = `${rect.width}px`
      cellOverlay.style.height = `${rect.height}px`
      cellOverlay.style.display = 'block'
    }
    // 如果既不是CellSelection也没有活动单元格，则隐藏覆盖层
    else {
      cellOverlay.style.display = 'none'
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

      return {
        left,
        top,
        width: right - left,
        height: bottom - top,
      }
    } catch (e) {
      console.error('Error getting selection rect:', e)
      return null
    }
  }
}
