import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const storage = readFileSync(new URL('../supabase/storage.sql', import.meta.url), 'utf8')

const tables = ['profiles', 'itineraries', 'expenses', 'checkins']

test('Supabase migration creates every business table with RLS enabled', () => {
  for (const table of tables) {
    assert.match(schema, new RegExp(`create table if not exists public\\.${table} \\(`))
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security;`))
  }
})

test('Supabase migration keeps user-owned row policies for every business table', () => {
  const policies = [
    ['profiles', 'own profile', 'id'],
    ['itineraries', 'own itineraries', 'user_id'],
    ['expenses', 'own expenses', 'user_id'],
    ['checkins', 'own checkins', 'user_id'],
  ]

  for (const [table, policy, ownerColumn] of policies) {
    assert.match(schema, new RegExp(`drop policy if exists "${policy}" on public\\.${table};`))
    assert.match(schema, new RegExp(`create policy "${policy}" on public\\.${table}`))
    assert.match(schema, new RegExp(`auth\\.uid\\(\\) = ${ownerColumn}`))
  }
})

test('expense receipt schema is present in the clean and incremental migration paths', () => {
  assert.match(schema, /receipt_paths text\[\] not null default '\{\}'/)
  assert.match(
    schema,
    /alter table public\.expenses add column if not exists receipt_paths text\[\] not null default '\{\}';/,
  )
})

test('storage migration keeps check-in photos public and expense receipts private', () => {
  assert.match(storage, /values \('checkin-photos', 'checkin-photos', true\)/)
  assert.match(storage, /values \('expense-receipts', 'expense-receipts', false\)/)
  assert.match(storage, /on conflict \(id\) do update set public = false;/)
  assert.match(storage, /create policy "expense receipts own read"/)
  assert.match(storage, /create policy "expense receipts own write"/)
  assert.match(storage, /create policy "expense receipts own delete"/)
  assert.match(storage, /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g)
})
