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

      // 创建下拉菜单容器
      const dropdownContainer = document.createElement('div')
      dropdownContainer.className = 'table-header-dropdown-container'
      dropdownContainer.style.position = 'absolute'
      dropdownContainer.style.top = '100%'
      dropdownContainer.style.left = '0'
      dropdownContainer.style.display = 'none'

      // 创建遮罩层
      const overlay = document.createElement('div')
      overlay.className = 'table-header-overlay'
      overlay.style.position = 'fixed'
      overlay.style.top = '0'
      overlay.style.left = '0'
      overlay.style.width = '100vw'
      overlay.style.height = '100vh'
      overlay.style.background = 'transparent'
      overlay.style.zIndex = '5'
      overlay.style.display = 'block'

      // 创建下拉菜单
      const dropdown = document.createElement('div')
      dropdown.className = 'table-header-dropdown'
      dropdown.style.position = 'relative'
      dropdown.style.background = 'white'
      dropdown.style.border = '1px solid #ddd'
      dropdown.style.borderRadius = '3px'
      dropdown.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)'
      dropdown.style.zIndex = '6'
      dropdown.style.display = 'block'

      // 添加菜单项 - 切换表头行
      const toggleRowOption = document.createElement('div')
      toggleRowOption.className = 'table-header-menu-item'
      toggleRowOption.textContent = '切换表头行'
      toggleRowOption.style.padding = '6px 8px'
      toggleRowOption.style.cursor = 'pointer'

      // 添加菜单项 - 切换表头列
      const toggleColOption = document.createElement('div')
      toggleColOption.className = 'table-header-menu-item'
      toggleColOption.textContent = '切换表头列'
      toggleColOption.style.padding = '6px 8px'
      toggleColOption.style.cursor = 'pointer'

      // 添加鼠标悬停效果
      toggleRowOption.addEventListener('mouseover', () => {
        toggleRowOption.style.backgroundColor = '#f0f0f0'
      })
      toggleRowOption.addEventListener('mouseout', () => {
        toggleRowOption.style.backgroundColor = ''
      })

      toggleColOption.addEventListener('mouseover', () => {
        toggleColOption.style.backgroundColor = '#f0f0f0'
      })
      toggleColOption.addEventListener('mouseout', () => {
        toggleColOption.style.backgroundColor = ''
      })

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

      // 遮罩层点击事件
      overlay.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        // 隐藏下拉菜单容器
        dropdownContainer.style.display = 'none'
      })

      // 按钮点击事件
      menuButton.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        // 切换下拉菜单容器的显示状态
        const isVisible = dropdownContainer.style.display !== 'none'
        dropdownContainer.style.display = isVisible ? 'none' : 'block'
      })

      // 菜单项点击事件
      toggleRowOption.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleHeaderRow(editorView.state, editorView.dispatch)
        dropdownContainer.style.display = 'none'
        editorView.focus()
      })

      toggleColOption.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleHeaderColumn(editorView.state, editorView.dispatch)
        dropdownContainer.style.display = 'none'
        editorView.focus()
      })

      // 点击外部区域关闭下拉菜单
      document.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('.table-header-menu')) {
          dropdownContainer.style.display = 'none'
        }
      })

      // 监听表格选择状态
      function updateMenuVisibility() {
        const tableSelected = isInTable(editorView.state)
        menuContainer.style.display = tableSelected ? 'block' : 'none'
      }

      // 初始检查菜单可见性
      updateMenuVisibility()

      // 保存事件处理函数引用以便稍后清理
      const documentClickHandler = (e: MouseEvent) => {
        if (!(e.target as HTMLElement).closest('.table-header-menu')) {
          dropdownContainer.style.display = 'none'
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
