import { useMemo } from 'react'

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

interface StatsDashboardProps {
  todos: Todo[]
}

export default function StatsDashboard({ todos }: StatsDashboardProps) {
  const stats = useMemo(() => {
    const total = todos.length
    const completed = todos.filter(t => t.completed).length
    const active = total - completed
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0

    // 按分类统计
    const categoryStats: Record<string, { total: number; completed: number }> = {}
    todos.forEach(todo => {
      const cat = todo.category || '未分类'
      if (!categoryStats[cat]) categoryStats[cat] = { total: 0, completed: 0 }
      categoryStats[cat].total++
      if (todo.completed) categoryStats[cat].completed++
    })

    // 按优先级统计
    const priorityStats: Record<string, number> = {}
    todos.forEach(todo => {
      const p = todo.priority || 'medium'
      priorityStats[p] = (priorityStats[p] || 0) + 1
    })

    // 本周趋势（最近7天）
    const today = new Date()
    const weekDays: { date: string; created: number; completed: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      weekDays.push({
        date: `${d.getMonth() + 1}/${d.getDate()}`,
        created: todos.filter(t => t.created_at?.startsWith(dateStr)).length,
        completed: todos.filter(t => t.completed && t.created_at?.startsWith(dateStr)).length
      })
    }

    return { total, completed, active, completionRate, categoryStats, priorityStats, weekDays }
  }, [todos])

  const { total, completed, active, completionRate, categoryStats, priorityStats, weekDays } = stats

  // 饼图数据
  const pieData = [
    { label: '已完成', value: completed, color: '#52c41a' },
    { label: '待办', value: active, color: '#faad14' }
  ]

  // 计算饼图路径
  const cx = 50, cy = 50, r = 40
  let angle = -90
  const pieSlices = pieData.map(d => {
    const frac = total > 0 ? d.value / total : 0
    const a = frac * 360
    const startAngle = angle
    const endAngle = angle + a
    angle += a
    const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180)
    const y1 = cy + r * Math.sin((startAngle * Math.PI) / 180)
    const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180)
    const y2 = cy + r * Math.sin((endAngle * Math.PI) / 180)
    const largeArc = a > 180 ? 1 : 0
    return {
      path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: d.color,
      label: d.label,
      value: d.value
    }
  })

  // 柱状图 - 分类
  const catEntries = Object.entries(categoryStats).sort((a, b) => b[1].total - a[1].total)
  const maxCat = Math.max(...catEntries.map(e => e[1].total), 1)

  // 折线图 - 本周趋势
  const maxWeek = Math.max(...weekDays.map(d => Math.max(d.created, d.completed)), 1)

  const priorityColors: Record<string, string> = {
    high: '#ff4d4f',
    medium: '#faad14',
    low: '#52c41a'
  }
  const priorityLabels: Record<string, string> = {
    high: '高', medium: '中', low: '低'
  }

  if (total === 0) {
    return (
      <div className="stats-empty">
        <p>📊 暂无数据，添加任务后查看统计</p>
      </div>
    )
  }

  return (
    <div className="stats-dashboard">
      {/* 概览卡片 */}
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-number">{total}</div>
          <div className="stat-label">总任务</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#52c41a' }}>{completed}</div>
          <div className="stat-label">已完成</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#faad14' }}>{active}</div>
          <div className="stat-label">待办</div>
        </div>
        <div className="stat-card">
          <div className="stat-number" style={{ color: '#1890ff' }}>{completionRate}%</div>
          <div className="stat-label">完成率</div>
        </div>
      </div>

      {/* 图表区 */}
      <div className="stats-charts">
        {/* 完成率饼图 */}
        <div className="chart-box">
          <h4>📊 完成状态</h4>
          <svg viewBox="0 0 100 100" className="pie-chart">
            {pieSlices.map((slice, i) => (
              <path key={i} d={slice.path} fill={slice.color} stroke="#fff" strokeWidth="1" />
            ))}
            <text x="50" y="48" textAnchor="middle" className="pie-center-text">{completionRate}%</text>
            <text x="50" y="58" textAnchor="middle" className="pie-center-label">完成率</text>
          </svg>
          <div className="legend">
            {pieSlices.map((slice, i) => (
              <span key={i} className="legend-item">
                <span className="legend-dot" style={{ background: slice.color }} />{slice.label}: {slice.value}
              </span>
            ))}
          </div>
        </div>

        {/* 分类柱状图 */}
        <div className="chart-box">
          <h4>🏷️ 分类分布</h4>
          <div className="bar-chart">
            {catEntries.map(([cat, data]) => (
              <div key={cat} className="bar-row">
                <span className="bar-label">{cat}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${(data.total / maxCat) * 100}%` }}
                  >
                    <span className="bar-value">{data.total}</span>
                  </div>
                </div>
                <span className="bar-done">{data.completed}/{data.total}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 优先级分布 */}
        <div className="chart-box">
          <h4>⚡ 优先级分布</h4>
          <div className="priority-bars">
            {Object.entries(priorityStats).map(([p, count]) => (
              <div key={p} className="p-bar-row">
                <span className="p-bar-label" style={{ color: priorityColors[p] || '#999' }}>
                  {priorityLabels[p] || p}优先级
                </span>
                <div className="p-bar-track">
                  <div
                    className="p-bar-fill"
                    style={{
                      width: `${(count / total) * 100}%`,
                      background: priorityColors[p] || '#999'
                    }}
                  />
                </div>
                <span className="p-bar-value">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 本周趋势 */}
        <div className="chart-box wide">
          <h4>📈 本周趋势</h4>
          <div className="trend-chart">
            <svg viewBox={`0 0 ${weekDays.length * 50} 120`} className="trend-svg">
              {/* 背景网格线 */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
                <line
                  key={i}
                  x1="0"
                  y1={100 - ratio * 100}
                  x2={weekDays.length * 50}
                  y2={100 - ratio * 100}
                  stroke="#eee"
                  strokeWidth="0.5"
                />
              ))}
              {/* 创建折线 */}
              <polyline
                fill="none"
                stroke="#1890ff"
                strokeWidth="2"
                points={weekDays.map((d, i) => `${i * 50 + 25},${100 - (d.created / maxWeek) * 100}`).join(' ')}
              />
              {/* 完成折线 */}
              <polyline
                fill="none"
                stroke="#52c41a"
                strokeWidth="2"
                strokeDasharray="4,2"
                points={weekDays.map((d, i) => `${i * 50 + 25},${100 - (d.completed / maxWeek) * 100}`).join(' ')}
              />
              {/* 数据点 */}
              {weekDays.map((d, i) => (
                <g key={i}>
                  <circle cx={i * 50 + 25} cy={100 - (d.created / maxWeek) * 100} r="3" fill="#1890ff" />
                  <circle cx={i * 50 + 25} cy={100 - (d.completed / maxWeek) * 100} r="3" fill="#52c41a" />
                </g>
              ))}
              {/* X轴标签 */}
              {weekDays.map((d, i) => (
                <text key={i} x={i * 50 + 25} y="115" textAnchor="middle" fontSize="8" fill="#999">
                  {d.date}
                </text>
              ))}
            </svg>
            <div className="trend-legend">
              <span><span className="dot" style={{ background: '#1890ff' }} />新增</span>
              <span><span className="dot" style={{ background: '#52c41a' }} />完成</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
