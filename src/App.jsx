import { useState, useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import './App.css'

const SUBJECTS   = ['Mathe', 'Praktische Informatik', 'Theoretische Informatik', 'GdI']
const TYPES      = ['Abgabe', 'To-Do', 'Lesen', 'Klausur']
const PRIORITIES = ['hoch', 'mittel', 'niedrig']

const SUBJECT_COLOR = {
  Mathe:                     '#4f86f7',
  'Praktische Informatik':   '#10b981',
  'Theoretische Informatik': '#f59e0b',
  GdI:                       '#ef4444',
}
const SUBJECT_SHORT = {
  Mathe:                     'Mathe',
  'Praktische Informatik':   'P.Inf',
  'Theoretische Informatik': 'T.Inf',
  GdI:                       'GdI',
}
const PRIORITY_COLOR = { hoch: '#ef4444', mittel: '#f59e0b', niedrig: '#10b981' }
const PRIORITY_LABEL = { hoch: '↑ Hoch', mittel: '→ Mittel', niedrig: '↓ Niedrig' }
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(deadline) {
  const today = new Date(); today.setHours(0,0,0,0)
  const d     = new Date(deadline); d.setHours(0,0,0,0)
  return Math.round((d - today) / 86_400_000)
}

function deadlineLabel(deadline) {
  const d       = new Date(deadline)
  const hasTime = deadline.includes('T')
  return hasTime
    ? d.toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
    : d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' })
}

function isoDate(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

function toDateStr(d) { return d.toISOString().slice(0,10) }

function getWeekDays() {
  const today = new Date()
  const mon   = new Date(today)
  mon.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d
  })
}

