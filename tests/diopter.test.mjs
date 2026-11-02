import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizeDiopter } from '../src/lib/diopter.ts'

test('unsigned CYL decimal defaults to negative', () => {
  assert.equal(normalizeDiopter('0.5', 'cyl'), '-0.5')
})

test('explicit positive CYL overrides the default', () => {
  assert.equal(normalizeDiopter('+0.5', 'cyl'), '+0.5')
})

test('unsigned ADD decimal defaults to positive', () => {
  assert.equal(normalizeDiopter('0.5', 'add'), '+0.5')
})

test('explicit negative ADD overrides the default', () => {
  assert.equal(normalizeDiopter('-0.5', 'add'), '-0.5')
})

test('CYL shorthand applies the default sign after division', () => {
  assert.equal(normalizeDiopter('125', 'cyl'), '-1.25')
})

test('ADD shorthand applies the default sign after division', () => {
  assert.equal(normalizeDiopter('175', 'add'), '+1.75')
})

test('explicit positive CYL shorthand stays positive', () => {
  assert.equal(normalizeDiopter('+125', 'cyl'), '+1.25')
})

test('explicit negative ADD shorthand stays negative', () => {
  assert.equal(normalizeDiopter('-175', 'add'), '-1.75')
})

test('saving after blur does not scale or flip a value twice', () => {
  assert.equal(normalizeDiopter(normalizeDiopter('50', 'cyl'), 'cyl'), '-0.50')
})

test('untouched historical unsigned CYL is not reinterpreted during editing', () => {
  assert.equal(normalizeDiopter('0.50', 'cyl', false), '0.50')
})

test('SPH keeps its existing unsigned shorthand behavior', () => {
  assert.equal(normalizeDiopter('275', 'sph'), '2.75')
})

test('unrelated prescription fields are untouched', () => {
  assert.equal(normalizeDiopter('180', 'axis'), '180')
})

test('free text remains unchanged', () => {
  assert.equal(normalizeDiopter('PL', 'cyl'), 'PL')
})

test('blank field stays blank', () => {
  assert.equal(normalizeDiopter('', 'add'), '')
})

test('unsigned zero does not acquire a negative sign', () => {
  assert.equal(normalizeDiopter('0', 'cyl'), '0.00')
})

test('decimal without a leading zero accepts the CYL default', () => {
  assert.equal(normalizeDiopter('.5', 'cyl'), '-.5')
})
