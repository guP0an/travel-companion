import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const authBarSource = readFileSync(new URL('../src/components/AuthBar.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

test('the account panel includes one environment-aware WeChat action', () => {
  assert.match(authBarSource, /api\/wechat-oauth\?mode=status/)
  assert.match(authBarSource, /微信扫码登录/)
  assert.match(authBarSource, /微信登录/)
  assert.match(authBarSource, /getWechatLoginMode/)
})

test('the WeChat action has a stable full-width mobile control', () => {
  assert.match(authBarSource, /auth-wechat-button/)
  assert.match(styles, /\.auth-wechat-button\s*\{[^}]*width:\s*100%/s)
})
