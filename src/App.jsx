import { useState, useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import './App.css'

const SUBJECTS   = ['Mathe', 'Praktische Informatik', 'Theoretische Informatik', 'GdI']
const TYPES      = ['Abgabe', 'To-Do', 'Lesen', 'Klausur']
const PRIORITIES = ['hoch', 'mittel', 'niedrig']

const SUBJECT_COLOR = {
  Mathe:                    '#4f86f7',
  'Praktische Informatik':  '#10b981',
  'Theoretische Informatik':'#f59e0b',
  GdI:                      '#ef4444',
}
const SUBJECT_SHORT = {
  Mathe:                    'Mathe',
  'Praktische Informatik':  'P.Inf',
  'Theoretische Informatik':'T.Inf',
  GdI:                      'GdI',
}
const PRIORITY_COLOR = { hoch: '#ef4444', mittel: '#f59e0b', niedrig: '#10b981' }
const PRIORITY_LABEL = { hoch: '↑ Hoch',  mittel: '→ Mittel', niedrig: '↓ Niedrig' }
const TYPE_ICON      = { Abgabe: '📤', 'To-Do': '✅', Lesen: '📖', Klausur: '📝' }

const QUOTES = [
  'Fang einfach an – der Rest folgt.',
  'Schritt für Schritt zum Ziel.',
  'Du bist näher dran als du denkst.',
  'Fokus schlägt Perfektion.',
  'Heute die Basis für morgen legen.',
  'Du schaffst das.',
  'Der beste Zeitpunkt ist jetzt.',
]

// ── Helpers ────────────────────────────────────────────────────────────────

function daysUntil(dateStr) {
  const t = new Date(); t.setHours(0,0,0,0)
  const d = new Date(dateStr); d.setHours(0,0,0,0)
  return Math.round((d - t) / 86_400_000)
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10)
}

function getWeekDays() {
  const today = new Date()
  const mon = new Date(today)
  mon.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon)
    d.setDate(mon.getDate() + i)
    return d
  })
}

