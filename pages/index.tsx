import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import Calendar from '@/components/Calendar'
import StatsDashboard from '@/components/StatsDashboard'
import KanbanBoard from '@/components/KanbanBoard'

interface Todo {
  id: number
  title: string
  completed: boolean
  created_at: string
  priority?: string
  category?: string
  due_date?: string
  description?: string
}

const CATEGORIES = ['工作', '生活', '学习', '其他']
const PRIORITIES = [
  { value: 'high', label: '高', color: '#ff4d4f' },
  { value: 'medium', label: '中', color: '#faad14' },
  { value: 'low', label: '低', color: '#52c41a' }
]

export default function Home() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [darkMode, setDarkMode] = useState(false)

  const [category, setCategory] = useState('工作')
  const [priority, setPriority] = useState('medium')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState<Set<number>>(new Set())

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed'>('all')
  const [filterCategory, setFilterCategory] = useState('全部')
  const [filterPriority, setFilterPriority] = useState('全部')
  const [sortBy, setSortBy] = useState<'created' | 'priority' | 'due'>('created')
  const [modernSchema, setModernSchema] = useState(false)

  // 视图相关
  const [view, setView] = useState<'list' | 'calendar' | 'kanban' | 'stats'>('list')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showDateModal, setShowDateModal] = useState(false)

  // 批量操作
  const [batchMode, setBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // 归档
  const [showArchived, setShowArchived] = useState(false)
  const [archivedTodos, setArchivedTodos] = useState<Todo[]>([])

  // 导入
  const [showImportModal, setShowImportModal] = useState(false)
  const [importText, setImportText] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const saved = localStorage.getItem('darkMode')
    setDarkMode(saved ? saved === 'true' : prefersDark)

    checkSchema()
    fetchTodos()

    const subscription = supabase
      .channel('todos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'todos' },
        () => fetchTodos()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [])

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('darkMode', darkMode.toString())
  }, [darkMode])

  // 键盘快捷键
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // 忽略输入框中的快捷键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur()
          if (showDateModal) setShowDateModal(false)
        }
        return
      }

      switch (e.key) {
        case 'n':
        case 'N':
          e.preventDefault()
          inputRef.current?.focus()
          break
        case '/':
          e.preventDefault()
          searchRef.current?.focus()
          break
        case 'v':
        case 'V':
          e.preventDefault()
          setView(v => {
            if (v === 'list') return 'calendar'
            if (v === 'calendar') return 'kanban'
            if (v === 'kanban') return 'stats'
            return 'list'
          })
          break
        case 'b':
        case 'B':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            toggleBatchMode()
          }
          break
        case 'd':
        case 'D':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            setDarkMode(d => !d)
          }
          break
        case 'Escape':
          if (showDateModal) setShowDateModal(false)
          if (showImportModal) setShowImportModal(false)
          if (batchMode) setBatchMode(false)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showDateModal, showImportModal, view, batchMode])

  async function checkSchema() {
    const { error } = await supabase.from('todos').select('priority').limit(1)
    setModernSchema(!error)
  }

  async function fetchTodos() {
    try {
      setError(null)
      let query = supabase.from('todos').select('*')

      if (sortBy === 'created') {
        query = query.order('created_at', { ascending: false })
      } else if (sortBy === 'due') {
        query = query.order('due_date', { ascending: true })
      }

      const { data, error: supaError } = await query

      if (supaError) {
        console.error('Supabase error:', supaError)
        setError(supaError.message)
      } else {
        let sorted = data || []
        if (sortBy === 'priority') {
          const pMap = { high: 0, medium: 1, low: 2 }
          sorted = [...sorted].sort((a, b) => (pMap[a.priority as keyof typeof pMap] ?? 1) - (pMap[b.priority as keyof typeof pMap] ?? 1))
        }
        setTodos(sorted)
      }
    } catch (err: any) {
      console.error('Fetch error:', err)
      setError(err?.message || '未知错误')
    } finally {
      setLoading(false)
    }
  }

  const PRIORITY_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低'
}

