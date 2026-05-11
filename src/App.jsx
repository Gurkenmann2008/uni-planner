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
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(deadline); d.setHours(0, 0, 0, 0)
  return Math.round((d - today) / 86_400_000)
}

function deadlineLabel(deadline) {
  const d = new Date(deadline)
  const hasTime = deadline.includes('T')
  return hasTime
    ? d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function toDateStr(date) { return date.toISOString().slice(0, 10) }

function getWeekDays() {
  const today = new Date()
  const mon   = new Date(today)
  mon.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i); return d
  })
}

function toSpotifyUri(url) {
  if (!url) return ''
  const m = url.match(/open\.spotify\.com\/(playlist|album|track|episode|show)\/([a-zA-Z0-9]+)/)
  return m ? `spotify:${m[1]}:${m[2]}` : ''
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
            .filter(t => t.deadline.slice(0, 10) === ds)
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
                    title={`${t.title} – ${deadlineLabel(t.deadline)}`}
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

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks, setTasks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('uni-tasks') ?? '[]') }
    catch { return [] }
  })
  const [filter,   setFilter]   = useState('Alle')
  const [search,   setSearch]   = useState('')
  const [view,     setView]     = useState('list')
  const [form,     setForm]     = useState({
    title: '', type: 'Abgabe', deadline: '', subject: 'Mathe', priority: 'mittel',
  })

  // Spotify state
  const [spotifyUrl,       setSpotifyUrl]       = useState(() => localStorage.getItem('uni-spotify') ?? '')
  const [spotifyDraft,     setSpotifyDraft]     = useState('')
  const [spotifyEditing,   setSpotifyEditing]   = useState(false)
  const [spotifyCollapsed, setSpotifyCollapsed] = useState(false)
  const [volume,           setVolume]           = useState(80)
  const [muted,            setMuted]            = useState(false)

  const prevRef       = useRef(tasks)
  const controllerRef = useRef(null)
  const embedRef      = useRef(null)

  // Persist tasks + spotify URL
  useEffect(() => { localStorage.setItem('uni-tasks',   JSON.stringify(tasks)) }, [tasks])
  useEffect(() => { localStorage.setItem('uni-spotify', spotifyUrl)             }, [spotifyUrl])

  // Seed + aktualisiere Moodle-Tasks aus tasks.json
  // Vorhandene Moodle-Tasks werden mit frischen Daten überschrieben
  // (Fach, Deadline, Titel) — nur done-Status bleibt erhalten.
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}tasks.json`)
      .then(r => r.json())
      .then(fetched => {
        setTasks(prev => {
          const freshById = Object.fromEntries(fetched.map(t => [t.id, t]))
          // Manuelle Tasks unverändert lassen; Moodle-Tasks aktualisieren
          const updated = prev.map(t =>
            t.source === 'moodle' && freshById[t.id]
              ? { ...freshById[t.id], done: t.done }
              : t
          )
          // Wirklich neue Tasks (noch nicht in State) anhängen
          const existingIds = new Set(prev.map(t => t.id))
          const brandNew    = fetched.filter(t => !existingIds.has(t.id))
          return brandNew.length ? [...updated, ...brandNew] : updated
        })
      })
      .catch(() => {})
  }, [])

  // Confetti on full subject completion
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

  // Spotify iFrame API init
  useEffect(() => {
    const uri = toSpotifyUri(spotifyUrl)
    if (!uri) return

    function createPlayer(IFrameAPI) {
      if (!embedRef.current) return
      embedRef.current.innerHTML = ''
      IFrameAPI.createController(
        embedRef.current,
        { uri, width: '100%', height: '80' },
        ctrl => {
          controllerRef.current = ctrl
          ctrl.setVolume(volume / 100)
        }
      )
    }

    if (window.SpotifyIframeApi) {
      createPlayer(window.SpotifyIframeApi)
      return
    }

    const prevReady = window.onSpotifyIframeApiReady
    window.onSpotifyIframeApiReady = api => {
      window.SpotifyIframeApi = api
      if (prevReady) prevReady(api)
      createPlayer(api)
    }

    if (!document.querySelector('script[src*="spotify.com/embed/iframe-api"]')) {
      const s = document.createElement('script')
      s.src = 'https://open.spotify.com/embed/iframe-api/v1'
      document.body.appendChild(s)
    }
  }, [spotifyUrl])

  // Sync volume/mute to controller
  useEffect(() => {
    controllerRef.current?.setVolume(muted ? 0 : volume / 100)
  }, [volume, muted])

  // Handlers
  function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.deadline) return
    setTasks(prev => [...prev, { id: crypto.randomUUID(), ...form, done: false, createdAt: Date.now() }])
    setForm(f => ({ ...f, title: '', deadline: '' }))
  }
  const toggle = id => setTasks(p => p.map(t => t.id === id ? { ...t, done: !t.done } : t))
  const remove = id => setTasks(p => p.filter(t => t.id !== id))

  function saveSpotify() { setSpotifyUrl(spotifyDraft.trim()); setSpotifyEditing(false) }

  function toggleMute() {
    setMuted(m => !m)
  }

  // Derived
  const visible = sortTasks(
    tasks
      .filter(t => filter === 'Alle' || t.subject === filter)
      .filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()))
  )
  const today      = new Date()
  const dateLabel  = today.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const quote      = QUOTES[today.getDay()]
  const openCount  = tasks.filter(t => !t.done).length
  const hasSpotify = !!toSpotifyUri(spotifyUrl)

  return (
    <div className={`app${hasSpotify && !spotifyCollapsed ? ' has-player' : ''}`}>

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-row">
          <span className="header-date">{dateLabel}</span>
          <span className="header-badge">{openCount} offen</span>
        </div>
        <h1 className="header-title">Uni-Planer</h1>
        <p className="header-quote">„{quote}"</p>
      </header>

      {/* ── Subject Progress Bars ── */}
      <section className="progress-section">
        {SUBJECTS.map((s, i) => {
          const all  = tasks.filter(t => t.subject === s)
          const done = all.filter(t => t.done).length
          const pct  = all.length ? done / all.length : 0
          return (
            <div key={s} className="progress-card glass" style={{ '--i': i }}>
              <div className="pc-header">
                <span className="pc-name" style={{ color: SUBJECT_COLOR[s] }}>{SUBJECT_SHORT[s]}</span>
                <span className="pc-count">{done}/{all.length}</span>
              </div>
              <div className="pc-track">
                <div
                  className="pc-fill"
                  style={{ width: `${pct * 100}%`, background: SUBJECT_COLOR[s] }}
                />
              </div>
              <span className="pc-pct">{Math.round(pct * 100)}%</span>
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
            placeholder="Aufgaben suchen..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <button className="search-clear" onClick={() => setSearch('')}>×</button>}
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

      {/* ── Add Form ── */}
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
          <select className="select" value={form.priority}
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

      {/* ── List / Week View ── */}
      {view === 'list' ? (
        <ul className="task-list">
          {visible.length === 0 && (
            <li className="empty-state">
              {search ? `Keine Treffer für „${search}"` : 'Keine Aufgaben — weiter so! 🎉'}
            </li>
          )}
          {visible.map((task, i) => {
            const diff     = daysUntil(task.deadline)
            const overdue  = diff < 0 && !task.done
            const soon     = diff >= 0 && diff <= 2 && !task.done
            const priority = task.priority ?? 'mittel'
            const dl       = deadlineLabel(task.deadline)
            const daysLbl  = task.done ? null
              : overdue  ? `${Math.abs(diff)}d überfällig`
              : diff === 0 ? 'Heute'
              : `${diff}d`

            return (
              <li
                key={task.id}
                style={{ '--i': i }}
                className={`task-item glass${task.done ? ' done' : ''}${overdue ? ' overdue' : soon ? ' soon' : ''}`}
              >
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
          <span className="spotify-icon">♫</span>

          {spotifyEditing ? (
            <div className="spotify-edit">
              <input
                className="spotify-input"
                type="text"
                placeholder="Spotify-URL einfügen (Playlist, Album, Track)..."
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
              {hasSpotify && (
                <div className="volume-wrap">
                  <button
                    className="mute-btn"
                    onClick={toggleMute}
                    title={muted ? 'Ton an' : 'Ton aus'}
                  >
                    {muted || volume === 0 ? '🔇' : volume < 40 ? '🔉' : '🔊'}
                  </button>
                  <input
                    type="range"
                    min="0" max="100"
                    value={muted ? 0 : volume}
                    onChange={e => { setMuted(false); setVolume(Number(e.target.value)) }}
                    className="volume-slider"
                    title={`Lautstärke: ${muted ? 0 : volume}%`}
                  />
                  <span className="volume-label">{muted ? 0 : volume}%</span>
                </div>
              )}
              <button
                className="spotify-label-btn"
                onClick={() => { setSpotifyDraft(spotifyUrl); setSpotifyEditing(true) }}
              >
                {spotifyUrl ? 'wechseln' : '+ Playlist hinzufügen'}
              </button>
              {hasSpotify && (
                <button className="spotify-collapse" onClick={() => setSpotifyCollapsed(c => !c)}>
                  {spotifyCollapsed ? '▲' : '▼'}
                </button>
              )}
            </>
          )}
        </div>

        {/* Spotify iFrame API target – immer im DOM wenn URL gesetzt */}
        {hasSpotify && (
          <div
            ref={embedRef}
            className={`spotify-embed-target${spotifyCollapsed ? ' hidden' : ''}`}
          />
        )}
      </div>
    </div>
  )
}
