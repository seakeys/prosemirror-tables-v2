import 'prosemirror-view/style/prosemirror.css'
import 'prosemirror-menu/style/menu.css'
import 'prosemirror-example-setup/style/style.css'
import 'prosemirror-gapcursor/style/gapcursor.css'
import '../style/tables.css'
import '../style/table-header-menu.css'
import '../style/table-overlay.css'
import '../style/table-add-buttons.css'

import { EditorView } from 'prosemirror-view'
import { EditorState } from 'prosemirror-state'
import { DOMParser, Schema } from 'prosemirror-model'
import { schema as baseSchema } from 'prosemirror-schema-basic'
import { keymap } from 'prosemirror-keymap'

import { goToNextCell } from '../src'
import { tableEditing, columnResizing, tableNodes, fixTables } from '../src'
import { tableHeaderMenuPlugin } from '../src/tableHeaderMenu'
import { tableRowButtonPlugin } from '../src/tableRowButtonPlugin'
import { tableColumnButtonPlugin } from '../src/tableColumnButtonPlugin'
import { tableOverlayPlugin } from '../src/tableOverlayPlugin'
import { tableAddCellButtonPlugin } from '../src/tableAddCellButtonPlugin'

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
})

const contentElement = document.querySelector('#content')
if (!contentElement) throw new Error('Failed to find #content')

const doc = DOMParser.fromSchema(schema).parse(contentElement)

let state = EditorState.create({
  doc,
  plugins: [
    columnResizing(),
    tableHeaderMenuPlugin(),
    tableRowButtonPlugin(),
    tableColumnButtonPlugin(),
    tableOverlayPlugin(),
    tableAddCellButtonPlugin(),
    tableEditing(),
    keymap({
      Tab: goToNextCell(1),
      'Shift-Tab': goToNextCell(-1),
    }),
  ],
})
const fix = fixTables(state)
if (fix) state = state.apply(fix.setMeta('addToHistory', false))

const view = new EditorView(document.querySelector('#editor'), { state })

declare global {
  interface Window {
    view?: EditorView
  }
}

window.view = view

document.execCommand('enableObjectResizing', false, 'false')
document.execCommand('enableInlineTableEditing', false, 'false')
