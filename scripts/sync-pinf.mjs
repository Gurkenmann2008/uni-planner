#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs'

const REPO  = 'pi2-tuebingen-teams/team109_zhanghuiran619-sys_Gurkenmann2008'
const TOKEN = process.env.PINF_REPO_TOKEN

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}: ${path}`)
  return res.json()
}

async function main() {
  if (!TOKEN) throw new Error('PINF_REPO_TOKEN nicht gesetzt')

  // 1. Sheet-Ordner ermitteln
  const root   = await api(`/repos/${REPO}/contents`)
  const sheets = root
    .filter(f => f.type === 'dir' && /^sheet\d+$/.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
  console.log(`${sheets.length} Sheet-Ordner gefunden: ${sheets.map(s => s.name).join(', ')}`)

  // 2. CI-Ergebnisse pro Sheet aus dem letzten Workflow-Run
  const testPassed = await fetchTestResults()

  // 3. Jede Sheet-README parsen → Task erzeugen
  const fresh = []
  for (const sheet of sheets) {
    const num = sheet.name.replace('sheet', '')  // "01", "02", ...
    try {
      const file    = await api(`/repos/${REPO}/contents/${sheet.name}/README.md`)
      const content = Buffer.from(file.content, 'base64').toString('utf8')

      const deadline = parseDeadline(content)
      if (!deadline) {
        console.log(`  ${sheet.name}: kein Deadline-Datum gefunden – übersprungen`)
        continue
      }

      const title   = parseTitle(content, num)
      const isDone  = testPassed[num] === true

      fresh.push({
        id:      `pinf-${sheet.name}`,
        title,
        type:    'Abgabe',
        subject: 'Praktische Informatik',
        deadline,
        done:    isDone,
        source:  'pinf',
      })
      console.log(`  ${sheet.name}: "${title}" → ${deadline} (${isDone ? '✓ bestanden' : '○ offen'})`)
    } catch (e) {
      console.warn(`  ${sheet.name}: ${e.message}`)
    }
  }

  console.log(`${fresh.length} PInf-Aufgaben geparst`)

  // 4. Mit bestehender tasks.json mergen (done-Status erhalten)
  const existing = existsSync('public/tasks.json')
    ? JSON.parse(readFileSync('public/tasks.json', 'utf8'))
    : []

  const doneById = Object.fromEntries(
    existing.filter(t => t.source === 'pinf' && t.done).map(t => [t.id, true])
  )
  const nonPinf = existing.filter(t => t.source !== 'pinf')

  // done = true wenn CI bestanden ODER vorher manuell als erledigt markiert
  const merged = [
    ...nonPinf,
    ...fresh.map(t => ({ ...t, done: t.done || (doneById[t.id] ?? false) })),
  ]

  writeFileSync('public/tasks.json', JSON.stringify(merged, null, 2) + '\n')
  console.log(`tasks.json geschrieben (${merged.length} Aufgaben gesamt)`)
}

// ── CI-Status pro Sheet ───────────────────────────────────────────────────────

async function fetchTestResults() {
  try {
    const runs = await api(`/repos/${REPO}/actions/runs?per_page=1&status=completed`)
    const run  = runs.workflow_runs?.[0]
    if (!run) return {}

    const jobs = await api(`/repos/${REPO}/actions/runs/${run.id}/jobs`)
    const results = {}
    for (const job of jobs.jobs) {
      // Job-Namen wie "test (01)", "test (02)"
      const m = job.name.match(/test\s*\((\d+)\)/)
      if (m) results[m[1]] = job.conclusion === 'success'
    }
    console.log('CI-Ergebnisse:', JSON.stringify(results))
    return results
  } catch (e) {
    console.warn(`CI-Status nicht abrufbar: ${e.message}`)
    return {}
  }
}

// ── Deadline-Parser ───────────────────────────────────────────────────────────

function parseDeadline(content) {
  // Primär: "DD.MM.YYYY um HH:MM" → als Date speichern
  // Bsp: "15.05.2026 um 23:59" oder "Freitag, 15.05.2026 um 23:59"
  const withDate = content.match(/(\d{1,2})\.(\d{2})\.(\d{4})\s+um\s+(\d{1,2}):(\d{2})/)
  if (withDate) {
    const [, d, mo, y, h, mi] = withDate
    // Berlin CEST = UTC+2 → 23:59 lokal = 21:59 UTC
    const utcH = String(Math.max(0, Number(h) - 2)).padStart(2, '0')
    return `${y}-${mo}-${d.padStart(2,'0')}T${utcH}:${mi}:00Z`
  }

  // Fallback: Nur "YYYY-MM-DD" wenn nur das Datum angegeben ist
  const dateOnly = content.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (dateOnly) return dateOnly[0]

  return null
}

function parseTitle(content, num) {
  // Aus der ersten Überschrift: "# Hausaufgabenblatt 03" → "Hausaufgabenblatt 03"
  const h1 = content.match(/^#\s+(.+)/m)
  if (h1) return h1[1].trim()
  return `P.Inf Sheet ${num}`
}

main().catch(err => { console.error(err.message); process.exit(1) })
