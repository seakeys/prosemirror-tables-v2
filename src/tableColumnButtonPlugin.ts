import { Plugin, PluginKey, EditorState, Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { cellAround } from './util'
import { TableMap } from './tablemap'
import { addColumnBefore, addColumnAfter, deleteColumn } from './commands'
import { CellSelection } from './cellselection'
import { highlightRowOrColumn } from './tableOverlayPlugin'

// 创建插件键
export const tableColumnButtonPluginKey = new PluginKey('tableColumnButton')

export function tableColumnButtonPlugin() {
  // 创建一个按钮元素缓存
  let buttonContainer: HTMLElement | null = null
  let dropdown: HTMLElement | null = null
  let dropdownContainer: HTMLElement | null = null
  // 添加遮罩层
  let overlay: HTMLElement | null = null

  return new Plugin({
    key: tableColumnButtonPluginKey,

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
        const meta = tr.getMeta(tableColumnButtonPluginKey)
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

      // 创建下拉菜单容器（新增的父级元素）
      dropdownContainer = document.createElement('div')
      dropdownContainer.className = 'table-column-dropdown-container'
      dropdownContainer.style.position = 'absolute'
      dropdownContainer.style.left = '0'
      dropdownContainer.style.top = '20px'
      dropdownContainer.style.display = 'none'

      // 创建遮罩层
      overlay = document.createElement('div')
      overlay.className = 'table-column-overlay'
      overlay.style.position = 'fixed'
      overlay.style.top = '0'
      overlay.style.left = '0'
      overlay.style.width = '100vw'
      overlay.style.height = '100vh'
      overlay.style.background = 'transparent'
      overlay.style.zIndex = '5'
      overlay.style.display = 'block'

      // 创建下拉菜单
      dropdown = document.createElement('div')
      dropdown.className = 'table-column-dropdown'
      dropdown.style.position = 'absolute'
      dropdown.style.left = '0'
      dropdown.style.top = '0'
      dropdown.style.background = 'white'
      dropdown.style.border = '1px solid #ddd'
      dropdown.style.borderRadius = '3px'
      dropdown.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)'
      dropdown.style.zIndex = '6'
      dropdown.style.display = 'block'
      dropdown.style.minWidth = '120px'

      // 为遮罩层添加点击事件，关闭下拉菜单
      overlay.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        // 隐藏整个下拉菜单容器
        if (dropdownContainer) dropdownContainer.style.display = 'none'
      })

      // 定义菜单项接口类型
      interface ColumnMenuItem {
        text: string
        command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean
        selectAfter: ((state: { hoveredColumn: number }) => number) | null
      }

      // 添加菜单项
      const menuItems: ColumnMenuItem[] = [
        { text: '在左插入列', command: addColumnBefore, selectAfter: (state) => state.hoveredColumn },
        { text: '在右插入列', command: addColumnAfter, selectAfter: (state) => state.hoveredColumn + 1 },
        { text: '删除列', command: deleteColumn, selectAfter: null },
      ]

      menuItems.forEach((item) => {
        const menuItem = document.createElement('div')
        menuItem.textContent = item.text
        menuItem.style.padding = '6px 8px'
        menuItem.style.cursor = 'pointer'
        menuItem.addEventListener('mouseover', () => {
          menuItem.style.backgroundColor = '#f0f0f0'
        })
        menuItem.addEventListener('mouseout', () => {
          menuItem.style.backgroundColor = ''
        })
        menuItem.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()

          const state = tableColumnButtonPluginKey.getState(editorView.state)
          if (state && state.hoveredColumn !== null && state.tableStart !== null && state.tableMap) {
            // 在执行命令前，先选中当前列
            selectColumn(editorView, state.hoveredColumn, state.tableStart, state.tableMap)

            // 执行相应的命令
            item.command(editorView.state, editorView.dispatch)

            // 如果需要选中插入后的列
            if (item.selectAfter !== null) {
              // 获取更新后的表格状态
              setTimeout(() => {
                const newState = editorView.state
                const $cell = cellAround(newState.selection.$head)
                if ($cell) {
                  const table = $cell.node(-1)
                  const tableStart = $cell.start(-1)
                  const map = TableMap.get(table)

                  // 计算要选中的列索引
                  if (item.selectAfter) {
                    const colToSelect = item.selectAfter(state)
                    // 选中新列
                    selectColumn(editorView, colToSelect, tableStart, map)
                  }
                }
              }, 0)
            }

            // 隐藏下拉菜单容器
            if (dropdownContainer) dropdownContainer.style.display = 'none'

            // 隐藏按钮
            if (buttonContainer) buttonContainer.style.display = 'none'

            // 聚焦回编辑器
            editorView.focus()
          }
        })
        dropdown?.appendChild(menuItem)
      })

      // 按钮点击事件
      button.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        // 选中整列
        const state = tableColumnButtonPluginKey.getState(editorView.state)
        highlightRowOrColumn(editorView, 'column', state.hoveredColumn)

        // 切换下拉菜单容器的显示状态
        if (dropdownContainer) {
          const isVisible = dropdownContainer.style.display !== 'none'
          dropdownContainer.style.display = isVisible ? 'none' : 'block'
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

        // 检查编辑器是否有活动的列
        const state = tableColumnButtonPluginKey.getState(editorView.state)
        if (!state || state.hoveredColumn === null) {
          // 如果没有活动列，隐藏按钮
          setTimeout(() => {
            // 再次检查，防止用户快速移回
            if (buttonContainer && buttonContainer.dataset.hover !== 'true' && dropdownContainer && dropdownContainer.style.display === 'none') {
              buttonContainer.style.display = 'none'
            }
          }, 200)
        }
      })

      // 将下拉菜单和遮罩层添加到下拉菜单容器中
      dropdownContainer.appendChild(overlay)
      dropdownContainer.appendChild(dropdown)

      buttonContainer.appendChild(button)
      buttonContainer.appendChild(dropdownContainer)

      // 添加到编辑器容器
      const editorContainer = editorView.dom.parentNode
      if (editorContainer && editorContainer instanceof HTMLElement) {
        if (getComputedStyle(editorContainer).position === 'static') {
          editorContainer.style.position = 'relative'
        }
        editorContainer.appendChild(buttonContainer)
      }

      // 点击文档其他地方时隐藏下拉菜单
      document.addEventListener('click', (e) => {
        if (dropdownContainer && dropdownContainer.style.display === 'block' && buttonContainer && !buttonContainer.contains(e.target as Node)) {
          dropdownContainer.style.display = 'none'
        }
      })

      return {
        update(view) {
          updateButtonPosition(view)
        },
        destroy() {
          if (buttonContainer && buttonContainer.parentNode) {
            buttonContainer.parentNode.removeChild(buttonContainer)
          }
          buttonContainer = null
          dropdown = null
          dropdownContainer = null
          overlay = null
        },
      }
    },

    props: {
      handleDOMEvents: {
        mousemove(view, event) {
          // 检查鼠标是否在按钮或下拉菜单上
          if ((buttonContainer && event.target instanceof Node && buttonContainer.contains(event.target)) || (dropdownContainer && dropdownContainer.style.display === 'block')) {
            // 鼠标在按钮上，保持按钮显示
            return false
          }

          // 获取鼠标位置对应的文档位置
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (!pos) return false

          // 查找该位置是否在单元格内
          const $cell = cellAround(view.state.doc.resolve(pos.pos))
          if (!$cell) {
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
          const currentState = tableColumnButtonPluginKey.getState(view.state)

          // 只有当列索引变化时才更新状态，减少不必要的重渲染
          if (!currentState || currentState.hoveredColumn !== colIndex || currentState.tableStart !== tableStart) {
            // 更新插件状态
            view.dispatch(
              view.state.tr.setMeta(tableColumnButtonPluginKey, {
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
            return false
          }

          // 鼠标离开编辑器区域且不是移到按钮上，隐藏按钮
          setTimeout(() => {
            // 再次检查鼠标位置，确保不是在按钮上
            const elementAtPointer = document.elementFromPoint(event.clientX, event.clientY)
            if (buttonContainer && elementAtPointer && !buttonContainer.contains(elementAtPointer as Node) && dropdownContainer && dropdownContainer.style.display === 'none') {
              buttonContainer.style.display = 'none'
              view.dispatch(
                view.state.tr.setMeta(tableColumnButtonPluginKey, {
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

  // 选择整列的辅助函数
  function selectColumn(view: EditorView, colIndex: number, tableStart: number, map: TableMap) {
    try {
      // 找到第一行和最后一行的单元格位置
      const topCellPos = map.map[colIndex]
      const bottomCellPos = map.map[(map.height - 1) * map.width + colIndex]

      // 创建单元格选择
      const $anchor = view.state.doc.resolve(tableStart + topCellPos)
      const $head = view.state.doc.resolve(tableStart + bottomCellPos)

      if ($anchor && $head) {
        // 创建列选择
        const cellSelection = new CellSelection($anchor, $head)

        // 应用选择
        view.dispatch(view.state.tr.setSelection(cellSelection))
      }
    } catch (error) {
      console.error('选择列时出错:', error)
    }
  }

  // 更新按钮位置的辅助函数
  function updateButtonPosition(view: EditorView) {
    if (!buttonContainer) return

    const state = tableColumnButtonPluginKey.getState(view.state)
    if (!state || state.hoveredColumn === null || state.tableStart === null || !state.tableMap) {
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
    let colSpanSum = 0

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i] as HTMLElement
      const colspan = parseInt(cell.getAttribute('colspan') || '1')

      if (colSpanSum <= state.hoveredColumn && state.hoveredColumn < colSpanSum + colspan) {
        colElement = cell
        break
      }

      colSpanSum += colspan
    }

    if (!colElement) return

    const colRect = colElement.getBoundingClientRect()
    const editorRect = view.dom.getBoundingClientRect()

    // 设置按钮位置，使其水平居中于单元格，垂直位置在单元格上方
    buttonContainer.style.left = colRect.left - editorRect.left + (colRect.width - 26) / 2 + 'px'
    buttonContainer.style.top = colRect.top - editorRect.top - 16 - 4 + 'px' // 16是按钮高度，4是额外间距
    buttonContainer.style.display = 'block'
  }
}
