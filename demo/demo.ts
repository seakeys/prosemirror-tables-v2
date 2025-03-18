import 'prosemirror-view/style/prosemirror.css'
import 'prosemirror-menu/style/menu.css'
import 'prosemirror-example-setup/style/style.css'
import 'prosemirror-gapcursor/style/gapcursor.css'
import '../style/tables.css'

import { EditorView } from 'prosemirror-view'
import { EditorState } from 'prosemirror-state'
import { DOMParser, Schema } from 'prosemirror-model'
import { schema as baseSchema } from 'prosemirror-schema-basic'
import { keymap } from 'prosemirror-keymap'
import { exampleSetup, buildMenuItems } from 'prosemirror-example-setup'
import { MenuItem, Dropdown } from 'prosemirror-menu'

import {
  addColumnAfter,
  addColumnBefore,
  deleteColumn,
  addRowAfter,
  addRowBefore,
  deleteRow,
  mergeCells,
  splitCell,
  setCellAttr,
  toggleHeaderRow,
  toggleHeaderColumn,
  toggleHeaderCell,
  goToNextCell,
  deleteTable,
} from '../src'
import { tableEditing, columnResizing, tableNodes, fixTables } from '../src'
import { toggleStrongWithStars } from '../src/markdown-stars'

const schema = new Schema({
  nodes: baseSchema.spec.nodes.append(
    tableNodes({
      tableGroup: 'block',
      cellContent: 'block+',
      cellAttributes: {
        background: {
          default: null,
          getFromDOM(dom) {
            return dom.style.backgroundColor || null
          },
          setDOMAttr(value, attrs) {
            if (value) attrs.style = (attrs.style || '') + `background-color: ${value};`
          },
        },
      },
    }),
  ),
  marks: {
    strong: {
      toDOM() {
        return ['strong', { class: 'custom-bold', style: 'font-weight: 800;' }, 0]
      },
      parseDOM: [{ tag: 'strong' }],
    },
    // 添加markdownStar标记
    markdownStar: {
      attrs: { position: { default: null } },
      toDOM(node) {
        return ['span', { class: 'markdown-star', 'data-position': node.attrs.position || '' }, 0]
      },
      parseDOM: [
        {
          tag: 'span.markdown-star',
          getAttrs(dom) {
            return { position: dom.getAttribute('data-position') || null }
          },
        },
      ],
    },
  },
})

// 添加一个CSS样式元素到head，用于处理自定义加粗样式
const styleElement = document.createElement('style')
styleElement.textContent = `
  .markdown-star {
    color: red;
    font-weight: normal;
  }
  .custom-bold {
    color: green;
    font-weight: bold;
  }
`
document.head.appendChild(styleElement)

const menu = buildMenuItems(schema).fullMenu
function item(label: string, cmd: (state: EditorState) => boolean) {
  return new MenuItem({ label, select: cmd, run: cmd })
}
const tableMenu = [
  item('插入列（前）', addColumnBefore),
  item('插入列（后）', addColumnAfter),
  item('删除列', deleteColumn),
  item('插入行（前）', addRowBefore),
  item('插入行（后）', addRowAfter),
  item('删除行', deleteRow),
  item('合并单元格', mergeCells),
  item('拆分单元格', splitCell),
  item('切换表头列', toggleHeaderColumn),
  item('切换表头行', toggleHeaderRow),
]
menu.splice(2, 0, [new Dropdown(tableMenu, { label: 'Table' })])

const contentElement = document.querySelector('#content')
if (!contentElement) {
  throw new Error('Failed to find #content')
}
const doc = DOMParser.fromSchema(schema).parse(contentElement)

let state = EditorState.create({
  doc,
  plugins: [
    columnResizing(),
    tableEditing(),
    keymap({
      Tab: goToNextCell(1),
      'Shift-Tab': goToNextCell(-1),
      'Mod-b': toggleStrongWithStars(schema),
    }),
  ].concat(
    exampleSetup({
      schema,
      menuContent: menu,
    }),
  ),
})
const fix = fixTables(state)
if (fix) state = state.apply(fix.setMeta('addToHistory', false))

const view = new EditorView(document.querySelector('#editor'), {
  state,
})

declare global {
  interface Window {
    view?: EditorView
  }
}

window.view = view

document.execCommand('enableObjectResizing', false, 'false')
document.execCommand('enableInlineTableEditing', false, 'false')
