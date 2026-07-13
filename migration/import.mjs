// Step 2 of migration: bulk-insert cleaned-customers.json into Supabase.
//
//   $env:SUPABASE_URL = "https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "sb_secret_..."   (API Keys > secret key — keep SECRET;
//                                                       legacy service_role key also works)
//   node migration/import.mjs
//
// Refuses to run if the customers table already has rows (pass --append to override),
// so an accidental double-run cannot duplicate 20k+ records.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const here = dirname(fileURLToPath(import.meta.url))

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first.')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false } })
const rows = JSON.parse(readFileSync(join(here, 'cleaned-customers.json'), 'utf8'))

const { count, error: countError } = await supabase
  .from('customers')
  .select('*', { count: 'exact', head: true })
if (countError) {
  console.error('Cannot reach the customers table:', countError.message)
  process.exit(1)
}
if (count > 0 && !process.argv.includes('--append')) {
  console.error(
    `customers table already has ${count} rows. ` +
      'Refusing to import again (use --append if you really mean it).',
  )
  process.exit(1)
}

const BATCH = 500
let inserted = 0
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH)
  const { error } = await supabase.from('customers').insert(batch)
  if (error) {
    console.error(`Batch starting at row ${i} failed:`, error.message)
    console.error('Fix the problem and re-run with --append (already-inserted rows stay).')
    process.exit(1)
  }
  inserted += batch.length
  process.stdout.write(`\rInserted ${inserted} / ${rows.length}`)
}

console.log(`\nDone. ${inserted} customers imported.`)
