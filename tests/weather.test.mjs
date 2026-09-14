import assert from 'node:assert/strict'
import test from 'node:test'

import { forecastableDates, weatherVisual, itineraryWeatherCity } from '../node_modules/.tmp-tsnode/shared/weather.js'

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

test('thunderstorms are not rendered as ordinary heavy rain', () => {
  assert.equal(weatherVisual(95).kind, 'thunder')
  assert.equal(weatherVisual(96).label, '雷雨伴冰雹')
  assert.equal(weatherVisual(99).kind, 'thunder')
})

test('daily weather uses the arrival city from an existing itinerary', () => {
  assert.equal(itineraryWeatherCity('云南（昆明+大理）', { theme:'抵达昆明，市区慢逛', segments:[] }), '昆明')
  assert.equal(itineraryWeatherCity('云南（昆明+大理）', { theme:'大理古城慢游', segments:[] }), '大理')
  assert.equal(itineraryWeatherCity('云南（昆明+大理）', { theme:'自由活动', segments:[] }), '')
})
