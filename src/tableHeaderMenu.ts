import { Plugin, PluginKey } from 'prosemirror-state'
import { toggleHeaderRow, toggleHeaderColumn } from './commands'
import { isInTable } from './util'

export const tableMenuPluginKey = new PluginKey('tableMenu')

export function tableHeaderMenuPlugin() {
  return new Plugin({
    key: tableMenuPluginKey,

    view(editorView) {
      // 创建菜单容器
      const menuContainer = document.createElement('div')
      menuContainer.className = 'table-header-menu'
      menuContainer.style.display = 'none'

      // 创建菜单按钮
      const menuButton = document.createElement('button')
      menuButton.className = 'table-header-menu-button'
      menuButton.textContent = '≡'
      menuButton.title = '表格选项'

      // 创建下拉菜单
      const dropdown = document.createElement('div')
      dropdown.className = 'table-header-dropdown'
      dropdown.style.display = 'none'

      // 添加菜单项 - 切换表头行
      const toggleRowOption = document.createElement('div')
      toggleRowOption.className = 'table-header-menu-item'
      toggleRowOption.textContent = '切换表头行'

      // 添加菜单项 - 切换表头列
      const toggleColOption = document.createElement('div')
      toggleColOption.className = 'table-header-menu-item'
      toggleColOption.textContent = '切换表头列'

      // 组装菜单
      dropdown.appendChild(toggleRowOption)
      dropdown.appendChild(toggleColOption)
      menuContainer.appendChild(menuButton)
      menuContainer.appendChild(dropdown)

      // 添加到编辑器容器外
      const editorContainer = editorView.dom.parentNode
      if (editorContainer && editorContainer instanceof HTMLElement) {
        editorContainer.style.position = 'relative'
        editorContainer.appendChild(menuContainer)
      }

      // 按钮点击事件
      menuButton.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none'
      })

      // 菜单项点击事件
      toggleRowOption.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleHeaderRow(editorView.state, editorView.dispatch)
        dropdown.style.display = 'none'
        editorView.focus()
      })

      toggleColOption.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleHeaderColumn(editorView.state, editorView.dispatch)
        dropdown.style.display = 'none'
        editorView.focus()
      })

      // 点击外部区域关闭下拉菜单
      document.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('.table-header-menu')) {
          dropdown.style.display = 'none'
        }
      })

      // 监听表格选择状态
      function updateMenuVisibility() {
        const tableSelected = isInTable(editorView.state)
        menuContainer.style.display = tableSelected ? 'block' : 'none'
      }

      // 初始检查菜单可见性
      updateMenuVisibility()

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
          document.removeEventListener('click', (e) => {
            if (!(e.target as HTMLElement).closest('.table-header-menu')) {
              dropdown.style.display = 'none'
            }
          })
        },
      }
    },
  })
}
