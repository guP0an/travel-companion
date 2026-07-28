import assert from 'node:assert/strict'
import test from 'node:test'

import { ledgerSummary } from '../node_modules/.tmp-tsnode/shared/ledger.js'

test('ledger totals stay isolated by itinerary and keep old rows unassigned', () => {
  const trips = [
    { id: 'hong-kong', destination: '香港' },
    { id: 'japan', destination: '日本' },
  ]
  const expenses = [
    { itinerary_id: 'hong-kong', amount: 1214 },
    { itinerary_id: 'japan', amount: 680 },
    { itinerary_id: null, amount: 99 },
  ]

  assert.deepEqual(ledgerSummary(trips, expenses), [
    { id: 'hong-kong', destination: '香港', count: 1, total: 1214 },
    { id: 'japan', destination: '日本', count: 1, total: 680 },
    { id: null, destination: '历史未归档', count: 1, total: 99 },
  ])
})
