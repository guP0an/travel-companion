import assert from 'node:assert/strict'
import test from 'node:test'

import { applyItineraryDates } from '../node_modules/.tmp-tsnode/api/ai.js'
import { forecastableDates, weatherVisual } from '../node_modules/.tmp-tsnode/shared/weather.js'

test('generated days inherit consecutive dates from the confirmed departure date', () => {
  const plan = {
    meta: { destination: '东京', days: 2, departureDate: '' },
    days: [{ dayIndex: 1, date: '' }, { dayIndex: 2, date: '' }],
  }
  assert.deepEqual(applyItineraryDates(plan, { departureDate: '2026-08-01', days: 2 }).days.map((day) => day.date), [
    '2026-08-01',
    '2026-08-02',
  ])
})

test('weather visuals distinguish intensity and strong wind', () => {
  assert.deepEqual(weatherVisual(0, 10), { kind: 'sunny', intensity: 'light', label: '晴' })
  assert.deepEqual(weatherVisual(2, 10), { kind: 'cloudy', intensity: 'medium', label: '多云' })
  assert.deepEqual(weatherVisual(51, 10), { kind: 'rain', intensity: 'light', label: '小雨' })
  assert.deepEqual(weatherVisual(63, 10), { kind: 'rain', intensity: 'medium', label: '中雨' })
  assert.deepEqual(weatherVisual(65, 10), { kind: 'rain', intensity: 'heavy', label: '大雨' })
  assert.deepEqual(weatherVisual(71, 10), { kind: 'snow', intensity: 'light', label: '小雪' })
  assert.deepEqual(weatherVisual(73, 10), { kind: 'snow', intensity: 'medium', label: '中雪' })
  assert.deepEqual(weatherVisual(75, 10), { kind: 'snow', intensity: 'heavy', label: '大雪' })
  assert.deepEqual(weatherVisual(1, 42), { kind: 'wind', intensity: 'heavy', label: '大风' })
})

test('only dates inside the sixteen-day forecast window are requested', () => {
  assert.deepEqual(forecastableDates([
    '2026-07-27',
    '2026-07-28',
    '2026-08-12',
    '2026-08-13',
    '2026-08-28',
  ], '2026-07-28'), ['2026-07-28', '2026-08-12'])
})
