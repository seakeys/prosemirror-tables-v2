// 此文件定义了一个ProseMirror选择子类，用于模拟表格单元格选择。
// 表格插件需要处于活动状态才能连接表格选择的用户交互部分
// （这样当您跨单元格选择时才能实际获得此类选择）。

import { Fragment, Node, ResolvedPos, Slice } from 'prosemirror-model'
import { EditorState, NodeSelection, Selection, SelectionRange, TextSelection, Transaction } from 'prosemirror-state'
import { Decoration, DecorationSet, DecorationSource } from 'prosemirror-view'

import { Mappable } from 'prosemirror-transform'
import { TableMap } from './tablemap'
import { CellAttrs, inSameTable, pointsAtCell, removeColSpan } from './util'

/**
 * @public
 */
export interface CellSelectionJSON {
  type: string
  anchor: number
  head: number
}

/**
 * [`Selection`](http://prosemirror.net/docs/ref/#state.Selection)的子类，
 * 表示跨越表格部分的单元格选择。
 * 启用插件后，当用户跨单元格选择时，将创建这些选择，
 * 并通过给选定单元格一个`selectedCell` CSS类来绘制它们。
 *
 * @public
 */
export class CellSelection extends Selection {
  // 一个指向锚点单元格前方的已解析位置
  // （锚点单元格是扩展选择时不移动的单元格）。
  public $anchorCell: ResolvedPos

  // 一个指向头部单元格前方的已解析位置
  // （头部单元格是扩展选择时移动的单元格）。
  public $headCell: ResolvedPos

  // 表格选择通过其锚点和头部单元格来标识。
  // 给到此构造函数的位置应指向同一表格中两个单元格之前。
  // 它们可以是相同的，以选择单个单元格。
  constructor($anchorCell: ResolvedPos, $headCell: ResolvedPos = $anchorCell) {
    const table = $anchorCell.node(-1)
    const map = TableMap.get(table)
    const tableStart = $anchorCell.start(-1)
    const rect = map.rectBetween($anchorCell.pos - tableStart, $headCell.pos - tableStart)

    const doc = $anchorCell.node(0)
    const cells = map.cellsInRect(rect).filter((p) => p != $headCell.pos - tableStart)
    // 使头部单元格成为第一个范围，以便它作为选择的主要部分
    cells.unshift($headCell.pos - tableStart)
    const ranges = cells.map((pos) => {
      const cell = table.nodeAt(pos)
      if (!cell) {
        throw RangeError(`No cell with offset ${pos} found`)
      }
      const from = tableStart + pos + 1
      return new SelectionRange(doc.resolve(from), doc.resolve(from + cell.content.size))
    })
    super(ranges[0].$from, ranges[0].$to, ranges)
    this.$anchorCell = $anchorCell
    this.$headCell = $headCell
  }

  /**
   * 将此选择映射到文档的新版本。
   * 如果选择的锚点和头部单元格仍然指向同一表格中的单元格，
   * 则返回新的CellSelection。否则，返回文本选择。
   */
  public map(doc: Node, mapping: Mappable): CellSelection | Selection {
    const $anchorCell = doc.resolve(mapping.map(this.$anchorCell.pos))
    const $headCell = doc.resolve(mapping.map(this.$headCell.pos))
    if (pointsAtCell($anchorCell) && pointsAtCell($headCell) && inSameTable($anchorCell, $headCell)) {
      const tableChanged = this.$anchorCell.node(-1) != $anchorCell.node(-1)
      if (tableChanged && this.isRowSelection()) return CellSelection.rowSelection($anchorCell, $headCell)
      else if (tableChanged && this.isColSelection()) return CellSelection.colSelection($anchorCell, $headCell)
      else return new CellSelection($anchorCell, $headCell)
    }
    return TextSelection.between($anchorCell, $headCell)
  }

