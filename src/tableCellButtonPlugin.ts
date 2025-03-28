import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { TableMap } from './tablemap'
import { cellAround } from './util'
import { EditorView } from 'prosemirror-view'
import { Node as PMNode } from 'prosemirror-model'

interface TableButtonsState {
  activeRow: number
  activeCol: number
  decorationSet: DecorationSet
}

// 存储所有按钮的DOM引用
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
          updateButtonsVisibility(meta.activeRow, meta.activeCol)
          return {
            ...state,
            activeRow: meta.activeRow,
            activeCol: meta.activeCol,
          }
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
          updateActivePosition(view, -1, -1)
          return false
        },
      },
    },
  })
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
          () => {
            // 如果已经存在该按钮，直接返回
            if (buttonRefs[key]) return buttonRefs[key]

            const button = document.createElement('div')
            button.className = 'table-cell-internal-button table-cell-button-first-column'
            button.textContent = '...'
            button.title = `列 ${col + 1} 操作`

            button.addEventListener('click', (e) => {
              e.preventDefault()
              e.stopPropagation()
              alert(`列 ${col + 1} 按钮被点击！`)
            })

            // 存储DOM引用
            buttonRefs[key] = button
            return button
          },
          { key },
        ),
      ) // 添加key保证widget的稳定性
    }

    // 创建行按钮
    for (let row = 0; row < map.height; row++) {
      const cellPos = pos + 1 + map.map[row * map.width]
      const key = `row-${row}`

      decorations.push(
        Decoration.widget(
          cellPos + 1,
          () => {
            // 如果已经存在该按钮，直接返回
            if (buttonRefs[key]) return buttonRefs[key]

            const button = document.createElement('div')
            button.className = 'table-cell-internal-button table-cell-button-first-row'
            button.textContent = '...'
            button.title = `行 ${row + 1} 操作`

            button.addEventListener('click', (e) => {
              e.preventDefault()
              e.stopPropagation()
              alert(`行 ${row + 1} 按钮被点击！`)
            })

            // 存储DOM引用
            buttonRefs[key] = button
            return button
          },
          { key },
        ),
      ) // 添加key保证widget的稳定性
    }

    return false
  })

  return DecorationSet.create(doc, decorations)
}

// 更新按钮可见性
function updateButtonsVisibility(activeRow: number, activeCol: number): void {
  // 更新所有按钮状态
  Object.keys(buttonRefs).forEach((key) => {
    if (key.startsWith('row-')) {
      const row = parseInt(key.substring(4))
      if (row === activeRow) {
        buttonRefs[key].classList.add('active')
      } else {
        buttonRefs[key].classList.remove('active')
      }
    } else if (key.startsWith('col-')) {
      const col = parseInt(key.substring(4))
      if (col === activeCol) {
        buttonRefs[key].classList.add('active')
      } else {
        buttonRefs[key].classList.remove('active')
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