function toEmbedUrl(url) {
  if (!url) return ''
  if (url.includes('/embed/')) return url
  const m = url.match(/open\.spotify\.com\/(playlist|album|track|episode|show)\/([a-zA-Z0-9]+)/)
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0` : ''
}

function sortTasks(arr) {
  const p = { hoch:0, mittel:1, niedrig:2 }
  return [...arr].sort((a,b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    const pd = (p[a.priority ?? 'mittel']) - (p[b.priority ?? 'mittel'])
    if (pd !== 0) return pd
    return new Date(a.deadline) - new Date(b.deadline)
  })
}

// ── Animated Background ───────────────────────────────────────────────────────

function AnimatedBg() {
  return (
    <div className="anim-bg" aria-hidden="true">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <div className="blob b4" />
    </div>
  )
}

// ── Week View ─────────────────────────────────────────────────────────────────

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
            .filter(t => t.deadline.slice(0,10) === ds)
            .filter(t => filter === 'Alle' || t.subject === filter)
        )
        return (
          <div key={ds} className={`week-col${isToday ? ' today' : ''}`}>
            <div className="week-col-header">
              <span className="week-day-name">{day.toLocaleDateString('de-DE', { weekday:'short' })}</span>
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
                    title={`${t.title} – ${deadlineLabel(t.deadline)}`}
                  >
                    {t.priority === 'hoch' && <span className="week-prio" style={{ background: PRIORITY_COLOR.hoch }} />}
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

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks,  setTasks]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('uni-tasks') ?? '[]') }
    catch { return [] }
  })
  const [filter,   setFilter]   = useState('Alle')
  const [search,   setSearch]   = useState('')
  const [view,     setView]     = useState('list')
  const [form,     setForm]     = useState({
    title:'', type:'Abgabe', deadline:'', subject:'Mathe', priority:'mittel',
  })
  const [spotifyUrl,       setSpotifyUrl]       = useState(() => localStorage.getItem('uni-spotify') ?? '')
  const [spotifyDraft,     setSpotifyDraft]     = useState('')
  const [spotifyEditing,   setSpotifyEditing]   = useState(false)
  const [spotifyCollapsed, setSpotifyCollapsed] = useState(false)

  const prevRef    = useRef(tasks)
  const titleRef   = useRef(null)

  // Persist
  useEffect(() => { localStorage.setItem('uni-tasks',   JSON.stringify(tasks)) }, [tasks])
  useEffect(() => { localStorage.setItem('uni-spotify', spotifyUrl)             }, [spotifyUrl])

  // Seed + update Moodle tasks from tasks.json
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}tasks.json`)
      .then(r => r.json())
      .then(fetched => {
        setTasks(prev => {
          const freshById = Object.fromEntries(fetched.map(t => [t.id, t]))
          const updated   = prev.map(t =>
            t.source === 'moodle' && freshById[t.id]
              ? { ...freshById[t.id], done: t.done }
              : t
          )
          const existingIds = new Set(prev.map(t => t.id))
          const brandNew    = fetched.filter(t => !existingIds.has(t.id))
          return brandNew.length ? [...updated, ...brandNew] : updated
        })
      })
      .catch(() => {})
  }, [])

  // Confetti on subject completion
  useEffect(() => {
    SUBJECTS.forEach(s => {
      const curr = tasks.filter(t => t.subject === s)
      const prev = prevRef.current.filter(t => t.subject === s)
      if (curr.length > 0 && curr.every(t => t.done) &&
          !(prev.length > 0 && prev.every(t => t.done))) {
        confetti({ particleCount: 130, spread: 80, origin: { y: 0.45 },
          colors: [SUBJECT_COLOR[s], '#ffffff', '#ffd700'] })
      }
    })
    prevRef.current = tasks
  }, [tasks])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return
      if (e.key === '/' || e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        titleRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Handlers
  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.deadline) return
    setTasks(prev => [...prev, { id: crypto.randomUUID(), ...form, done: false, createdAt: Date.now() }])
    setForm(f => ({ ...f, title:'', deadline:'' }))
    titleRef.current?.focus()
  }
  const toggle       = id => setTasks(p => p.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const remove       = id => setTasks(p => p.filter(t => t.id !== id))
  const clearDone    = ()  => setTasks(p => p.filter(t => !t.done))
  const setQuickDate = d   => setForm(f => ({ ...f, deadline: isoDate(d) }))
  const saveSpotify  = ()  => { setSpotifyUrl(spotifyDraft.trim()); setSpotifyEditing(false) }

  // Derived
  const visible = sortTasks(
    tasks
      .filter(t => filter === 'Alle' || t.subject === filter)
      .filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()))
  )
  const doneCount  = tasks.filter(t => t.done).length
  const openCount  = tasks.length - doneCount
  const today      = new Date()
  const dateLabel  = today.toLocaleDateString('de-DE', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
  const quote      = QUOTES[today.getDay()]
  const embedUrl   = toEmbedUrl(spotifyUrl)
  const hasPlayer  = !!embedUrl && !spotifyCollapsed

  return (
    <>
      <AnimatedBg />
      <div className={`app${hasPlayer ? ' has-player' : ''}`}>

        {/* ── Header ── */}
        <header className="app-header">
          <div className="header-row">
            <span className="header-date">{dateLabel}</span>
            <span className="header-badge">{openCount} offen</span>
          </div>
          <h1 className="header-title">Uni-Planer</h1>
          <p className="header-quote">„{quote}"</p>
          <div className="header-stats">
            {(() => {
              const todayTasks  = tasks.filter(t => !t.done && daysUntil(t.deadline) === 0)
              const overdueTasks = tasks.filter(t => !t.done && daysUntil(t.deadline) < 0)
              const weekTasks   = tasks.filter(t => !t.done && daysUntil(t.deadline) >= 0 && daysUntil(t.deadline) <= 7)
              return (<>
                <div className="stat-item">
                  <span className="stat-val" style={{ color: overdueTasks.length > 0 ? '#f87171' : 'var(--text)' }}>
                    {overdueTasks.length}
                  </span>
                  <span className="stat-lbl">Überfällig</span>
                </div>
                <div className="stat-item">
                  <span className="stat-val" style={{ color: todayTasks.length > 0 ? '#fbbf24' : 'var(--text)' }}>
                    {todayTasks.length}
                  </span>
                  <span className="stat-lbl">Heute</span>
                </div>
                <div className="stat-item">
                  <span className="stat-val">{weekTasks.length}</span>
                  <span className="stat-lbl">Diese Woche</span>
                </div>
                <div className="stat-item">
                  <span className="stat-val" style={{ color: 'var(--accent)' }}>{doneCount}</span>
                  <span className="stat-lbl">Erledigt</span>
                </div>
              </>)
            })()}
          </div>
        </header>

        {/* ── Subject Progress Bars ── */}
        <section className="progress-section">
          {SUBJECTS.map((s, i) => {
            const all  = tasks.filter(t => t.subject === s)
            const done = all.filter(t => t.done).length
            const pct  = all.length ? done / all.length : 0
            return (
              <div key={s} className="progress-card glass"
                style={{ '--i': i, '--subject-color': SUBJECT_COLOR[s] }}>
                <div className="pc-header">
                  <span className="pc-name" style={{ color: SUBJECT_COLOR[s] }}>{SUBJECT_SHORT[s]}</span>
                  <span className="pc-count">{done}/{all.length}</span>
                </div>
                <div className="pc-track">
                  <div className="pc-fill" style={{ width:`${pct*100}%`, background: SUBJECT_COLOR[s] }} />
                </div>
                <div className="pc-footer">
                  <span className="pc-pct">{Math.round(pct*100)}%</span>
                  {all.length === 0 && <span className="pc-empty">Keine Aufgaben</span>}
                </div>
              </div>
            )
          })}
        </section>

        {/* ── Controls ── */}
        <div className="controls-row">
          <div className="search-wrap">
            <span className="search-icon">⌕</span>
            <input
              ref={titleRef === null ? null : undefined}
              className="search-input"
              type="text"
              placeholder="Suchen… (Tipp: / drücken)"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
          </div>
          <div className="view-toggle">
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Liste</button>
            <button className={view === 'week' ? 'active' : ''} onClick={() => setView('week')}>Woche</button>
          </div>
          {doneCount > 0 && (
            <button className="btn-clear-done" onClick={clearDone} title="Alle erledigten löschen">
              ✓ {doneCount} löschen
            </button>
          )}
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
                style={isActive && color ? { borderColor:color, color } : {}}
                onClick={() => setFilter(s)}
              >
                {color && <span className="dot" style={{ background:color }} />}
                {SUBJECT_SHORT[s] ?? s}
              </button>
            )
          })}
        </div>

        {/* ── Add Form ── */}
        <form className="form-card glass" onSubmit={handleSubmit}>
          <input
            ref={titleRef}
            className="input full"
            type="text"
            placeholder="Neue Aufgabe eingeben… (N drücken)"
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
            <select className="select" value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
            <div className="date-group">
              <input
                className="input"
                type="date"
                value={form.deadline}
                onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                required
              />
              <div className="date-shortcuts">
                <button type="button" onClick={() => setQuickDate(1)}  title="Morgen">+1T</button>
                <button type="button" onClick={() => setQuickDate(7)}  title="In einer Woche">+1W</button>
                <button type="button" onClick={() => setQuickDate(14)} title="In zwei Wochen">+2W</button>
              </div>
            </div>
            <button className="btn-add" type="submit">+ Hinzufügen</button>
          </div>
        </form>

        {/* ── Task List / Week View ── */}
        {view === 'list' ? (
          <ul className="task-list">
            {visible.length === 0 && (
              <li className="empty-state">
                {search ? `Keine Treffer für „${search}"` : 'Keine Aufgaben — weiter so! 🎉'}
              </li>
            )}
            {visible.map((task, i) => {
              const diff     = daysUntil(task.deadline)
              const overdue  = diff < 0  && !task.done
              const isToday  = diff === 0 && !task.done
              const soon     = diff >= 0 && diff <= 2 && !task.done
              const priority = task.priority ?? 'mittel'
              const dl       = deadlineLabel(task.deadline)
              const daysLbl  = task.done ? null
                : overdue  ? `${Math.abs(diff)}d überfällig`
                : isToday  ? 'Heute fällig!'
                : `${diff}d`
              return (
                <li
                  key={task.id}
                  style={{ '--i': Math.min(i, 10) }}
                  className={`task-item glass${task.done ? ' done' : ''}${overdue ? ' overdue' : isToday ? ' today-due' : soon ? ' soon' : ''}`}
                >
                  <div className="task-stripe" style={{ background: SUBJECT_COLOR[task.subject] }} />
                  <span className="prio-dot" style={{ background: PRIORITY_COLOR[priority] }}
                    title={`Priorität: ${priority}`} />
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
                      <span className={`tag deadline-tag${overdue ? ' overdue' : isToday ? ' today-due' : soon ? ' soon' : ''}`}>
                        {dl}{daysLbl && <span className="days-label"> · {daysLbl}</span>}
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

        {/* ── Spotify Player ── */}
        <div className={`spotify-bar glass${spotifyCollapsed ? ' collapsed' : ''}`}>
          <div className="spotify-toprow">
            <span className="spotify-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1db954">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
            </span>

            {spotifyEditing ? (
              <div className="spotify-edit">
                <input
                  className="spotify-input"
                  type="text"
                  placeholder="Spotify-URL (Playlist, Album, Track)…"
                  value={spotifyDraft}
                  onChange={e => setSpotifyDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveSpotify()}
                  autoFocus
                />
                <button className="sp-btn sp-ok" onClick={saveSpotify}>OK</button>
                <button className="sp-btn sp-x"  onClick={() => setSpotifyEditing(false)}>✕</button>
              </div>
            ) : (
              <>
                <span className="spotify-label">
                  {spotifyUrl ? 'Spotify Player' : 'Musik zum Lernen'}
                </span>
                <div className="spotify-actions">
                  <button className="sp-icon-btn" title="Playlist ändern"
                    onClick={() => { setSpotifyDraft(spotifyUrl); setSpotifyEditing(true) }}>
                    ✎
                  </button>
                  {embedUrl && (
                    <button className="sp-icon-btn" onClick={() => setSpotifyCollapsed(c => !c)}
                      title={spotifyCollapsed ? 'Aufklappen' : 'Einklappen'}>
                      {spotifyCollapsed ? '▲' : '▼'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {embedUrl && !spotifyCollapsed && (
            <iframe
              src={embedUrl}
              width="100%"
              height="152"
              frameBorder="0"
              allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
              loading="lazy"
              title="Spotify"
              className="spotify-iframe"
            />
          )}

          {!spotifyUrl && !spotifyEditing && (
            <button
              className="spotify-cta"
              onClick={() => { setSpotifyDraft(''); setSpotifyEditing(true) }}
            >
              + Playlist hinzufügen
            </button>
          )}
        </div>
      </div>
    </>
  )
}
