import { useState } from 'react'

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

interface CalendarProps {
  todos: Todo[]
  onSelectDate: (date: string) => void
  selectedDate: string | null
}

export default function Calendar({ todos, onSelectDate, selectedDate }: CalendarProps) {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const firstDay = new Date(currentYear, currentMonth, 1)
  const lastDay = new Date(currentYear, currentMonth + 1, 0)
  const startDayOfWeek = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  const days: (number | null)[] = []
  for (let i = 0; i < startDayOfWeek; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  const todosByDate = new Map<string, Todo[]>()
  todos.forEach(todo => {
    const d = todo.due_date || todo.created_at?.split('T')[0]
    if (!d) return
    if (!todosByDate.has(d)) todosByDate.set(d, [])
    todosByDate.get(d)!.push(todo)
  })

  const weekDays = ['日', '一', '二', '三', '四', '五', '六']

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11)
      setCurrentYear(y => y - 1)
    } else {
      setCurrentMonth(m => m - 1)
    }
  }

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0)
      setCurrentYear(y => y + 1)
    } else {
      setCurrentMonth(m => m + 1)
    }
  }

  return (
    <div>
      <div className="calendar-header">
        <button className="cal-nav" onClick={prevMonth}>◀</button>
        <span className="cal-title">{currentYear}年 {currentMonth + 1}月</span>
        <button className="cal-nav" onClick={nextMonth}>▶</button>
      </div>
      <div className="calendar-grid">
        {weekDays.map(d => (
          <div key={d} className="cal-weekday">{d}</div>
        ))}
        {days.map((day, idx) => {
          if (day === null) return <div key={`e${idx}`} className="cal-day empty" />
          const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayTodos = todosByDate.get(dateStr) || []
          const hasTasks = dayTodos.length > 0
          const allDone = hasTasks && dayTodos.every(t => t.completed)
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          return (
            <div
              key={dateStr}
              className={`cal-day ${hasTasks ? (allDone ? 'done' : 'has-tasks') : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectDate(dateStr)}
            >
              <span className="day-number">{day}</span>
              {hasTasks && <span className={`task-dot ${allDone ? 'done-dot' : ''}`}>{dayTodos.length}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
