# ProseMirror 表格模块

这个模块定义了一个模式扩展，用于支持具有行跨度/列跨度支持的表格，以及用于此类表格中单元格选择的自定义选择类。它还包括一个管理这类选择并强制执行表格不变性的插件，以及用于处理表格的多个命令。

顶层目录包含 `demo.js` 和 `index.html`，可以通过 `npm run build_demo` 构建，以展示模块的简单使用演示。

## 文档

模块的主文件导出了使用它所需的所有内容。你可能首先要做的是创建一个支持表格的模式。这就是 `tableNodes` 的用途：

@tableNodes

@tableEditing

@CellSelection

### 命令

以下命令可用于为用户提供表格编辑功能：

@addColumnBefore（在前添加列）

@addColumnAfter（在后添加列）

@deleteColumn（删除列）

@addRowBefore（在前添加行）

@addRowAfter（在后添加行）

@deleteRow（删除行）

@mergeCells（合并单元格）

@splitCell（拆分单元格）

@splitCellWithType（使用特定类型拆分单元格）

@setCellAttr（设置单元格属性）

@toggleHeaderRow（切换标题行）

@toggleHeaderColumn（切换标题列）

@toggleHeaderCell（切换标题单元格）

@toggleHeader（切换标题）

@goToNextCell（转到下一个单元格）

@deleteTable（删除表格）

### 实用工具

@fixTables（修复表格）

@TableMap（表格映射）
