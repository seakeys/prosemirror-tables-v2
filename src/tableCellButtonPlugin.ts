import { Plugin, PluginKey } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { TableMap } from './tablemap'

// 创建插件键
export const tableCellInternalButtonPluginKey = new PluginKey('tableCellInternalButton')

export function tableCellButtonPlugin() {
  return new Plugin({
    key: tableCellInternalButtonPluginKey,

    props: {
      // 使用装饰器向第一行和第一列的单元格添加按钮
      decorations(state) {
        const decorations: Decoration[] = []

        // 遍历文档查找所有表格
        state.doc.descendants((node, pos) => {
          if (node.type.spec.tableRole === 'table') {
            const tableMap = TableMap.get(node)
            const tableStart = pos + 1 // 表格开始位置

            // 遍历表格的每个单元格
            for (let row = 0; row < tableMap.height; row++) {
              for (let col = 0; col < tableMap.width; col++) {
                // 只处理第一行或第一列的单元格
                if (row === 0 || col === 0) {
                  const cellPos = tableMap.map[row * tableMap.width + col]
                  const cellNode = node.nodeAt(cellPos)

                  if (cellNode) {
                    // 为单元格创建装饰
                    decorations.push(
                      Decoration.widget(tableStart + cellPos + 1, () => {
                        // 创建按钮元素
                        const button = document.createElement('div')

                        let buttonClass = 'table-cell-internal-button'
                        if (row === 0) {
                          // 仅第一行非第一列的单元格
                          buttonClass += ' table-cell-button-first-row'
                        } else if (col === 0) {
                          // 仅第一列非第一行的单元格
                          buttonClass += ' table-cell-button-first-column'
                        }
                        button.className = buttonClass
                        button.textContent = '+'

                        // 添加点击事件
                        button.addEventListener('click', (e) => {
                          e.preventDefault()
                          e.stopPropagation()

                          // 这里可以添加你想要的按钮点击行为
                          alert(`单元格按钮被点击！行: ${row}, 列: ${col}`)
                        })

                        return button
                      }),
                    )
                  }
                }
              }
            }
          }
          return true
        })

        return DecorationSet.create(state.doc, decorations)
      },
    },
  })
}
