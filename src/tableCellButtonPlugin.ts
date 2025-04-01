import { EditorState, Plugin, PluginKey, TextSelection, Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { TableMap } from './tablemap'
import { cellAround } from './util'
import { EditorView } from 'prosemirror-view'
import { Node as PMNode } from 'prosemirror-model'
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, clearColumnContent, clearRowContent, deleteColumn, deleteRow, duplicateColumn, duplicateRow } from './commands'
import { CellSelection } from './cellselection'

// 菜单项接口定义
interface MenuItem {
  text: string
  icon: string
  shortcut: string // 快捷键
  command: (state: EditorState, dispatch?: (tr: Transaction) => void) => boolean
  selectAfter: (() => number) | null
}

interface TableButtonsState {
  activeRow: number
  activeCol: number
  decorationSet: DecorationSet
  sharedMenu: HTMLElement | null
  activeMenuType: 'row' | 'column' | null
  resizeHandler?: (() => void) | null // 存储resize事件处理函数
  scrollHandler?: (() => void) | null // 存储scroll事件处理函数
  editorView: EditorView | null
}

// 存储按钮DOM引用
const buttonRefs: { [key: string]: HTMLElement } = {}

export const tableButtonsKey = new PluginKey<TableButtonsState>('tableButtons')

export function tableCellButtonPlugin(): Plugin {
  return new Plugin<TableButtonsState>({
    key: tableButtonsKey,

    state: {
      init(_, state) {
        return {
          activeRow: -1,
          activeCol: -1,
          decorationSet: buildDecorationSet(state.doc),
          sharedMenu: null,
          activeMenuType: null,
          editorView: null,
        }
      },
      apply(tr, state) {
        // 更新下拉框位置
        requestAnimationFrame(() => state.editorView && handleWindowResize(state.editorView))

        // 如果文档变化，重建装饰集
        if (tr.docChanged) {
          return {
            ...state,
            decorationSet: buildDecorationSet(tr.doc),
          }
        }

        // 检查状态更新
        const meta = tr.getMeta(tableButtonsKey)
        if (meta) {
          // 如果更新了行列位置，更新按钮可见性
          if (meta.activeRow !== undefined && meta.activeCol !== undefined && (meta.activeRow !== state.activeRow || meta.activeCol !== state.activeCol)) {
            updateButtonsVisibility(meta.activeRow, meta.activeCol)
          }

          // 返回更新后的状态
          return { ...state, ...meta }
        }

        return state
      },
    },

    props: {
      decorations(state) {
        const pluginState = tableButtonsKey.getState(state)
        return pluginState?.decorationSet ?? DecorationSet.empty
      },

      handleDOMEvents: {
        mousemove(view, event) {
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (!pos) return false

          const $cell = cellAround(view.state.doc.resolve(pos.pos))
          if (!$cell) return false

          const table = $cell.node(-1)
          const tableStart = $cell.start(-1)
          const map = TableMap.get(table)

          const cellPos = $cell.pos - tableStart
          const cellIndex = map.map.findIndex((p) => p === cellPos)
          if (cellIndex === -1) return false

          const row = Math.floor(cellIndex / map.width)
          const col = cellIndex % map.width

          updateActivePosition(view, row, col)
          return false
        },

        mouseleave(view) {
          // 检查菜单是否显示
          const pluginState = tableButtonsKey.getState(view.state)
          const container = document.querySelector('.table-cell-menu-container') as HTMLElement
          if (!pluginState || !container || !container.classList.contains('visible')) {
            updateActivePosition(view, -1, -1)
          }
          return false
        },

        mousedown() {
          // 移出按钮背景色
          Object.keys(buttonRefs).forEach((key) => buttonRefs[key].classList.remove('focus'))
        },
      },
    },

    view(editorView) {
      const pluginState = tableButtonsKey.getState(editorView.state)

      if (pluginState) pluginState.editorView = editorView

      // 初始化共享菜单
      if (pluginState && !pluginState.sharedMenu) {
        pluginState.sharedMenu = createSharedMenu(editorView)
      }

      return {
        destroy() {
          const pluginState = tableButtonsKey.getState(editorView.state)
          // 清理菜单
          if (pluginState?.sharedMenu && pluginState?.sharedMenu?.parentNode) {
            pluginState?.sharedMenu.parentNode.removeChild(pluginState?.sharedMenu)
            pluginState.sharedMenu = null
          }
        },
      }
    },
  })
}

