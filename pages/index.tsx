import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import Calendar from '@/components/Calendar'

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
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [showDateModal, setShowDateModal] = useState(false)

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

  async function addTodo(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || input.trim().length > 100) return
    if (addLoading) return

    setAddLoading(true)
    const newTodo: any = {
      title: input.trim(),
      completed: false
    }

    if (modernSchema) {
      newTodo.priority = priority
      newTodo.category = category
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
            .insert([{ title: input.trim(), completed: false }])
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
              onClick={() => setView(v => v === 'list' ? 'calendar' : 'list')}
              title={view === 'list' ? '切换到日历' : '切换到列表'}
            >
              {view === 'list' ? '📅 日历' : '📋 列表'}
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
        </div>

        {/* 搜索和筛选 - 仅在列表视图显示 */}
        {view === 'list' && (
          <div className="filters">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="🔍 搜索任务..."
              className="search-input"
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
        <form onSubmit={addTodo} className="add-form">
          <div className="input-row">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="输入新任务..."
              className="main-input"
              maxLength={100}
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

        {/* 主内容区 - 列表或日历 */}
        {loading ? (
          <p className="status">加载中...</p>
        ) : error ? (
          <p className="status error">错误: {error}</p>
        ) : view === 'calendar' ? (
          <Calendar todos={todos} onSelectDate={handleSelectDate} selectedDate={selectedDate} />
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
              return (
                <li
                  key={todo.id}
                  className={`todo-item ${todo.completed ? 'done' : ''} ${overdue ? 'overdue' : ''}`}
                >
                  <div className="todo-main">
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
        }
      `}</style>
    </div>
  )
}
