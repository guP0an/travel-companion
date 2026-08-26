import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sheet = readFileSync(new URL('../src/components/AnimatedSheet.tsx', import.meta.url), 'utf8')
const spotDetail = readFileSync(new URL('../src/components/SpotDetail.tsx', import.meta.url), 'utf8')

test('spot detail uses an accessible animated sheet', () => {
  assert.match(sheet, /@radix-ui\/react-dialog/)
  assert.match(sheet, /AnimatePresence onExitComplete/)
  assert.match(sheet, /reducedMotion="user"/)
  assert.match(spotDetail, /AnimatedSheetTitle/)
  assert.match(spotDetail, /AnimatedSheetClose/)
  assert.doesNotMatch(spotDetail, /position: 'fixed', inset: 0/)
})
