import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const auth = readFileSync(new URL('../src/components/AuthBar.tsx', import.meta.url), 'utf8')
test('account panel uses usernames and requires recovery-code acknowledgement', () => {
  assert.doesNotMatch(auth, /supabase|type="email"|type="tel"|signInWithOtp|wechat-oauth/)
  assert.match(auth, /我已保存恢复码/)
  assert.match(auth, /autoComplete="username"/)
  assert.match(auth, /setIssuedCode\(result.recoveryCode\)/)
})
