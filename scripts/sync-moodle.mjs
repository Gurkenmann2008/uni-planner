#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs'

const SUBJECT_MAP = {
  'Mathematik für Informatik': 'Mathe',       // "Mathematik für Informatik 2 "
  'IdS':                       'GdI',          // "IdS-SS26"
  'Intec':                     'Praktische Informatik', // "Intec SoSe 26"
}

const ABGABE_KEYWORDS = ['abgabe', 'assignment', 'submission', 'einreichung', 'is due', 'fällig']
const KLAUSUR_KEYWORDS = ['klausur', 'exam', 'prüfung', 'test', 'quiz']
const LESEN_KEYWORDS   = ['lesen', 'lektüre', 'reading']

async function main() {
  const url = process.env.MOODLE_ICAL_URL
  if (!url) throw new Error('Env-Variable MOODLE_ICAL_URL nicht gesetzt')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} beim Abruf des iCal-Feeds`)
  const ical = await res.text()

  const events = parseICal(ical)
  console.log(`${events.length} iCal-Events gefunden`)

  const fresh = events.map(toTask).filter(Boolean)
  console.log(`${fresh.length} relevante Aufgaben nach Fächer-Mapping`)

  const existing = existsSync('public/tasks.json')
    ? JSON.parse(readFileSync('public/tasks.json', 'utf8'))
    : []

  const merged = merge(existing, fresh)
  writeFileSync('public/tasks.json', JSON.stringify(merged, null, 2) + '\n')
  console.log(`tasks.json geschrieben (${merged.length} Aufgaben gesamt)`)
}

// ── iCal-Parser ─────────────────────────────────────────────────────────────

function parseICal(text) {
  // Zeilenfortsetzungen auflösen (RFC 5545)
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '')
  return unfolded
    .split('BEGIN:VEVENT')
    .slice(1)
    .map(block => {
      const end = block.indexOf('END:VEVENT')
      const props = {}
      for (const line of block.slice(0, end).split(/\r?\n/).filter(Boolean)) {
        const colon = line.indexOf(':')
        if (colon === -1) continue
        // Key kann Parameter enthalten: DTSTART;VALUE=DATE → DTSTART
        const key = line.slice(0, colon).split(';')[0].toUpperCase()
        props[key] = line.slice(colon + 1).trim()
      }
      return props
    })
}

// ── Event → Task ─────────────────────────────────────────────────────────────

function toTask(event) {
  const summary    = event.SUMMARY    ?? ''
  const categories = event.CATEGORIES ?? ''
  const dtstart    = event.DTSTART    ?? ''
  const uid        = event.UID        ?? crypto.randomUUID()

  const deadline = parseDate(dtstart)
  if (!deadline) return null

  // Fach aus CATEGORIES oder SUMMARY ermitteln
  const searchText = `${categories} ${summary}`
  const subject = detectSubject(searchText)
  if (!subject) return null   // Kurs nicht im Mapping → überspringen

  return {
    id:       uid,
    title:    cleanTitle(summary),
    type:     detectType(summary),
    subject,
    deadline,
    done:     false,
    source:   'moodle',
  }
}

function detectSubject(text) {
  for (const [keyword, mapped] of Object.entries(SUBJECT_MAP)) {
    if (text.toLowerCase().includes(keyword.toLowerCase())) return mapped
  }
  return null
}

function detectType(summary) {
  const lower = summary.toLowerCase()
  if (ABGABE_KEYWORDS.some(k => lower.includes(k)))  return 'Abgabe'
  if (KLAUSUR_KEYWORDS.some(k => lower.includes(k))) return 'Klausur'
  if (LESEN_KEYWORDS.some(k => lower.includes(k)))   return 'Lesen'
  return 'To-Do'
}

function cleanTitle(summary) {
  return summary
    .replace(/^(abgabe|assignment due|is due|fällig|submission|einreichung):\s*/i, '')
    .replace(/\s*ist fällig\.?\s*$/i, '')   // "Blatt 3 ist fällig." → "Blatt 3"
    .replace(/\s*is due\.?\s*$/i, '')
    .replace(/\s*-\s*[^-]+$/, '')           // " - Kursname" am Ende entfernen
    .trim()
}

function parseDate(dtstart) {
  const m = dtstart.match(/^(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// ── Merge: Done-Status erhalten, manuelle Tasks behalten ─────────────────────

function merge(existing, fresh) {
  const doneIds = new Set(
    existing.filter(t => t.source === 'moodle' && t.done).map(t => t.id)
  )
  const manual  = existing.filter(t => t.source !== 'moodle')
  const updated = fresh.map(t => ({ ...t, done: doneIds.has(t.id) }))
  return [...manual, ...updated]
}

main().catch(err => { console.error(err.message); process.exit(1) })
