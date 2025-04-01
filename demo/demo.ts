import 'prosemirror-view/style/prosemirror.css'
import 'prosemirror-gapcursor/style/gapcursor.css'
import '../style/tables.css'
import '../style/table-header-menu.css'
import '../style/table-overlay.css'
import '../style/table-bottom-right-buttons.css'
import '../style/table-top-left-buttons.css'
import '../style/table-drag.css'

import { EditorView } from 'prosemirror-view'
import { EditorState } from 'prosemirror-state'
import { DOMParser, Schema } from 'prosemirror-model'
import { schema as baseSchema } from 'prosemirror-schema-basic'
import { keymap } from 'prosemirror-keymap'
import { baseKeymap } from 'prosemirror-commands'
import { history, undo, redo } from 'prosemirror-history'

import { deleteTableRowOrColumn, duplicateTableRowOrColumn, goToNextCell, tableSelectAll } from '../src'
import { tableEditing, columnResizing, tableNodes, fixTables } from '../src'
import { tableHeaderMenuPlugin } from '../src/tableHeaderMenu'
import { tableOverlayPlugin } from '../src/tableOverlayPlugin'
import { tableAddCellButtonPlugin } from '../src/tableAddCellButtonPlugin'
import { tableCellButtonPlugin } from '../src/tableCellButtonPlugin'
import { tableDragPlugin } from '../src/tableDragPlugin'
import { getStoredTableContent, initTableLocalStorage } from '../src/tableLocalStorage'

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

// 创建表格快捷键映射
const tableKeymap = {
  ...baseKeymap,
  Tab: goToNextCell(1),
  'Shift-Tab': goToNextCell(-1),
  'Mod-z': undo,
  'Mod-y': redo,
  'Mod-Shift-z': redo,
  'Mod-d': duplicateTableRowOrColumn,
  'Mod-a': tableSelectAll,
  Delete: deleteTableRowOrColumn,
}

const contentElement = document.querySelector('#content')
if (!contentElement) throw new Error('找不到 #content 元素')

// 解析默认内容
const defaultDoc = DOMParser.fromSchema(schema).parse(contentElement)

// 优先使用本地存储的内容，如果没有则使用默认内容
const doc = getStoredTableContent(schema, defaultDoc)

let state = EditorState.create({
  doc,
  plugins: [
    // 基础编辑功能
    history(),
    // 表格功能插件
    columnResizing(),
    tableHeaderMenuPlugin(),
    tableOverlayPlugin(),
    tableAddCellButtonPlugin(),
    tableCellButtonPlugin(),
    tableDragPlugin(),
    // 快捷键
    keymap(tableKeymap),
    tableEditing(),
  ],
})

const fix = fixTables(state)
if (fix) state = state.apply(fix.setMeta('addToHistory', false))

const view = new EditorView(document.querySelector('#editor'), { state })

// 初始化表格本地存储功能
initTableLocalStorage(view, schema)

declare global {
  interface Window {
    view?: EditorView
  }
}

window.view = view

document.execCommand('enableObjectResizing', false, 'false')
document.execCommand('enableInlineTableEditing', false, 'false')
