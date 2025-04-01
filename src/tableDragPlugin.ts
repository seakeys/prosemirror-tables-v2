import { Plugin, PluginKey } from 'prosemirror-state'

// 创建插件键
export const tableDragPluginKey = new PluginKey('tableDrag')

// 极简的拖动表格插件，避免与编辑器更新循环交互
export function tableDragPlugin() {
  console.log('初始化 tableDragPlugin')

  // 跟踪拖动状态
  let isDragging = false
  let selectedContainer: HTMLElement | null = null
  let startX = 0
  let startY = 0
  let currentTranslateX = 0
  let currentTranslateY = 0

  // 设置表格为可拖动
  function setupTableDragging() {
    console.log('设置表格拖动功能')
    // 清理可能存在的事件监听器，防止重复绑定
    cleanupEventListeners()
    // 添加新的事件监听器
    document.addEventListener('mousedown', handleDocumentMouseDown)
    console.log('已添加 mousedown 事件监听器')
  }

  // 清理所有事件监听器
  function cleanupEventListeners() {
    console.log('清理事件监听器')
    document.removeEventListener('mousedown', handleDocumentMouseDown)
    document.removeEventListener('mousemove', handleDocumentMouseMove)
    document.removeEventListener('mouseup', handleDocumentMouseUp)

    // 确保没有表格处于拖动状态
    const draggingContainers = document.querySelectorAll('.table-container.dragging')
    draggingContainers.forEach((container) => {
      container.classList.remove('dragging')
      console.log('移除残留的拖动样式')
    })
  }

  function setContainerTransform(container: HTMLElement, x: number, y: number): void {
    container.style.transform = `translate(${x}px, ${y}px)`
    console.log(`设置容器变换: translate(${x}px, ${y}px)`)
  }

  // 获取容器当前变换
  function getContainerTransform(container: HTMLElement) {
    const transform = window.getComputedStyle(container).transform
    console.log('当前变换矩阵:', transform)

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
    console.log('文档 mousedown 事件触发', (e.target as HTMLElement)?.tagName, '坐标:', e.clientX, e.clientY)

    // 检查是否点击在表格容器内部
    const isInsideContainer = (e.target as Element).closest('.table-container')
    if (isInsideContainer) {
      console.log('点击在表格容器内部，忽略拖动')
      return
    }

    // 只在body或html元素上触发
    if (e.target === document.body || e.target === document.documentElement) {
      console.log('在 body 或 html 上触发')

      // 查找页面上的第一个表格容器
      const container = document.querySelector('.table-container') as HTMLDivElement
      console.log('找到表格容器:', container)

      if (container) {
        // 确保容器可以被定位
        const position = getComputedStyle(container).position
        console.log('表格容器的 position 属性:', position)

        if (position === 'static') {
          container.style.position = 'relative'
          console.log('将表格容器的 position 设置为 relative')
        }

        // 确保没有正在拖动的其他容器
        if (isDragging && selectedContainer) {
          console.log('有其他容器正在拖动，先重置状态')
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

        console.log('拖动初始位置:', {
          startX,
          startY,
          currentTranslateX,
          currentTranslateY,
        })

        // 添加拖动样式
        selectedContainer.classList.add('dragging')
        console.log('添加拖动样式类')

        // 添加拖动事件处理
        document.addEventListener('mousemove', handleDocumentMouseMove)
        document.addEventListener('mouseup', handleDocumentMouseUp)
        console.log('添加 mousemove 和 mouseup 事件监听器')

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

    // 只在移动超过1px时记录日志，减少日志量
    if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
      console.log('鼠标移动:', {
        clientX: e.clientX,
        clientY: e.clientY,
        deltaX,
        deltaY,
      })
    }

    // 计算新位置
    const newX = currentTranslateX + deltaX
    const newY = currentTranslateY + deltaY

    // 使用transform设置位置
    setContainerTransform(selectedContainer, newX, newY)

    // 阻止默认行为
    e.preventDefault()
  }

  // 处理文档级别的鼠标释放
  function handleDocumentMouseUp(e: MouseEvent) {
    console.log('mouseup 事件触发', e.clientX, e.clientY)

    if (isDragging && selectedContainer) {
      // 移除拖动样式
      selectedContainer.classList.remove('dragging')
      console.log('移除拖动样式类')

      // 计算总移动距离
      const totalDeltaX = e.clientX - startX
      const totalDeltaY = e.clientY - startY

      // 获取最终位置
      const finalTransform = getContainerTransform(selectedContainer)
      const finalX = finalTransform[0]
      const finalY = finalTransform[1]

      // 记录最终位置
      console.log('拖动结束位置:', {
        finalX,
        finalY,
        总移动X: totalDeltaX,
        总移动Y: totalDeltaY,
      })

      // 重置拖动状态
      isDragging = false
      selectedContainer = null
      console.log('重置拖动状态')

      // 移除事件处理器
      document.removeEventListener('mousemove', handleDocumentMouseMove)
      document.removeEventListener('mouseup', handleDocumentMouseUp)
      console.log('移除 mousemove 和 mouseup 事件监听器')
    }
  }

  // 初始化
  setupTableDragging()

  // 返回一个简单的插件，不直接操作编辑器状态
  return new Plugin({
    key: tableDragPluginKey,

    // 注意：只提供空的默认方法，避免与编辑器状态交互
    view() {
      console.log('创建插件视图')
      return {
        update() {
          // 为减少日志量，禁用视图更新日志
          // console.log('插件视图更新')
        },
        destroy() {
          console.log('销毁插件视图，移除事件监听器')
          // 清理全局事件
          cleanupEventListeners()
        },
      }
    },
  })
}