// 智能分类规则引擎
  const smartRules = {
    work: ['开会', '汇报', '项目', 'deadline', '加班', '邮件', '客户', '方案', '报告', 'PPT', '演示', '评审', '周会', '例会', 'deadline', '交付', '上线', 'bug', '修复', '代码', '开发', '测试', '部署'],
    life: ['买菜', '做饭', '打扫', '洗衣服', '取快递', '缴费', '交水电', '交房租', '物业', '维修', '换灯泡', '扔垃圾', '整理', '收纳', '购物', '超市', '理发'],
    study: ['考试', '论文', '课程', '看书', '复习', '预习', '作业', '题库', '单词', '背诵', '笔记', '网课', '慕课', '学习', '刷题', '备考', '期末', '期中', '四六级', '考研'],
    other: ['运动', '健身', '跑步', '打球', '游泳', '瑜伽', '爬山', '旅游', '看电影', '聚会', '聚餐', '约会', '休息', '放松', '冥想']
  }

  function smartClassify(title: string) {
    const t = title.toLowerCase()
    for (const [cat, keywords] of Object.entries(smartRules)) {
      for (const kw of keywords) {
        if (t.includes(kw.toLowerCase())) {
          const catMap: Record<string, string> = { work: '工作', life: '生活', study: '学习', other: '其他' }
          return catMap[cat] || '其他'
        }
      }
    }
    return null
  }

  function smartPriority(title: string) {
    const urgent = ['紧急', '马上', '立刻', '今天必须', 'deadline', '过期', '逾期', '重要', ' ASAP', 'asap']
    if (urgent.some(kw => title.toLowerCase().includes(kw.toLowerCase()))) return 'high'
    const low = ['有空', '顺便', '随便', '闲了', '以后', '下次', '改天']
    if (low.some(kw => title.toLowerCase().includes(kw.toLowerCase()))) return 'low'
    return null
  }

  // 模板
  const TEMPLATES = [
    { name: '日报', title: '写日报', category: '工作', priority: 'medium' as const },
    { name: '周报', title: '写周报', category: '工作', priority: 'medium' as const },
    { name: '健身', title: '去健身', category: '其他', priority: 'medium' as const },
    { name: '买菜', title: '买菜', category: '生活', priority: 'low' as const },
    { name: '学习', title: '学习', category: '学习', priority: 'medium' as const },
  ]

  // 子任务
  interface SubTask {
    id: string
    title: string
    completed: boolean
  }
  const [subTasks, setSubTasks] = useState<Record<number, SubTask[]>>({})
  const [showSubTaskModal, setShowSubTaskModal] = useState(false)
  const [currentTodoId, setCurrentTodoId] = useState<number | null>(null)
  const [subTaskInput, setSubTaskInput] = useState('')
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null)

  function loadSubTasks() {
    try {
      const data = JSON.parse(localStorage.getItem('subTasks') || '{}')
      setSubTasks(data)
    } catch {
      setSubTasks({})
    }
  }

  function saveSubTasks(data: Record<number, SubTask[]>) {
    localStorage.setItem('subTasks', JSON.stringify(data))
    setSubTasks(data)
  }

  function addSubTask(todoId: number, title: string) {
    const data = { ...subTasks }
    if (!data[todoId]) data[todoId] = []
    data[todoId].push({ id: Date.now().toString(), title, completed: false })
    saveSubTasks(data)
  }

  function toggleSubTask(todoId: number, subId: string) {
    const data = { ...subTasks }
    if (!data[todoId]) return
    const sub = data[todoId].find(s => s.id === subId)
    if (sub) sub.completed = !sub.completed
    saveSubTasks(data)
  }

  function deleteSubTask(todoId: number, subId: string) {
    const data = { ...subTasks }
    if (!data[todoId]) return
    data[todoId] = data[todoId].filter(s => s.id !== subId)
    saveSubTasks(data)
  }

  // 重复任务
  interface RecurringTask {
    id: string
    title: string
    category: string
    priority: string
    frequency: 'daily' | 'weekly' | 'monthly'
    lastCreated: string
  }
  const [recurringTasks, setRecurringTasks] = useState<RecurringTask[]>([])
  const [showRecurringModal, setShowRecurringModal] = useState(false)
  const [recurringForm, setRecurringForm] = useState({
    title: '', category: '工作', priority: 'medium', frequency: 'daily' as RecurringTask['frequency']
  })

  function loadRecurring() {
    try {
      const data = JSON.parse(localStorage.getItem('recurringTasks') || '[]')
      setRecurringTasks(data)
      // 自动创建今天的
      createRecurringTasks(data)
    } catch {
      setRecurringTasks([])
    }
  }

  function saveRecurring(data: RecurringTask[]) {
    localStorage.setItem('recurringTasks', JSON.stringify(data))
    setRecurringTasks(data)
  }

  async function createRecurringTasks(list: RecurringTask[]) {
    const today = new Date().toISOString().split('T')[0]
    for (const rt of list) {
      const last = rt.lastCreated || ''
      let shouldCreate = false
      if (rt.frequency === 'daily') {
        shouldCreate = last !== today
      } else if (rt.frequency === 'weekly') {
        const lastWeek = new Date(last).getTime()
        const now = new Date().getTime()
        shouldCreate = (now - lastWeek) >= 7 * 24 * 60 * 60 * 1000 || !last
      } else if (rt.frequency === 'monthly') {
        const lastMonth = new Date(last).getMonth()
        const thisMonth = new Date().getMonth()
        shouldCreate = lastMonth !== thisMonth || !last
      }
      if (shouldCreate) {
        const { error } = await supabase.from('todos').insert([{
          title: rt.title,
          completed: false,
          priority: rt.priority,
          category: rt.category,
          due_date: today
        }])
        if (!error) {
          rt.lastCreated = today
        }
      }
    }
    saveRecurring(list)
    fetchTodos()
  }

  useEffect(() => {
    loadSubTasks()
    loadRecurring()
  }, [])

  // 智能提示
  useEffect(() => {
    if (!input.trim()) {
      setAiSuggestion(null)
      return
    }
    const smartCat = smartClassify(input)
    const smartPri = smartPriority(input)
    if (smartCat || smartPri) {
      const parts = []
      if (smartCat) parts.push(`分类建议: ${smartCat}`)
      if (smartPri) parts.push(`优先级建议: ${smartPri === 'high' ? '高' : '低'}`)
      setAiSuggestion(parts.join(' · '))
    } else {
      setAiSuggestion(null)
    }
  }, [input])

  async function addTodo(e: React.FormEvent, fromTemplate?: typeof TEMPLATES[0]) {
    e.preventDefault()
    const title = fromTemplate ? fromTemplate.title : input.trim()
    if (!title || title.length > 100) return
    if (addLoading) return

    setAddLoading(true)
    const newTodo: any = {
      title,
      completed: false
    }

    if (modernSchema) {
      newTodo.priority = fromTemplate ? fromTemplate.priority : priority
      newTodo.category = fromTemplate ? fromTemplate.category : category
      if (dueDate) newTodo.due_date = dueDate
      if (description.trim() && description.length <= 500) newTodo.description = description.trim()
    }

    try {
      const { error } = await supabase.from('todos').insert([newTodo])

      if (error) {
        console.error(error)
        if (modernSchema) {
          const { error: fallbackError } = await supabase
            .from('todos')
            .insert([{ title, completed: false }])
          if (fallbackError) console.error('Fallback error:', fallbackError)
          else {
            setInput('')
            setDueDate('')
            setDescription('')
            fetchTodos()
          }
        }
      } else {
        setInput('')
        setDueDate('')
        setDescription('')
        fetchTodos()
      }
    } catch (err: any) {
      setError('添加失败: ' + (err?.message || '网络错误'))
    } finally {
      setAddLoading(false)
    }
  }

  async function addFromTemplate(template: typeof TEMPLATES[0]) {
    const { error } = await supabase.from('todos').insert([{
      title: template.title,
      completed: false,
      priority: template.priority,
      category: template.category
    }])
    if (error) setError('添加失败: ' + error.message)
    else fetchTodos()
  }

  function applySmartSuggestion() {
    const smartCat = smartClassify(input)
    const smartPri = smartPriority(input)
    if (smartCat) setCategory(smartCat)
    if (smartPri) setPriority(smartPri)
    setAiSuggestion(null)
  }

  async function toggleTodo(id: number, completed: boolean) {
    const { error } = await supabase
      .from('todos')
      .update({ completed: !completed })
      .eq('id', id)

    if (error) console.error(error)
    else fetchTodos()
  }

  async function deleteTodo(id: number) {
    if (deleteLoading.has(id)) return
    setDeleteLoading(prev => new Set(prev).add(id))
    try {
      const { error } = await supabase.from('todos').delete().eq('id', id)
      if (error) {
        console.error(error)
        setError('删除失败: ' + error.message)
      } else {
        fetchTodos()
      }
    } catch (err: any) {
      setError('删除失败: ' + (err?.message || '网络错误'))
    } finally {
      setDeleteLoading(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  // ========== 批量操作 ==========
  function toggleBatchMode() {
    setBatchMode(v => !v)
    setSelectedIds(new Set())
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    const ids = new Set(filteredTodos.map(t => t.id))
    setSelectedIds(ids)
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function batchComplete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      const { error } = await supabase.from('todos').update({ completed: true }).in('id', ids)
      if (error) setError('批量完成失败: ' + error.message)
      else {
        fetchTodos()
        setSelectedIds(new Set())
      }
    } catch (err: any) {
      setError('批量完成失败: ' + (err?.message || '网络错误'))
    }
  }

  async function batchDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!confirm(`确定要删除选中的 ${ids.length} 个任务吗？`)) return
    try {
      const { error } = await supabase.from('todos').delete().in('id', ids)
      if (error) setError('批量删除失败: ' + error.message)
      else {
        fetchTodos()
        setSelectedIds(new Set())
      }
    } catch (err: any) {
      setError('批量删除失败: ' + (err?.message || '网络错误'))
    }
  }

  async function batchArchive() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      // 先获取要归档的任务
      const tasksToArchive = todos.filter(t => ids.includes(t.id))
      const currentArchived = JSON.parse(localStorage.getItem('archivedTodos') || '[]')
      const newArchived = [...currentArchived, ...tasksToArchive.map(t => ({ ...t, archivedAt: new Date().toISOString() }))]
      localStorage.setItem('archivedTodos', JSON.stringify(newArchived))
      // 从主列表删除
      const { error } = await supabase.from('todos').delete().in('id', ids)
      if (error) setError('归档失败: ' + error.message)
      else {
        fetchTodos()
        fetchArchived()
        setSelectedIds(new Set())
      }
    } catch (err: any) {
      setError('归档失败: ' + (err?.message || '网络错误'))
    }
  }

  // ========== 归档相关 ==========
  function fetchArchived() {
    try {
      const data = JSON.parse(localStorage.getItem('archivedTodos') || '[]')
      setArchivedTodos(data)
    } catch {
      setArchivedTodos([])
    }
  }

  useEffect(() => { fetchArchived() }, [])

  function unarchiveTodo(archivedTodo: Todo & { archivedAt?: string }) {
    try {
      const current = JSON.parse(localStorage.getItem('archivedTodos') || '[]')
      const updated = current.filter((t: any) => t.id !== archivedTodo.id)
      localStorage.setItem('archivedTodos', JSON.stringify(updated))
      // 重新添加到数据库
      const { id, archivedAt, ...todoData } = archivedTodo as any
      supabase.from('todos').insert([todoData]).then(({ error }) => {
        if (error) setError('恢复失败: ' + error.message)
        else {
          fetchArchived()
          fetchTodos()
        }
      })
    } catch (err: any) {
      setError('恢复失败: ' + (err?.message || '网络错误'))
    }
  }

  function clearArchived() {
    if (!confirm('确定要清空所有归档任务吗？此操作不可恢复！')) return
    localStorage.removeItem('archivedTodos')
    fetchArchived()
  }

  // ========== 导入导出 ==========
  function exportToJSON() {
    const data = { todos, exportedAt: new Date().toISOString(), version: '1.0' }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `todos-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportToCSV() {
    const headers = ['id', 'title', 'completed', 'created_at', 'priority', 'category', 'due_date', 'description']
    const rows = todos.map(t => [
      t.id, JSON.stringify(t.title), t.completed, t.created_at,
      t.priority || '', t.category || '', t.due_date || '', JSON.stringify(t.description || '')
    ].join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `todos-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importFromJSON(text: string) {
    try {
      const data = JSON.parse(text)
      const tasks = data.todos || data
      if (!Array.isArray(tasks)) throw new Error('格式错误：未找到任务数组')
      let count = 0
      for (const todo of tasks) {
        const { id, ...newTodo } = todo
        const { error } = await supabase.from('todos').insert([newTodo])
        if (!error) count++
      }
      fetchTodos()
      setShowImportModal(false)
      setImportText('')
      alert(`成功导入 ${count} 个任务`)
    } catch (err: any) {
      setError('导入失败: ' + (err?.message || '格式错误'))
    }
  }

  const filteredTodos = todos.filter(todo => {
    const matchSearch = todo.title.toLowerCase().includes(search.toLowerCase()) ||
      (todo.description?.toLowerCase().includes(search.toLowerCase()) ?? false)
    const matchStatus = filterStatus === 'all' ? true :
      filterStatus === 'active' ? !todo.completed :
        todo.completed
    const matchCategory = filterCategory === '全部' ? true : todo.category === filterCategory
    const matchPriority = filterPriority === '全部' ? true : todo.priority === filterPriority
    return matchSearch && matchStatus && matchCategory && matchPriority
  })

  const completedCount = filteredTodos.filter(t => t.completed).length
  const totalCount = todos.length

  function isOverdue(dueDate?: string) {
    if (!dueDate) return false
    return new Date(dueDate) < new Date(new Date().toDateString())
  }

  function formatDate(dateStr?: string) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    const today = new Date()
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 0) return '今天'
    if (diff === 1) return '明天'
    if (diff === -1) return '昨天'
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const priorityInfo = (p?: string) => PRIORITIES.find(x => x.value === p) || PRIORITIES[1]

  function handleSelectDate(date: string) {
    setSelectedDate(date)
    setShowDateModal(true)
  }

  function handleCloseModal() {
    setShowDateModal(false)
    setSelectedDate(null)
  }

  const dateTodos = selectedDate
    ? todos.filter(todo => {
      const d = todo.due_date || todo.created_at?.split('T')[0]
      return d === selectedDate
    })
    : []

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div className="app">
        <header className="header">
          <h1>📝 Todo List</h1>
          <div className="header-actions">
            <button
              className="view-toggle"
              onClick={() => setView(v => {
                if (v === 'list') return 'calendar'
                if (v === 'calendar') return 'kanban'
                if (v === 'kanban') return 'stats'
                return 'list'
              })}
              title="切换视图"
            >
              {view === 'list' && '📋 列表'}
              {view === 'calendar' && '📅 日历'}
              {view === 'kanban' && '🎯 看板'}
              {view === 'stats' && '📊 统计'}
            </button>
            <button
              className="batch-toggle"
              onClick={toggleBatchMode}
              title={batchMode ? '退出批量' : '批量操作'}
              style={{ background: batchMode ? '#ff4d4f' : undefined, color: batchMode ? 'white' : undefined }}
            >
              {batchMode ? '✓ 退出' : '☑️ 批量'}
            </button>
            <button
              className="theme-toggle"
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? '切换亮色' : '切换暗色'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        {/* 统计 */}
        <div className="stats-bar">
          <span>总任务: {totalCount}</span>
          <span>已完成: {completedCount}</span>
          <span>待办: {totalCount - completedCount}</span>
          <span>显示: {filteredTodos.length}</span>
          {archivedTodos.length > 0 && (
            <button className="archived-link" onClick={() => setShowArchived(v => !v)}>
              📦 归档 ({archivedTodos.length})
            </button>
          )}
        </div>

        {/* 批量操作工具栏 */}
        {batchMode && view === 'list' && !showArchived && (
          <div className="batch-toolbar">
            <span className="batch-info">已选 {selectedIds.size} 项</span>
            <button className="batch-btn" onClick={selectAll}>全选</button>
            <button className="batch-btn" onClick={clearSelection}>清空</button>
            <button className="batch-btn primary" onClick={batchComplete}>✓ 完成</button>
            <button className="batch-btn warning" onClick={batchArchive}>📦 归档</button>
            <button className="batch-btn danger" onClick={batchDelete}>🗑️ 删除</button>
          </div>
        )}

        {/* 导入导出按钮 */}
        <div className="toolbar">
          <button className="tool-btn" onClick={exportToJSON}>📤 导出 JSON</button>
          <button className="tool-btn" onClick={exportToCSV}>📤 导出 CSV</button>
          <button className="tool-btn" onClick={() => setShowImportModal(true)}>📥 导入</button>
        </div>

        {/* 搜索和筛选 - 仅在列表视图显示 */}
        {view === 'list' && (
          <div className="filters">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 搜索任务... (按 / 聚焦)"
              className="search-input"
              ref={searchRef}
            />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="filter-select">
              <option value="all">全部</option>
              <option value="active">待办</option>
              <option value="completed">已完成</option>
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="filter-select">
              <option value="全部">全部分类</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="filter-select">
              <option value="全部">全部优先级</option>
              {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <select value={sortBy} onChange={e => { setSortBy(e.target.value as any); fetchTodos() }} className="filter-select">
              <option value="created">按时间</option>
              <option value="priority">按优先级</option>
              <option value="due">按截止日期</option>
            </select>
          </div>
        )}

        {/* 添加任务 */}
        <div className="ai-suggestion-bar">
          {aiSuggestion && (
            <div className="ai-bubble">
              🤖 {aiSuggestion}
              <button className="ai-apply-btn" onClick={applySmartSuggestion}>应用</button>
            </div>
          )}
        </div>

        {/* 模板快捷 */}
        <div className="template-bar">
          <span className="template-label">📝 模板：</span>
          {TEMPLATES.map(t => (
            <button key={t.name} className="template-chip" onClick={() => addFromTemplate(t)}>
              +{t.name}
            </button>
          ))}
          <button className="template-chip recurring-chip" onClick={() => setShowRecurringModal(true)}>
            🔄 重复任务
          </button>
        </div>

        <form onSubmit={addTodo} className="add-form">
          <div className="input-row">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="输入新任务... (按 N 聚焦)"
              className="main-input"
              maxLength={100}
              ref={inputRef}
            />
            <button type="submit" className="add-btn" disabled={!input.trim() || addLoading}>
              {addLoading ? '⏳ 添加中...' : '➕ 添加'}
            </button>
          </div>
          <div className="options-row">
            <select value={category} onChange={e => setCategory(e.target.value)} className="option-select">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={priority} onChange={e => setPriority(e.target.value)} className="option-select">
              {PRIORITIES.map(p => <option key={p.value} value={p.value} style={{ color: p.color }}>
                {p.label}优先级
              </option>)}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="date-input"
              placeholder="截止日期"
            />
          </div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="任务备注/描述（可选，最多500字）..."
            className="desc-input"
            rows={2}
            maxLength={500}
          />
        </form>

        {!modernSchema && (
          <div className="hint">
            💡 提示：前往 Supabase SQL Editor 执行 <code>ALTER TABLE todos ADD COLUMN priority TEXT DEFAULT 'medium', ADD COLUMN category TEXT DEFAULT '其他', ADD COLUMN due_date DATE, ADD COLUMN description TEXT;</code> 以启用完整功能
          </div>
        )}

        {/* 主内容区 */}
        {showArchived ? (
          <div className="archived-view">
            <div className="archived-header">
              <h3>📦 已归档任务 ({archivedTodos.length})</h3>
              <div className="archived-actions">
                <button className="tool-btn" onClick={() => setShowArchived(false)}>← 返回</button>
                {archivedTodos.length > 0 && <button className="tool-btn danger" onClick={clearArchived}>🗑️ 清空</button>}
              </div>
            </div>
            {archivedTodos.length === 0 ? (
              <p className="status">暂无归档任务</p>
            ) : (
              <ul className="todo-list">
                {[...archivedTodos].reverse().map((todo: any) => {
                  const pInfo = priorityInfo(todo.priority)
                  return (
                    <li key={todo.id + '_archived'} className="todo-item done">
                      <div className="todo-main">
                        <div className="todo-content">
                          <div className="todo-header">
                            <span className="priority-badge" style={{ background: pInfo.color + '20', color: pInfo.color, borderColor: pInfo.color }}>{pInfo.label}</span>
                            {todo.category && <span className="category-badge">{todo.category}</span>}
                            <span className="archived-at">归档于: {new Date(todo.archivedAt).toLocaleDateString('zh-CN')}</span>
                          </div>
                          <span className="todo-title strike">{todo.title}</span>
                        </div>
                        <button onClick={() => unarchiveTodo(todo)} className="tool-btn">↩️ 恢复</button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : loading ? (
          <p className="status">加载中...</p>
        ) : error ? (
          <p className="status error">错误: {error}</p>
        ) : view === 'calendar' ? (
          <Calendar todos={todos} onSelectDate={handleSelectDate} selectedDate={selectedDate} />
        ) : view === 'kanban' ? (
          <KanbanBoard todos={todos} onToggle={toggleTodo} onDelete={deleteTodo} onArchive={(id: number) => {
            const todo = todos.find(t => t.id === id)
            if (!todo) return
            const current = JSON.parse(localStorage.getItem('archivedTodos') || '[]')
            localStorage.setItem('archivedTodos', JSON.stringify([...current, { ...todo, archivedAt: new Date().toISOString() }]))
            supabase.from('todos').delete().eq('id', id).then(({ error }) => {
              if (!error) { fetchTodos(); fetchArchived() }
            })
          }} />
        ) : view === 'stats' ? (
          <StatsDashboard todos={todos} />
        ) : filteredTodos.length === 0 ? (
          <p className="status">
            {search || filterStatus !== 'all' || filterCategory !== '全部' || filterPriority !== '全部'
              ? '没有匹配的任务 🔍'
              : '暂无任务，添加一个吧 👆'}
          </p>
        ) : (
          <ul className="todo-list">
            {filteredTodos.map(todo => {
              const pInfo = priorityInfo(todo.priority)
              const overdue = isOverdue(todo.due_date)
              const isSelected = selectedIds.has(todo.id)
              return (
                <li
                  key={todo.id}
                  className={`todo-item ${todo.completed ? 'done' : ''} ${overdue ? 'overdue' : ''} ${isSelected ? 'selected' : ''}`}
                  onClick={batchMode ? () => toggleSelect(todo.id) : undefined}
                  style={batchMode ? { cursor: 'pointer' } : undefined}
                >
                  <div className="todo-main">
                    {batchMode && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(todo.id)}
                        className="batch-checkbox"
                        onClick={e => e.stopPropagation()}
                      />
                    )}
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => toggleTodo(todo.id, todo.completed)}
                      className="checkbox"
                    />
                    <div className="todo-content">
                      <div className="todo-header">
                        <span
                          className="priority-badge"
                          style={{ background: pInfo.color + '20', color: pInfo.color, borderColor: pInfo.color }}
                        >
                          {pInfo.label}
                        </span>
                        {todo.category && (
                          <span className="category-badge">{todo.category}</span>
                        )}
                        {todo.due_date && (
                          <span className={`due-badge ${overdue ? 'overdue-badge' : ''}`}>
                            📅 {formatDate(todo.due_date)}{overdue ? ' (已过期)' : ''}
                          </span>
                        )}
                      </div>
                      <span className={`todo-title ${todo.completed ? 'strike' : ''}`}>
                        {todo.title}
                      </span>
                      {todo.description && (
                        <button
                          className="expand-btn"
                          onClick={() => setExpandedId(expandedId === todo.id ? null : todo.id)}
                        >
                          {expandedId === todo.id ? '▲ 收起' : '▼ 详情'}
                        </button>
                      )}
                      {(subTasks[todo.id]?.length || 0) > 0 && (
                        <button
                          className="expand-btn"
                          onClick={() => { setCurrentTodoId(todo.id); setShowSubTaskModal(true) }}
                        >
                          📋 子任务 ({subTasks[todo.id].filter(s => s.completed).length}/{subTasks[todo.id].length})
                        </button>
                      )}
                      <button
                        className="expand-btn"
                        onClick={() => { setCurrentTodoId(todo.id); setShowSubTaskModal(true) }}
                      >
                        ➕ 子任务
                      </button>
                    </div>
                    <button
                      onClick={() => deleteTodo(todo.id)}
                      className="del-btn"
                      title="删除"
                      disabled={deleteLoading.has(todo.id)}
                    >
                      {deleteLoading.has(todo.id) ? '⏳' : '🗑️'}
                    </button>
                  </div>
                  {expandedId === todo.id && todo.description && (
                    <div className="todo-desc">
                      {todo.description}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* 日期弹窗 */}
        {showDateModal && selectedDate && (
          <div className="modal-overlay" onClick={handleCloseModal}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>📅 {selectedDate} 的任务</h3>
                <button className="modal-close" onClick={handleCloseModal}>✕</button>
              </div>
              {dateTodos.length === 0 ? (
                <p className="modal-empty">当天没有任务</p>
              ) : (
                <ul className="modal-list">
                  {dateTodos.map(todo => {
                    const pInfo = priorityInfo(todo.priority)
                    return (
                      <li key={todo.id} className={`modal-todo ${todo.completed ? 'done' : ''}`}>
                        <input
                          type="checkbox"
                          checked={todo.completed}
                          onChange={() => toggleTodo(todo.id, todo.completed)}
                          className="checkbox"
                        />
                        <div className="modal-todo-content">
                          <span className={`modal-todo-title ${todo.completed ? 'strike' : ''}`}>
                            {todo.title}
                          </span>
                          <div className="modal-todo-meta">
                            <span className="priority-badge" style={{ background: pInfo.color + '20', color: pInfo.color, borderColor: pInfo.color }}>
                              {pInfo.label}
                            </span>
                            {todo.category && <span className="category-badge">{todo.category}</span>}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
        {/* 导入弹窗 */}
        {showImportModal && (
          <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
            <div className="modal-card import-card" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>📥 导入任务</h3>
                <button className="modal-close" onClick={() => setShowImportModal(false)}>✕</button>
              </div>
              <p className="import-hint">粘贴 JSON 数据（支持导出格式或纯任务数组）</p>
              <textarea
                className="import-textarea"
                value={importText}
                onChange={e => setImportText(e.target.value)}
                placeholder={`[\n  {"title": "示例任务", "completed": false, "priority": "medium", "category": "工作"}\n]`}
                rows={10}
              />
              <div className="import-actions">
                <button className="tool-btn" onClick={() => setShowImportModal(false)}>取消</button>
                <button className="tool-btn primary" onClick={() => importFromJSON(importText)}>导入</button>
              </div>
            </div>
          </div>
        )}

        {/* 子任务弹窗 */}
        {showSubTaskModal && currentTodoId && (
          <div className="modal-overlay" onClick={() => setShowSubTaskModal(false)}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>📋 子任务</h3>
                <button className="modal-close" onClick={() => setShowSubTaskModal(false)}>✕</button>
              </div>
              <div className="subtask-form">
                <input
                  type="text"
                  value={subTaskInput}
                  onChange={e => setSubTaskInput(e.target.value)}
                  placeholder="添加子任务..."
                  className="subtask-input"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && subTaskInput.trim()) {
                      addSubTask(currentTodoId, subTaskInput.trim())
                      setSubTaskInput('')
                    }
                  }}
                />
                <button
                  className="tool-btn primary"
                  onClick={() => {
                    if (subTaskInput.trim()) {
                      addSubTask(currentTodoId, subTaskInput.trim())
                      setSubTaskInput('')
                    }
                  }}
                >
                  添加
                </button>
              </div>
              <ul className="subtask-list">
                {(subTasks[currentTodoId] || []).map(sub => (
                  <li key={sub.id} className={`subtask-item ${sub.completed ? 'done' : ''}`}>
                    <input
                      type="checkbox"
                      checked={sub.completed}
                      onChange={() => toggleSubTask(currentTodoId, sub.id)}
                      className="subtask-checkbox"
                    />
                    <span className="subtask-title">{sub.title}</span>
                    <button className="subtask-del" onClick={() => deleteSubTask(currentTodoId, sub.id)}>✕</button>
                  </li>
                ))}
                {(subTasks[currentTodoId] || []).length === 0 && (
                  <p className="modal-empty">暂无子任务</p>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* 重复任务弹窗 */}
        {showRecurringModal && (
          <div className="modal-overlay" onClick={() => setShowRecurringModal(false)}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>🔄 重复任务管理</h3>
                <button className="modal-close" onClick={() => setShowRecurringModal(false)}>✕</button>
              </div>
              <div className="recurring-form">
                <input
                  type="text"
                  value={recurringForm.title}
                  onChange={e => setRecurringForm(f => ({ ...f, title: e.target.value }))}
                  placeholder="任务标题"
                  className="subtask-input"
                />
                <select
                  value={recurringForm.category}
                  onChange={e => setRecurringForm(f => ({ ...f, category: e.target.value }))}
                  className="option-select"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={recurringForm.priority}
                  onChange={e => setRecurringForm(f => ({ ...f, priority: e.target.value }))}
                  className="option-select"
                >
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <select
                  value={recurringForm.frequency}
                  onChange={e => setRecurringForm(f => ({ ...f, frequency: e.target.value as any }))}
                  className="option-select"
                >
                  <option value="daily">每天</option>
                  <option value="weekly">每周</option>
                  <option value="monthly">每月</option>
                </select>
                <button
                  className="tool-btn primary"
                  onClick={() => {
                    if (!recurringForm.title.trim()) return
                    const newTask: RecurringTask = {
                      id: Date.now().toString(),
                      title: recurringForm.title.trim(),
                      category: recurringForm.category,
                      priority: recurringForm.priority,
                      frequency: recurringForm.frequency,
                      lastCreated: ''
                    }
                    saveRecurring([...recurringTasks, newTask])
                    setRecurringForm({ title: '', category: '工作', priority: 'medium', frequency: 'daily' })
                  }}
                >
                  添加
                </button>
              </div>
              <ul className="recurring-list">
                {recurringTasks.map(rt => (
                  <li key={rt.id} className="recurring-item">
                    <div className="recurring-info">
                      <span className="recurring-title">{rt.title}</span>
                      <span className="recurring-meta">{rt.category} · {PRIORITY_LABELS[rt.priority] || '中'} · {rt.frequency === 'daily' ? '每天' : rt.frequency === 'weekly' ? '每周' : '每月'}</span>
                    </div>
                    <button
                      className="recurring-del"
                      onClick={() => {
                        if (confirm('确定删除这条重复规则吗？')) {
                          saveRecurring(recurringTasks.filter(t => t.id !== rt.id))
                        }
                      }}
                    >
                      🗑️
                    </button>
                  </li>
                ))}
                {recurringTasks.length === 0 && <p className="modal-empty">暂无重复任务规则</p>}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* 快捷键提示 */}
      <div className="shortcut-hint">
        <div><kbd>N</kbd> 新建</div>
        <div><kbd>/</kbd> 搜索</div>
        <div><kbd>V</kbd> 切换视图</div>
        <div><kbd>B</kbd> 批量</div>
        <div><kbd>Ctrl+D</kbd> 主题</div>
        <div><kbd>Esc</kbd> 关闭</div>
      </div>

      <style jsx global>{`
        :root {
          --bg: #f5f5f5;
          --card: #ffffff;
          --text: #333333;
          --text-secondary: #666666;
          --border: #e0e0e0;
          --primary: #1890ff;
          --primary-hover: #40a9ff;
          --shadow: 0 2px 8px rgba(0,0,0,0.08);
          --radius: 12px;
        }
        .dark {
          --bg: #1a1a2e;
          --card: #16213e;
          --text: #e0e0e0;
          --text-secondary: #a0a0a0;
          --border: #2a2a4a;
          --primary: #4dabf7;
          --primary-hover: #74c0fc;
          --shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: var(--bg);
          color: var(--text);
          transition: background 0.3s, color 0.3s;
        }
        .app {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .header h1 { margin: 0; font-size: 28px; }
        .header-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .theme-toggle, .view-toggle {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 50%;
          width: 42px;
          height: 42px;
          font-size: 20px;
          cursor: pointer;
          transition: transform 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .view-toggle {
          border-radius: 8px;
          width: auto;
          padding: 0 14px;
          font-size: 14px;
          font-weight: 600;
          gap: 4px;
        }
        .theme-toggle:hover, .view-toggle:hover { transform: scale(1.1); }
        .stats-bar {
          display: flex;
          gap: 16px;
          padding: 12px 16px;
          background: var(--card);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          margin-bottom: 16px;
          font-size: 14px;
          color: var(--text-secondary);
        }
        .filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .search-input, .filter-select {
          padding: 10px 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--card);
          color: var(--text);
          font-size: 14px;
          outline: none;
        }
        .search-input { flex: 1; min-width: 200px; }
        .filter-select { cursor: pointer; }
        .add-form {
          background: var(--card);
          padding: 16px;
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          margin-bottom: 20px;
        }
        .input-row {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        .main-input {
          flex: 1;
          padding: 12px 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg);
          color: var(--text);
          font-size: 16px;
          outline: none;
        }
        .main-input:focus { border-color: var(--primary); }
        .add-btn {
          padding: 12px 20px;
          background: var(--primary);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          cursor: pointer;
          transition: background 0.2s;
          white-space: nowrap;
        }
        .add-btn:hover:not(:disabled) { background: var(--primary-hover); }
        .add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .options-row {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
        }
        .option-select, .date-input {
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font-size: 14px;
          cursor: pointer;
        }
        .desc-input {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg);
          color: var(--text);
          font-size: 14px;
          resize: vertical;
          font-family: inherit;
        }
        .hint {
          background: #fffbe6;
          border: 1px solid #ffe58f;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 16px;
          font-size: 13px;
          color: #614700;
        }
        .dark .hint {
          background: #2b2111;
          border-color: #5c4a1f;
          color: #d4b86a;
        }
        .hint code {
          background: #fff1b8;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: monospace;
        }
        .dark .hint code {
          background: #3d2f14;
        }
        .status {
          text-align: center;
          padding: 40px;
          color: var(--text-secondary);
          font-size: 16px;
        }
        .error { color: #ff4d4f; }
        .todo-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .todo-item {
          background: var(--card);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          margin-bottom: 10px;
          padding: 14px 16px;
          transition: all 0.2s;
        }
        .todo-item:hover { transform: translateY(-1px); }
        .todo-item.done { opacity: 0.6; }
        .todo-item.overdue { border-left: 3px solid #ff4d4f; }
        .todo-main {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .checkbox {
          width: 20px;
          height: 20px;
          margin-top: 2px;
          cursor: pointer;
          accent-color: var(--primary);
        }
        .todo-content {
          flex: 1;
        }
        .todo-header {
          display: flex;
          gap: 6px;
          margin-bottom: 6px;
          flex-wrap: wrap;
        }
        .priority-badge {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 4px;
          border: 1px solid;
          font-weight: 600;
        }
        .category-badge {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 4px;
          background: var(--bg);
          color: var(--text-secondary);
        }
        .due-badge {
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 4px;
          background: #e6f7ff;
          color: #1890ff;
        }
        .overdue-badge {
          background: #fff2f0;
          color: #ff4d4f;
        }
        .todo-title {
          font-size: 16px;
          line-height: 1.5;
          display: block;
        }
        .todo-title.strike {
          text-decoration: line-through;
          color: var(--text-secondary);
        }
        .expand-btn {
          background: none;
          border: none;
          color: var(--primary);
          cursor: pointer;
          font-size: 13px;
          padding: 4px 0;
          margin-top: 4px;
        }
        .todo-desc {
          margin-top: 8px;
          padding: 10px 12px;
          background: var(--bg);
          border-radius: 8px;
          font-size: 14px;
          color: var(--text-secondary);
          line-height: 1.6;
          margin-left: 32px;
        }
        .del-btn {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          padding: 4px;
          opacity: 0.5;
          transition: opacity 0.2s;
        }
        .del-btn:hover { opacity: 1; }

        /* 日历样式 */
        .calendar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding: 12px 16px;
          background: var(--card);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
        }
        .cal-title {
          font-size: 18px;
          font-weight: 600;
        }
        .cal-nav {
          background: var(--primary);
          color: white;
          border: none;
          border-radius: 8px;
          width: 36px;
          height: 36px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .cal-nav:hover { background: var(--primary-hover); }
        .calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 4px;
          background: var(--card);
          border-radius: var(--radius);
          padding: 12px;
          box-shadow: var(--shadow);
        }
        .cal-weekday {
          text-align: center;
          padding: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .cal-day {
          aspect-ratio: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          min-height: 48px;
        }
        .cal-day:hover { background: var(--bg); }
        .cal-day.empty { cursor: default; }
        .cal-day.empty:hover { background: none; }
        .cal-day.today {
          background: var(--primary);
          color: white;
        }
        .cal-day.today:hover { background: var(--primary-hover); }
        .cal-day.selected {
          box-shadow: 0 0 0 2px var(--primary);
        }
        .cal-day.has-tasks {
          background: #e6f7ff;
        }
        .dark .cal-day.has-tasks {
          background: #1a3a5c;
        }
        .cal-day.has-tasks:hover {
          background: #bae0ff;
        }
        .dark .cal-day.has-tasks:hover {
          background: #2a5a8c;
        }
        .cal-day.done {
          background: #f6ffed;
        }
        .dark .cal-day.done {
          background: #1a3c1a;
        }
        .cal-day.done:hover {
          background: #d9f7be;
        }
        .dark .cal-day.done:hover {
          background: #2a5c2a;
        }
        .day-number {
          font-size: 15px;
          font-weight: 500;
        }
        .task-dot {
          font-size: 11px;
          background: #ff4d4f;
          color: white;
          border-radius: 10px;
          padding: 1px 6px;
          margin-top: 2px;
          font-weight: 600;
        }
        .done-dot {
          background: #52c41a;
        }

        /* 弹窗样式 */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .modal-card {
          background: var(--card);
          border-radius: var(--radius);
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          width: 100%;
          max-width: 480px;
          max-height: 80vh;
          overflow-y: auto;
          padding: 20px;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .modal-header h3 {
          margin: 0;
          font-size: 18px;
        }
        .modal-close {
          background: none;
          border: none;
          font-size: 20px;
          cursor: pointer;
          color: var(--text-secondary);
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
        }
        .modal-close:hover {
          background: var(--bg);
          color: var(--text);
        }
        .modal-empty {
          text-align: center;
          padding: 30px;
          color: var(--text-secondary);
        }
        .modal-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .modal-todo {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid var(--border);
        }
        .modal-todo:last-child {
          border-bottom: none;
        }
        .modal-todo.done {
          opacity: 0.6;
        }
        .modal-todo-content {
          flex: 1;
        }
        .modal-todo-title {
          font-size: 15px;
          display: block;
          margin-bottom: 4px;
        }
        .modal-todo-meta {
          display: flex;
          gap: 6px;
        }
        .modal-todo-title.strike {
          text-decoration: line-through;
          color: var(--text-secondary);
        }

        /* 动画 */
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideOut {
          from { opacity: 1; transform: translateY(0); }
          to { opacity: 0; transform: translateY(8px); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .todo-item {
          animation: slideIn 0.3s ease;
        }
        .todo-item.removing {
          animation: slideOut 0.3s ease forwards;
        }
        .modal-overlay {
          animation: fadeIn 0.2s ease;
        }
        .modal-card {
          animation: slideIn 0.3s ease;
        }
        .status {
          animation: fadeIn 0.5s ease;
        }
        .add-btn:disabled {
          animation: pulse 1.5s ease infinite;
        }
        .hint {
          animation: slideIn 0.4s ease;
        }
        .stats-bar {
          animation: slideIn 0.3s ease;
        }

        /* ========== 批量操作 ========== */
        .batch-toolbar {
          display: flex;
          gap: 8px;
          align-items: center;
          padding: 10px 14px;
          background: var(--card);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          margin-bottom: 12px;
          flex-wrap: wrap;
          animation: slideIn 0.3s ease;
        }
        .batch-info {
          font-size: 14px;
          font-weight: 600;
          color: var(--primary);
          margin-right: 8px;
        }
        .batch-btn {
          padding: 6px 12px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .batch-btn:hover { background: var(--primary); color: white; border-color: var(--primary); }
        .batch-btn.primary { background: #52c41a; color: white; border-color: #52c41a; }
        .batch-btn.primary:hover { background: #73d13d; }
        .batch-btn.warning { background: #faad14; color: white; border-color: #faad14; }
        .batch-btn.warning:hover { background: #ffc53d; }
        .batch-btn.danger { background: #ff4d4f; color: white; border-color: #ff4d4f; }
        .batch-btn.danger:hover { background: #ff7875; }
        .batch-checkbox {
          width: 18px;
          height: 18px;
          margin-right: 8px;
          cursor: pointer;
          accent-color: var(--primary);
        }
        .todo-item.selected {
          box-shadow: 0 0 0 2px var(--primary);
          background: var(--bg);
        }

        /* ========== 工具栏 ========== */
        .toolbar {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .tool-btn {
          padding: 8px 14px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--card);
          color: var(--text);
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tool-btn:hover { background: var(--primary); color: white; border-color: var(--primary); }
        .tool-btn.danger:hover { background: #ff4d4f; border-color: #ff4d4f; }
        .tool-btn.primary { background: var(--primary); color: white; border-color: var(--primary); }
        .archived-link {
          background: none;
          border: none;
          color: var(--primary);
          font-size: 14px;
          cursor: pointer;
          text-decoration: underline;
          margin-left: auto;
        }

        /* ========== 归档视图 ========== */
        .archived-view { animation: slideIn 0.3s ease; }
        .archived-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .archived-header h3 { margin: 0; }
        .archived-actions { display: flex; gap: 8px; }
        .archived-at {
          font-size: 12px;
          color: var(--text-secondary);
          margin-left: auto;
        }

        /* ========== 导入弹窗 ========== */
        .import-card { max-width: 520px; }
        .import-hint {
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 12px;
        }
        .import-textarea {
          width: 100%;
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg);
          color: var(--text);
          font-family: monospace;
          font-size: 13px;
          resize: vertical;
          min-height: 200px;
        }
        .import-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 12px;
        }

        /* ========== 统计面板 ========== */
        .stats-empty {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-secondary);
        }
        .stats-dashboard { animation: slideIn 0.4s ease; }
        .stats-cards {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }
        .stat-card {
          background: var(--card);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          padding: 20px;
          text-align: center;
        }
        .stat-number {
          font-size: 32px;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .stat-label {
          font-size: 13px;
          color: var(--text-secondary);
        }
        .stats-charts {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        .chart-box {
          background: var(--card);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          padding: 20px;
        }
        .chart-box.wide { grid-column: span 2; }
        .chart-box h4 {
          margin: 0 0 16px 0;
          font-size: 15px;
          color: var(--text-secondary);
        }
        .pie-chart { width: 160px; height: 160px; margin: 0 auto; }
        .pie-center-text {
          font-size: 14px;
          font-weight: 700;
          fill: var(--text);
        }
        .pie-center-label {
          font-size: 8px;
          fill: var(--text-secondary);
        }
        .legend {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin-top: 12px;
          font-size: 13px;
        }
        .legend-item { display: flex; align-items: center; gap: 6px; }
        .legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
        .bar-chart { display: flex; flex-direction: column; gap: 10px; }
        .bar-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
        }
        .bar-label { width: 60px; text-align: right; color: var(--text-secondary); flex-shrink: 0; }
        .bar-track { flex: 1; height: 24px; background: var(--bg); border-radius: 4px; overflow: hidden; }
        .bar-fill {
          height: 100%;
          background: var(--primary);
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding-right: 8px;
          transition: width 0.5s ease;
          min-width: 30px;
        }
        .bar-value { font-size: 11px; color: white; font-weight: 600; }
        .bar-done { width: 60px; text-align: left; color: var(--text-secondary); font-size: 11px; }
        .priority-bars { display: flex; flex-direction: column; gap: 10px; }
        .p-bar-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
        }
        .p-bar-label { width: 70px; text-align: right; flex-shrink: 0; font-weight: 600; }
        .p-bar-track { flex: 1; height: 20px; background: var(--bg); border-radius: 4px; overflow: hidden; }
        .p-bar-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.5s ease;
        }
        .p-bar-value { width: 30px; text-align: left; font-size: 13px; font-weight: 600; }
        .trend-chart { padding: 10px 0; }
        .trend-svg { width: 100%; height: 140px; }
        .trend-legend {
          display: flex;
          justify-content: center;
          gap: 20px;
          margin-top: 8px;
          font-size: 13px;
        }
        .trend-legend .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
          margin-right: 6px;
        }

        /* ========== 看板视图 ========== */
        .kanban-board {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          animation: slideIn 0.3s ease;
        }
        .kanban-column {
          background: var(--card);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          min-height: 300px;
        }
        .kanban-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
          border-bottom: 2px solid;
        }
        .kanban-title { font-size: 15px; font-weight: 600; }
        .kanban-count {
          font-size: 13px;
          padding: 2px 10px;
          border-radius: 12px;
          font-weight: 600;
        }
        .kanban-list {
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .kanban-card {
          background: var(--bg);
          border-radius: 8px;
          padding: 12px;
          cursor: grab;
          transition: all 0.2s;
          border: 1px solid var(--border);
        }
        .kanban-card:hover { transform: translateY(-2px); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .kanban-card.dragging { opacity: 0.5; transform: scale(0.98); }
        .kanban-card-header {
          display: flex;
          gap: 6px;
          margin-bottom: 6px;
          flex-wrap: wrap;
        }
        .kanban-priority {
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
        }
        .kanban-category {
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 4px;
          background: var(--card);
          color: var(--text-secondary);
        }
        .kanban-card-title {
          font-size: 14px;
          margin: 0 0 6px 0;
          line-height: 1.4;
        }
        .kanban-due {
          font-size: 11px;
          color: var(--primary);
        }
        .kanban-due.overdue { color: #ff4d4f; }
        .kanban-card-actions {
          display: flex;
          gap: 4px;
          margin-top: 8px;
        }
        .kanban-action-btn {
          background: none;
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 4px 8px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }
        .kanban-action-btn:hover { background: var(--primary); border-color: var(--primary); }
        .kanban-empty {
          text-align: center;
          padding: 30px;
          color: var(--text-secondary);
          font-size: 13px;
        }

        /* ========== 批量开关 ========== */
        .batch-toggle {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 0 14px;
          height: 42px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }
        .batch-toggle:hover { transform: scale(1.05); }

        /* ========== 智能提示 ========== */
        .ai-suggestion-bar {
          margin-bottom: 8px;
          min-height: 36px;
        }
        .ai-bubble {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%);
          border: 1px solid #91caff;
          border-radius: 20px;
          font-size: 13px;
          color: #0958d9;
          animation: slideIn 0.3s ease;
        }
        .dark .ai-bubble {
          background: linear-gradient(135deg, #111d2c 0%, #16213e 100%);
          border-color: #1d39c4;
          color: #4dabf7;
        }
        .ai-apply-btn {
          padding: 4px 10px;
          background: #1890ff;
          color: white;
          border: none;
          border-radius: 12px;
          font-size: 12px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .ai-apply-btn:hover { background: #40a9ff; }

        /* ========== 模板快捷 ========== */
        .template-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .template-label {
          font-size: 13px;
          color: var(--text-secondary);
          font-weight: 500;
        }
        .template-chip {
          padding: 6px 12px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 16px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
          color: var(--text);
        }
        .template-chip:hover {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
          transform: translateY(-1px);
        }
        .recurring-chip {
          background: #f6ffed;
          border-color: #b7eb8f;
          color: #389e0d;
        }
        .dark .recurring-chip {
          background: #162b16;
          border-color: #2b5c2b;
          color: #73d13d;
        }
        .recurring-chip:hover {
          background: #73d13d;
          color: white;
        }

        /* ========== 子任务 ========== */
        .subtask-form {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
        }
        .subtask-input {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg);
          color: var(--text);
          font-size: 14px;
          outline: none;
        }
        .subtask-input:focus { border-color: var(--primary); }
        .subtask-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .subtask-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: var(--bg);
          border-radius: 8px;
          transition: all 0.2s;
        }
        .subtask-item.done { opacity: 0.6; }
        .subtask-item.done .subtask-title { text-decoration: line-through; color: var(--text-secondary); }
        .subtask-checkbox {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: var(--primary);
        }
        .subtask-title {
          flex: 1;
          font-size: 14px;
        }
        .subtask-del {
          background: none;
          border: none;
          color: #ff4d4f;
          cursor: pointer;
          font-size: 14px;
          padding: 2px 6px;
          border-radius: 4px;
          transition: background 0.2s;
        }
        .subtask-del:hover { background: #fff2f0; }

        /* ========== 重复任务 ========== */
        .recurring-form {
          display: flex;
          gap: 8px;
          margin-bottom: 16px;
          flex-wrap: wrap;
          align-items: center;
        }
        .recurring-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .recurring-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 14px;
          background: var(--bg);
          border-radius: 8px;
          transition: all 0.2s;
        }
        .recurring-item:hover { background: var(--card); }
        .recurring-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .recurring-title {
          font-size: 14px;
          font-weight: 500;
        }
        .recurring-meta {
          font-size: 12px;
          color: var(--text-secondary);
        }
        .recurring-del {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 16px;
          padding: 4px;
          opacity: 0.5;
          transition: opacity 0.2s;
        }
        .recurring-del:hover { opacity: 1; }

        /* 快捷键提示 */
        .shortcut-hint {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 12px 16px;
          box-shadow: var(--shadow);
          font-size: 12px;
          color: var(--text-secondary);
          z-index: 100;
          max-width: 220px;
          line-height: 1.8;
        }
        .shortcut-hint kbd {
          background: var(--bg);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 2px 6px;
          font-family: monospace;
          font-size: 11px;
        }

        /* ========== AI 建议 ========== */
        .ai-suggestion-bar {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 12px;
          padding: 10px 14px;
          background: var(--card);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          animation: slideIn 0.3s ease;
        }
        .ai-bubble {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 20px;
          background: var(--bg);
          border: 1px solid var(--border);
          font-size: 13px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.2s;
        }
        .ai-bubble:hover {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }
        .ai-apply-btn {
          background: none;
          border: none;
          color: var(--primary);
          cursor: pointer;
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 6px;
          transition: background 0.2s;
        }
        .ai-apply-btn:hover {
          background: var(--bg);
        }

        /* ========== 模板芯片 ========== */
        .template-bar {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
          margin-bottom: 12px;
        }
        .template-label {
          font-size: 13px;
          color: var(--text-secondary);
          font-weight: 600;
        }
        .template-chip {
          padding: 4px 12px;
          border-radius: 16px;
          background: var(--bg);
          border: 1px solid var(--border);
          font-size: 12px;
          color: var(--text);
          cursor: pointer;
          transition: all 0.2s;
        }
        .template-chip:hover {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }
        .recurring-chip {
          padding: 4px 12px;
          border-radius: 16px;
          background: #e6f7ff;
          border: 1px solid #91d5ff;
          font-size: 12px;
          color: var(--primary);
          cursor: pointer;
          transition: all 0.2s;
        }
        .dark .recurring-chip {
          background: #1a3a5c;
          border-color: #2a5a8c;
        }
        .recurring-chip:hover {
          background: var(--primary);
          color: white;
        }

        /* ========== 子任务 ========== */
        .subtask-form {
          display: flex;
          gap: 8px;
          margin-top: 10px;
          margin-left: 32px;
        }
        .subtask-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
          font-size: 14px;
          outline: none;
        }
        .subtask-input:focus {
          border-color: var(--primary);
        }
        .subtask-list {
          margin-top: 8px;
          margin-left: 32px;
          list-style: none;
          padding: 0;
        }
        .subtask-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
          border-bottom: 1px solid var(--border);
        }
        .subtask-item:last-child {
          border-bottom: none;
        }
        .subtask-checkbox {
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: var(--primary);
        }
        .subtask-title {
          flex: 1;
          font-size: 14px;
          color: var(--text);
        }
        .subtask-title.done {
          text-decoration: line-through;
          color: var(--text-secondary);
        }
        .subtask-del {
          background: none;
          border: none;
          font-size: 14px;
          cursor: pointer;
          opacity: 0.4;
          transition: opacity 0.2s;
        }
        .subtask-del:hover {
          opacity: 1;
        }

        /* ========== 循环任务 ========== */
        .recurring-form {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 12px;
          padding: 12px 16px;
          background: var(--card);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
        }
        .recurring-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }
        .recurring-item {
          background: var(--card);
          border-radius: var(--radius);
          box-shadow: var(--shadow);
          margin-bottom: 10px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: all 0.2s;
        }
        .recurring-item:hover {
          transform: translateY(-1px);
        }
        .recurring-info {
          flex: 1;
        }
        .recurring-title {
          font-size: 16px;
          margin: 0 0 4px 0;
          color: var(--text);
        }
        .recurring-meta {
          font-size: 12px;
          color: var(--text-secondary);
          display: flex;
          gap: 8px;
        }
        .recurring-del {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          opacity: 0.5;
          transition: opacity 0.2s;
        }
        .recurring-del:hover {
          opacity: 1;
        }

        @media (max-width: 600px) {
          .filters { flex-direction: column; }
          .search-input { width: 100%; }
          .options-row { flex-direction: column; }
          .stats-bar { flex-wrap: wrap; }
          .calendar-grid { gap: 2px; padding: 8px; }
          .cal-day { min-height: 40px; }
          .day-number { font-size: 13px; }
          .task-dot { font-size: 10px; padding: 1px 4px; }
          .modal-card { padding: 16px; }
          .stats-cards { grid-template-columns: repeat(2, 1fr); }
          .stats-charts { grid-template-columns: 1fr; }
          .chart-box.wide { grid-column: span 1; }
          .kanban-board { grid-template-columns: 1fr; }
          .batch-toolbar { flex-direction: column; align-items: flex-start; }
          .toolbar { flex-wrap: wrap; }
          .archived-header { flex-direction: column; gap: 8px; align-items: flex-start; }
          .ai-suggestion-bar { gap: 6px; padding: 8px 10px; }
          .ai-bubble { padding: 5px 10px; font-size: 12px; }
          .template-bar { gap: 6px; }
          .subtask-form { margin-left: 0; }
          .subtask-list { margin-left: 0; }
          .subtask-input { font-size: 13px; }
          .recurring-form { padding: 10px 12px; }
          .recurring-item { flex-direction: column; align-items: flex-start; gap: 8px; }
          .recurring-meta { flex-wrap: wrap; }
          .shortcut-hint { display: none; }
        }
      `}</style>
    </div>
  )
}
