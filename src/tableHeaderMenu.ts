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

      // 创建菜单按钮
      const menuButton = document.createElement('div')
      menuButton.className = 'table-header-menu-button'
      menuButton.innerHTML =
        '<span>选项</span><svg xmlns="http://www.w3.org/2000/svg" width="8.121" height="8.121" viewBox="0 0 8.121 8.121"><defs><style>.a{fill:none;stroke:#b1b1b1;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.5px;}</style></defs><g transform="translate(1651.233 701.88) rotate(180)"><path class="a" d="M4.242,0H0V4.244" transform="translate(1647.173 694.819) rotate(45)"/></g></svg>'
      menuButton.title = '表格选项'

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
      toggleRowOption.innerHTML = `<div style="display: flex;"><div><svg xmlns="http://www.w3.org/2000/svg" width="12" height="10" viewBox="0 0 12 10"><defs><style>.a{fill:#fff;}.a,.b,.c{stroke:#707070;}.b,.e{fill:none;}.c{fill:#707070;}.d{stroke:none;}</style></defs><g transform="translate(-1573 -718)"><g class="a" transform="translate(1573 718)"><rect class="d" width="12" height="10" rx="2"/><rect class="e" x="0.5" y="0.5" width="11" height="9" rx="1.5"/></g><line class="b" x2="11" transform="translate(1573.5 721.5)"/><line class="b" y1="9" transform="translate(1579 718.5)"/><line class="b" x2="11" transform="translate(1573.5 724.5)"/><g class="c" transform="translate(1573 718)"><path class="d" d="M2,0h8a2,2,0,0,1,2,2V4a0,0,0,0,1,0,0H0A0,0,0,0,1,0,4V2A2,2,0,0,1,2,0Z"/><path class="e" d="M2,.5h8A1.5,1.5,0,0,1,11.5,2V3.5a0,0,0,0,1,0,0H.5a0,0,0,0,1,0,0V2A1.5,1.5,0,0,1,2,.5Z"/></g></g></svg><span style="padding-left: 7px;">切换表头行</span></div><div style="margin-left: auto; min-width: 0px; flex-shrink: 0;"><div class="pseudoHover pseudoActive" style="position: relative; border-radius: 44px; --pseudoHover--background: rgba(55,53,47,.06); --pseudoActive--background: rgba(55,53,47,.16);"><div style="display: flex; flex-shrink: 0; height: 14px; width: 26px; border-radius: 44px; padding: 2px; box-sizing: content-box; background: rgb(35, 131, 226); transition: background 200ms, box-shadow 200ms;"><div style="width: 14px; height: 14px; border-radius: 44px; background: white; transition: transform 200ms ease-out, background 200ms ease-out; transform: translateX(12px) translateY(0px);"></div></div><input type="checkbox" role="switch" checked="" style="position: absolute; opacity: 0; width: 100%; height: 100%; top: 0px; left: 0px; cursor: pointer;"></div></div></div>`

      // 添加菜单项 - 切换表头列
      const toggleColOption = document.createElement('div')
      toggleColOption.className = 'table-header-menu-item'
      toggleColOption.innerHTML = `<div style="display: flex;"><div><svg xmlns="http://www.w3.org/2000/svg" width="12" height="10" viewBox="0 0 12 10"><defs><style>.a{fill:#fff;}.a,.b,.c{stroke:#707070;}.b,.e{fill:none;}.c{fill:#707070;}.d{stroke:none;}</style></defs><g transform="translate(-1573 -718)"><g class="a" transform="translate(1573 718)"><rect class="d" width="12" height="10" rx="2"/><rect class="e" x="0.5" y="0.5" width="11" height="9" rx="1.5"/></g><line class="b" x2="11" transform="translate(1573.5 721.5)"/><line class="b" y1="9" transform="translate(1580.5 718.5)"/><line class="b" x2="11" transform="translate(1573.5 724.5)"/><g class="c" transform="translate(1573 728) rotate(-90)"><path class="d" d="M2,0H8a2,2,0,0,1,2,2V4a0,0,0,0,1,0,0H0A0,0,0,0,1,0,4V2A2,2,0,0,1,2,0Z"/><path class="e" d="M2,.5H8A1.5,1.5,0,0,1,9.5,2V3.5a0,0,0,0,1,0,0H.5a0,0,0,0,1,0,0V2A1.5,1.5,0,0,1,2,.5Z"/></g></g></svg><span style="padding-left: 7px;">切换表头列</span></div><div style="margin-left: auto; min-width: 0px; flex-shrink: 0;"><div class="pseudoHover pseudoActive" style="position: relative; border-radius: 44px; --pseudoHover--background: rgba(55,53,47,.06); --pseudoActive--background: rgba(55,53,47,.16);"><div style="display: flex; flex-shrink: 0; height: 14px; width: 26px; border-radius: 44px; padding: 2px; box-sizing: content-box; background: rgba(135, 131, 120, 0.3); transition: background 200ms, box-shadow 200ms;"><div style="width: 14px; height: 14px; border-radius: 44px; background: white; transition: transform 200ms ease-out, background 200ms ease-out; transform: translateX(0px) translateY(0px);"></div></div><input type="checkbox" role="switch" checked="" style="position: absolute; opacity: 0; width: 100%; height: 100%; top: 0px; left: 0px; cursor: pointer;"></div></div></div>`

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
        dropdownContainer.classList.remove('visible')
      })

      // 按钮点击事件
      menuButton.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        // 切换下拉菜单容器的显示状态
        dropdownContainer.classList.toggle('visible')
      })

      // 菜单项点击事件
      toggleRowOption.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleHeaderRow(editorView.state, editorView.dispatch)
        dropdownContainer.classList.remove('visible')
        editorView.focus()
      })

      toggleColOption.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleHeaderColumn(editorView.state, editorView.dispatch)
        dropdownContainer.classList.remove('visible')
        editorView.focus()
      })

      // 点击外部区域关闭下拉菜单
      document.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('.table-header-menu')) {
          dropdownContainer.classList.remove('visible')
        }
      })

      // 监听表格选择状态
      function updateMenuVisibility() {
        const tableSelected = isInTable(editorView.state)
        if (tableSelected) {
          menuContainer.classList.add('visible')
        } else {
          menuContainer.classList.remove('visible')
        }
      }

      // 初始检查菜单可见性
      updateMenuVisibility()

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