  /**
   * 返回包含所选单元格的表格行的矩形切片。
   */
  public content(): Slice {
    const table = this.$anchorCell.node(-1)
    const map = TableMap.get(table)
    const tableStart = this.$anchorCell.start(-1)

    const rect = map.rectBetween(this.$anchorCell.pos - tableStart, this.$headCell.pos - tableStart)
    const seen: Record<number, boolean> = {}
    const rows = []
    for (let row = rect.top; row < rect.bottom; row++) {
      const rowContent = []
      for (let index = row * map.width + rect.left, col = rect.left; col < rect.right; col++, index++) {
        const pos = map.map[index]
        if (seen[pos]) continue
        seen[pos] = true

        const cellRect = map.findCell(pos)
        let cell = table.nodeAt(pos)
        if (!cell) {
          throw RangeError(`No cell with offset ${pos} found`)
        }

        const extraLeft = rect.left - cellRect.left
        const extraRight = cellRect.right - rect.right

        if (extraLeft > 0 || extraRight > 0) {
          let attrs = cell.attrs as CellAttrs
          if (extraLeft > 0) {
            attrs = removeColSpan(attrs, 0, extraLeft)
          }
          if (extraRight > 0) {
            attrs = removeColSpan(attrs, attrs.colspan - extraRight, extraRight)
          }
          if (cellRect.left < rect.left) {
            cell = cell.type.createAndFill(attrs)
            if (!cell) {
              throw RangeError(`Could not create cell with attrs ${JSON.stringify(attrs)}`)
            }
          } else {
            cell = cell.type.create(attrs, cell.content)
          }
        }
        if (cellRect.top < rect.top || cellRect.bottom > rect.bottom) {
          const attrs = {
            ...cell.attrs,
            rowspan: Math.min(cellRect.bottom, rect.bottom) - Math.max(cellRect.top, rect.top),
          }
          if (cellRect.top < rect.top) {
            cell = cell.type.createAndFill(attrs)!
          } else {
            cell = cell.type.create(attrs, cell.content)
          }
        }
        rowContent.push(cell)
      }
      rows.push(table.child(row).copy(Fragment.from(rowContent)))
    }

    const fragment = this.isColSelection() && this.isRowSelection() ? table : rows
    return new Slice(Fragment.from(fragment), 1, 1)
  }

  /**
   * 用提供的内容替换所选单元格。
   * 如果未提供内容，则清空所选单元格。
   */
  public replace(tr: Transaction, content: Slice = Slice.empty): void {
    const mapFrom = tr.steps.length,
      ranges = this.ranges
    for (let i = 0; i < ranges.length; i++) {
      const { $from, $to } = ranges[i],
        mapping = tr.mapping.slice(mapFrom)
      tr.replace(mapping.map($from.pos), mapping.map($to.pos), i ? Slice.empty : content)
    }
    const sel = Selection.findFrom(tr.doc.resolve(tr.mapping.slice(mapFrom).map(this.to)), -1)
    if (sel) tr.setSelection(sel)
  }

  /**
   * 用提供的节点替换所选单元格。
   */
  public replaceWith(tr: Transaction, node: Node): void {
    this.replace(tr, new Slice(Fragment.from(node), 0, 0))
  }

  /**
   * 对选择中的每个单元格执行给定函数。
   */
  public forEachCell(f: (node: Node, pos: number) => void): void {
    const table = this.$anchorCell.node(-1)
    const map = TableMap.get(table)
    const tableStart = this.$anchorCell.start(-1)

    const cells = map.cellsInRect(map.rectBetween(this.$anchorCell.pos - tableStart, this.$headCell.pos - tableStart))
    for (let i = 0; i < cells.length; i++) {
      f(table.nodeAt(cells[i])!, tableStart + cells[i])
    }
  }

  /**
   * 判断这个选择是否从表格顶部一直延伸到底部。
   */
  public isColSelection(): boolean {
    const anchorTop = this.$anchorCell.index(-1)
    const headTop = this.$headCell.index(-1)
    if (Math.min(anchorTop, headTop) > 0) return false

    const anchorBottom = anchorTop + this.$anchorCell.nodeAfter!.attrs.rowspan
    const headBottom = headTop + this.$headCell.nodeAfter!.attrs.rowspan

    return Math.max(anchorBottom, headBottom) == this.$headCell.node(-1).childCount
  }

  /**
   * 返回覆盖给定锚点和头部单元格的最小列选择。
   */
  public static colSelection($anchorCell: ResolvedPos, $headCell: ResolvedPos = $anchorCell): CellSelection {
    const table = $anchorCell.node(-1)
    const map = TableMap.get(table)
    const tableStart = $anchorCell.start(-1)

    const anchorRect = map.findCell($anchorCell.pos - tableStart)
    const headRect = map.findCell($headCell.pos - tableStart)
    const doc = $anchorCell.node(0)

    if (anchorRect.top <= headRect.top) {
      if (anchorRect.top > 0) $anchorCell = doc.resolve(tableStart + map.map[anchorRect.left])
      if (headRect.bottom < map.height) $headCell = doc.resolve(tableStart + map.map[map.width * (map.height - 1) + headRect.right - 1])
    } else {
      if (headRect.top > 0) $headCell = doc.resolve(tableStart + map.map[headRect.left])
      if (anchorRect.bottom < map.height) $anchorCell = doc.resolve(tableStart + map.map[map.width * (map.height - 1) + anchorRect.right - 1])
    }
    return new CellSelection($anchorCell, $headCell)
  }

