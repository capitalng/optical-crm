import assert from 'node:assert/strict'
import { test } from 'node:test'
import { malaysiaToday, warrantyDaysBetween, warrantyEndDate, warrantySection } from '../src/lib/warranty.ts'

test('contacted record stays accessible after the follow-up window ends', () => {
  assert.equal(warrantySection({ warranty_start_date: '2026-01-01', warranty_contacted_at: '2026-01-20T00:00:00Z' }, '2026-11-02', 6), 'contacted')
})

test('undo moves an active contacted record back to To contact', () => {
  const record = { warranty_start_date: '2026-10-01', warranty_contacted_at: '2026-10-15T00:00:00Z' }
  assert.equal(warrantySection({ ...record, warranty_contacted_at: null }, '2026-11-02', 6), 'pending')
})

test('undo of an expired record keeps it accessible under Window ended', () => {
  assert.equal(warrantySection({ warranty_start_date: '2026-01-01', warranty_contacted_at: null }, '2026-11-02', 6), 'ended')
})

test('uncollected purchase has no countdown and stays on To contact', () => {
  assert.equal(warrantySection({ warranty_start_date: null, warranty_contacted_at: null }, '2030-01-01', 6), 'pending')
})

test('custom collection date overrides old visit date for follow-up timing', () => {
  const record = { visit_date: '2026-01-01', warranty_start_date: '2026-10-01', warranty_contacted_at: null }
  assert.equal(warrantySection(record, '2026-11-02', 6), 'pending')
})

test('future start date remains pending', () => {
  assert.equal(warrantySection({ warranty_start_date: '2026-12-01', warranty_contacted_at: null }, '2026-11-02', 6), 'pending')
})

test('six months uses calendar months across the year boundary', () => {
  assert.equal(warrantyEndDate('2026-10-15', 6), '2027-04-15')
})

test('month-end anniversary clamps to the final day in February', () => {
  assert.equal(warrantyEndDate('2026-08-31', 6), '2027-02-28')
})

test('month-end anniversary preserves leap day', () => {
  assert.equal(warrantyEndDate('2027-08-31', 6), '2028-02-29')
})

test('record ends on its six-month anniversary', () => {
  assert.equal(warrantySection({ warranty_start_date: '2026-05-02', warranty_contacted_at: null }, '2026-11-02', 6), 'ended')
})

test('day countdown crosses leap day correctly', () => {
  assert.equal(warrantyDaysBetween('2028-02-28', '2028-03-01'), 2)
})

test('today follows Malaysia midnight independently of device timezone', () => {
  assert.equal(malaysiaToday(new Date('2026-11-01T16:00:00Z')), '2026-11-02')
})
