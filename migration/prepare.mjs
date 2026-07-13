// Step 1 of migration: clean the raw Firebase export into an import-ready file.
//
//   node migration/prepare.mjs <path-to-raw-json>
//
// Accepts either format:
//   - live-users.json        (Firebase RTDB export: { "<pushKey>": {record}, ... })
//   - extracted-customers.json (plain array of records — the 2019 snapshot fallback)
//
// Output: migration/cleaned-customers.json + a summary printed to the console.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: node migration/prepare.mjs <path-to-raw-json>')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(inputPath, 'utf8'))

// Normalize both formats to [{ legacyKey, record }]
const entries = Array.isArray(raw)
  ? raw.map((record) => ({ legacyKey: null, record }))
  : Object.entries(raw).map(([legacyKey, record]) => ({ legacyKey, record }))

function clean(value) {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  if (s === '' || s.toLowerCase() === 'null') return null
  return s
}

// Legacy created_at appears in two formats:
//   "2016-10-06 10:22:29"  (original bulk import)
//   "Thu Jul 09 2026 12:00:00 GMT+0800 (Malaysia Time)"  (JS Date() from the old site's Add form)
function parseCreatedAt(value) {
  const s = clean(value)
  if (!s) return null
  const isoish = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)
    ? s.replace(' ', 'T') + '+08:00' // shop local time
    : s
  const d = new Date(isoish)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

const cleaned = []
let skippedEmpty = 0
let duplicatesDropped = 0
const seen = new Set()

for (const { legacyKey, record } of entries) {
  const row = {
    legacy_id: clean(record.id),
    legacy_key: legacyKey,
    ref_no: clean(record.ref)?.toUpperCase() ?? null,
    name: clean(record.name)?.toUpperCase() ?? null,
    phone: clean(record.phone),
    email: clean(record.email)?.toLowerCase() ?? null,
    address: clean(record.address),
    ic: clean(record.ic),
    created_at: parseCreatedAt(record.created_at),
  }

  // Drop rows that carry no identifying information at all.
  if (!row.ref_no && !row.name && !row.phone && !row.email && !row.address && !row.ic) {
    skippedEmpty++
    continue
  }

  // Drop exact duplicates (same ref + name + phone + email + address + ic).
  const fingerprint = [row.ref_no, row.name, row.phone, row.email, row.address, row.ic].join('')
  if (seen.has(fingerprint)) {
    duplicatesDropped++
    continue
  }
  seen.add(fingerprint)

  cleaned.push(row)
}

const outPath = join(here, 'cleaned-customers.json')
writeFileSync(outPath, JSON.stringify(cleaned))

const stat = (label, count) => console.log(`${label.padEnd(38)} ${String(count).padStart(7)}`)
console.log('--- prepare.mjs summary ---')
stat('Records in input file', entries.length)
stat('Skipped (completely empty)', skippedEmpty)
stat('Dropped (exact duplicates)', duplicatesDropped)
stat('Ready to import', cleaned.length)
stat('  with ref no', cleaned.filter((r) => r.ref_no).length)
stat('  with name', cleaned.filter((r) => r.name).length)
stat('  with phone', cleaned.filter((r) => r.phone).length)
console.log(`\nWrote ${outPath}`)
console.log('Next: node migration/import.mjs')
