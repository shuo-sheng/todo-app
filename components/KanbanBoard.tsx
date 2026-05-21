import { useMemo, useState } from 'react'

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

interface KanbanBoardProps {
  todos: Todo[]
  onToggle: (id: number, completed: boolean) => void
  onDelete: (id: number) => void
  onArchive: (id: number) => void
}

const PRIORITY_COLORS: Record<string, string> = {
  high: '#ff4d4f',
  medium: '#faad14',
  low: '#52c41a'
}
const PRIORITY_LABELS: Record<string, string> = {
  high: '高', medium: '中', low: '低'
}

export default function KanbanBoard({ todos, onToggle, onDelete, onArchive }: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<number | null>(null)

  const columns = useMemo(() => {
    const todo = todos.filter(t => !t.completed)
    const done = todos.filter(t => t.completed)
    return {
      todo: todo.sort((a, b) => {
        const pA = PRIORITY_LABELS[a.priority || 'medium'] || '中'
        const pB = PRIORITY_LABELS[b.priority || 'medium'] || '中'
        return pA.localeCompare(pB)
      }),
      done: done.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
  }, [todos])

  function handleDragStart(id: number) {
    setDraggingId(id)
  }

  function handleDrop(e: React.DragEvent, targetStatus: 'todo' | 'done') {
    e.preventDefault()
    if (draggingId === null) return
    const todo = todos.find(t => t.id === draggingId)
    if (!todo) return
    if (targetStatus === 'done' && !todo.completed) {
      onToggle(todo.id, false)
    } else if (targetStatus === 'todo' && todo.completed) {
      onToggle(todo.id, true)
    }
    setDraggingId(null)
  }

  function allowDrop(e: React.DragEvent) {
    e.preventDefault()
  }

  const columnConfig = [
    { key: 'todo' as const, title: '📋 待办', count: columns.todo.length, color: '#faad14' },
    { key: 'done' as const, title: '✅ 已完成', count: columns.done.length, color: '#52c41a' }
  ]

  function formatDate(dateStr?: string) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  function isOverdue(dueDate?: string) {
    if (!dueDate) return false
    return new Date(dueDate) < new Date(new Date().toDateString())
  }

  return (
    <div className="kanban-board">
      {columnConfig.map(col => (
        <div
          key={col.key}
          className="kanban-column"
          onDragOver={allowDrop}
          onDrop={e => handleDrop(e, col.key)}
        >
          <div className="kanban-header" style={{ borderColor: col.color }}>
            <span className="kanban-title">{col.title}</span>
            <span className="kanban-count" style={{ background: col.color + '20', color: col.color }}>
              {col.count}
            </span>
          </div>
          <div className="kanban-list">
            {columns[col.key].map(todo => (
              <div
                key={todo.id}
                className={`kanban-card ${draggingId === todo.id ? 'dragging' : ''}`}
                draggable
                onDragStart={() => handleDragStart(todo.id)}
              >
                <div className="kanban-card-header">
                  <span
                    className="kanban-priority"
                    style={{ background: PRIORITY_COLORS[todo.priority || 'medium'] + '20', color: PRIORITY_COLORS[todo.priority || 'medium'] }}
                  >
                    {PRIORITY_LABELS[todo.priority || 'medium'] || '中'}
                  </span>
                  {todo.category && <span className="kanban-category">{todo.category}</span>}
                </div>
                <p className="kanban-card-title">{todo.title}</p>
                {todo.due_date && (
                  <span className={`kanban-due ${isOverdue(todo.due_date) ? 'overdue' : ''}`}>
                    📅 {formatDate(todo.due_date)}{isOverdue(todo.due_date) ? ' (已过期)' : ''}
                  </span>
                )}
                <div className="kanban-card-actions">
                  <button
                    onClick={() => onToggle(todo.id, todo.completed)}
                    className="kanban-action-btn"
                    title={todo.completed ? '标记未完成' : '标记完成'}
                  >
                    {todo.completed ? '↩️' : '✓'}
                  </button>
                  <button
                    onClick={() => onArchive(todo.id)}
                    className="kanban-action-btn"
                    title="归档"
                  >
                    📦
                  </button>
                  <button
                    onClick={() => onDelete(todo.id)}
                    className="kanban-action-btn"
                    title="删除"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
            {columns[col.key].length === 0 && (
              <div className="kanban-empty">
                {col.key === 'todo' ? '暂无待办任务 🎯' : '还没有已完成任务'}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