// 创建共享菜单
function createSharedMenu(view: EditorView) {
  // 创建父容器元素
  const container = document.createElement('div')
  container.className = 'table-cell-menu-container'

  // 创建透明层 - 作为菜单的背景，用于捕获点击事件
  const overlay = document.createElement('div')
  overlay.className = 'table-cell-menu-overlay'

  // 创建菜单元素
  const menu = document.createElement('div')
  menu.className = 'table-cell-menu'

  // 点击透明层关闭菜单
  overlay.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    hideMenu(view)
  })

  // 将子元素添加到容器
  container.appendChild(overlay)
  container.appendChild(menu)

  // 将容器添加到DOM
  document.body.appendChild(container)

  return menu
}

// 显示菜单
function showMenu(view: EditorView, button: HTMLElement, type: 'row' | 'column', row: number, col: number) {
  const pluginState = tableButtonsKey.getState(view.state)
  if (!pluginState) return

  // 添加选中背景色
  button.classList.add('focus')

  if (!pluginState.sharedMenu) pluginState.sharedMenu = createSharedMenu(view)

  // 清空现有内容
  pluginState.sharedMenu.innerHTML = ''

  // 根据类型填充菜单内容
  if (type === 'row') {
    // 行菜单项
    const menuItems: MenuItem[] = [
      {
        text: '在前插入行',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="9.194" height="11.877" viewBox="0 0 9.194 11.877"><defs><style>.a,.b{fill:none;}.b{stroke:#5f5f5f;}.c,.d{stroke:none;}.d{fill:#5f5f5f;}</style></defs><g transform="translate(692.659 -1609.758) rotate(90)"><g class="a" transform="translate(1610.635 687.562)"><path class="c" d="M0,0H11V1H0Z"/><path class="d" d="M 0 0 L 11 0 L 11 1 L 0 1 L 0 0 Z"/></g><path class="b" d="M6,0H0V6" transform="translate(1610.465 688.061) rotate(-45)"/></g></svg>',
        shortcut: '',
        command: addRowBefore,
        selectAfter: () => row,
      },
      {
        text: '在后插入行',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="9.194" height="11.877" viewBox="0 0 9.194 11.877"><defs><style>.a,.b{fill:none;}.b{stroke:#5f5f5f;}.c,.d{stroke:none;}.d{fill:#5f5f5f;}</style></defs><g transform="translate(-683.465 1621.635) rotate(-90)"><g class="a" transform="translate(1610.635 687.562)"><path class="c" d="M0,0H11V1H0Z"/><path class="d" d="M 0 0 L 11 0 L 11 1 L 0 1 L 0 0 Z"/></g><path class="b" d="M6,0H0V6" transform="translate(1610.465 688.061) rotate(-45)"/></g></svg>',
        shortcut: '',
        command: addRowAfter,
        selectAfter: () => row + 1,
      },
      {
        text: '创建副本',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><defs><style>.a{fill:#5f5f5f;}</style></defs><g transform="translate(12) rotate(90)"><path class="a" d="M10,1a1,1,0,0,1,1,1V7a1,1,0,0,1-1,1H5A1,1,0,0,1,4,7V2A1,1,0,0,1,5,1h5m0-1H5A2,2,0,0,0,3,2V7A2,2,0,0,0,5,9h5a2,2,0,0,0,2-2V2a2,2,0,0,0-2-2Z"/><path class="a" d="M7,11H2a1,1,0,0,1-1-1V5A1,1,0,0,1,2,4V3A2,2,0,0,0,0,5v5a2,2,0,0,0,2,2H7a2,2,0,0,0,2-2H8A1,1,0,0,1,7,11Z"/></g></svg>',
        shortcut: 'Ctrl+D',
        command: duplicateRow,
        selectAfter: null,
      },
      {
        text: '清除内容',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><defs><style>.a{fill:#5f5f5f;}</style></defs><g transform="translate(1490.264 -3155.368)"><path class="a" d="M-1484.264,3155.368a6,6,0,0,0-6,6,6,6,0,0,0,6,6,6,6,0,0,0,6-6A6,6,0,0,0-1484.264,3155.368Zm2.121,7.413a.5.5,0,0,1,0,.707.5.5,0,0,1-.707,0l-1.413-1.413-1.415,1.415a.5.5,0,0,1-.707,0,.5.5,0,0,1,0-.708l1.415-1.414-1.415-1.415a.5.5,0,0,1,0-.707.5.5,0,0,1,.707,0l1.415,1.415,1.413-1.414a.5.5,0,0,1,.707,0,.5.5,0,0,1,0,.707l-1.413,1.414Z"/></g></svg>',
        shortcut: '',
        command: clearRowContent,
        selectAfter: null,
      },
      {
        text: '删除',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="11.408" height="12" viewBox="0 0 11.408 12"><defs><style>.a{fill:#5f5f5f;}</style></defs><path class="a" d="M3.117,2.693h.937V1.432A.539.539,0,0,1,4.644.878H6.753a.539.539,0,0,1,.589.554V2.693h.937V1.373A1.31,1.31,0,0,0,6.818,0H4.578A1.31,1.31,0,0,0,3.117,1.373ZM.442,3.164h10.53a.445.445,0,0,0,.436-.448.44.44,0,0,0-.436-.442H.442a.445.445,0,0,0,0,.89ZM3.005,12h5.4a1.375,1.375,0,0,0,1.45-1.39l.412-7.557H9.322l-.4,7.457a.6.6,0,0,1-.613.6H3.088a.605.605,0,0,1-.607-.6L2.063,3.052H1.137l.419,7.563A1.363,1.363,0,0,0,3.005,12Zm.954-1.9a.333.333,0,0,0,.365-.348L4.142,4.573a.341.341,0,0,0-.365-.342.333.333,0,0,0-.366.348l.177,5.176A.344.344,0,0,0,3.96,10.1Zm1.744,0a.351.351,0,0,0,.383-.348V4.578A.351.351,0,0,0,5.7,4.231a.346.346,0,0,0-.377.348V9.755A.346.346,0,0,0,5.7,10.1Zm1.75,0a.342.342,0,0,0,.365-.348L8,4.578a.333.333,0,0,0-.366-.348.342.342,0,0,0-.365.348L7.089,9.755A.333.333,0,0,0,7.454,10.1Z" transform="translate(0 0)"/></svg>',
        shortcut: 'Del',
        command: deleteRow,
        selectAfter: null,
      },
    ]
    fillMenuItems(view, menuItems)
  } else {
    // 列菜单项
    const menuItems: MenuItem[] = [
      {
        text: '在左插入列',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="11.877" height="9.194" viewBox="0 0 11.877 9.194"><defs><style>.a,.b{fill:none;}.b{stroke:#5f5f5f;}.c,.d{stroke:none;}.d{fill:#5f5f5f;}</style></defs><g transform="translate(-1609.758 -683.465)"><g class="a" transform="translate(1610.635 687.562)"><path class="c" d="M0,0H11V1H0Z"/><path class="d" d="M 0 0 L 11 0 L 11 1 L 0 1 L 0 0 Z"/></g><path class="b" d="M6,0H0V6" transform="translate(1610.465 688.061) rotate(-45)"/></g></svg>',
        shortcut: '',
        command: addColumnBefore,
        selectAfter: () => col,
      },
      {
        text: '在右插入列',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="11.877" height="9.194" viewBox="0 0 11.877 9.194"><defs><style>.a,.b{fill:none;}.b{stroke:#5f5f5f;}.c,.d{stroke:none;}.d{fill:#5f5f5f;}</style></defs><g transform="translate(1621.635 692.659) rotate(180)"><g class="a" transform="translate(1610.635 687.562)"><path class="c" d="M0,0H11V1H0Z"/><path class="d" d="M 0 0 L 11 0 L 11 1 L 0 1 L 0 0 Z"/></g><path class="b" d="M6,0H0V6" transform="translate(1610.465 688.061) rotate(-45)"/></g></svg>',
        shortcut: '',
        command: addColumnAfter,
        selectAfter: () => col + 1,
      },
      {
        text: '创建副本',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><defs><style>.a{fill:#5f5f5f;}</style></defs><g transform="translate(12) rotate(90)"><path class="a" d="M10,1a1,1,0,0,1,1,1V7a1,1,0,0,1-1,1H5A1,1,0,0,1,4,7V2A1,1,0,0,1,5,1h5m0-1H5A2,2,0,0,0,3,2V7A2,2,0,0,0,5,9h5a2,2,0,0,0,2-2V2a2,2,0,0,0-2-2Z"/><path class="a" d="M7,11H2a1,1,0,0,1-1-1V5A1,1,0,0,1,2,4V3A2,2,0,0,0,0,5v5a2,2,0,0,0,2,2H7a2,2,0,0,0,2-2H8A1,1,0,0,1,7,11Z"/></g></svg>',
        shortcut: 'Ctrl+D',
        command: duplicateColumn,
        selectAfter: null,
      },
      {
        text: '清除内容',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><defs><style>.a{fill:#5f5f5f;}</style></defs><g transform="translate(1490.264 -3155.368)"><path class="a" d="M-1484.264,3155.368a6,6,0,0,0-6,6,6,6,0,0,0,6,6,6,6,0,0,0,6-6A6,6,0,0,0-1484.264,3155.368Zm2.121,7.413a.5.5,0,0,1,0,.707.5.5,0,0,1-.707,0l-1.413-1.413-1.415,1.415a.5.5,0,0,1-.707,0,.5.5,0,0,1,0-.708l1.415-1.414-1.415-1.415a.5.5,0,0,1,0-.707.5.5,0,0,1,.707,0l1.415,1.415,1.413-1.414a.5.5,0,0,1,.707,0,.5.5,0,0,1,0,.707l-1.413,1.414Z"/></g></svg>',
        shortcut: '',
        command: clearColumnContent,
        selectAfter: null,
      },
      {
        text: '删除',
        icon: '<svg xmlns="http://www.w3.org/2000/svg" width="11.408" height="12" viewBox="0 0 11.408 12"><defs><style>.a{fill:#5f5f5f;}</style></defs><path class="a" d="M3.117,2.693h.937V1.432A.539.539,0,0,1,4.644.878H6.753a.539.539,0,0,1,.589.554V2.693h.937V1.373A1.31,1.31,0,0,0,6.818,0H4.578A1.31,1.31,0,0,0,3.117,1.373ZM.442,3.164h10.53a.445.445,0,0,0,.436-.448.44.44,0,0,0-.436-.442H.442a.445.445,0,0,0,0,.89ZM3.005,12h5.4a1.375,1.375,0,0,0,1.45-1.39l.412-7.557H9.322l-.4,7.457a.6.6,0,0,1-.613.6H3.088a.605.605,0,0,1-.607-.6L2.063,3.052H1.137l.419,7.563A1.363,1.363,0,0,0,3.005,12Zm.954-1.9a.333.333,0,0,0,.365-.348L4.142,4.573a.341.341,0,0,0-.365-.342.333.333,0,0,0-.366.348l.177,5.176A.344.344,0,0,0,3.96,10.1Zm1.744,0a.351.351,0,0,0,.383-.348V4.578A.351.351,0,0,0,5.7,4.231a.346.346,0,0,0-.377.348V9.755A.346.346,0,0,0,5.7,10.1Zm1.75,0a.342.342,0,0,0,.365-.348L8,4.578a.333.333,0,0,0-.366-.348.342.342,0,0,0-.365.348L7.089,9.755A.333.333,0,0,0,7.454,10.1Z" transform="translate(0 0)"/></svg>',
        shortcut: 'Del',
        command: deleteColumn,
        selectAfter: null,
      },
    ]
    fillMenuItems(view, menuItems)
  }

  // 定位菜单
  positionMenu(pluginState, button, type)

  // 显示菜单容器
  const container = document.querySelector('.table-cell-menu-container') as HTMLElement
  if (container) container.classList.add('visible')

  // 更新活动菜单信息
  view.dispatch(view.state.tr.setMeta(tableButtonsKey, { ...pluginState, activeMenuType: type }))

  // 选择对应的行或列
  selectTableRowOrColumn(view, type, row, col)

  // 添加窗口变化监听
  const resizeHandler = () => handleWindowResize(view)
  window.addEventListener('resize', resizeHandler)
  window.addEventListener('scroll', resizeHandler)

  // 存储事件处理函数引用以便稍后移除
  view.state.tr.setMeta(tableButtonsKey, { ...pluginState, resizeHandler, scrollHandler: resizeHandler })
}

// 填充菜单项
function fillMenuItems(view: EditorView, menuItems: MenuItem[]): void {
  const pluginState = tableButtonsKey.getState(view.state)
  if (!pluginState || !pluginState.sharedMenu) return

  menuItems.forEach((item: MenuItem) => {
    const menuItem: HTMLDivElement = document.createElement('div')
    menuItem.className = 'table-cell-menu-item'

    // 创建图标和文本的父容器
    const contentContainer = document.createElement('div')
    contentContainer.className = 'menu-item-content'

    // 创建图标容器
    const iconContainer = document.createElement('span')
    iconContainer.className = 'menu-item-icon'
    iconContainer.innerHTML = item.icon

    // 创建文本容器
    const textContainer = document.createElement('span')
    textContainer.className = 'menu-item-text'
    textContainer.textContent = item.text

    // 将图标和文本添加到父容器
    contentContainer.appendChild(iconContainer)
    contentContainer.appendChild(textContainer)

    // 创建快捷键容器
    const shortcutContainer = document.createElement('span')
    shortcutContainer.className = 'menu-item-shortcut'
    shortcutContainer.textContent = item.shortcut

    // 添加内容父容器和快捷键到菜单项
    menuItem.appendChild(contentContainer)
    menuItem.appendChild(shortcutContainer)

    menuItem.addEventListener('mouseenter', () => menuItem.style.setProperty('backgroundColor', '#f0f0f0'))

    menuItem.addEventListener('mouseleave', () => menuItem.style.setProperty('backgroundColor', ''))

    menuItem.addEventListener('click', (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // 执行命令
      if (item.command) {
        const state = view.state
        const dispatch = view.dispatch
        item.command(state, dispatch)

        // 如果有selectAfter函数，执行后续选择
        if (item.selectAfter) {
          const newPosition = item.selectAfter()

          // 获取当前的插件状态
          const pluginState = tableButtonsKey.getState(state)
          if (pluginState && pluginState.activeMenuType) {
            // 根据菜单类型确定行还是列选择
            const activeRow = pluginState.activeMenuType === 'row' ? newPosition : 0
            const activeCol = pluginState.activeMenuType === 'column' ? newPosition : 0

            // 使用setTimeout确保在命令执行后应用选择
            setTimeout(() => {
              // 选择新添加的行或列的第一个单元格
              selectCellAt(view, activeRow, activeCol)

              // 移除所有按钮的 focus 状态
              Object.keys(buttonRefs).forEach((key) => buttonRefs[key].classList.remove('focus'))

              // 更新装饰按钮状态
              if (pluginState.activeMenuType === 'row') {
                // 更新行按钮状态
                updateActivePosition(view, newPosition, -1)
              } else if (pluginState.activeMenuType === 'column') {
                // 更新列按钮状态
                updateActivePosition(view, -1, newPosition)
              }
            }, 0)
          }
        }
      }

      // 关闭菜单
      hideMenu(view)
    })

    pluginState.sharedMenu?.appendChild(menuItem)
  })
}

// 选择指定位置的单元格
function selectCellAt(view: EditorView, row: number, col: number): boolean {
  // 获取文档
  const { doc } = view.state

  // 查找表格
  let tablePos = -1
  let table: PMNode | null = null

  doc.descendants((node, pos) => {
    if (tablePos !== -1) return false // 已找到表格
    if (node.type.spec.tableRole === 'table') {
      tablePos = pos
      table = node
      return false
    }
    return true
  })

  if (tablePos === -1 || !table) return false

  // 获取表格映射
  const tableStart = tablePos + 1
  const tableMap = TableMap.get(table)

  // 确保行列索引在表格范围内
  if (row < 0 || row >= tableMap.height || col < 0 || col >= tableMap.width) {
    return false
  }

  // 获取目标单元格位置
  const cellIndex = row * tableMap.width + col
  const cellPos = tableMap.map[cellIndex]

  // 创建目标单元格的ResolvedPos
  const $cell = doc.resolve(tableStart + cellPos)

  // 创建一个事务
  const tr = view.state.tr

  // 创建单元格选择
  const cellSelection = new CellSelection($cell)
  tr.setSelection(cellSelection)

  // 应用选择
  view.dispatch(tr)

  // 在单元格中定位光标（设置焦点）
  setTimeout(() => {
    // 获取单元格内容的开始位置
    const cellContentStart = tableStart + cellPos + 1 // +1 是为了跳过单元格节点本身进入内容

    // 创建文本选择并应用
    const textSelection = TextSelection.create(doc, cellContentStart)
    view.dispatch(view.state.tr.setSelection(textSelection))

    // 确保编辑器获得焦点
    view.focus()
  }, 10)

  return true
}

// 菜单定位函数
function positionMenu(pluginState: TableButtonsState, button: HTMLElement, type: 'row' | 'column'): void {
  if (!pluginState.sharedMenu) return

  const rect = button.getBoundingClientRect()

  // top 0 位置直接隐藏拉下框
  if (!rect.top && pluginState.editorView) return hideMenu(pluginState.editorView)

  if (type === 'row') {
    pluginState.sharedMenu.style.left = `${rect.right + 5}px`
    pluginState.sharedMenu.style.top = `${rect.top}px`
  } else {
    pluginState.sharedMenu.style.left = `${rect.left}px`
    pluginState.sharedMenu.style.top = `${rect.bottom + 5}px`
  }
}

// 窗口大小变化处理
function handleWindowResize(view: EditorView) {
  const pluginState = tableButtonsKey.getState(view.state)
  if (!pluginState || !pluginState.activeMenuType || !pluginState.sharedMenu) return

  // 寻找当前活动按钮
  let activeButton: HTMLElement | null = null
  if (pluginState.activeMenuType === 'row') {
    activeButton = buttonRefs[`row-${pluginState.activeRow}`] || null
  } else {
    activeButton = buttonRefs[`col-${pluginState.activeCol}`] || null
  }

  // 重新定位菜单
  if (activeButton) positionMenu(pluginState, activeButton, pluginState.activeMenuType)
}

// 隐藏菜单
function hideMenu(view: EditorView) {
  const pluginState = tableButtonsKey.getState(view.state)
  if (!pluginState) return

  const container = document.querySelector('.table-cell-menu-container') as HTMLElement
  if (container) container.classList.remove('visible')

  // 移除窗口事件监听
  if (pluginState.resizeHandler) {
    window.removeEventListener('resize', pluginState.resizeHandler)
  }
  if (pluginState.scrollHandler) {
    window.removeEventListener('scroll', pluginState.scrollHandler)
  }

  // 更新状态
  view.dispatch(view.state.tr.setMeta(tableButtonsKey, { ...pluginState, activeMenuType: null, resizeHandler: null, scrollHandler: null }))
}

// 构建表格装饰集
function buildDecorationSet(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = []

  doc.descendants((node, pos) => {
    if (node.type.spec.tableRole !== 'table') return true

    const map = TableMap.get(node)
    if (map.width <= 0 || map.height <= 0) return false

    // 创建列按钮
    for (let col = 0; col < map.width; col++) {
      const cellPos = pos + 1 + map.map[col]
      const key = `col-${col}`

      decorations.push(
        Decoration.widget(
          cellPos + 1,
          (view) => {
            // 如果已经存在该按钮，直接返回
            if (buttonRefs[key]) return buttonRefs[key]

            const button = document.createElement('div')
            button.className = 'table-cell-internal-button table-cell-button-first-column'
            button.textContent = '...'
            button.title = `列 ${col + 1} 操作`

            button.addEventListener('click', (e) => {
              e.preventDefault()
              e.stopPropagation()

              // 显示菜单
              showMenu(view, button, 'column', -1, col)
            })

            // 添加鼠标悬停处理
            button.addEventListener('mouseenter', () => (button.dataset.hover = 'true'))
            button.addEventListener('mouseleave', () => (button.dataset.hover = 'false'))

            // 存储DOM引用
            buttonRefs[key] = button
            return button
          },
          { key },
        ),
      )
    }

    // 创建行按钮
    for (let row = 0; row < map.height; row++) {
      const cellPos = pos + 1 + map.map[row * map.width]
      const key = `row-${row}`

      decorations.push(
        Decoration.widget(
          cellPos + 1,
          (view) => {
            // 如果已经存在该按钮，直接返回
            if (buttonRefs[key]) return buttonRefs[key]

            const button = document.createElement('div')
            button.className = 'table-cell-internal-button table-cell-button-first-row'
            button.textContent = '...'
            button.title = `行 ${row + 1} 操作`

            button.addEventListener('click', (e) => {
              e.preventDefault()
              e.stopPropagation()

              // 显示菜单
              showMenu(view, button, 'row', row, -1)
            })

            button.addEventListener('mouseenter', () => (button.dataset.hover = 'true'))
            button.addEventListener('mouseleave', () => (button.dataset.hover = 'false'))

            // 存储DOM引用
            buttonRefs[key] = button
            return button
          },
          { key },
        ),
      )
    }

    return false
  })

  return DecorationSet.create(doc, decorations)
}

// 更新按钮可见性
function updateButtonsVisibility(activeRow: number, activeCol: number): void {
  // 更新所有按钮状态
  Object.keys(buttonRefs).forEach((key) => {
    const button = buttonRefs[key]

    // 如果鼠标悬停在按钮上，保持按钮可见
    if (button.dataset.hover === 'true') {
      button.classList.add('active')
      return
    }

    if (key.startsWith('row-')) {
      const row = parseInt(key.substring(4))
      if (row === activeRow) {
        button.classList.add('active')
      } else {
        button.classList.remove('active')
      }
    } else if (key.startsWith('col-')) {
      const col = parseInt(key.substring(4))
      if (col === activeCol) {
        button.classList.add('active')
      } else {
        button.classList.remove('active')
      }
    }
  })
}

// 更新活动位置
function updateActivePosition(view: EditorView, row: number, col: number): void {
  const state = view.state
  const pluginState = tableButtonsKey.getState(state)
  if (!pluginState) return

  // 如果位置没变，不执行操作
  if (pluginState.activeRow === row && pluginState.activeCol === col) return

  // 更新状态
  view.dispatch(state.tr.setMeta(tableButtonsKey, { activeRow: row, activeCol: col }))
}

// 根据菜单类型和行/列索引选择表格的整行或整列
function selectTableRowOrColumn(view: EditorView, activeMenuType: 'row' | 'column' | null, activeRow: number, activeCol: number): boolean {
  if (!activeMenuType || (activeMenuType === 'row' && activeRow < 0) || (activeMenuType === 'column' && activeCol < 0)) {
    return false
  }

  // 获取文档
  const { doc, selection } = view.state

  // 获取表格位置
  const $cell = cellAround(doc.resolve(selection.from))
  if (!$cell) return false

  const table = $cell.node(-1)
  const tableStart = $cell.start(-1)
  const tableMap = TableMap.get(table)

  if (!tableMap || tableMap.width <= 0 || tableMap.height <= 0) return false

  let $anchor = null
  let $head = null

  if (activeMenuType === 'row') {
    // 选择整行
    const startCellPos = tableMap.map[activeRow * tableMap.width]
    const endCellPos = tableMap.map[activeRow * tableMap.width + tableMap.width - 1]

    // 创建选区的锚点和焦点
    $anchor = doc.resolve(tableStart + startCellPos)
    $head = doc.resolve(tableStart + endCellPos)
  } else if (activeMenuType === 'column') {
    // 选择整列
    const startCellPos = tableMap.map[activeCol]
    const endCellPos = tableMap.map[(tableMap.height - 1) * tableMap.width + activeCol]

    // 创建选区的锚点和焦点
    $anchor = doc.resolve(tableStart + startCellPos)
    $head = doc.resolve(tableStart + endCellPos)
  }

  // 应用选择
  if ($anchor && $head) {
    // 创建单元格选择
    const cellSelection = new CellSelection($anchor, $head)

    // 应用选择
    view.dispatch(view.state.tr.setSelection(cellSelection))
    return true
  }

  return false
}
