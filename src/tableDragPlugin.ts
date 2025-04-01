import { Plugin, PluginKey } from 'prosemirror-state'

// 创建插件键
export const tableDragPluginKey = new PluginKey('tableDrag')

// 极简的拖动表格插件，避免与编辑器更新循环交互
export function tableDragPlugin() {
  // 跟踪拖动状态
  let isDragging = false
  let selectedContainer: HTMLElement | null = null
  let startX = 0
  let startY = 0
  let currentTranslateX = 0
  let currentTranslateY = 0

  // 设置表格为可拖动
  function setupTableDragging() {
    // 清理可能存在的事件监听器，防止重复绑定
    cleanupEventListeners()
    // 添加新的事件监听器
    document.addEventListener('mousedown', handleDocumentMouseDown)
  }

  // 清理所有事件监听器
  function cleanupEventListeners() {
    document.removeEventListener('mousedown', handleDocumentMouseDown)
    document.removeEventListener('mousemove', handleDocumentMouseMove)
    document.removeEventListener('mouseup', handleDocumentMouseUp)

    // 确保没有表格处于拖动状态
    const draggingContainers = document.querySelectorAll('.table-container.dragging')
    draggingContainers.forEach((container) => {
      container.classList.remove('dragging')
    })
  }

  function setContainerTransform(container: HTMLElement, x: number, y: number): void {
    container.style.transform = `translate(${x}px, ${y}px)`
  }

  // 获取容器当前变换
  function getContainerTransform(container: HTMLElement) {
    const transform = window.getComputedStyle(container).transform

    // 如果是默认的 'none' 或空值，返回 [0, 0]
    if (transform === 'none' || !transform) {
      return [0, 0]
    }

    try {
      // 解析变换矩阵，格式为 "matrix(a, b, c, d, tx, ty)" 或 "matrix3d(...)"
      const matrix = transform.match(/^matrix\((.+)\)$/)
      if (matrix) {
        const values = matrix[1].split(', ')
        return [parseFloat(values[4]), parseFloat(values[5])]
      }

      const matrix3d = transform.match(/^matrix3d\((.+)\)$/)
      if (matrix3d) {
        const values = matrix3d[1].split(', ')
        return [parseFloat(values[12]), parseFloat(values[13])]
      }
    } catch (e) {
      console.error('解析变换错误:', e)
    }

    return [0, 0]
  }

  // 处理文档级别的鼠标按下
  function handleDocumentMouseDown(e: MouseEvent) {
    // 检查是否点击在表格容器内部
    const isInsideContainer = (e.target as Element).closest('.table-container')
    if (isInsideContainer) {
      return
    }

    // 只在body或html元素上触发
    if (e.target === document.body || e.target === document.documentElement) {
      // 查找页面上的第一个表格容器
      const container = document.querySelector('.table-container') as HTMLDivElement

      if (container) {
        // 确保容器可以被定位
        const position = getComputedStyle(container).position

        if (position === 'static') container.style.position = 'relative'

        // 确保没有正在拖动的其他容器
        if (isDragging && selectedContainer) {
          selectedContainer.classList.remove('dragging')
          isDragging = false
        }

        // 设置拖动状态
        isDragging = true
        selectedContainer = container
        startX = e.clientX
        startY = e.clientY

        // 获取当前变换
        const transformValues = getContainerTransform(container)
        currentTranslateX = transformValues[0]
        currentTranslateY = transformValues[1]

        // 添加拖动样式
        selectedContainer.classList.add('dragging')

        // 添加拖动事件处理
        document.addEventListener('mousemove', handleDocumentMouseMove)
        document.addEventListener('mouseup', handleDocumentMouseUp)

        // 阻止默认行为
        e.preventDefault()
      }
    }
  }

  // 处理文档级别的鼠标移动
  function handleDocumentMouseMove(e: MouseEvent) {
    if (!isDragging || !selectedContainer) {
      return
    }

    // 计算位移
    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY

    // 计算新位置
    const newX = currentTranslateX + deltaX
    const newY = currentTranslateY + deltaY

    // 使用transform设置位置
    setContainerTransform(selectedContainer, newX, newY)

    // 阻止默认行为
    e.preventDefault()
  }

  // 处理文档级别的鼠标释放
  function handleDocumentMouseUp() {
    if (isDragging && selectedContainer) {
      // 移除拖动样式
      selectedContainer.classList.remove('dragging')

      // 重置拖动状态
      isDragging = false
      selectedContainer = null

      // 移除事件处理器
      document.removeEventListener('mousemove', handleDocumentMouseMove)
      document.removeEventListener('mouseup', handleDocumentMouseUp)
    }
  }

  // 初始化
  setupTableDragging()

  return new Plugin({
    key: tableDragPluginKey,

    // 注意：只提供空的默认方法，避免与编辑器状态交互
    view() {
      return {
        update() {
          // 为减少日志量，禁用视图更新日志
        },
        destroy() {
          // 清理全局事件
          cleanupEventListeners()
        },
      }
    },
  })
}
