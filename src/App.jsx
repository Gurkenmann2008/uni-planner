import { useState, useEffect, useRef, useCallback, memo } from 'react'
import confetti from 'canvas-confetti'
import './App.css'

// ── Constants ─────────────────────────────────────────────────────────────────

const SUBJECTS   = ['Mathe', 'Praktische Informatik', 'Theoretische Informatik', 'GdI']
const TYPES      = ['Abgabe', 'To-Do', 'Lesen', 'Klausur']
const PRIORITIES = ['hoch', 'mittel', 'niedrig']

const SC = {                           // Subject Colors
  Mathe:                     '#60a5fa',
  'Praktische Informatik':   '#34d399',
  'Theoretische Informatik': '#fbbf24',
  GdI:                       '#f87171',
}
const SS = {                           // Subject Short
  Mathe:'Mathe','Praktische Informatik':'P.Inf','Theoretische Informatik':'T.Inf',GdI:'GdI',
}
const PC = { hoch:'#f87171', mittel:'#fbbf24', niedrig:'#34d399' }
const PL = { hoch:'↑ Hoch',  mittel:'→ Mittel', niedrig:'↓ Niedrig' }
const TI = { Abgabe:'📤', 'To-Do':'✅', Lesen:'📖', Klausur:'📝' }
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

function daysUntil(dl) {
  const t = new Date(); t.setHours(0,0,0,0)
  const d = new Date(dl); d.setHours(0,0,0,0)
  return Math.round((d-t)/86_400_000)
}
function dlLabel(dl) {
  const d = new Date(dl), hasTime = dl.includes('T')
  return hasTime
    ? d.toLocaleString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})
    : d.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'})
}
function isoDate(n=0) { const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10) }
function toDateStr(d)  { return d.toISOString().slice(0,10) }
function getWeekDays() {
  const t=new Date(), m=new Date(t)
  m.setDate(t.getDate()-((t.getDay()+6)%7))
  return Array.from({length:7},(_,i)=>{ const d=new Date(m); d.setDate(m.getDate()+i); return d })
}
function toSpotifyUri(url) {
  if (!url) return ''
  const m = url.match(/open\.spotify\.com\/(playlist|album|track|episode|show)\/([a-zA-Z0-9]+)/)
  return m ? `spotify:${m[1]}:${m[2]}` : ''
}
function toEmbedUrl(url) {
  if (!url) return ''
  const m = url.match(/open\.spotify\.com\/(playlist|album|track|episode|show)\/([a-zA-Z0-9]+)/)
  return m ? `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0` : ''
}
function sortTasks(arr) {
  const p={hoch:0,mittel:1,niedrig:2}
  return [...arr].sort((a,b)=>{
    if(a.done!==b.done) return a.done?1:-1
    const pd=(p[a.priority??'mittel'])-(p[b.priority??'mittel'])
    if(pd!==0) return pd
    return new Date(a.deadline)-new Date(b.deadline)
  })
}
function fmt(n) { return n<1024?`${n}B`:n<1048576?`${(n/1024).toFixed(0)}KB`:`${(n/1048576).toFixed(1)}MB` }

// ── IndexedDB for file storage ────────────────────────────────────────────────

let _db = null
async function getDB() {
  if (_db) return _db
  return new Promise((res,rej)=>{
    const req = indexedDB.open('uni-planer-files',1)
    req.onupgradeneeded = () => req.result.createObjectStore('files',{keyPath:'id'})
    req.onsuccess = () => { _db=req.result; res(_db) }
    req.onerror   = () => rej(req.error)
  })
}
async function dbSave(subject, file) {
  const db=await getDB(), id=crypto.randomUUID()
  return new Promise((res,rej)=>{
    const tx=db.transaction('files','readwrite')
    tx.objectStore('files').add({id,subject,name:file.name,type:file.type,size:file.size,blob:file,addedAt:Date.now()})
    tx.oncomplete=()=>res(id); tx.onerror=()=>rej(tx.error)
  })
}
async function dbGetAll() {
  const db=await getDB()
  return new Promise((res,rej)=>{
    const req=db.transaction('files','readonly').objectStore('files').getAll()
    req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error)
  })
}
async function dbDelete(id) {
  const db=await getDB()
  return new Promise((res,rej)=>{
    const tx=db.transaction('files','readwrite')
    tx.objectStore('files').delete(id)
    tx.oncomplete=res; tx.onerror=()=>rej(tx.error)
  })
}

