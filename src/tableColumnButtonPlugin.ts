import { Plugin, PluginKey } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { cellAround } from './util'
import { TableMap } from './tablemap'

// 创建插件键
export const columnButtonPluginKey = new PluginKey('tableColumnButton')

export function tableColumnButtonPlugin() {
  // 创建一个按钮元素缓存
  let buttonContainer: HTMLElement | null = null

  return new Plugin({
    key: columnButtonPluginKey,

    state: {
      // 初始化插件状态
      init() {
        return { hoveredColumn: null, tableStart: null, tableMap: null }
      },

      // 处理状态更新
      apply(tr, prev) {
        // 如果文档变化，重置状态
        if (tr.docChanged) {
          return { hoveredColumn: null, tableStart: null, tableMap: null }
        }

        // 从元数据中获取列信息
        const meta = tr.getMeta(columnButtonPluginKey)
        if (meta) {
          return meta
        }

        return prev
      },
    },

    view(editorView) {
      // 创建按钮容器
      buttonContainer = document.createElement('div')
      buttonContainer.className = 'table-column-button-container'
      buttonContainer.style.position = 'absolute'
      buttonContainer.style.display = 'none'
      buttonContainer.style.top = '0'
      buttonContainer.style.zIndex = '5'
      buttonContainer.style.pointerEvents = 'auto'

      // 创建按钮元素
      const button = document.createElement('button')
      button.className = 'table-column-button'
      button.textContent = '≡'
      button.style.width = '26px'
      button.style.height = '16px'
      button.style.padding = '0'
      button.style.border = '1px solid #ddd'
      button.style.background = '#f5f5f5'
      button.style.borderRadius = '3px'
      button.style.cursor = 'pointer'

      // 按钮点击事件
      button.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        const state = columnButtonPluginKey.getState(editorView.state)
        if (state && state.hoveredColumn !== null) {
          // 这里可以添加按钮点击后的操作
          console.log('列按钮被点击:', state.hoveredColumn)
          // 例如：dispatch某个命令 - 这里只做了日志记录
        }
      })

      // 添加鼠标移入移出事件，防止按钮闪烁
      buttonContainer.addEventListener('mouseenter', () => {
        // 鼠标进入按钮区域
        if (buttonContainer) buttonContainer.dataset.hover = 'true'
      })

      buttonContainer.addEventListener('mouseleave', () => {
        // 鼠标离开按钮区域
        if (buttonContainer) buttonContainer.dataset.hover = 'false'

        // 检查编辑器是否有活动的单元格
        const state = columnButtonPluginKey.getState(editorView.state)
        if (!state || state.hoveredColumn === null) {
          // 如果没有活动列，隐藏按钮
          setTimeout(() => {
            // 再次检查，防止用户快速移回
            if (buttonContainer && buttonContainer.dataset.hover !== 'true') {
              buttonContainer.style.display = 'none'
            }
          }, 200)
        }
      })

      buttonContainer.appendChild(button)

      // 添加到编辑器容器
      const editorContainer = editorView.dom.parentNode
      if (editorContainer && editorContainer instanceof HTMLElement) {
        if (getComputedStyle(editorContainer).position === 'static') {
          editorContainer.style.position = 'relative'
        }
        editorContainer.appendChild(buttonContainer)
      }

      return {
        update(view) {
          updateButtonPosition(view)
        },
        destroy() {
          if (buttonContainer && buttonContainer.parentNode) {
            buttonContainer.parentNode.removeChild(buttonContainer)
          }
          buttonContainer = null
        },
      }
    },

    props: {
      handleDOMEvents: {
        mousemove(view, event) {
          // 检查鼠标是否在按钮上
          if (buttonContainer && event.target instanceof Node && buttonContainer.contains(event.target)) {
            // 鼠标在按钮上，保持按钮显示
            return false
          }

          // 获取鼠标位置对应的文档位置
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (!pos) return false

          // 查找该位置是否在单元格内
          const $cell = cellAround(view.state.doc.resolve(pos.pos))
          if (!$cell) {
            // 不在单元格内，不处理
            return false
          }

          // 获取表格信息
          const table = $cell.node(-1)
          const tableStart = $cell.start(-1)
          const map = TableMap.get(table)

          // 计算列索引
          const cellPos = $cell.pos - tableStart
          const cellIndex = map.map.findIndex((pos) => pos === cellPos)
          const colIndex = cellIndex % map.width

          // 获取当前状态
          const currentState = columnButtonPluginKey.getState(view.state)

          // 只有当列索引变化时才更新状态，减少不必要的重渲染
          if (!currentState || currentState.hoveredColumn !== colIndex || currentState.tableStart !== tableStart) {
            // 更新插件状态
            view.dispatch(
              view.state.tr.setMeta(columnButtonPluginKey, {
                hoveredColumn: colIndex,
                tableStart,
                tableMap: map,
              }),
            )
          }

          return false
        },
        mouseleave(view, event) {
          // 检查鼠标是否移动到按钮上
          const relatedTarget = event.relatedTarget
          if (buttonContainer && relatedTarget instanceof Node && (buttonContainer === relatedTarget || buttonContainer.contains(relatedTarget))) {
            // 鼠标移动到按钮上，不隐藏按钮
            return false
          }

          // 鼠标离开编辑器区域且不是移到按钮上，隐藏按钮
          setTimeout(() => {
            // 再次检查鼠标位置，确保不是在按钮上
            const elementAtPointer = document.elementFromPoint(event.clientX, event.clientY)
            if (buttonContainer && elementAtPointer && !buttonContainer.contains(elementAtPointer as Node)) {
              buttonContainer.style.display = 'none'
              view.dispatch(
                view.state.tr.setMeta(columnButtonPluginKey, {
                  hoveredColumn: null,
                  tableStart: null,
                  tableMap: null,
                }),
              )
            }
          }, 100)
          return false
        },
      },
    },
  })

  // 更新按钮位置的辅助函数
  function updateButtonPosition(view: EditorView) {
    if (!buttonContainer) return

    const state = columnButtonPluginKey.getState(view.state)
    if (!state || state.hoveredColumn === null || state.tableStart === null || !state.tableMap) {
      // 不立即隐藏按钮，避免在列间移动时闪烁
      return
    }

    // 获取表格元素
    const tableDOM = view.nodeDOM(state.tableStart - 1) as HTMLElement
    if (!tableDOM || !tableDOM.querySelector('tbody')) {
      return
    }

    // 获取第一行中对应列的单元格
    const firstRow = tableDOM.querySelector('tr')
    if (!firstRow) return

    // 获取所有单元格
    const cells = firstRow.querySelectorAll('td, th')

    // 找到对应列的单元格
    let colElement: HTMLElement | null = null
    let cellIndex = 0
    let colSpanSum = 0

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i] as HTMLElement
      const colspan = parseInt(cell.getAttribute('colspan') || '1')

      if (colSpanSum <= state.hoveredColumn && state.hoveredColumn < colSpanSum + colspan) {
        colElement = cell
        cellIndex = i
        break
      }

      colSpanSum += colspan
    }

    if (!colElement) return

    const colRect = colElement.getBoundingClientRect()
    const editorRect = view.dom.getBoundingClientRect()

    // 设置按钮位置，使其水平居中于单元格，垂直位置在单元格上方
    buttonContainer.style.left = colRect.left - editorRect.left + (colRect.width - 26) / 2 + 'px'
    buttonContainer.style.top = colRect.top - editorRect.top - 9 + 'px' // 16是按钮高度，4是额外间距
    buttonContainer.style.display = 'block'
  }
}
