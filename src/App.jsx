import { useState, useEffect } from 'react'
import './App.css'

const SUBJECTS = ['Mathe', 'Praktische Informatik', 'Theoretische Informatik', 'GdI']
const TYPES = ['Abgabe', 'To-Do', 'Lesen', 'Klausur']

const SUBJECT_COLOR = {
  Mathe: '#4f86f7',
  'Praktische Informatik': '#10b981',
  'Theoretische Informatik': '#f59e0b',
  GdI: '#ef4444',
}

const TYPE_ICON = {
  Abgabe: '📤',
  'To-Do': '✅',
  Lesen: '📖',
  Klausur: '📝',
}

function daysUntil(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  return Math.round((d - today) / 86_400_000)
}

export default function App() {
  const [tasks, setTasks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('uni-tasks') ?? '[]')
    } catch {
      return []
    }
  })
  const [filter, setFilter] = useState('Alle')
  const [form, setForm] = useState({
    title: '',
    type: 'To-Do',
    deadline: '',
    subject: 'Mathe',
  })

  useEffect(() => {
    localStorage.setItem('uni-tasks', JSON.stringify(tasks))
  }, [tasks])

  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.deadline) return
    setTasks(prev => [
      ...prev,
      { id: crypto.randomUUID(), ...form, done: false, createdAt: Date.now() },
    ])
    setForm(f => ({ ...f, title: '', deadline: '' }))
  }

  function toggle(id) {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, done: !t.done } : t)))
  }

  function remove(id) {
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const visible = tasks
    .filter(t => filter === 'Alle' || t.subject === filter)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))

  const openCount = tasks.filter(t => !t.done).length

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Uni-Planer</h1>
        <p className="app-subtitle">
          {openCount} offene Aufgabe{openCount !== 1 ? 'n' : ''}
        </p>
      </header>

      <form className="form-card" onSubmit={handleSubmit}>
        <input
          className="input full"
          type="text"
          placeholder="Neue Aufgabe eingeben..."
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          required
        />
        <div className="form-row">
          <select
            className="select"
            value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
          >
            {SUBJECTS.map(s => <option key={s}>{s}</option>)}
          </select>
          <select
            className="select"
            value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
          >
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <input
            className="input"
            type="date"
            value={form.deadline}
            onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
            required
          />
          <button className="btn-add" type="submit">+ Hinzufügen</button>
        </div>
      </form>

      <div className="filter-bar">
        {['Alle', ...SUBJECTS].map(s => {
          const isActive = filter === s
          const color = SUBJECT_COLOR[s]
          return (
            <button
              key={s}
              className={`filter-btn${isActive ? ' active' : ''}`}
              style={isActive && color ? { borderColor: color, color } : {}}
              onClick={() => setFilter(s)}
            >
              {color && <span className="dot" style={{ background: color }} />}
              {s}
            </button>
          )
        })}
      </div>

      <ul className="task-list">
        {visible.length === 0 && (
          <li className="empty-state">
            <span className="empty-icon">🎉</span>
            Keine Aufgaben — weiter so!
          </li>
        )}
        {visible.map(task => {
          const diff = daysUntil(task.deadline)
          const overdue = diff < 0 && !task.done
          const soon = diff >= 0 && diff <= 2 && !task.done
          const dateLabel = new Date(task.deadline).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
          const daysLabel = task.done
            ? null
            : overdue
            ? `${Math.abs(diff)} Tag${Math.abs(diff) !== 1 ? 'e' : ''} überfällig`
            : diff === 0
            ? 'Heute fällig'
            : `noch ${diff} Tag${diff !== 1 ? 'e' : ''}`

          return (
            <li
              key={task.id}
              className={`task-item${task.done ? ' done' : ''}${overdue ? ' overdue' : soon ? ' soon' : ''}`}
            >
              <div
                className="task-stripe"
                style={{ background: SUBJECT_COLOR[task.subject] }}
              />
              <label className="checkbox-wrap">
                <input type="checkbox" checked={task.done} onChange={() => toggle(task.id)} />
                <span className="checkmark" />
              </label>
              <div className="task-body">
                <span className="task-title">{task.title}</span>
                <div className="task-meta">
                  <span className="tag subject-tag" style={{ color: SUBJECT_COLOR[task.subject] }}>
                    {task.subject}
                  </span>
                  <span className="tag type-tag">
                    {TYPE_ICON[task.type]} {task.type}
                  </span>
                  <span className={`tag deadline-tag${overdue ? ' overdue' : soon ? ' soon' : ''}`}>
                    📅 {dateLabel}
                    {daysLabel && <span className="days-label"> · {daysLabel}</span>}
                  </span>
                </div>
              </div>
              <button
                className="delete-btn"
                onClick={() => remove(task.id)}
                aria-label="Aufgabe löschen"
                title="Löschen"
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
