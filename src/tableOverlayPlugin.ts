// tableOverlayPlugin.ts - 垂直方向调整版
import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view'
import { cellAround } from './util'

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
}

// 定义偏移配置
interface OffsetConfig {
  horizontal: number
  vertical: number
  borderWidth: number
}

/**
 * 创建表格覆盖层插件
 * 使用Notion类似的绝对定位覆盖层实现活动单元格的红色边框
 */
export function tableOverlayPlugin(options: Partial<OffsetConfig> = {}) {
  // 默认配置
  const config: OffsetConfig = {
    horizontal: -1, // 水平方向的偏移量
    vertical: 25, // 垂直方向的偏移量（增加为-2）
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
        return { activeCellRect: null }
      },

      // 应用状态变更
      apply(tr, prev) {
        // 检查事务中是否有我们插件的元数据
        const overlayMeta = tr.getMeta(tableOverlayPluginKey)
        if (overlayMeta !== undefined) {
          return { activeCellRect: overlayMeta }
        }

        // 如果文档变化，重新计算位置
        if (tr.docChanged && prev.activeCellRect) {
          return { activeCellRect: null } // 简单处理：文档变化时清除高亮
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

      // 创建单元格覆盖层
      cellOverlay = document.createElement('div')
      cellOverlay.className = 'table-cell-overlay'
      cellOverlay.style.position = 'absolute'
      cellOverlay.style.zIndex = '3'
      cellOverlay.style.boxSizing = 'content-box' // 确保边框不会影响尺寸计算
      cellOverlay.style.border = `${config.borderWidth}px solid rgb(255, 50, 50)` // 红色边框
      cellOverlay.style.display = 'none' // 初始隐藏

      // 为调试添加数据属性
      cellOverlay.dataset.offsetH = config.horizontal.toString()
      cellOverlay.dataset.offsetV = config.vertical.toString()

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
        update(view, prevState) {
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
        // 查找点击位置所在的单元格
        const $cell = cellAround(view.state.doc.resolve(pos))

        if ($cell) {
          const cellPos = $cell.pos
          const cellRect = getCellRect(view, cellPos)

          // 更新覆盖层状态
          if (cellRect) {
            view.dispatch(view.state.tr.setMeta(tableOverlayPluginKey, cellRect))
          }

          return false // 不阻止事件传播
        }

        // 如果不在单元格中点击，清除活动单元格
        const state = tableOverlayPluginKey.getState(view.state)
        if (state && state.activeCellRect) {
          view.dispatch(view.state.tr.setMeta(tableOverlayPluginKey, null))
        }

        return false
      },
    },
  })

  // 更新覆盖层位置和可见性
  function updateOverlay(view: EditorView) {
    if (!cellOverlay) return

    const state = tableOverlayPluginKey.getState(view.state)
    if (!state || !state.activeCellRect) {
      cellOverlay.style.display = 'none'
      return
    }

    const rect = state.activeCellRect
    console.log(rect)

    // 设置覆盖层位置和尺寸，使用不同的水平和垂直偏移
    cellOverlay.style.left = `${rect.left + config.horizontal}px`
    cellOverlay.style.top = `${rect.top + config.vertical}px` // 使用垂直偏移
    cellOverlay.style.width = `${rect.width}px` // 不改变宽度
    cellOverlay.style.height = `${rect.height}px` // 不改变高度
    cellOverlay.style.display = 'block'

    // 添加调试信息作为数据属性
    cellOverlay.dataset.rectLeft = rect.left.toString()
    cellOverlay.dataset.rectTop = rect.top.toString()
    cellOverlay.dataset.rectWidth = rect.width.toString()
    cellOverlay.dataset.rectHeight = rect.height.toString()
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

      console.log(cellRect)

      // 获取计算样式
      const computedStyle = window.getComputedStyle(dom)

      // 获取边框宽度
      const borderLeftWidth = parseFloat(computedStyle.borderLeftWidth) || 0
      const borderTopWidth = parseFloat(computedStyle.borderTopWidth) || 0
      const borderRightWidth = parseFloat(computedStyle.borderRightWidth) || 0
      const borderBottomWidth = parseFloat(computedStyle.borderBottomWidth) || 0

      // 检查边框合并模式
      const tableElement = dom.closest('table')
      const isBorderCollapse = tableElement ? window.getComputedStyle(tableElement).borderCollapse === 'collapse' : false

      // 记录调试信息到控制台
      console.log('Cell debug info:', {
        borderLeftWidth,
        borderTopWidth,
        borderRightWidth,
        borderBottomWidth,
        isBorderCollapse,
        padding: computedStyle.padding,
        boxSizing: computedStyle.boxSizing,
      })

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
}
