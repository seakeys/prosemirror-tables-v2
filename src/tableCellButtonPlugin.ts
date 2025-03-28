import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { TableMap } from './tablemap'
import { cellAround } from './util'
import { EditorView } from 'prosemirror-view'
import { Node as PMNode } from 'prosemirror-model'
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow } from './commands'
import { CellSelection } from './cellselection'

// 菜单项接口定义
interface MenuItem {
  text: string
  command: (state: any, dispatch: any) => boolean
  selectAfter: ((state: any) => number) | null
}

interface TableButtonsState {
  activeRow: number
  activeCol: number
  decorationSet: DecorationSet
  sharedMenu: HTMLElement | null
  activeMenuType: 'row' | 'column' | null
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
        }
      },
      apply(tr, state) {
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
          if (!$cell) {
            updateActivePosition(view, -1, -1)
            return false
          }

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
          if (!pluginState || !container || container.style.display !== 'block') {
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
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '0'
  container.style.width = '100%'
  container.style.height = '100%'
  container.style.zIndex = '100'
  container.style.display = 'none'
  container.style.pointerEvents = 'none' // 允许事件穿透到下层元素

  // 创建透明层 - 作为菜单的背景，用于捕获点击事件
  const overlay = document.createElement('div')
  overlay.className = 'table-cell-menu-overlay'
  overlay.style.position = 'absolute'
  overlay.style.top = '0'
  overlay.style.left = '0'
  overlay.style.width = '100%'
  overlay.style.height = '100%'
  overlay.style.backgroundColor = 'transparent'
  overlay.style.pointerEvents = 'auto' // 捕获事件

  // 创建菜单元素
  const menu = document.createElement('div')
  menu.className = 'table-cell-menu'
  menu.style.position = 'absolute'
  menu.style.backgroundColor = 'white'
  menu.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)'
  menu.style.borderRadius = '4px'
  menu.style.padding = '4px 0'
  menu.style.pointerEvents = 'auto' // 捕获事件

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
      { text: '在前插入行', command: addRowBefore, selectAfter: (state) => row },
      { text: '在后插入行', command: addRowAfter, selectAfter: (state) => row + 1 },
      { text: '删除行', command: deleteRow, selectAfter: null },
    ]
    fillMenuItems(view, menuItems)
  } else {
    // 列菜单项
    const menuItems: MenuItem[] = [
      { text: '在左插入列', command: addColumnBefore, selectAfter: (state) => col },
      { text: '在右插入列', command: addColumnAfter, selectAfter: (state) => col + 1 },
      { text: '删除列', command: deleteColumn, selectAfter: null },
    ]
    fillMenuItems(view, menuItems)
  }

  // 定位菜单
  const rect = button.getBoundingClientRect()
  if (type === 'row') {
    pluginState.sharedMenu.style.left = `${rect.right + 5}px`
    pluginState.sharedMenu.style.top = `${rect.top}px`
  } else {
    pluginState.sharedMenu.style.left = `${rect.left}px`
    pluginState.sharedMenu.style.top = `${rect.bottom + 5}px`
  }

  // 显示菜单容器
  const container = document.querySelector('.table-cell-menu-container') as HTMLElement
  if (container) container.style.display = 'block'

  // 更新活动菜单信息
  view.dispatch(view.state.tr.setMeta(tableButtonsKey, { ...pluginState, activeMenuType: type }))

  // 选择对应的行或列
  selectTableRowOrColumn(view, type, row, col)
}

// 填充菜单项
function fillMenuItems(view: EditorView, menuItems: MenuItem[]): void {
  const pluginState = tableButtonsKey.getState(view.state)
  if (!pluginState || !pluginState.sharedMenu) return

  menuItems.forEach((item: MenuItem) => {
    const menuItem: HTMLDivElement = document.createElement('div')
    menuItem.className = 'table-cell-menu-item'
    menuItem.textContent = item.text
    menuItem.style.padding = '6px 12px'
    menuItem.style.cursor = 'pointer'
    menuItem.style.whiteSpace = 'nowrap'

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
          const newPosition = item.selectAfter(state)

          // 获取当前的插件状态
          const pluginState = tableButtonsKey.getState(state)
          if (pluginState && pluginState.activeMenuType) {
            // 根据菜单类型确定行还是列选择
            const activeRow = pluginState.activeMenuType === 'row' ? newPosition : -1
            const activeCol = pluginState.activeMenuType === 'column' ? newPosition : -1

            // 应用选择
            setTimeout(() => {
              // 使用setTimeout确保在命令执行后应用选择
              selectTableRowOrColumn(view, pluginState.activeMenuType, activeRow, activeCol)
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

// 隐藏菜单
function hideMenu(view: EditorView) {
  const pluginState = tableButtonsKey.getState(view.state)
  if (!pluginState) return

  const container = document.querySelector('.table-cell-menu-container') as HTMLElement
  if (container) container.style.display = 'none'

  // 更新状态
  view.dispatch(view.state.tr.setMeta(tableButtonsKey, { ...pluginState, activeMenuType: null }))
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
