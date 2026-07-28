import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const ledger = readFileSync(new URL('../src/components/Ledger.tsx', import.meta.url), 'utf8')
const plan = readFileSync(new URL('../src/lib/plan.ts', import.meta.url), 'utf8')

test('ledger offers one-shot camera and upload receipt scanning', () => {
  assert.match(ledger, /capture="environment"/)
  assert.match(ledger, /拍小票/)
  assert.match(ledger, /上传图片/)
  assert.match(ledger, /setReceipts\(\[file\]\)/)
  assert.match(plan, /op: 'receipt'/)
})

test('receipt scan only prefills editable fields before explicit confirmation', () => {
  assert.match(ledger, /type="date"/)
  assert.match(ledger, /spent_at: spentAt/)
  assert.match(ledger, /确认记账/)
  assert.match(ledger, /scanReceipt/)
  assert.match(ledger, /addExpense\([\s\S]*?\}, receipts\)/)
})
