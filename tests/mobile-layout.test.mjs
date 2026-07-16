import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

test('mobile planner hides the empty result panel and exposes compact form hooks', () => {
  assert.match(app, /planner-workspace.*has-itinerary/)
  assert.match(css, /planner-workspace:not\(\.has-itinerary\) \.itinerary-workspace/)
  assert.match(css, /@media \(max-width: 820px\)/)
  assert.match(css, /\.plan-options-row/)
  assert.match(css, /\.plan-upload-row/)
})

test('desktop empty itinerary remains available', () => {
  assert.match(app, /className="itinerary-empty"/)
  assert.doesNotMatch(css, /^\.planner-workspace:not\(\.has-itinerary\) \.itinerary-workspace/m)
})
