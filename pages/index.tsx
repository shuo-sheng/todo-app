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

// 颜色变暗辅助函数
function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, Math.min(255, (num >> 16) + amount))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amount))
  const b = Math.max(0, Math.min(255, (num & 0x00FF) + amount))
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

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
  const [theme, setTheme] = useState<'ink' | 'lake' | 'sakura' | 'purple' | 'custom'>('ink')
  
  // 自定义主题 - 默认淡淡渐变
  const [customColors, setCustomColors] = useState({
    primary: '#f0f4f8',
    secondary: '#e8eef5',
    accent: '#dfe7f0',
    glassOpacity: 0.75,
    textColor: '#3a4a5c'
  })
  const [showThemeModal, setShowThemeModal] = useState(false)
  
  // 保存的主题预设
  const [savedThemes, setSavedThemes] = useState<Array<{name: string, colors: typeof customColors}>>([])
  const [themeNameInput, setThemeNameInput] = useState('')

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
    
    const savedTheme = localStorage.getItem('theme') as 'ink' | 'lake' | 'sakura' | 'purple' | 'custom' | null
    if (savedTheme) setTheme(savedTheme)
    
    // 加载自定义主题设置
    try {
      const savedCustom = localStorage.getItem('customTheme')
      if (savedCustom) setCustomColors(JSON.parse(savedCustom))
      const saved = localStorage.getItem('savedThemes')
      if (saved) setSavedThemes(JSON.parse(saved))
    } catch { /* ignore */ }

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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
    
    // 应用自定义主题颜色
    if (theme === 'custom') {
      const root = document.documentElement
      root.style.setProperty('--custom-primary', customColors.primary)
      root.style.setProperty('--custom-secondary', customColors.secondary)
      root.style.setProperty('--custom-accent', customColors.accent)
      root.style.setProperty('--custom-text', customColors.textColor)
      // 计算 text-secondary 和 text-muted（主文字色的变暗版）
      root.style.setProperty('--custom-text-secondary', adjustColor(customColors.textColor, -30))
      root.style.setProperty('--custom-text-muted', adjustColor(customColors.textColor, -60))
      // 玻璃背景用完整 rgba
      root.style.setProperty('--custom-glass-bg', `rgba(255, 255, 255, ${customColors.glassOpacity})`)
      root.style.setProperty('--custom-glass-bg-dark', `rgba(30, 30, 30, ${customColors.glassOpacity})`)
    }
  }, [theme, customColors])

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

  function saveCurrentTheme() {
    if (!themeNameInput.trim()) return
    const newTheme = { name: themeNameInput.trim(), colors: { ...customColors } }
    const updated = [...savedThemes, newTheme]
    setSavedThemes(updated)
    localStorage.setItem('savedThemes', JSON.stringify(updated))
    setThemeNameInput('')
  }

  function loadSavedTheme(idx: number) {
    const t = savedThemes[idx]
    if (!t) return
    setCustomColors(t.colors)
    localStorage.setItem('customTheme', JSON.stringify(t.colors))
    setTheme('custom')
  }

  function deleteSavedTheme(idx: number) {
    const updated = savedThemes.filter((_, i) => i !== idx)
    setSavedThemes(updated)
    localStorage.setItem('savedThemes', JSON.stringify(updated))
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
          <span className="header-stats">{totalCount} · {completedCount} ✓ · {totalCount - completedCount} ○</span>
        </header>

        {/* 顶部工具栏 - 所有按钮集中上方 */}
        <div className="top-toolbar">
          <div className="toolbar-group">
            <button className="icon-btn" onClick={() => setView(v => {
              if (v === 'list') return 'calendar'
              if (v === 'calendar') return 'kanban'
              if (v === 'kanban') return 'stats'
              return 'list'
            })} title="切换视图">
              {view === 'list' && '📋'}
              {view === 'calendar' && '📅'}
              {view === 'kanban' && '🎯'}
              {view === 'stats' && '📊'}
            </button>
            <button className="icon-btn" onClick={toggleBatchMode} title={batchMode ? '退出批量' : '批量操作'} style={{ background: batchMode ? 'rgba(255,77,79,0.15)' : undefined }}>
              {batchMode ? '✓' : '☑️'}
            </button>
            <button className="icon-btn" onClick={() => setDarkMode(!darkMode)} title={darkMode ? '亮色' : '暗色'}>
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button className="icon-btn" onClick={() => {
              const themes: ('ink' | 'lake' | 'sakura' | 'purple' | 'custom')[] = ['ink', 'lake', 'sakura', 'purple', 'custom']
              const idx = themes.indexOf(theme)
              setTheme(themes[(idx + 1) % themes.length])
            }} title={`主题: ${theme === 'ink' ? '水墨' : theme === 'lake' ? '湖水' : theme === 'sakura' ? '樱花' : theme === 'purple' ? '暮山' : '自定义'}`}>
              {theme === 'ink' && '🖋️'}
              {theme === 'lake' && '💧'}
              {theme === 'sakura' && '🌸'}
              {theme === 'purple' && '🔮'}
              {theme === 'custom' && '🎨'}
            </button>
            {theme === 'custom' && (
              <button className="icon-btn" onClick={() => setShowThemeModal(true)} title="编辑自定义主题">
                ⚙️
              </button>
            )}
          </div>
          <div className="toolbar-divider" />
          <div className="toolbar-group">
            <button className="icon-btn" onClick={exportToJSON} title="导出JSON">📤</button>
            <button className="icon-btn" onClick={() => setShowImportModal(true)} title="导入">📥</button>
            {archivedTodos.length > 0 && (
              <button className="icon-btn" onClick={() => setShowArchived(v => !v)} title={`归档 (${archivedTodos.length})`}>
                📦
              </button>
            )}
          </div>
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

        {/* 自定义主题弹窗 */}
        {showThemeModal && (
          <div className="modal-overlay" onClick={() => setShowThemeModal(false)}>
            <div className="modal-card" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h3>🎨 自定义主题</h3>
                <button className="modal-close" onClick={() => setShowThemeModal(false)}>✕</button>
              </div>
              <div className="theme-form">
                <div className="theme-row">
                  <label>渐变主色</label>
                  <input type="color" value={customColors.primary} onChange={e => {
                    const c = { ...customColors, primary: e.target.value }
                    setCustomColors(c)
                    localStorage.setItem('customTheme', JSON.stringify(c))
                  }} />
                  <span>{customColors.primary}</span>
                </div>
                <div className="theme-row">
                  <label>渐变次色</label>
                  <input type="color" value={customColors.secondary} onChange={e => {
                    const c = { ...customColors, secondary: e.target.value }
                    setCustomColors(c)
                    localStorage.setItem('customTheme', JSON.stringify(c))
                  }} />
                  <span>{customColors.secondary}</span>
                </div>
                <div className="theme-row">
                  <label>渐变强调色</label>
                  <input type="color" value={customColors.accent} onChange={e => {
                    const c = { ...customColors, accent: e.target.value }
                    setCustomColors(c)
                    localStorage.setItem('customTheme', JSON.stringify(c))
                  }} />
                  <span>{customColors.accent}</span>
                </div>
                <div className="theme-row">
                  <label>文字颜色</label>
                  <input type="color" value={customColors.textColor} onChange={e => {
                    const c = { ...customColors, textColor: e.target.value }
                    setCustomColors(c)
                    localStorage.setItem('customTheme', JSON.stringify(c))
                  }} />
                  <span>{customColors.textColor}</span>
                </div>
                <div className="theme-row">
                  <label>玻璃透明度: {Math.round(customColors.glassOpacity * 100)}%</label>
                  <input type="range" min="0.3" max="0.95" step="0.05" value={customColors.glassOpacity} onChange={e => {
                    const c = { ...customColors, glassOpacity: parseFloat(e.target.value) }
                    setCustomColors(c)
                    localStorage.setItem('customTheme', JSON.stringify(c))
                  }} />
                </div>
                <div className="theme-preview" style={{
                  background: `linear-gradient(160deg, ${customColors.primary} 0%, ${customColors.secondary} 50%, ${customColors.accent} 100%)`,
                  padding: '20px',
                  borderRadius: '16px',
                  marginTop: '12px',
                  color: customColors.textColor
                }}>
                  <div style={{
                    background: `rgba(255,255,255,${customColors.glassOpacity})`,
                    padding: '12px 16px',
                    borderRadius: '12px',
                    backdropFilter: 'blur(16px)'
                  }}>
                    预览效果
                  </div>
                </div>
                
                {/* 保存主题 */}
                <div className="theme-save-row" style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={themeNameInput}
                    onChange={e => setThemeNameInput(e.target.value)}
                    placeholder="主题名称..."
                    className="subtask-input"
                    style={{ flex: 1 }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && themeNameInput.trim()) {
                        saveCurrentTheme()
                      }
                    }}
                  />
                  <button className="tool-btn primary" onClick={saveCurrentTheme} disabled={!themeNameInput.trim()}>
                    💾 保存主题
                  </button>
                </div>
                
                {/* 已保存的主题 */}
                {savedThemes.length > 0 && (
                  <>
                    <p style={{ marginTop: '12px', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>📚 已保存的主题：</p>
                    <ul className="saved-theme-list">
                      {savedThemes.map((t, idx) => (
                        <li key={idx} className="saved-theme-item">
                          <div
                            className="saved-theme-preview"
                            style={{ background: `linear-gradient(135deg, ${t.colors.primary}, ${t.colors.secondary})` }}
                            onClick={() => loadSavedTheme(idx)}
                            title="点击应用"
                          />
                          <span className="saved-theme-name" onClick={() => loadSavedTheme(idx)}>{t.name}</span>
                          <button className="saved-theme-del" onClick={() => deleteSavedTheme(idx)} title="删除">✕</button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                
                <div className="theme-actions" style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'center' }}>
                  <button className="tool-btn" onClick={() => {
                    const defaults = { primary: '#f0f4f8', secondary: '#e8eef5', accent: '#dfe7f0', glassOpacity: 0.75, textColor: '#3a4a5c' }
                    setCustomColors(defaults)
                    localStorage.setItem('customTheme', JSON.stringify(defaults))
                  }}>
                    ↺ 重置默认
                  </button>
                  <button className="tool-btn primary" onClick={() => setShowThemeModal(false)}>
                    ✅ 完成
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
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
    </div>
  )
}