  /**
   * 判断这个选择是否从表格左侧一直延伸到右侧。
   */
  public isRowSelection(): boolean {
    const table = this.$anchorCell.node(-1)
    const map = TableMap.get(table)
    const tableStart = this.$anchorCell.start(-1)

    const anchorLeft = map.colCount(this.$anchorCell.pos - tableStart)
    const headLeft = map.colCount(this.$headCell.pos - tableStart)
    if (Math.min(anchorLeft, headLeft) > 0) return false

    const anchorRight = anchorLeft + this.$anchorCell.nodeAfter!.attrs.colspan
    const headRight = headLeft + this.$headCell.nodeAfter!.attrs.colspan
    return Math.max(anchorRight, headRight) == map.width
  }

  /**
   * 判断两个单元格选择是否相等。
   */
  public eq(other: unknown): boolean {
    return other instanceof CellSelection && other.$anchorCell.pos == this.$anchorCell.pos && other.$headCell.pos == this.$headCell.pos
  }

  /**
   * 返回覆盖给定锚点和头部单元格的最小行选择。
   */
  public static rowSelection($anchorCell: ResolvedPos, $headCell: ResolvedPos = $anchorCell): CellSelection {
    const table = $anchorCell.node(-1)
    const map = TableMap.get(table)
    const tableStart = $anchorCell.start(-1)

    const anchorRect = map.findCell($anchorCell.pos - tableStart)
    const headRect = map.findCell($headCell.pos - tableStart)
    const doc = $anchorCell.node(0)

    if (anchorRect.left <= headRect.left) {
      if (anchorRect.left > 0) $anchorCell = doc.resolve(tableStart + map.map[anchorRect.top * map.width])
      if (headRect.right < map.width) $headCell = doc.resolve(tableStart + map.map[map.width * (headRect.top + 1) - 1])
    } else {
      if (headRect.left > 0) $headCell = doc.resolve(tableStart + map.map[headRect.top * map.width])
      if (anchorRect.right < map.width) $anchorCell = doc.resolve(tableStart + map.map[map.width * (anchorRect.top + 1) - 1])
    }
    return new CellSelection($anchorCell, $headCell)
  }

  /**
   * 将单元格选择转换为JSON对象，用于序列化。
   */
  public toJSON(): CellSelectionJSON {
    return {
      type: 'cell',
      anchor: this.$anchorCell.pos,
      head: this.$headCell.pos,
    }
  }

  /**
   * 从JSON对象创建单元格选择。
   */
  static fromJSON(doc: Node, json: CellSelectionJSON): CellSelection {
    return new CellSelection(doc.resolve(json.anchor), doc.resolve(json.head))
  }

  /**
   * 在文档中创建一个新的单元格选择。
   */
  static create(doc: Node, anchorCell: number, headCell: number = anchorCell): CellSelection {
    return new CellSelection(doc.resolve(anchorCell), doc.resolve(headCell))
  }

  /**
   * 创建此选择的书签，用于在文档更改后恢复选择。
   */
  getBookmark(): CellBookmark {
    return new CellBookmark(this.$anchorCell.pos, this.$headCell.pos)
  }
}

// 设置单元格选择为不可见，这样它就不会显示光标
CellSelection.prototype.visible = false

// 注册单元格选择的JSON ID
Selection.jsonID('cell', CellSelection)

/**
 * 单元格选择的书签，用于在文档更改后恢复选择。
 * @public
 */
export class CellBookmark {
  /**
   * 创建单元格书签。
   * @param anchor - 锚点单元格的位置
   * @param head - 头部单元格的位置
   */
  constructor(
    public anchor: number,
    public head: number,
  ) {}

  /**
   * 将书签映射到文档的新版本。
   */
  map(mapping: Mappable): CellBookmark {
    return new CellBookmark(mapping.map(this.anchor), mapping.map(this.head))
  }

  /**
   * 从书签中恢复选择。
   * 如果书签指向的位置不再是有效的单元格，则返回最接近的文本选择。
   */
  resolve(doc: Node): CellSelection | Selection {
    const $anchorCell = doc.resolve(this.anchor),
      $headCell = doc.resolve(this.head)
    if (
      $anchorCell.parent.type.spec.tableRole == 'row' &&
      $headCell.parent.type.spec.tableRole == 'row' &&
      $anchorCell.index() < $anchorCell.parent.childCount &&
      $headCell.index() < $headCell.parent.childCount &&
      inSameTable($anchorCell, $headCell)
    )
      return new CellSelection($anchorCell, $headCell)
    else return Selection.near($headCell, 1)
  }
}

