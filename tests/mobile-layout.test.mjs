import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const planForm = readFileSync(new URL('../src/components/PlanForm.tsx', import.meta.url), 'utf8')
const mascot = readFileSync(new URL('../src/components/Mascot.tsx', import.meta.url), 'utf8')

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

test('丸玩 product brand stays distinct from the 丸丸 travel companion', () => {
  assert.match(app, /brand-name[\s\S]*丸玩/)
  assert.match(app, /交给丸丸/)
  assert.match(app, /丸丸 Lv\./)
  assert.doesNotMatch(app, /交给丸玩|丸玩 Lv\./)
  assert.match(planForm, /告诉丸丸/)
  assert.match(planForm, /让丸丸排一版/)
  assert.match(mascot, /aria-label="丸丸"/)
})