// ── Animated Background ───────────────────────────────────────────────────────

function AnimatedBg() {
  return (
    <div className="anim-bg" aria-hidden>
      <div className="blob b1"/><div className="blob b2"/>
      <div className="blob b3"/><div className="blob b4"/>
    </div>
  )
}

// ── Spotify Player (memoized to avoid re-renders destroying the embed) ────────

const SpotifyPlayer = memo(function SpotifyPlayer({ url, volume, muted, collapsed }) {
  const divRef  = useRef(null)
  const ctrlRef = useRef(null)

  useEffect(() => {
    if (window.SpotifyIframeApi || document.getElementById('sp-api-script')) return
    window.onSpotifyIframeApiReady = api => { window.SpotifyIframeApi = api }
    const s = Object.assign(document.createElement('script'), {
      id: 'sp-api-script', src: 'https://open.spotify.com/embed/iframe-api/v1',
    })
    document.head.appendChild(s)
  }, [])

  useEffect(() => {
    const uri = toSpotifyUri(url)
    if (!uri || !divRef.current) return
    let cancelled = false

    function init(api) {
      if (cancelled || !divRef.current) return
      divRef.current.innerHTML = ''
      api.createController(divRef.current, { uri, width:'100%', height:'80' }, ctrl => {
        ctrlRef.current = ctrl
        ctrl.addListener('ready', () => {
          if (!cancelled) ctrl.setVolume(muted ? 0 : volume/100)
        })
      })
    }

    if (window.SpotifyIframeApi) { init(window.SpotifyIframeApi) }
    else {
      const prev = window.onSpotifyIframeApiReady
      window.onSpotifyIframeApiReady = api => {
        window.SpotifyIframeApi = api
        prev?.(api)
        init(api)
      }
    }
    return () => { cancelled = true }
  }, [url])

  useEffect(() => {
    ctrlRef.current?.setVolume(muted ? 0 : volume/100)
  }, [volume, muted])

  return (
    <div
      ref={divRef}
      className="sp-embed"
      style={{ display: url && !collapsed ? 'block' : 'none' }}
    />
  )
})

// ── Week View ─────────────────────────────────────────────────────────────────