/**
 * 创建用于绘制单元格选择的装饰集。
 * 为每个选中的单元格添加"selectedCell"类。
 */
export function drawCellSelection(state: EditorState): DecorationSource | null {
  if (!(state.selection instanceof CellSelection)) return null
  const cells: Decoration[] = []
  state.selection.forEachCell((node, pos) => {
    cells.push(Decoration.node(pos, pos + node.nodeSize, { class: 'selectedCell' }))
  })
  return DecorationSet.create(state.doc, cells)
}

/**
 * 检查文本选择是否位于单元格边界上。
 * 这用于确定是否需要将文本选择规范化为单元格选择。
 */
function isCellBoundarySelection({ $from, $to }: TextSelection) {
  if ($from.pos == $to.pos || $from.pos < $to.pos - 6) return false // 快速排除
  let afterFrom = $from.pos
  let beforeTo = $to.pos
  let depth = $from.depth
  for (; depth >= 0; depth--, afterFrom++) if ($from.after(depth + 1) < $from.end(depth)) break
  for (let d = $to.depth; d >= 0; d--, beforeTo--) if ($to.before(d + 1) > $to.start(d)) break
  return afterFrom == beforeTo && /row|table/.test($from.node(depth).type.spec.tableRole)
}

/**
 * 检查文本选择是否跨越多个单元格。
 * 这用于确定是否需要将文本选择规范化为仅在一个单元格内。
 */
function isTextSelectionAcrossCells({ $from, $to }: TextSelection) {
  let fromCellBoundaryNode: Node | undefined
  let toCellBoundaryNode: Node | undefined

  for (let i = $from.depth; i > 0; i--) {
    const node = $from.node(i)
    if (node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell') {
      fromCellBoundaryNode = node
      break
    }
  }

  for (let i = $to.depth; i > 0; i--) {
    const node = $to.node(i)
    if (node.type.spec.tableRole === 'cell' || node.type.spec.tableRole === 'header_cell') {
      toCellBoundaryNode = node
      break
    }
  }

  return fromCellBoundaryNode !== toCellBoundaryNode && $to.parentOffset === 0
}

/**
 * 规范化选择，确保表格相关的选择处于有效状态。
 *
 * - 如果选择是单元格节点选择，则转换为单元格选择
 * - 如果选择是行节点选择，则转换为行选择
 * - 如果选择是表格节点选择且不允许表格节点选择，则转换为选择整个表格的单元格选择
 * - 如果选择是位于单元格边界的文本选择，则规范化为仅从起点的文本选择
 * - 如果选择是跨越多个单元格的文本选择，则规范化为仅在起始单元格内的文本选择
 *
 * @param state 编辑器状态
 * @param tr 可选的事务，如果未提供则创建新事务
 * @param allowTableNodeSelection 是否允许表格节点选择
 * @returns 更新后的事务，如果没有需要规范化的内容则返回未定义
 */
export function normalizeSelection(state: EditorState, tr: Transaction | undefined, allowTableNodeSelection: boolean): Transaction | undefined {
  const sel = (tr || state).selection
  const doc = (tr || state).doc
  let normalize: Selection | undefined
  let role: string | undefined
  if (sel instanceof NodeSelection && (role = sel.node.type.spec.tableRole)) {
    if (role == 'cell' || role == 'header_cell') {
      normalize = CellSelection.create(doc, sel.from)
    } else if (role == 'row') {
      const $cell = doc.resolve(sel.from + 1)
      normalize = CellSelection.rowSelection($cell, $cell)
    } else if (!allowTableNodeSelection) {
      const map = TableMap.get(sel.node)
      const start = sel.from + 1
      const lastCell = start + map.map[map.width * map.height - 1]
      normalize = CellSelection.create(doc, start + 1, lastCell)
    }
  } else if (sel instanceof TextSelection && isCellBoundarySelection(sel)) {
    normalize = TextSelection.create(doc, sel.from)
  } else if (sel instanceof TextSelection && isTextSelectionAcrossCells(sel)) {
    normalize = TextSelection.create(doc, sel.$from.start(), sel.$from.end())
  }
  if (normalize) (tr || (tr = state.tr)).setSelection(normalize)
  return tr
}