function toEmbedUrl(url) {
  if (!url) return ''
  if (url.includes('/embed/')) return url
  const m = url.match(/open\.spotify\.com\/(playlist|album|track|episode|show)\/([a-zA-Z0-9]+)/)
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0` : ''
}

function sortTasks(arr) {
  const p = { hoch: 0, mittel: 1, niedrig: 2 }
  return [...arr].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    const pd = (p[a.priority ?? 'mittel']) - (p[b.priority ?? 'mittel'])
    if (pd !== 0) return pd
    return new Date(a.deadline) - new Date(b.deadline)
  })
}

// ── Progress Ring ──────────────────────────────────────────────────────────

function Ring({ pct, color, size = 54, stroke = 4.5 }) {
  const r    = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring-svg">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - (pct || 0))}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.4,0,.2,1)' }}
      />
    </svg>
  )
}

// ── Week View ──────────────────────────────────────────────────────────────

function WeekView({ tasks, filter, onToggle }) {
  const days     = getWeekDays()
  const todayStr = toDateStr(new Date())

  return (
    <div className="week-view">
      {days.map(day => {
        const ds      = toDateStr(day)
        const isToday = ds === todayStr
        const cols    = sortTasks(
          tasks
            .filter(t => t.deadline === ds)
            .filter(t => filter === 'Alle' || t.subject === filter)
        )
        return (
          <div key={ds} className={`week-col${isToday ? ' today' : ''}`}>
            <div className="week-col-header">
              <span className="week-day-name">
                {day.toLocaleDateString('de-DE', { weekday: 'short' })}
              </span>
              <span className="week-day-num">{day.getDate()}</span>
            </div>
            <div className="week-col-body">
              {cols.length === 0
                ? <span className="week-empty">–</span>
                : cols.map(t => (
                  <button
                    key={t.id}
                    className={`week-task${t.done ? ' done' : ''}`}
                    style={{ borderLeftColor: SUBJECT_COLOR[t.subject] }}
                    onClick={() => onToggle(t.id)}
                    title={t.title}
                  >
                    {t.priority === 'hoch' && (
                      <span className="week-prio" style={{ background: PRIORITY_COLOR.hoch }} />
                    )}
                    <span className="week-task-title">{t.title}</span>
                  </button>
                ))
              }
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks, setTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('uni-tasks') ?? '[]') }
    catch { return [] }
  })
  const [filter, setFilter]   = useState('Alle')
  const [search, setSearch]   = useState('')
  const [view,   setView]     = useState('list')
  const [form,   setForm]     = useState({
    title: '', type: 'Abgabe', deadline: '', subject: 'Mathe', priority: 'mittel',
  })
  const [spotifyUrl,       setSpotifyUrl]       = useState(() => localStorage.getItem('uni-spotify') ?? '')
  const [spotifyDraft,     setSpotifyDraft]     = useState('')
  const [spotifyEditing,   setSpotifyEditing]   = useState(false)
  const [spotifyCollapsed, setSpotifyCollapsed] = useState(false)

  const prevRef = useRef(tasks)

  // Persist
  useEffect(() => { localStorage.setItem('uni-tasks',   JSON.stringify(tasks)) }, [tasks])
  useEffect(() => { localStorage.setItem('uni-spotify', spotifyUrl)             }, [spotifyUrl])

  // Seed from Moodle sync
  useEffect(() => {
    fetch('/tasks.json')
      .then(r => r.json())
      .then(fetched => {
        setTasks(prev => {
          const ids = new Set(prev.map(t => t.id))
          const next = fetched.filter(t => !ids.has(t.id))
          return next.length ? [...prev, ...next] : prev
        })
      })
      .catch(() => {})
  }, [])

  // Confetti on subject completion
  useEffect(() => {
    SUBJECTS.forEach(s => {
      const curr = tasks.filter(t => t.subject === s)
      const prev = prevRef.current.filter(t => t.subject === s)
      if (
        curr.length > 0 && curr.every(t => t.done) &&
        !(prev.length > 0 && prev.every(t => t.done))
      ) {
        confetti({
          particleCount: 130,
          spread: 80,
          origin: { y: 0.45 },
          colors: [SUBJECT_COLOR[s], '#ffffff', '#ffd700'],
        })
      }
    })
    prevRef.current = tasks
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
  const toggle = id => setTasks(p => p.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const remove = id => setTasks(p => p.filter(t => t.id !== id))

  function saveSpotify() {
    setSpotifyUrl(spotifyDraft.trim())
    setSpotifyEditing(false)
  }

  // Derived
  const visible = sortTasks(
    tasks
      .filter(t => filter === 'Alle' || t.subject === filter)
      .filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()))
  )

  const today    = new Date()
  const todayStr = today.toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
  const quote    = QUOTES[today.getDay()]
  const openCount = tasks.filter(t => !t.done).length

  const embedUrl = toEmbedUrl(spotifyUrl)
  const playerOpen = !!embedUrl && !spotifyCollapsed

  return (
    <div className={`app${playerOpen ? ' has-player' : ''}`}>

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-row">
          <span className="header-date">{todayStr}</span>
          <span className="header-badge">{openCount} offen</span>
        </div>
        <h1 className="header-title">Uni-Planer</h1>
        <p className="header-quote">„{quote}"</p>
      </header>

      {/* ── Subject Progress ── */}
      <section className="progress-section">
        {SUBJECTS.map(s => {
          const all  = tasks.filter(t => t.subject === s)
          const done = all.filter(t => t.done).length
          return (
            <div key={s} className="progress-card glass">
              <div className="ring-wrap">
                <Ring pct={all.length ? done / all.length : 0} color={SUBJECT_COLOR[s]} />
                <span className="ring-pct">
                  {all.length ? Math.round(done / all.length * 100) : 0}%
                </span>
              </div>
              <span className="progress-subject" style={{ color: SUBJECT_COLOR[s] }}>
                {SUBJECT_SHORT[s]}
              </span>
              <span className="progress-count">{done}/{all.length}</span>
            </div>
          )
        })}
      </section>

      {/* ── Controls ── */}
      <div className="controls-row">
        <div className="search-wrap">
          <span className="search-icon">⌕</span>
          <input
            className="search-input"
            type="text"
            placeholder="Suchen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>×</button>
          )}
        </div>
        <div className="view-toggle">
          <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Liste</button>
          <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Woche</button>
        </div>
      </div>

      {/* ── Filter Pills ── */}
      <div className="filter-bar">
        {['Alle', ...SUBJECTS].map(s => {
          const isActive = filter === s
          const color    = SUBJECT_COLOR[s]
          return (
            <button
              key={s}
              className={`filter-btn${isActive ? ' active' : ''}`}
              style={isActive && color ? { borderColor: color, color } : {}}
              onClick={() => setFilter(s)}
            >
              {color && <span className="dot" style={{ background: color }} />}
              {SUBJECT_SHORT[s] ?? s}
            </button>
          )
        })}
      </div>

      {/* ── Form ── */}
      <form className="form-card glass" onSubmit={handleSubmit}>
        <input
          className="input full"
          type="text"
          placeholder="Neue Aufgabe eingeben..."
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          required
        />
        <div className="form-row">
          <select className="select" value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}>
            {SUBJECTS.map(s => <option key={s}>{s}</option>)}
          </select>
          <select className="select" value={form.type}
            onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
            {TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <select className="select priority-select" value={form.priority}
            onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
            {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
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

      {/* ── Content ── */}
      {view === 'list' ? (
        <ul className="task-list">
          {visible.length === 0 && (
            <li className="empty-state">
              {search ? `Keine Treffer für „${search}"` : 'Keine Aufgaben — weiter so! 🎉'}
            </li>
          )}
          {visible.map(task => {
            const diff     = daysUntil(task.deadline)
            const overdue  = diff < 0 && !task.done
            const soon     = diff >= 0 && diff <= 2 && !task.done
            const priority = task.priority ?? 'mittel'
            const dateLbl  = new Date(task.deadline).toLocaleDateString('de-DE',
              { day: '2-digit', month: '2-digit', year: 'numeric' })
            const daysLbl  = task.done ? null
              : overdue  ? `${Math.abs(diff)}d überfällig`
              : diff === 0 ? 'Heute'
              : `${diff}d`

            return (
              <li key={task.id}
                className={`task-item glass${task.done ? ' done' : ''}${overdue ? ' overdue' : soon ? ' soon' : ''}`}>
                <div className="task-stripe" style={{ background: SUBJECT_COLOR[task.subject] }} />
                <span
                  className="prio-dot"
                  style={{ background: PRIORITY_COLOR[priority] }}
                  title={`Priorität: ${priority}`}
                />
                <label className="checkbox-wrap">
                  <input type="checkbox" checked={task.done} onChange={() => toggle(task.id)} />
                  <span className="checkmark" />
                </label>
                <div className="task-body">
                  <span className="task-title">{task.title}</span>
                  <div className="task-meta">
                    <span className="tag subject-tag" style={{ color: SUBJECT_COLOR[task.subject] }}>
                      {SUBJECT_SHORT[task.subject] ?? task.subject}
                    </span>
                    <span className="tag type-tag">{TYPE_ICON[task.type]} {task.type}</span>
                    <span className={`tag deadline-tag${overdue ? ' overdue' : soon ? ' soon' : ''}`}>
                      {dateLbl}
                      {daysLbl && <span className="days-label"> · {daysLbl}</span>}
                    </span>
                  </div>
                </div>
                <button className="delete-btn" onClick={() => remove(task.id)} title="Löschen">×</button>
              </li>
            )
          })}
        </ul>
      ) : (
        <WeekView tasks={tasks} filter={filter} onToggle={toggle} />
      )}

      {/* ── Spotify Bar ── */}
      <div className={`spotify-bar glass${spotifyCollapsed ? ' collapsed' : ''}`}>
        <div className="spotify-toprow">
          <span className="spotify-icon">♫</span>
          {spotifyEditing ? (
            <div className="spotify-edit">
              <input
                className="spotify-input"
                type="text"
                placeholder="Spotify Playlist-URL einfügen..."
                value={spotifyDraft}
                onChange={e => setSpotifyDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveSpotify()}
                autoFocus
              />
              <button className="sp-btn sp-ok"  onClick={saveSpotify}>OK</button>
              <button className="sp-btn sp-x"   onClick={() => setSpotifyEditing(false)}>✕</button>
            </div>
          ) : (
            <button
              className="spotify-label-btn"
              onClick={() => { setSpotifyDraft(spotifyUrl); setSpotifyEditing(true) }}
            >
              {spotifyUrl ? 'Playlist wechseln' : '+ Spotify Playlist hinzufügen'}
            </button>
          )}
          {embedUrl && !spotifyEditing && (
            <button className="spotify-collapse" onClick={() => setSpotifyCollapsed(c => !c)}>
              {spotifyCollapsed ? '▲' : '▼'}
            </button>
          )}
        </div>
        {embedUrl && !spotifyCollapsed && (
          <iframe
            src={embedUrl}
            width="100%"
            height="80"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            title="Spotify"
            className="spotify-iframe"
          />
        )}
      </div>
    </div>
  )
}
