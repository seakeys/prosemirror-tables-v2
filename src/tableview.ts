import { Node } from 'prosemirror-model'
import { NodeView, ViewMutationRecord } from 'prosemirror-view'
import { CellAttrs } from './util'

/**
 * @public
 * 表格视图组件，实现了NodeView接口
 */
export class TableView implements NodeView {
  public dom: HTMLDivElement
  public table: HTMLTableElement
  public colgroup: HTMLTableColElement
  public contentDOM: HTMLTableSectionElement

  /**
   * 创建表格视图的构造函数
   * @param node 表格节点
   * @param defaultCellMinWidth 默认单元格最小宽度
   */
  constructor(
    public node: Node,
    public defaultCellMinWidth: number,
  ) {
    this.dom = document.createElement('div')
    this.dom.className = 'tableWrapper'
    this.table = this.dom.appendChild(document.createElement('table'))
    this.table.style.setProperty('--default-cell-min-width', `${defaultCellMinWidth}px`)
    this.colgroup = this.table.appendChild(document.createElement('colgroup'))
    updateColumnsOnResize(node, this.colgroup, this.table, defaultCellMinWidth)
    this.contentDOM = this.table.appendChild(document.createElement('tbody'))
  }

  /**
   * 更新表格视图
   * @param node 新的表格节点
   * @returns 如果节点类型匹配则返回true，否则返回false
   */
  update(node: Node): boolean {
    if (node.type != this.node.type) return false
    this.node = node
    updateColumnsOnResize(node, this.colgroup, this.table, this.defaultCellMinWidth)
    return true
  }

  /**
   * 判断是否忽略特定的DOM变化
   * @param record DOM变化记录
   * @returns 如果是目标为表格或列组的属性变化则返回true
   */
  ignoreMutation(record: ViewMutationRecord): boolean {
    return record.type == 'attributes' && (record.target == this.table || this.colgroup.contains(record.target))
  }
}

/**
 * @public
 * 根据节点内容更新表格列的大小
 * @param node 表格节点
 * @param colgroup 表格的列组元素
 * @param table 表格元素
 * @param defaultCellMinWidth 默认单元格最小宽度
 * @param overrideCol 可选，要覆盖的列索引
 * @param overrideValue 可选，覆盖列的宽度值
 */
export function updateColumnsOnResize(
  node: Node,
  colgroup: HTMLTableColElement,
  table: HTMLTableElement,
  defaultCellMinWidth: number,
  overrideCol?: number,
  overrideValue?: number,
): void {
  let totalWidth = 0
  let fixedWidth = true
  let nextDOM = colgroup.firstChild as HTMLElement
  const row = node.firstChild
  if (!row) return

  for (let i = 0, col = 0; i < row.childCount; i++) {
    const { colspan, colwidth } = row.child(i).attrs as CellAttrs
    for (let j = 0; j < colspan; j++, col++) {
      const hasWidth = overrideCol == col ? overrideValue : colwidth && colwidth[j]
      const cssWidth = hasWidth ? hasWidth + 'px' : ''
      totalWidth += hasWidth || defaultCellMinWidth
      if (!hasWidth) fixedWidth = false
      if (!nextDOM) {
        const col = document.createElement('col')
        col.style.width = cssWidth
        colgroup.appendChild(col)
      } else {
        if (nextDOM.style.width != cssWidth) {
          nextDOM.style.width = cssWidth
        }
        nextDOM = nextDOM.nextSibling as HTMLElement
      }
    }
  }

  while (nextDOM) {
    const after = nextDOM.nextSibling
    nextDOM.parentNode?.removeChild(nextDOM)
    nextDOM = after as HTMLElement
  }

  if (fixedWidth) {
    table.style.width = totalWidth + 'px'
    table.style.minWidth = ''
  } else {
    table.style.width = ''
    table.style.minWidth = totalWidth + 'px'
  }
}
