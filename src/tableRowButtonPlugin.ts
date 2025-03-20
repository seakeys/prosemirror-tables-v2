import { EditorState, Plugin, PluginKey, Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { cellAround } from './util'
import { TableMap } from './tablemap'
import { addRowBefore, addRowAfter, deleteRow } from './commands'
import { CellSelection } from './cellselection'

// 行按钮插件
export const tableRowButtonPluginKey = new PluginKey('tableRowButton')

export function tableRowButtonPlugin() {
  // 创建一个按钮元素缓存
  let buttonContainer: HTMLElement | null = null
  let dropdown: HTMLElement | null = null
  let dropdownContainer: HTMLElement | null = null
  // 添加遮罩层
  let overlay: HTMLElement | null = null

  return new Plugin({
    key: tableRowButtonPluginKey,

    state: {
      // 初始化插件状态
      init() {
        return { hoveredRow: null, tableStart: null, tableMap: null }
      },

      // 处理状态更新
      apply(tr, prev) {
        // 如果文档变化，重置状态
        if (tr.docChanged) {
          return { hoveredRow: null, tableStart: null, tableMap: null }
        }

        // 从元数据中获取行信息
        const meta = tr.getMeta(tableRowButtonPluginKey)
        if (meta) {
          return meta
        }

        return prev
      },
    },

    view(editorView) {
      // 创建按钮容器
      buttonContainer = document.createElement('div')
      buttonContainer.className = 'table-row-button-container'
      buttonContainer.style.position = 'absolute'
      buttonContainer.style.display = 'none'
      buttonContainer.style.left = '0'
      buttonContainer.style.zIndex = '5'
      buttonContainer.style.pointerEvents = 'auto'

      // 创建按钮元素
      const button = document.createElement('button')
      button.className = 'table-row-button'
      button.textContent = '≡'
      button.style.width = '16px'
      button.style.height = '26px'
      button.style.padding = '0'
      button.style.border = '1px solid #ddd'
      button.style.background = '#f5f5f5'
      button.style.borderRadius = '3px'
      button.style.cursor = 'pointer'

      // 创建下拉菜单容器（新增的父级元素）
      dropdownContainer = document.createElement('div')
      dropdownContainer.className = 'table-row-dropdown-container'
      dropdownContainer.style.position = 'absolute'
      dropdownContainer.style.left = '20px'
      dropdownContainer.style.top = '0'
      dropdownContainer.style.display = 'none'

      // 创建遮罩层
      overlay = document.createElement('div')
      overlay.className = 'table-row-overlay'
      overlay.style.position = 'fixed'
      overlay.style.top = '0'
      overlay.style.left = '0'
      overlay.style.width = '100vw'
      overlay.style.height = '100vh'
      overlay.style.background = 'transparent'
      overlay.style.zIndex = '5'
      overlay.style.display = 'block'

      // 为遮罩层添加点击事件，关闭下拉菜单
      overlay.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        // 隐藏整个下拉菜单容器
        if (dropdownContainer) dropdownContainer.style.display = 'none'
      })

      // 创建下拉菜单
      dropdown = document.createElement('div')
      dropdown.className = 'table-row-dropdown'
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

      // 添加菜单项
      interface RowMenuItem {
        text: string
        command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean
        selectAfter: ((state: { hoveredRow: number }) => number) | null
      }

      const menuItems: RowMenuItem[] = [
        { text: '在前插入行', command: addRowBefore, selectAfter: (state) => state.hoveredRow },
        { text: '在后插入行', command: addRowAfter, selectAfter: (state) => state.hoveredRow + 1 },
        { text: '删除行', command: deleteRow, selectAfter: null },
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

          const state = tableRowButtonPluginKey.getState(editorView.state)
          if (state && state.hoveredRow !== null && state.tableStart !== null && state.tableMap) {
            // 在执行命令前，先选中当前行
            selectRow(editorView, state.hoveredRow, state.tableStart, state.tableMap)

            // 执行相应的命令
            item.command(editorView.state, editorView.dispatch)

            // 如果需要选中插入后的行
            if (item.selectAfter !== null) {
              // 获取更新后的表格状态
              setTimeout(() => {
                const newState = editorView.state
                const $cell = cellAround(newState.selection.$head)
                if ($cell) {
                  const table = $cell.node(-1)
                  const tableStart = $cell.start(-1)
                  const map = TableMap.get(table)

                  // 计算要选中的行索引
                  if (item.selectAfter) {
                    const rowToSelect = item.selectAfter(state)
                    // 选中新行
                    selectRow(editorView, rowToSelect, tableStart, map)
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

      // 将下拉菜单和遮罩层添加到下拉菜单容器中
      dropdownContainer.appendChild(overlay)
      dropdownContainer.appendChild(dropdown)

      buttonContainer.appendChild(button)
      buttonContainer.appendChild(dropdownContainer)

      // 按钮点击事件
      button.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

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

        // 检查编辑器是否有活动的单元格
        const state = tableRowButtonPluginKey.getState(editorView.state)
        if (!state || state.hoveredRow === null) {
          // 如果没有活动单元格，隐藏按钮
          setTimeout(() => {
            // 再次检查，防止用户快速移回
            if (buttonContainer && buttonContainer.dataset.hover !== 'true' && dropdownContainer && dropdownContainer.style.display === 'none') {
              buttonContainer.style.display = 'none'
            }
          }, 200)
        }
      })

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

          // 找到单元格所在的行索引
          const rowIndex = $cell.index(-1)

          // 获取当前状态
          const currentState = tableRowButtonPluginKey.getState(view.state)

          // 只有当行索引变化时才更新状态，减少不必要的重渲染
          if (!currentState || currentState.hoveredRow !== rowIndex || currentState.tableStart !== tableStart) {
            // 更新插件状态
            view.dispatch(
              view.state.tr.setMeta(tableRowButtonPluginKey, {
                hoveredRow: rowIndex,
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
                view.state.tr.setMeta(tableRowButtonPluginKey, {
                  hoveredRow: null,
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

  // 选择整行的辅助函数
  function selectRow(view: EditorView, rowIndex: number, tableStart: number, map: TableMap) {
    try {
      // 找到行的左侧和右侧单元格位置
      const left = rowIndex * map.width
      const right = (rowIndex + 1) * map.width - 1
      const leftPos = map.map[left]
      const rightPos = map.map[right]

      // 创建单元格选择
      const $anchor = view.state.doc.resolve(tableStart + leftPos)
      const $head = view.state.doc.resolve(tableStart + rightPos)

      if ($anchor && $head) {
        // 创建行选择
        const cellSelection = new CellSelection($anchor, $head)

        // 应用选择
        view.dispatch(view.state.tr.setSelection(cellSelection))
      }
    } catch (error) {
      console.error('选择行时出错:', error)
    }
  }

  // 更新按钮位置的辅助函数
  function updateButtonPosition(view: EditorView) {
    if (!buttonContainer) return

    const state = tableRowButtonPluginKey.getState(view.state)
    if (!state || state.hoveredRow === null || state.tableStart === null) {
      return
    }

    // 获取表格行元素
    const tableDOM = view.nodeDOM(state.tableStart - 1) as HTMLElement
    if (!tableDOM || !tableDOM.querySelector('tbody')) {
      return
    }

    const rows = tableDOM.querySelector('tbody')!.querySelectorAll('tr')
    if (state.hoveredRow >= rows.length) {
      return
    }

    const rowElement = rows[state.hoveredRow]
    const rowRect = rowElement.getBoundingClientRect()
    const editorRect = view.dom.getBoundingClientRect()

    // 设置按钮位置
    buttonContainer.style.top = rowRect.top - editorRect.top + (rowRect.height - 26) / 2 + 'px'

    // 获取第一个单元格
    const firstCell = rowElement.querySelector('td, th')
    const firstCellRect = firstCell ? firstCell.getBoundingClientRect() : rowRect

    // 计算按钮位置，使其中间垂直位置与单元格左边框重合
    const buttonPosition = firstCellRect.left - editorRect.left - 8
    buttonContainer.style.left = buttonPosition + 'px'
    buttonContainer.style.display = 'block'
  }
}
