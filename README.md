# ProseMirror 表格模块

本模块定义了一个架构扩展，支持带有行跨度/列跨度的表格，包括：
- 表格单元格选择的自定义选择类
- 管理此类选择并强制执行不变性的插件
- 用于处理表格的多个命令

顶层目录包含 `demo.js` 和 `index.html`，可以通过 `pnpm run build_demo` 构建，展示模块的简单演示。

## [在线演示](https://prosemirror-tables.netlify.app/)

## 文档

模块的主文件导出了使用它所需的一切。你可能首先要做的是创建一个支持表格的架构。这就是 `tableNodes` 的用途：

 * **`tableNodes`**`(options: Object) → Object`\
   这个函数为 `table`、`table_row` 和 `table_cell` 节点类型创建一组[节点规范](http://prosemirror.net/docs/ref/#model.SchemaSpec.nodes)，用于此模块。结果可以在创建架构时添加到节点集中。

    * **`options`**`: Object`\
      支持以下选项：

       * **`tableGroup`**`: ?string`\
         要添加到表格节点类型的组名（比如 `"block"`）。

       * **`cellContent`**`: string`\
         表格单元格的内容表达式。

       * **`cellAttributes`**`: ?Object`\
         要添加到单元格的额外属性。属性名映射到具有以下属性的对象：

          * **`default`**`: any`\
            属性的默认值。

          * **`getFromDOM`**`: ?fn(dom.Node) → any`\
            从 DOM 节点读取属性值的函数。

          * **`setDOMAttr`**`: ?fn(value: any, attrs: Object)`\
            用于向渲染单元格 DOM 的属性对象添加属性值的函数。


 * **`tableEditing`**`() → Plugin`\
   创建一个[插件](http://prosemirror.net/docs/ref/#state.Plugin)，当添加到编辑器时：
   - 启用单元格选择
   - 处理基于单元格的复制/粘贴
   - 确保表格保持良好的结构（每行宽度相同，单元格不重叠）。

   你可能应该将此插件放在插件数组的末尾，因为它广泛处理表格中的鼠标和箭头键事件，而其他插件（如间隙光标或列宽拖动插件）可能希望先执行更具体的行为。


### 类 CellSelection 继承自 Selection

一个 [`Selection`](http://prosemirror.net/docs/ref/#state.Selection) 的子类，表示跨越表格部分的单元格选择。启用插件后，当用户跨单元格选择时会创建这些选择，并通过给选定单元格添加 `selectedCell` CSS 类来绘制。

 * `new `**`CellSelection`**`($anchorCell: ResolvedPos, $headCell: ?ResolvedPos = $anchorCell)`\
   表格选择通过其锚点和头部单元格来标识。传递给构造函数的位置应指向同一表格中两个单元格的_前面_。它们可以相同，以选择单个单元格。

 * **`$anchorCell`**`: ResolvedPos`\
   指向锚点单元格（选择时不移动的单元格）_前面_的已解析位置。

 * **`$headCell`**`: ResolvedPos`\
   指向头部单元格（扩展选择时移动的单元格）前面的已解析位置。

 * **`content`**`() → Slice`\
   返回包含选定单元格的矩形表格行。

 * **`isColSelection`**`() → bool`\
   如果选择从表格顶部到底部，则为 true。

 * **`isRowSelection`**`() → bool`\
   如果选择从表格左侧到右侧，则为 true。

 * `static `**`colSelection`**`($anchorCell: ResolvedPos, $headCell: ?ResolvedPos = $anchorCell) → CellSelection`\
   返回覆盖给定锚点和头部单元格的最小列选择。

 * `static `**`rowSelection`**`($anchorCell: ResolvedPos, $headCell: ?ResolvedPos = $anchorCell) → CellSelection`\
   返回覆盖给定锚点和头部单元格的最小行选择。

 * `static `**`create`**`(doc: Node, anchorCell: number, headCell: ?number = anchorCell) → CellSelection`


### 命令

以下命令可用于为用户提供表格编辑功能。

 * **`addColumnBefore`**`(state: EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   在选择的列之前添加列的命令。

 * **`addColumnAfter`**`(state: EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   在选择的列之后添加列的命令。

 * **`deleteColumn`**`(state: EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   从表格中删除选定列的命令函数。

 * **`addRowBefore`**`(state: EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   在选择前添加表格行。

 * **`addRowAfter`**`(state: EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   在选择后添加表格行。

 * **`deleteRow`**`(state: EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   从表格中删除选定行。

 * **`mergeCells`**`(state: EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   将选定的单元格合并为单个单元格。仅在选定单元格的轮廓形成矩形时可用。

 * **`splitCell`**`(state: EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   拆分选定的单元格，其行跨度或列跨度大于 1，分割成较小的单元格。使用第一个单元格类型作为新单元格。

 * **`splitCellWithType`**`(getType: fn({row: number, col: number, node: Node}) → NodeType) → fn(EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   拆分选定的单元格（行跨度或列跨度大于 1），使用 getType 函数返回的单元格类型（th、td）将其拆分为较小的单元格。

 * **`setCellAttr`**`(name: string, value: any) → fn(EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   返回一个命令，设置给定属性为给定值，仅在当前选定单元格尚未将该属性设置为该值时可用。

 * **`toggleHeaderRow`**`(EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   切换选定行是否包含标题单元格。

 * **`toggleHeaderColumn`**`(EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   切换选定列是否包含标题单元格。

 * **`toggleHeaderCell`**`(EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   切换选定的单元格是否为标题单元格。

 * **`toggleHeader`**`(type: string, options: ?{useDeprecatedLogic: bool}) → fn(EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   切换行/列标题和普通单元格（仅适用于第一行/列）。
   对于已弃用的行为，在选项中传递 `useDeprecatedLogic` 为 true。

 * **`goToNextCell`**`(direction: number) → fn(EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   返回一个命令，用于在表格中选择下一个（direction=1）或上一个（direction=-1）单元格。

 * **`deleteTable`**`(state: EditorState, dispatch: ?fn(tr: Transaction)) → bool`\
   删除选择周围的表格（如果有）。


### 实用工具

 * **`fixTables`**`(state: EditorState, oldState: ?EditorState) → ?Transaction`\
   检查给定状态文档中的所有表格，并在必要时返回修复它们的事务。如果提供了 `oldState`，则假定它保存了先前的、已知正确的状态，将用于避免重新扫描未更改的文档部分。


### 类 TableMap

表格映射描述了给定表格的结构。为避免频繁重新计算，它们按表格节点缓存。为了能够这样做，映射中保存的位置是相对于表格开始，而不是文档开始。

 * **`width`**`: number`\
   表格的宽度

 * **`height`**`: number`\
   表格的高度

 * **`map`**`: [number]`\
   一个 width * height 数组，每个槽位包含覆盖表格该部分的单元格的起始位置

 * **`findCell`**`(pos: number) → Rect`\
   找到给定位置的单元格尺寸。

 * **`colCount`**`(pos: number) → number`\
   找到给定位置单元格的左侧。

 * **`nextCell`**`(pos: number, axis: string, dir: number) → ?number`\
   在给定方向上找到下一个单元格，从 `pos` 处的单元格开始（如果有）。

 * **`rectBetween`**`(a: number, b: number) → Rect`\
   获取跨越两个给定单元格的矩形。

 * **`cellsInRect`**`(rect: Rect) → [number]`\
   返回在给定矩形中具有左上角的所有单元格的位置。

 * **`positionAt`**`(row: number, col: number, table: Node) → number`\
   返回给定行和列的单元格开始的位置，或者如果单元格从那里开始，则返回该位置。

 * `static `**`get`**`(table: Node) → TableMap`\
   为给定的表格节点查找表格映射。