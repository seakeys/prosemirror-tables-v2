import { Plugin, PluginKey } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { TableMap } from './tablemap'
import { cellAround } from './util'

export const tableEdgeButtonsKey = new PluginKey('simpleTableButton')

interface TableEdgeButtonsState {
  rowButton: HTMLElement | null
  colButton: HTMLElement | null
  rowColButton: HTMLElement | null
}

export function tableAddCellButtonPlugin() {
  return new Plugin<TableEdgeButtonsState>({
    key: tableEdgeButtonsKey,

    state: {
      init() {
        return {
          rowButton: null, // 行按钮
          colButton: null, // 列按钮
          rowColButton: null, // 行列按钮
        }
      },
      apply(tr, prev) {
        if (tr.docChanged) {
          return { rowButton: prev.rowButton, colButton: prev.colButton, rowColButton: prev.rowColButton }
        }

        const meta = tr.getMeta(tableEdgeButtonsKey)
        if (meta) {
          return meta
        }

        return prev
      },
    },

    view(editorView) {
      const pluginState = tableEdgeButtonsKey.getState(editorView.state)

      // 创建行按钮
      pluginState.rowButton = document.createElement('div')
      const rowButtonChildren = document.createElement('div')
      rowButtonChildren.className = 'table-add-row-button-children'
      rowButtonChildren.innerHTML = '+'
      pluginState.rowButton.appendChild(rowButtonChildren)
      pluginState.rowButton.className = 'table-add-row-button'
      const handleRowMousedown = () => alert('表格按钮被点击了1！')
      pluginState.rowButton.addEventListener('mousedown', handleRowMousedown)
      const handleRowMouseOver = () => pluginState.rowButton?.style.setProperty('opacity', '1')
      pluginState.rowButton.addEventListener('mousemove', handleRowMouseOver)

      // 创建列按钮
      pluginState.colButton = document.createElement('div')
      const colButtonChildren = document.createElement('div')
      colButtonChildren.className = 'table-add-column-button-children'
      colButtonChildren.innerHTML = '+'
      pluginState.colButton.appendChild(colButtonChildren)
      pluginState.colButton.className = 'table-add-column-button'
      const handleColMousedown = () => alert('表格按钮被点击了1！')
      pluginState.colButton.addEventListener('mousedown', handleColMousedown)
      const handleColMouseOver = () => pluginState.colButton?.style.setProperty('opacity', '1')
      pluginState.colButton.addEventListener('mousemove', handleColMouseOver)

      // 同时创建行列按钮
      pluginState.rowColButton = document.createElement('div')
      const rowColButtonChildren = document.createElement('div')
      rowColButtonChildren.className = 'table-add-row-column-button-children'
      rowColButtonChildren.innerHTML = '+'
      pluginState.rowColButton.appendChild(rowColButtonChildren)
      pluginState.rowColButton.className = 'table-add-row-column-button'
      const handleRowColMousedown = () => alert('表格按钮被点击了1！')
      pluginState.rowColButton.addEventListener('mousedown', handleRowColMousedown)
      const handleRowColMouseOver = () => pluginState.rowColButton?.style.setProperty('opacity', '1')
      pluginState.rowColButton.addEventListener('mousemove', handleRowColMouseOver)

      const win = editorView.dom.ownerDocument.defaultView || window
      const handleWinMousedown = () => {
        requestAnimationFrame(() => {
          const hasFocus = editorView.hasFocus()
          if (!hasFocus) {
            pluginState.rowButton?.style.setProperty('opacity', '0')
            pluginState.colButton?.style.setProperty('opacity', '0')
            pluginState.rowColButton?.style.setProperty('opacity', '0')
          }
        })
      }
      const handleWinMousemove = (event: MouseEvent) => handleCellPosition(editorView, event)
      win.addEventListener('mousedown', handleWinMousedown)
      win.addEventListener('mousemove', handleWinMousemove)

      const editorContainer = editorView.dom.parentNode
      if (editorContainer) editorContainer.appendChild(pluginState.rowButton)
      if (editorContainer) editorContainer.appendChild(pluginState.colButton)
      if (editorContainer) editorContainer.appendChild(pluginState.rowColButton)

      return {
        destroy: () => {
          pluginState.rowButton.removeEventListener('mousedown', handleRowMousedown)
          pluginState.colButton.removeEventListener('mousedown', handleColMousedown)
          pluginState.rowColButton.removeEventListener('mousedown', handleRowColMousedown)

          pluginState.rowButton.removeEventListener('mousemove', handleRowMouseOver)
          pluginState.colButton.removeEventListener('mousemove', handleColMouseOver)
          pluginState.rowColButton.removeEventListener('mousemove', handleRowColMouseOver)

          win.removeEventListener('mousedown', handleWinMousedown)
          win.removeEventListener('mousemove', handleWinMousemove)
        },
      }
    },
  })
}

/**
 * 处理单元格位置并更新按钮状态的函数
 * @param view 编辑器视图
 * @param event 鼠标事件
 * @param state 插件状态
 * @returns 是否成功处理
 */
function handleCellPosition(view: EditorView, event: MouseEvent): boolean {
  const state = tableEdgeButtonsKey.getState(view.state)
  if (!state) return false

  // 判断是否在按钮上
  if (event.target === state.rowButton || event.target === state.colButton || event.target === state.rowColButton) return false

  // 获取鼠标位置对应的文档位置
  const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })
  if (!pos) {
    state.rowButton?.style.setProperty('opacity', '0')
    state.colButton?.style.setProperty('opacity', '0')
    state.rowColButton?.style.setProperty('opacity', '0')
    return false
  }

  // 查找该位置是否在单元格内
  const $cell = cellAround(view.state.doc.resolve(pos.pos))
  if (!$cell) return false

  // 获取表格信息
  const table = $cell.node(-1)
  const tableStart = $cell.start(-1)
  const map = TableMap.get(table)

  // 计算单元格位置
  const cellPos = $cell.pos - tableStart
  const cellIndex = map.map.findIndex((pos) => pos === cellPos)

  // 计算行和列索引
  const row = Math.floor(cellIndex / map.width)
  const col = cellIndex % map.width

  // 判断位置标志
  const isLastRow = row === map.height - 1
  const isLastColumn = col === map.width - 1
  const isBottomRightCell = isLastRow && isLastColumn

  // 更新按钮可见性
  updateButtonVisibility(state, isLastRow, isLastColumn, isBottomRightCell)

  return true
}

/**
 * 更新按钮可见性
 * @param state 插件状态
 * @param isLastRow 是否最后一行
 * @param isLastColumn 是否最后一列
 * @param isBottomRightCell 是否右下角单元格
 */
function updateButtonVisibility(state: TableEdgeButtonsState, isLastRow: boolean, isLastColumn: boolean, isBottomRightCell: boolean): void {
  if (isLastRow) {
    state.rowButton?.style.setProperty('opacity', '1')
  } else {
    state.rowButton?.style.setProperty('opacity', '0')
  }

  if (isLastColumn) {
    state.colButton?.style.setProperty('opacity', '1')
  } else {
    state.colButton?.style.setProperty('opacity', '0')
  }

  if (isBottomRightCell) {
    state.rowColButton?.style.setProperty('opacity', '1')
  } else {
    state.rowColButton?.style.setProperty('opacity', '0')
  }
}
