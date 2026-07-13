// One-off: find snapshot (2019) records absent from the live export by both
// legacy id and ref+name, and save them for human review. They are NOT imported
// by default — some were deliberately deleted by staff over the years. If the
// shop wants them back: review the CSV, then ask Claude to append the keepers.
//
//   node migration/extract-2019-extras.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const live = JSON.parse(readFileSync(join(here, 'live-users.json'), 'utf8'))
const snap = JSON.parse(readFileSync(join(here, 'extracted-customers.json'), 'utf8'))

const norm = (x) => String(x ?? '').trim().toUpperCase()
const liveVals = Object.values(live)
const liveIds = new Set(liveVals.map((r) => String(r.id)))
const liveRefName = new Set(liveVals.map((r) => `${norm(r.ref)}|${norm(r.name)}`))

const extras = snap.filter(
  (r) =>
    r.id &&
    !liveIds.has(String(r.id)) &&
    !liveRefName.has(`${norm(r.ref)}|${norm(r.name)}`),
)

writeFileSync(join(here, '2019-extras.json'), JSON.stringify(extras, null, 1))

const esc = (v) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const cols = ['ref', 'name', 'phone', 'email', 'address', 'ic', 'created_at']
const csv = [cols.join(','), ...extras.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n')
writeFileSync(join(here, '2019-extras.csv'), '﻿' + csv)

console.log(`${extras.length} records saved to migration/2019-extras.json and .csv (for review)`)
