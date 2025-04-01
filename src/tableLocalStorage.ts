import { Schema, Node } from 'prosemirror-model'
import { EditorView } from 'prosemirror-view'
import { tableNodeTypes } from './schema'

// 为表格数据定义存储键
const TABLE_DATA_KEY = 'prosemirror-table-data'

interface CellContentItem {
  type: 'text' | 'block'
  text?: string
  content?: CellContentItem[]
}

// 保存表格内容到localStorage
function saveTableContent(tableNode: Node): void {
  try {
    // 提取表格内容为可序列化的格式
    const tableData = serializeTable(tableNode)
    localStorage.setItem(TABLE_DATA_KEY, JSON.stringify(tableData))
  } catch (e) {
    console.error('保存表格数据到localStorage失败:', e)
  }
}

// 从localStorage加载表格内容
function loadTableContent(): any | null {
  try {
    const storedData = localStorage.getItem(TABLE_DATA_KEY)
    if (!storedData) return null

    return JSON.parse(storedData)
  } catch (e) {
    console.error('从localStorage加载表格数据失败:', e)
    return null
  }
}

// 将表格节点序列化为简单的JSON结构
function serializeTable(tableNode: Node) {
  const rows = []

  // 遍历行
  for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex++) {
    const row = tableNode.child(rowIndex)
    const cells = []

    // 遍历单元格
    for (let cellIndex = 0; cellIndex < row.childCount; cellIndex++) {
      const cell = row.child(cellIndex)

      const cellContent: CellContentItem[] = []

      // 保存单元格类型（是否为表头单元格）
      const isCellHeader = cell.type.name === 'table_header'

      // 提取单元格内容
      cell.content.forEach((node: Node) => {
        if (node.isText) {
          cellContent.push({
            type: 'text',
            text: node.text,
          })
        } else if (node.isBlock) {
          // 处理段落等块级节点
          const blockContent: CellContentItem[] = []
          node.forEach((textNode: Node) => {
            if (textNode.isText) {
              blockContent.push({
                type: 'text',
                text: textNode.text,
              })
            }
          })

          cellContent.push({
            type: 'block',
            content: blockContent,
          })
        }
      })

      cells.push({
        isHeader: isCellHeader,
        attrs: cell.attrs,
        content: cellContent,
      })
    }

    rows.push({
      attrs: row.attrs,
      cells: cells,
    })
  }

  return {
    attrs: tableNode.attrs,
    rows: rows,
  }
}

// 根据存储的数据创建表格内容
function createTableFromStoredData(schema: Schema, storedData: any): Node | null {
  const { nodes } = schema
  const types = tableNodeTypes(schema)
  const rows = []

  if (!storedData || !storedData.rows) {
    return null
  }

  // 遍历存储的行数据
  for (const rowData of storedData.rows) {
    const cells = []

    // 遍历单元格数据
    for (const cellData of rowData.cells) {
      // 创建单元格内容
      const content = []

      for (const item of cellData.content) {
        if (item.type === 'text') {
          content.push(schema.text(item.text))
        } else if (item.type === 'block') {
          const blockContent = []

          for (const textItem of item.content) {
            if (textItem.type === 'text') {
              blockContent.push(schema.text(textItem.text))
            }
          }

          content.push(nodes.paragraph.create(null, blockContent))
        }
      }

      // 根据单元格类型创建单元格（使用isHeader标志）
      const cellType = cellData.isHeader ? types.header_cell : types.cell
      cells.push(cellType.create(cellData.attrs, content))
    }

    // 创建行
    rows.push(nodes.table_row.create(rowData.attrs, cells))
  }

  // 创建表格
  return nodes.table.create(storedData.attrs, rows)
}

// 从localStorage加载表格数据
function loadTableFromStorage(schema: Schema): Node | null {
  const storedData = loadTableContent()
  if (!storedData) return null

  return createTableFromStoredData(schema, storedData)
}

// 查找文档中的表格并保存
function findAndSaveTable(doc: Node): void {
  doc.descendants((node, pos) => {
    if (node.type.spec.tableRole === 'table') {
      saveTableContent(node)
      return false // 找到表格后停止遍历
    }
    return true
  })
}

// 设置表格本地存储同步
function setupTableSync(view: EditorView): void {
  // 设置事务处理器，在文档变化时保存表格
  const originalDispatch = view.dispatch

  view.dispatch = (tr) => {
    // 调用原始的dispatch方法
    originalDispatch.call(view, tr)

    // 如果文档发生变化，保存表格数据
    if (tr.docChanged) {
      findAndSaveTable(view.state.doc)
    }
  }
}

// 主函数：初始化编辑器的表格本地存储
export function initTableLocalStorage(view: EditorView, schema: Schema, defaultContent: Node | null = null): Node | null {
  // 1. 从localStorage加载表格数据
  const storedTable = loadTableFromStorage(schema)

  // 2. 设置表格内容变化的监听器
  setupTableSync(view)

  // 3. 返回存储的表格数据（如果有）
  return storedTable || defaultContent
}

// 对外暴露的辅助函数，用于在初始化编辑器前获取表格内容
export function getStoredTableContent(schema: Schema, defaultContentNode: Node): Node {
  // 从localStorage加载表格数据
  const storedData = loadTableContent()

  if (storedData) {
    // 使用存储的数据
    const storedTable = createTableFromStoredData(schema, storedData)
    if (storedTable) {
      return schema.nodes.doc.create(null, storedTable)
    }
  }

  // 如果没有存储数据或创建失败，返回默认内容
  return defaultContentNode
}
