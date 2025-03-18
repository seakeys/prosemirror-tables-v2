import 'prosemirror-view/style/prosemirror.css'
import 'prosemirror-menu/style/menu.css'
import 'prosemirror-example-setup/style/style.css'
import 'prosemirror-gapcursor/style/gapcursor.css'
import '../style/tables.css'
import '../style/active-cell.css'

import { EditorView } from 'prosemirror-view'
import { EditorState } from 'prosemirror-state'
import { DOMParser, Schema } from 'prosemirror-model'
import { schema as baseSchema } from 'prosemirror-schema-basic'
import { keymap } from 'prosemirror-keymap'
import { exampleSetup } from 'prosemirror-example-setup'
import { MenuItem } from 'prosemirror-menu'

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
import { tableOverlayPlugin } from '../src/tableOverlayPlugin'

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
  marks: baseSchema.spec.marks,
})

function item(label: string, cmd: (state: EditorState) => boolean) {
  return new MenuItem({ label, select: cmd, run: cmd })
}

const menu = [
  [
    item('列前', addColumnBefore),
    item('列后', addColumnAfter),
    item('删列', deleteColumn),
    item('行前', addRowBefore),
    item('行后', addRowAfter),
    item('删行', deleteRow),
    item('删表', deleteTable),
    item('合并', mergeCells),
    item('拆分', splitCell),
    item('表头列', toggleHeaderColumn),
    item('表头行', toggleHeaderRow),
  ],
]

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
    // 添加我们的活动单元格插件
    tableOverlayPlugin(),
    keymap({
      Tab: goToNextCell(1),
      'Shift-Tab': goToNextCell(-1),
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