function WeekView({ tasks, filter, onToggle }) {
  const days=getWeekDays(), todayStr=toDateStr(new Date())
  return (
    <div className="week-view">
      {days.map(day=>{
        const ds=toDateStr(day), isToday=ds===todayStr
        const cols=sortTasks(tasks.filter(t=>t.deadline.slice(0,10)===ds&&(filter==='Alle'||t.subject===filter)))
        return (
          <div key={ds} className={`week-col${isToday?' today':''}`}>
            <div className="week-col-hdr">
              <span className="wdn">{day.toLocaleDateString('de-DE',{weekday:'short'})}</span>
              <span className="wdd">{day.getDate()}</span>
            </div>
            <div className="week-col-body">
              {cols.length===0
                ? <span className="week-empty">–</span>
                : cols.map(t=>(
                  <button key={t.id} className={`week-task${t.done?' done':''}`}
                    style={{borderLeftColor:SC[t.subject]}} onClick={()=>onToggle(t.id)}
                    title={`${t.title} – ${dlLabel(t.deadline)}`}>
                    {t.priority==='hoch'&&<span className="week-prio" style={{background:PC.hoch}}/>}
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

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ tasks }) {
  const overdue = tasks.filter(t=>!t.done&&daysUntil(t.deadline)<0)
  const today   = tasks.filter(t=>!t.done&&daysUntil(t.deadline)===0)
  const week    = tasks.filter(t=>!t.done&&daysUntil(t.deadline)>0&&daysUntil(t.deadline)<=7)
  const done    = tasks.filter(t=>t.done)
  const upcoming = sortTasks(tasks.filter(t=>!t.done&&daysUntil(t.deadline)<=14&&daysUntil(t.deadline)>=-3))

  return (
    <div className="tab-content overview-tab">
      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card glass" style={{'--accent-c':'#f87171'}}>
          <span className="stat-num" style={{color:overdue.length>0?'#f87171':'var(--text)'}}>
            {overdue.length}
          </span>
          <span className="stat-lbl">Überfällig</span>
        </div>
        <div className="stat-card glass" style={{'--accent-c':'#fbbf24'}}>
          <span className="stat-num" style={{color:today.length>0?'#fbbf24':'var(--text)'}}>
            {today.length}
          </span>
          <span className="stat-lbl">Heute fällig</span>
        </div>
        <div className="stat-card glass">
          <span className="stat-num">{week.length}</span>
          <span className="stat-lbl">Diese Woche</span>
        </div>
        <div className="stat-card glass" style={{'--accent-c':'var(--accent)'}}>
          <span className="stat-num" style={{color:'var(--accent)'}}>{done.length}</span>
          <span className="stat-lbl">Erledigt</span>
        </div>
      </div>

      {/* Subject Progress */}
      <div className="ov-section">
        <h2 className="ov-title">Fortschritt</h2>
        <div className="ov-progress">
          {SUBJECTS.map(s=>{
            const all=tasks.filter(t=>t.subject===s)
            const d=all.filter(t=>t.done).length
            const pct=all.length?d/all.length:0
            return (
              <div key={s} className="ov-prog-row">
                <span className="ov-prog-name" style={{color:SC[s]}}>{SS[s]}</span>
                <div className="ov-prog-track">
                  <div className="ov-prog-fill" style={{width:`${pct*100}%`,background:SC[s]}}/>
                </div>
                <span className="ov-prog-stat">{d}/{all.length}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Upcoming */}
      <div className="ov-section">
        <h2 className="ov-title">Nächste Abgaben</h2>
        {upcoming.length===0
          ? <p className="ov-empty">Keine anstehenden Aufgaben 🎉</p>
          : upcoming.map(t=>{
              const diff=daysUntil(t.deadline)
              const overdue=diff<0, isToday=diff===0
              return (
                <div key={t.id} className={`ov-task glass${overdue?' overdue':isToday?' today-due':diff<=2?' soon':''}`}>
                  <div className="ov-task-stripe" style={{background:SC[t.subject]}}/>
                  <div className="ov-task-body">
                    <span className="ov-task-title">{t.title}</span>
                    <div className="ov-task-meta">
                      <span style={{color:SC[t.subject],fontWeight:700,fontSize:'.75rem'}}>{SS[t.subject]}</span>
                      <span className="ov-task-dl">
                        {dlLabel(t.deadline)}
                        <span className={`ov-days${overdue?' over':isToday?' today':''}`}>
                          {' '}·{' '}{overdue?`${Math.abs(diff)}d überfällig`:isToday?'Heute!':diff===1?'Morgen':`${diff}d`}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
        }
      </div>
    </div>
  )
}

// ── To-Dos Tab ────────────────────────────────────────────────────────────────

function TodosTab({ todos, setTodos }) {
  const [input, setInput] = useState('')

  function add(e) {
    e.preventDefault()
    if (!input.trim()) return
    setTodos(p=>[...p,{id:crypto.randomUUID(),text:input.trim(),done:false,createdAt:Date.now()}])
    setInput('')
  }
  function toggle(id) { setTodos(p=>p.map(t=>t.id===id?{...t,done:!t.done}:t)) }
  function remove(id) { setTodos(p=>p.filter(t=>t.id!==id)) }
  function clearDone() { setTodos(p=>p.filter(t=>!t.done)) }

  const open  = todos.filter(t=>!t.done)
  const done  = todos.filter(t=>t.done)

  return (
    <div className="tab-content todos-tab">
      <div className="todos-header">
        <h2 className="tab-section-title">Persönliche To-Dos</h2>
        {done.length>0&&(
          <button className="btn-clear-done" onClick={clearDone}>✓ {done.length} löschen</button>
        )}
      </div>

      <form className="todo-form glass" onSubmit={add}>
        <input
          className="input full"
          type="text"
          placeholder="Neue To-Do hinzufügen…"
          value={input}
          onChange={e=>setInput(e.target.value)}
          autoFocus
        />
        <button className="btn-add" type="submit">+ Hinzufügen</button>
      </form>

      {todos.length===0 && (
        <div className="empty-state">Noch keine To-Dos. Füge deine erste hinzu!</div>
      )}

      {open.length>0&&(
        <ul className="todo-list">
          {open.map((t,i)=>(
            <li key={t.id} className="todo-item glass" style={{'--i':i}}>
              <label className="checkbox-wrap">
                <input type="checkbox" checked={false} onChange={()=>toggle(t.id)}/>
                <span className="checkmark"/>
              </label>
              <span className="todo-text">{t.text}</span>
              <button className="delete-btn" onClick={()=>remove(t.id)}>×</button>
            </li>
          ))}
        </ul>
      )}

      {done.length>0&&(
        <>
          <div className="done-section-lbl">Erledigt ({done.length})</div>
          <ul className="todo-list">
            {done.map(t=>(
              <li key={t.id} className="todo-item done glass">
                <label className="checkbox-wrap">
                  <input type="checkbox" checked={true} onChange={()=>toggle(t.id)}/>
                  <span className="checkmark"/>
                </label>
                <span className="todo-text">{t.text}</span>
                <button className="delete-btn" onClick={()=>remove(t.id)}>×</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

// ── Dateien Tab ───────────────────────────────────────────────────────────────

function DateienTab({ tasks }) {
  const [files,    setFiles]    = useState([])
  const [urlInput, setUrlInput] = useState({})
  const [showUrl,  setShowUrl]  = useState({})
  const [dragging, setDragging] = useState(null)

  useEffect(()=>{
    dbGetAll().then(setFiles).catch(()=>{})
  },[])

  async function handleFiles(subject, fileList) {
    const added=[]
    for(const file of fileList){
      await dbSave(subject, file)
      added.push(file)
    }
    const fresh=await dbGetAll()
    setFiles(fresh)
  }

  async function handleUrlAdd(subject) {
    const url=(urlInput[subject]??'').trim()
    if(!url) return
    const name = url.split('/').pop() || url.slice(0,40)
    const blob = new Blob([url],{type:'text/uri-list'})
    const file = new File([blob],`${name}.url`,{type:'text/uri-list'})
    await dbSave(subject, file)
    setFiles(await dbGetAll())
    setUrlInput(u=>({...u,[subject]:''}))
    setShowUrl(u=>({...u,[subject]:false}))
  }

  async function del(id) {
    await dbDelete(id)
    setFiles(f=>f.filter(x=>x.id!==id))
  }

  function open(f) {
    if(f.type==='text/uri-list'){
      f.blob.text().then(url=>window.open(url,'_blank'))
    } else {
      const url=URL.createObjectURL(f.blob)
      window.open(url,'_blank')
    }
  }

  // PInf: collect GitHub links from tasks
  const pinfLinks = tasks.filter(t=>t.source==='pinf'&&t.sheetUrl)
    .map(t=>({id:`gh-${t.id}`, name:t.title, url:t.sheetUrl, isGithub:true}))

  return (
    <div className="tab-content dateien-tab">
      {SUBJECTS.map(subject=>{
        const subjectFiles = files.filter(f=>f.subject===subject)
        const ghLinks = subject==='Praktische Informatik' ? pinfLinks : []
        return (
          <div key={subject} className="dateien-subject glass">
            <div className="dateien-subject-hdr">
              <span className="dateien-subject-name" style={{color:SC[subject]}}>{SS[subject]}</span>
              <div className="dateien-actions">
                <button className="btn-dateien-action"
                  onClick={()=>setShowUrl(u=>({...u,[subject]:!u[subject]}))}>
                  + URL
                </button>
                <label className="btn-dateien-action">
                  + Datei
                  <input type="file" multiple style={{display:'none'}} accept=".pdf,.java,.md,.txt,.zip,.png,.jpg"
                    onChange={e=>handleFiles(subject,[...e.target.files]).then(()=>e.target.value='')}/>
                </label>
              </div>
            </div>

            {showUrl[subject]&&(
              <div className="url-input-row">
                <input className="input" type="url" placeholder="https://…"
                  value={urlInput[subject]??''}
                  onChange={e=>setUrlInput(u=>({...u,[subject]:e.target.value}))}
                  onKeyDown={e=>e.key==='Enter'&&handleUrlAdd(subject)}/>
                <button className="btn-add" onClick={()=>handleUrlAdd(subject)}>OK</button>
              </div>
            )}

            {/* GitHub auto-links */}
            {ghLinks.map(l=>(
              <div key={l.id} className="file-row github-link">
                <span className="file-icon">🔗</span>
                <span className="file-name">{l.name}</span>
                <span className="file-badge">GitHub</span>
                <button className="file-btn" onClick={()=>window.open(l.url,'_blank')}>Öffnen</button>
              </div>
            ))}

            {/* Uploaded files */}
            {subjectFiles.length===0&&ghLinks.length===0&&(
              <div
                className={`drop-zone${dragging===subject?' drag-over':''}`}
                onDragOver={e=>{e.preventDefault();setDragging(subject)}}
                onDragLeave={()=>setDragging(null)}
                onDrop={e=>{e.preventDefault();setDragging(null);handleFiles(subject,[...e.dataTransfer.files])}}
              >
                Datei hier hineinziehen oder oben hochladen
              </div>
            )}

            {subjectFiles.map(f=>(
              <div key={f.id} className="file-row">
                <span className="file-icon">{f.type==='text/uri-list'?'🔗':f.type==='application/pdf'?'📄':'📁'}</span>
                <div className="file-info">
                  <span className="file-name">{f.name.replace('.url','')}</span>
                  <span className="file-meta">{fmt(f.size)} · {new Date(f.addedAt).toLocaleDateString('de-DE')}</span>
                </div>
                <button className="file-btn" onClick={()=>open(f)}>Öffnen</button>
                <button className="file-btn danger" onClick={()=>del(f.id)}>✕</button>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [tasks,  setTasks]  = useState(()=>{ try{return JSON.parse(localStorage.getItem('uni-tasks')?? '[]')}catch{return []} })
  const [todos,  setTodos]  = useState(()=>{ try{return JSON.parse(localStorage.getItem('uni-todos') ?? '[]')}catch{return []} })
  const [filter, setFilter] = useState('Alle')
  const [search, setSearch] = useState('')
  const [view,   setView]   = useState('list')
  const [tab,    setTab]    = useState('uebersicht')
  const [form,   setForm]   = useState({title:'',type:'Abgabe',deadline:'',subject:'Mathe',priority:'mittel'})

  // Spotify
  const [spUrl,       setSpUrl]       = useState(()=>localStorage.getItem('uni-spotify')??'')
  const [spDraft,     setSpDraft]     = useState('')
  const [spEditing,   setSpEditing]   = useState(false)
  const [spCollapsed, setSpCollapsed] = useState(false)
  const [volume,      setVolume]      = useState(()=>Number(localStorage.getItem('uni-vol')??80))
  const [muted,       setMuted]       = useState(false)

  const prevRef  = useRef(tasks)
  const titleRef = useRef(null)

  // Persist
  useEffect(()=>{ localStorage.setItem('uni-tasks', JSON.stringify(tasks)) },[tasks])
  useEffect(()=>{ localStorage.setItem('uni-todos', JSON.stringify(todos)) },[todos])
  useEffect(()=>{ localStorage.setItem('uni-spotify', spUrl)               },[spUrl])
  useEffect(()=>{ localStorage.setItem('uni-vol', String(volume))           },[volume])

  // Seed / update from tasks.json
  useEffect(()=>{
    fetch(`${import.meta.env.BASE_URL}tasks.json`)
      .then(r=>r.json())
      .then(fetched=>{
        setTasks(prev=>{
          const byId = Object.fromEntries(fetched.map(t=>[t.id,t]))
          const updated = prev.map(t=>t.source==='moodle'&&byId[t.id]?{...byId[t.id],done:t.done}:t.source==='pinf'&&byId[t.id]?{...byId[t.id],done:t.done}:t)
          const existIds = new Set(prev.map(t=>t.id))
          const brandNew = fetched.filter(t=>!existIds.has(t.id))
          return brandNew.length?[...updated,...brandNew]:updated
        })
      })
      .catch(()=>{})
  },[])

  // Confetti
  useEffect(()=>{
    SUBJECTS.forEach(s=>{
      const curr=tasks.filter(t=>t.subject===s), prev=prevRef.current.filter(t=>t.subject===s)
      if(curr.length>0&&curr.every(t=>t.done)&&!(prev.length>0&&prev.every(t=>t.done)))
        confetti({particleCount:130,spread:80,origin:{y:.45},colors:[SC[s],'#fff','#ffd700']})
    })
    prevRef.current=tasks
  },[tasks])

  // Keyboard shortcuts
  useEffect(()=>{
    const h=e=>{
      if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT') return
      if(e.key==='/'||e.key==='n'||e.key==='N'){e.preventDefault();setTab('aufgaben');setTimeout(()=>titleRef.current?.focus(),50)}
    }
    window.addEventListener('keydown',h)
    return ()=>window.removeEventListener('keydown',h)
  },[])

  // Handlers
  function submit(e){
    e.preventDefault()
    if(!form.title.trim()||!form.deadline) return
    setTasks(p=>[...p,{id:crypto.randomUUID(),...form,done:false,createdAt:Date.now()}])
    setForm(f=>({...f,title:'',deadline:''}))
    titleRef.current?.focus()
  }
  const toggle    = id=>setTasks(p=>p.map(t=>t.id===id?{...t,done:!t.done}:t))
  const remove    = id=>setTasks(p=>p.filter(t=>t.id!==id))
  const clearDone = ()=>setTasks(p=>p.filter(t=>!t.done))

  const visible = sortTasks(
    tasks.filter(t=>filter==='Alle'||t.subject===filter)
         .filter(t=>!search||t.title.toLowerCase().includes(search.toLowerCase()))
  )
  const doneCount = tasks.filter(t=>t.done).length
  const openCount = tasks.length-doneCount
  const today     = new Date()
  const embedUrl  = toEmbedUrl(spUrl)
  const hasPlayer = !!embedUrl&&!spCollapsed

  const TABS = [
    {id:'uebersicht', label:'Übersicht', icon:'◈'},
    {id:'aufgaben',   label:'Aufgaben',  icon:'≡'},
    {id:'todos',      label:'To-Dos',    icon:'✓'},
    {id:'dateien',    label:'Dateien',   icon:'⊞'},
  ]

  return (
    <>
      <AnimatedBg/>
      <div className={`app${hasPlayer?' has-player':''}`}>

        {/* ── Top Header ── */}
        <header className="app-header">
          <div className="app-header-top">
            <div className="app-title-block">
              <h1 className="header-title">Uni-Planer</h1>
              <span className="header-date">{today.toLocaleDateString('de-DE',{weekday:'long',day:'numeric',month:'long'})}</span>
            </div>
            <div className="header-pills">
              <span className="header-badge">{openCount} offen</span>
            </div>
          </div>

          {/* Tab Nav */}
          <nav className="tab-nav">
            {TABS.map(t=>(
              <button key={t.id} className={`tab-btn${tab===t.id?' active':''}`} onClick={()=>setTab(t.id)}>
                <span className="tab-icon">{t.icon}</span>
                <span className="tab-label">{t.label}</span>
              </button>
            ))}
          </nav>
        </header>

        {/* ── Tab Content ── */}
        {tab==='uebersicht' && <OverviewTab tasks={tasks}/>}

        {tab==='aufgaben' && (
          <div className="tab-content">
            {/* Controls */}
            <div className="controls-row">
              <div className="search-wrap">
                <span className="search-icon">⌕</span>
                <input className="search-input" type="text" placeholder="Suchen… (/ drücken)"
                  value={search} onChange={e=>setSearch(e.target.value)}/>
                {search&&<button className="search-clear" onClick={()=>setSearch('')}>×</button>}
              </div>
              <div className="view-toggle">
                <button className={view==='list'?'active':''} onClick={()=>setView('list')}>Liste</button>
                <button className={view==='week'?'active':''} onClick={()=>setView('week')}>Woche</button>
              </div>
              {doneCount>0&&<button className="btn-clear-done" onClick={clearDone}>✓ {doneCount} löschen</button>}
            </div>

            {/* Filters */}
            <div className="filter-bar">
              {['Alle',...SUBJECTS].map(s=>{
                const isActive=filter===s, color=SC[s]
                return (
                  <button key={s} className={`filter-btn${isActive?' active':''}`}
                    style={isActive&&color?{borderColor:color,color}:{}} onClick={()=>setFilter(s)}>
                    {color&&<span className="dot" style={{background:color}}/>}
                    {SS[s]??s}
                  </button>
                )
              })}
            </div>

            {/* Form */}
            <form className="form-card glass" onSubmit={submit}>
              <input ref={titleRef} className="input full" type="text"
                placeholder="Neue Aufgabe eingeben… (N drücken)"
                value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} required/>
              <div className="form-row">
                <select className="select" value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))}>
                  {SUBJECTS.map(s=><option key={s}>{s}</option>)}
                </select>
                <select className="select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                  {TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
                <select className="select" value={form.priority} onChange={e=>setForm(f=>({...f,priority:e.target.value}))}>
                  {PRIORITIES.map(p=><option key={p} value={p}>{PL[p]}</option>)}
                </select>
                <div className="date-group">
                  <input className="input" type="date" value={form.deadline}
                    onChange={e=>setForm(f=>({...f,deadline:e.target.value}))} required/>
                  <div className="date-shortcuts">
                    <button type="button" onClick={()=>setForm(f=>({...f,deadline:isoDate(1)}))}>+1T</button>
                    <button type="button" onClick={()=>setForm(f=>({...f,deadline:isoDate(7)}))}>+1W</button>
                    <button type="button" onClick={()=>setForm(f=>({...f,deadline:isoDate(14)}))}>+2W</button>
                  </div>
                </div>
                <button className="btn-add" type="submit">+ Hinzufügen</button>
              </div>
            </form>

            {/* List or Week */}
            {view==='list' ? (
              <ul className="task-list">
                {visible.length===0&&<li className="empty-state">{search?`Keine Treffer für „${search}"`:'Keine Aufgaben — weiter so! 🎉'}</li>}
                {visible.map((t,i)=>{
                  const diff=daysUntil(t.deadline), overdue=diff<0&&!t.done
                  const isToday=diff===0&&!t.done, soon=diff>=0&&diff<=2&&!t.done
                  const prio=t.priority??'mittel'
                  const daysLbl=t.done?null:overdue?`${Math.abs(diff)}d überfällig`:isToday?'Heute fällig!':diff===1?'Morgen':`${diff}d`
                  return (
                    <li key={t.id} style={{'--i':Math.min(i,10)}}
                      className={`task-item glass${t.done?' done':''}${overdue?' overdue':isToday?' today-due':soon?' soon':''}`}>
                      <div className="task-stripe" style={{background:SC[t.subject]}}/>
                      <span className="prio-dot" style={{background:PC[prio]}} title={`Priorität: ${prio}`}/>
                      <label className="checkbox-wrap">
                        <input type="checkbox" checked={t.done} onChange={()=>toggle(t.id)}/>
                        <span className="checkmark"/>
                      </label>
                      <div className="task-body">
                        <span className="task-title">{t.title}</span>
                        <div className="task-meta">
                          <span className="tag subject-tag" style={{color:SC[t.subject]}}>{SS[t.subject]??t.subject}</span>
                          <span className="tag type-tag">{TI[t.type]} {t.type}</span>
                          <span className={`tag deadline-tag${overdue?' overdue':isToday?' today-due':soon?' soon':''}`}>
                            {dlLabel(t.deadline)}{daysLbl&&<span className="days-label"> · {daysLbl}</span>}
                          </span>
                        </div>
                      </div>
                      <button className="delete-btn" onClick={()=>remove(t.id)} title="Löschen">×</button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <WeekView tasks={tasks} filter={filter} onToggle={toggle}/>
            )}
          </div>
        )}

        {tab==='todos'   && <TodosTab  todos={todos} setTodos={setTodos}/>}
        {tab==='dateien' && <DateienTab tasks={tasks}/>}

        {/* ── Spotify Player ── */}
        <div className={`spotify-bar glass${spCollapsed?' collapsed':''}`}>
          <div className="sp-toprow">
            <span className="sp-logo">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#1db954">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
            </span>

            {spEditing ? (
              <div className="sp-edit">
                <input className="sp-url-input" type="text"
                  placeholder="Spotify-URL (Playlist, Album, Track)…"
                  value={spDraft} onChange={e=>setSpDraft(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&(setSpUrl(spDraft.trim()),setSpEditing(false))}
                  autoFocus/>
                <button className="sp-btn sp-ok" onClick={()=>{setSpUrl(spDraft.trim());setSpEditing(false)}}>OK</button>
                <button className="sp-btn sp-x"  onClick={()=>setSpEditing(false)}>✕</button>
              </div>
            ) : (
              <>
                {spUrl ? (
                  <div className="sp-vol-row">
                    <button className="sp-mute" onClick={()=>setMuted(m=>!m)}>
                      {muted||volume===0?'🔇':volume<40?'🔉':'🔊'}
                    </button>
                    <input type="range" min="0" max="100" value={muted?0:volume}
                      className="sp-slider"
                      onChange={e=>{setMuted(false);setVolume(Number(e.target.value))}}/>
                    <span className="sp-vol-label">{muted?0:volume}%</span>
                  </div>
                ) : (
                  <span className="sp-label">Musik zum Lernen</span>
                )}
                <div className="sp-actions">
                  <button className="sp-icon-btn" onClick={()=>{setSpDraft(spUrl);setSpEditing(true)}} title="URL ändern">✎</button>
                  {embedUrl&&<button className="sp-icon-btn" onClick={()=>setSpCollapsed(c=>!c)}>{spCollapsed?'▲':'▼'}</button>}
                </div>
              </>
            )}
          </div>

          <SpotifyPlayer url={spUrl} volume={volume} muted={muted} collapsed={spCollapsed}/>

          {!spUrl&&!spEditing&&(
            <button className="sp-cta" onClick={()=>{setSpDraft('');setSpEditing(true)}}>
              + Playlist hinzufügen
            </button>
          )}
        </div>
      </div>
    </>
  )
}
