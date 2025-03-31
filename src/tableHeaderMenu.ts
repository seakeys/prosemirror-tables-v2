import { Plugin, PluginKey } from 'prosemirror-state'
import { toggleHeaderRow, toggleHeaderColumn } from './commands'
import { isInTable } from './util'
import { selectedRect } from './commands'
import { tableNodeTypes } from './schema'
import { EditorView } from 'prosemirror-view'

export const tableMenuPluginKey = new PluginKey('tableMenu')

// 检查表格的表头行状态
function isHeaderRowEnabled(view: EditorView) {
  if (!isInTable(view.state)) return false

  try {
    // 获取选中的表格区域
    const rect = selectedRect(view.state)
    const types = tableNodeTypes(view.state.schema)

    // 检查第一行的单元格是否都是表头单元格
    for (let col = 0; col < rect.map.width; col++) {
      const cellPos = rect.map.map[col]
      const cell = rect.table.nodeAt(cellPos)
      if (cell && cell.type !== types.header_cell) {
        return false
      }
    }

    return true
  } catch (e) {
    console.error('检查表头行状态时出错:', e)
    return false
  }
}

// 检查表格的表头列状态
function isHeaderColumnEnabled(view: EditorView) {
  if (!isInTable(view.state)) return false

  try {
    // 获取选中的表格区域
    const rect = selectedRect(view.state)
    const types = tableNodeTypes(view.state.schema)

    // 检查第一列的单元格是否都是表头单元格
    for (let row = 0; row < rect.map.height; row++) {
      const cellPos = rect.map.map[row * rect.map.width]
      const cell = rect.table.nodeAt(cellPos)
      if (cell && cell.type !== types.header_cell) {
        return false
      }
    }

    return true
  } catch (e) {
    console.error('检查表头列状态时出错:', e)
    return false
  }
}

// 更新开关按钮状态
function updateToggleButton(button: HTMLElement, enabled: boolean): void {
  // 查找开关轨道元素
  const switchTrack = button.querySelector('.table-toggle-switch-track')

  if (switchTrack) {
    if (enabled) {
      // 启用状态 - 添加enabled类
      switchTrack.classList.add('enabled')
    } else {
      // 禁用状态 - 移除enabled类
      switchTrack.classList.remove('enabled')
    }
  }

  // 更新复选框状态
  const checkbox = button.querySelector('input[type="checkbox"]') as HTMLInputElement
  if (checkbox) {
    checkbox.checked = enabled
  }
}

