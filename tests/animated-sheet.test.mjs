import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sheet = readFileSync(new URL('../src/components/AnimatedSheet.tsx', import.meta.url), 'utf8')
const spotDetail = readFileSync(new URL('../src/components/SpotDetail.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

test('spot detail uses an accessible animated sheet', () => {
  assert.match(sheet, /@radix-ui\/react-dialog/)
  assert.match(sheet, /AnimatePresence onExitComplete/)
  assert.match(sheet, /reducedMotion="user"/)
  assert.match(spotDetail, /AnimatedSheetTitle/)
  assert.match(spotDetail, /AnimatedSheetClose/)
  assert.doesNotMatch(spotDetail, /position: 'fixed', inset: 0/)
})

test('spot rating uses a soft custom star control', () => {
  assert.match(spotDetail, /rating-star-glyph/)
  assert.match(spotDetail, /aria-pressed=/)
  assert.doesNotMatch(spotDetail, /\n\s+★\n/)
  assert.match(css, /\.rating-star-button\[aria-pressed="true"\]/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})
