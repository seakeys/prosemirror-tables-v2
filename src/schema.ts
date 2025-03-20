// 用于创建支持表格的模式的辅助函数

import { AttributeSpec, Attrs, Node, NodeSpec, NodeType, Schema } from 'prosemirror-model'
import { CellAttrs, MutableAttrs } from './util'

/**
 * 从DOM元素获取单元格属性
 *
 * @param dom - HTML元素或字符串
 * @param extraAttrs - 额外的属性
 * @returns 单元格属性对象
 */
function getCellAttrs(dom: HTMLElement | string, extraAttrs: Attrs): Attrs {
  if (typeof dom === 'string') {
    return {}
  }

  const widthAttr = dom.getAttribute('data-colwidth')
  const widths = widthAttr && /^\d+(,\d+)*$/.test(widthAttr) ? widthAttr.split(',').map((s) => Number(s)) : null
  const colspan = Number(dom.getAttribute('colspan') || 1)
  const result: MutableAttrs = {
    colspan,
    rowspan: Number(dom.getAttribute('rowspan') || 1),
    colwidth: widths && widths.length == colspan ? widths : null,
  } satisfies CellAttrs
  for (const prop in extraAttrs) {
    const getter = extraAttrs[prop].getFromDOM
    const value = getter && getter(dom)
    if (value != null) {
      result[prop] = value
    }
  }
  return result
}

/**
 * 设置单元格DOM属性
 *
 * @param node - 节点对象
 * @param extraAttrs - 额外的属性
 * @returns 处理后的属性对象
 */
function setCellAttrs(node: Node, extraAttrs: Attrs): Attrs {
  const attrs: MutableAttrs = {}
  if (node.attrs.colspan != 1) attrs.colspan = node.attrs.colspan
  if (node.attrs.rowspan != 1) attrs.rowspan = node.attrs.rowspan
  if (node.attrs.colwidth) attrs['data-colwidth'] = node.attrs.colwidth.join(',')
  for (const prop in extraAttrs) {
    const setter = extraAttrs[prop].setDOMAttr
    if (setter) setter(node.attrs[prop], attrs)
  }
  return attrs
}

/**
 * 从DOM获取值的函数类型
 * @public
 */
export type getFromDOM = (dom: HTMLElement) => unknown

/**
 * 设置DOM属性的函数类型
 * @public
 */
export type setDOMAttr = (value: unknown, attrs: MutableAttrs) => void

/**
 * 单元格属性接口
 * @public
 */
export interface CellAttributes {
  /**
   * 属性的默认值
   */
  default: unknown

  /**
   * 从DOM节点读取属性值的函数
   */
  getFromDOM?: getFromDOM

  /**
   * 将属性值添加到用于渲染单元格DOM的属性对象的函数
   */
  setDOMAttr?: setDOMAttr
}

/**
 * 表格节点选项接口
 * @public
 */
export interface TableNodesOptions {
  /**
   * 添加到表格节点类型的组名(如 "block")
   */
  tableGroup?: string

  /**
   * 表格单元格的内容表达式
   */
  cellContent: string

  /**
   * 添加到单元格的额外属性。将属性名映射到具有以下属性的对象
   */
  cellAttributes: { [key: string]: CellAttributes }
}

/**
 * 表格节点类型记录
 * @public
 */
export type TableNodes = Record<'table' | 'table_row' | 'table_cell' | 'table_header', NodeSpec>

/**
 * 此函数创建一组节点规范(http://prosemirror.net/docs/ref/#model.SchemaSpec.nodes)，
 * 用于本模块使用的 `table`、`table_row` 和 `table_cell` 节点类型。
 * 创建模式时，可以将结果添加到节点集中。
 *
 * @public
 */
export function tableNodes(options: TableNodesOptions): TableNodes {
  const extraAttrs = options.cellAttributes || {}
  const cellAttrs: Record<string, AttributeSpec> = {
    colspan: { default: 1 },
    rowspan: { default: 1 },
    colwidth: { default: null },
  }
  for (const prop in extraAttrs) cellAttrs[prop] = { default: extraAttrs[prop].default }

  return {
    table: {
      content: 'table_row+',
      tableRole: 'table',
      isolating: true,
      group: options.tableGroup,
      parseDOM: [{ tag: 'table' }],
      toDOM() {
        return ['table', ['tbody', 0]]
      },
    },
    table_row: {
      content: '(table_cell | table_header)*',
      tableRole: 'row',
      parseDOM: [{ tag: 'tr' }],
      toDOM() {
        return ['tr', 0]
      },
    },
    table_cell: {
      content: options.cellContent,
      attrs: cellAttrs,
      tableRole: 'cell',
      isolating: true,
      parseDOM: [{ tag: 'td', getAttrs: (dom) => getCellAttrs(dom, extraAttrs) }],
      toDOM(node) {
        return ['td', setCellAttrs(node, extraAttrs), 0]
      },
    },
    table_header: {
      content: options.cellContent,
      attrs: cellAttrs,
      tableRole: 'header_cell',
      isolating: true,
      parseDOM: [{ tag: 'th', getAttrs: (dom) => getCellAttrs(dom, extraAttrs) }],
      toDOM(node) {
        return ['th', setCellAttrs(node, extraAttrs), 0]
      },
    },
  }
}

/**
 * 表格角色类型
 * @public
 */
export type TableRole = 'table' | 'row' | 'cell' | 'header_cell'

/**
 * 获取表格节点类型
 *
 * 此函数从给定的Schema中获取所有的表格相关节点类型，并按照它们的tableRole分类返回
 *
 * @param schema - ProseMirror模式对象
 * @returns 按tableRole分类的节点类型记录
 * @public
 */
export function tableNodeTypes(schema: Schema): Record<TableRole, NodeType> {
  let result = schema.cached.tableNodeTypes
  if (!result) {
    result = schema.cached.tableNodeTypes = {}
    for (const name in schema.nodes) {
      const type = schema.nodes[name],
        role = type.spec.tableRole
      if (role) result[role] = type
    }
  }
  return result
}