export function tableHeaderMenuPlugin() {
  return new Plugin({
    key: tableMenuPluginKey,

    view(editorView) {
      // 创建菜单容器
      const menuContainer = document.createElement('div')
      menuContainer.className = 'table-header-menu'

      // 创建菜单按钮
      const menuButton = document.createElement('div')
      menuButton.className = 'table-header-menu-button'
      menuButton.innerHTML =
        '<span>选项</span><svg xmlns="http://www.w3.org/2000/svg" width="8.121" height="8.121" viewBox="0 0 8.121 8.121"><defs><style>.menu_a{fill:none;stroke:#b1b1b1;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.5px;}</style></defs><g transform="translate(1651.233 701.88) rotate(180)"><path class="menu_a" d="M4.242,0H0V4.244" transform="translate(1647.173 694.819) rotate(45)"/></g></svg>'

      // 创建下拉菜单容器
      const dropdownContainer = document.createElement('div')
      dropdownContainer.className = 'table-header-dropdown-container'

      // 创建遮罩层
      const overlay = document.createElement('div')
      overlay.className = 'table-header-overlay'

      // 创建下拉菜单
      const dropdown = document.createElement('div')
      dropdown.className = 'table-header-dropdown'

      // 添加菜单项 - 切换表头行
      const toggleRowOption = document.createElement('div')
      toggleRowOption.className = 'table-header-menu-item'
      toggleRowOption.innerHTML =
        '<div class="table-toggle-content"><div><svg xmlns="http://www.w3.org/2000/svg" width="12" height="10" viewBox="0 0 12 10"><defs><style>.row_a{fill:#fff;}.row_a,.row_b,.row_c{stroke:#707070;}.row_b,.row_e{fill:none;}.row_c{fill:#707070;}.row_d{stroke:none;}</style></defs><g transform="translate(-1573 -718)"><g class="row_a" transform="translate(1573 718)"><rect class="row_d" width="12" height="10" rx="2"/><rect class="row_e" x="0.5" y="0.5" width="11" height="9" rx="1.5"/></g><line class="row_b" x2="11" transform="translate(1573.5 721.5)"/><line class="row_b" y1="9" transform="translate(1579 718.5)"/><line class="row_b" x2="11" transform="translate(1573.5 724.5)"/><g class="row_c" transform="translate(1573 718)"><path class="row_d" d="M2,0h8a2,2,0,0,1,2,2V4a0,0,0,0,1,0,0H0A0,0,0,0,1,0,4V2A2,2,0,0,1,2,0Z"/><path class="row_e" d="M2,.5h8A1.5,1.5,0,0,1,11.5,2V3.5a0,0,0,0,1,0,0H.5a0,0,0,0,1,0,0V2A1.5,1.5,0,0,1,2,.5Z"/></g></g></svg><span class="table-toggle-text">切换表头行</span></div><div class="table-toggle-switch-container"><div class="table-toggle-switch-shell"><div class="table-toggle-switch-track"><div class="table-toggle-switch-thumb"></div></div><input type="checkbox" role="switch" class="table-toggle-switch-checkbox"></div></div></div>'

      // 添加菜单项 - 切换表头列
      const toggleColOption = document.createElement('div')
      toggleColOption.className = 'table-header-menu-item'
      toggleColOption.innerHTML =
        '<div class="table-toggle-content"><div><svg xmlns="http://www.w3.org/2000/svg" width="12" height="10" viewBox="0 0 12 10"><defs><style>.col_a{fill:#fff;}.col_a,.col_b,.col_c{stroke:#707070;}.col_b,.col_e{fill:none;}.col_c{fill:#707070;}.col_d{stroke:none;}</style></defs><g transform="translate(-1573 -718)"><g class="col_a" transform="translate(1573 718)"><rect class="col_d" width="12" height="10" rx="2"/><rect class="col_e" x="0.5" y="0.5" width="11" height="9" rx="1.5"/></g><line class="col_b" x2="11" transform="translate(1573.5 721.5)"/><line class="col_b" y1="9" transform="translate(1580.5 718.5)"/><line class="col_b" x2="11" transform="translate(1573.5 724.5)"/><g class="col_c" transform="translate(1573 728) rotate(-90)"><path class="col_d" d="M2,0H8a2,2,0,0,1,2,2V4a0,0,0,0,1,0,0H0A0,0,0,0,1,0,4V2A2,2,0,0,1,2,0Z"/><path class="col_e" d="M2,.5H8A1.5,1.5,0,0,1,9.5,2V3.5a0,0,0,0,1,0,0H.5a0,0,0,0,1,0,0V2A1.5,1.5,0,0,1,2,.5Z"/></g></g></svg><span class="table-toggle-text">切换表头列</span></div><div class="table-toggle-switch-container"><div class="table-toggle-switch-shell"><div class="table-toggle-switch-track"><div class="table-toggle-switch-thumb"></div></div><input type="checkbox" role="switch" class="table-toggle-switch-checkbox"></div></div></div>'

      // 组装菜单
      dropdown.appendChild(toggleRowOption)
      dropdown.appendChild(toggleColOption)
      dropdownContainer.appendChild(overlay)
      dropdownContainer.appendChild(dropdown)
      menuContainer.appendChild(menuButton)
      menuContainer.appendChild(dropdownContainer)

      // 添加到编辑器容器外
      const editorContainer = editorView.dom.parentNode
      if (editorContainer && editorContainer instanceof HTMLElement) {
        editorContainer.style.position = 'relative'
        editorContainer.appendChild(menuContainer)
      }

      // 更新表头状态的函数
      function updateHeaderStatus() {
        const headerRowEnabled = isHeaderRowEnabled(editorView)
        const headerColEnabled = isHeaderColumnEnabled(editorView)

        // 更新开关状态
        updateToggleButton(toggleRowOption, headerRowEnabled)
        updateToggleButton(toggleColOption, headerColEnabled)
      }

      // 菜单打开事件 - 读取当前状态
      menuButton.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        // 在显示下拉菜单前更新状态
        updateHeaderStatus()

        // 切换下拉菜单容器的显示状态
        dropdownContainer.classList.toggle('visible')
      })

      // 遮罩层点击事件
      overlay.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        // 隐藏下拉菜单容器
        dropdownContainer.classList.remove('visible')
      })

      // 菜单项点击事件
      toggleRowOption.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleHeaderRow(editorView.state, editorView.dispatch)

        // 切换后等待状态更新，然后再次读取状态
        setTimeout(() => {
          updateHeaderStatus()
        }, 10)
      })

      toggleColOption.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleHeaderColumn(editorView.state, editorView.dispatch)

        // 切换后等待状态更新，然后再次读取状态
        setTimeout(() => {
          updateHeaderStatus()
        }, 10)
      })

      // 点击外部区域关闭下拉菜单
      document.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('.table-header-menu')) {
          dropdownContainer.classList.remove('visible')
        }
      })

      // 监听表格选择状态
      function updateMenuVisibility() {
        // 仅当在表格内时显示菜单
        if (isInTable(editorView.state)) {
          menuContainer.classList.add('visible')
        } else {
          menuContainer.classList.remove('visible')
          // 如果不在表格内，同时确保下拉菜单也隐藏
          dropdownContainer.classList.remove('visible')
        }
      }

      // 初始化时隐藏菜单容器
      menuContainer.classList.remove('visible')

      // 保存事件处理函数引用以便稍后清理
      const documentClickHandler = (e: MouseEvent) => {
        if (!(e.target as HTMLElement).closest('.table-header-menu')) {
          dropdownContainer.classList.remove('visible')
        }
      }

      // 绑定事件
      document.addEventListener('click', documentClickHandler)

      return {
        update: () => {
          updateMenuVisibility()
        },
        destroy: () => {
          // 移除菜单元素
          if (menuContainer.parentNode) {
            menuContainer.parentNode.removeChild(menuContainer)
          }
          // 移除事件监听
          document.removeEventListener('click', documentClickHandler)
        },
      }
    },
  })
}
