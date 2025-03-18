import { Plugin, PluginKey, EditorState, Transaction, TextSelection } from 'prosemirror-state'
import { Schema, Node, MarkType } from 'prosemirror-model'

// 创建一个插件键，用于识别我们的插件
const markdownStarsPluginKey = new PluginKey('markdownStars')

// 定义星号标记的属性接口
interface MarkdownStarAttrs {
  position: 'prefix' | 'suffix' | null
}

// 插件选项接口
interface MarkdownStarsPluginOptions {
  // 可以添加自定义选项
  starColor?: string
}

/**
 * 创建一个插件，处理星号和加粗文本的关系
 * 该版本会将星号放在strong标签内部
 */
export function markdownStarsPlugin(options: MarkdownStarsPluginOptions = {}): Plugin {
  return new Plugin({
    key: markdownStarsPluginKey,

    props: {
      // 处理输入规则
      handleTextInput(view, from: number, to: number, text: string): boolean {
        if (text === '*' && view.state.doc.textBetween(from - 1, from) === '*') {
          // 检测到连续两个星号，尝试应用加粗
          setTimeout(() => {
            const { state, dispatch } = view

            // 移除星号并应用加粗
            const tr = state.tr.delete(from - 1, from + 1) // 删除两个星号

            // 在光标位置应用加粗
            const markType = state.schema.marks.strong
            if (markType) {
              tr.addMark(from - 1, from - 1, markType.create())
            }

            dispatch(tr)
          }, 10)
          return true
        }
        return false
      },
    },

    // 用于观察文档变化
    appendTransaction(transactions: readonly Transaction[], oldState: EditorState, newState: EditorState): Transaction | null {
      if (!transactions.some((tr) => tr.docChanged)) return null

      const tr = newState.tr
      let modified = false

      // 获取标记类型
      const strongMarkType = newState.schema.marks.strong as MarkType
      const starMarkType = newState.schema.marks.markdownStar as MarkType | undefined

      if (!starMarkType) return null // 如果没有定义星号标记，就不处理

      // 第一遍扫描：找出所有强调标记的边界
      newState.doc.descendants((node: Node, pos: number) => {
        if (node.isText && node.marks.some((mark) => mark.type === strongMarkType)) {
          // 检查该节点的开头是否有星号标记
          const text = node.text
          if (!text) return // 跳过空文本节点

          // 检查开头是否已有星号
          const hasPrefixStar = text.startsWith('**') && node.marks.some((mark) => mark.type === starMarkType && (mark.attrs as MarkdownStarAttrs).position === 'prefix')

          // 检查结尾是否已有星号
          const hasSuffixStar = text.endsWith('**') && node.marks.some((mark) => mark.type === starMarkType && (mark.attrs as MarkdownStarAttrs).position === 'suffix')

          if (!hasPrefixStar) {
            // 在加粗文本开头添加星号
            tr.insertText('**', pos)
            // 添加星号标记并保留原有加粗标记
            const marks = [...node.marks]
            marks.push(starMarkType.create({ position: 'prefix' }))
            tr.setNodeMarkup(tr.mapping.map(pos), null, null, marks)
            modified = true
          }

          // 计算后缀位置（考虑到如果添加了前缀星号，位置会变化）
          const endPos = pos + node.nodeSize + (hasPrefixStar ? 0 : 2)

          if (!hasSuffixStar) {
            // 在加粗文本结尾添加星号
            tr.insertText('**', endPos - 2) // 减去2是因为我们要插在文本末尾
            // 添加星号标记并保留原有加粗标记
            const marks = [...node.marks]
            marks.push(starMarkType.create({ position: 'suffix' }))
            tr.setNodeMarkup(tr.mapping.map(endPos - 2), null, null, marks)
            modified = true
          }
        }
      })

      return modified ? tr : null
    },
  })
}

/**
 * 自定义加粗命令，处理加粗文本和星号
 */
export function toggleStrongWithStars(schema: Schema) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void): boolean => {
    const { from, to } = state.selection
    const markType = schema.marks.strong as MarkType
    const starMarkType = schema.marks.markdownStar as MarkType | undefined

    // 检查当前选区是否已经加粗
    const hasStrong = state.doc.rangeHasMark(from, to, markType)

    if (hasStrong) {
      // 移除加粗标记和星号标记
      if (dispatch) {
        // 首先尝试找到包含星号的范围
        interface StarRange {
          from: number
          to: number
          text: string
        }

        const starRanges: StarRange[] = []
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (node.isText && starMarkType && node.marks.some((mark) => mark.type === starMarkType)) {
            starRanges.push({ from: pos, to: pos + node.nodeSize, text: node.text || '' })
          }
        })

        // 从选区中移除加粗标记和星号标记
        let tr = state.tr.removeMark(from, to, markType)

        if (starMarkType) {
          tr = tr.removeMark(from, to, starMarkType)
        }

        // 同时删除所有标记为星号的文本
        for (const range of starRanges.sort((a, b) => b.from - a.from)) {
          // 从后往前删除，避免位置错乱
          if (range.text === '**') {
            tr = tr.delete(range.from, range.to)
          }
        }

        dispatch(tr)
      }
      return true
    } else {
      // 添加加粗标记和星号
      if (dispatch && starMarkType) {
        let tr = state.tr

        // 添加前缀星号
        tr = tr.insertText('**', from)

        // 添加后缀星号
        tr = tr.insertText('**', to + 2) // +2 因为我们插入了前缀星号

        // 给整个范围应用加粗标记
        tr = tr.addMark(from, to + 4, markType.create())

        // 给星号单独添加星号标记
        tr = tr.addMark(from, from + 2, starMarkType.create({ position: 'prefix' }))
        tr = tr.addMark(to + 2, to + 4, starMarkType.create({ position: 'suffix' }))

        // 设置光标位置，避免选中星号
        tr = tr.setSelection(TextSelection.create(tr.doc, from + 2, to + 2))

        dispatch(tr)
      }
      return true
    }
  }
}

/**
 * 创建带有markdownStar标记的Schema
 */
export function createSchemaWithStarMark<S extends Schema>(baseSchema: S): Schema {
  return new Schema({
    nodes: baseSchema.spec.nodes,
    marks: baseSchema.spec.marks.addToEnd('markdownStar', {
      attrs: { position: { default: null } },
      toDOM(node) {
        return [
          'span',
          {
            class: 'markdown-star',
            'data-position': node.attrs.position || '',
          },
          0,
        ]
      },
      parseDOM: [
        {
          tag: 'span.markdown-star',
          getAttrs(dom) {
            if (typeof dom === 'string') return null
            const element = dom as HTMLElement
            return { position: element.getAttribute('data-position') || null }
          },
        },
      ],
    }),
  })
}
