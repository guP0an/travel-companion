import assert from 'node:assert/strict'
import test from 'node:test'
import { pastedImage } from '../node_modules/.tmp-tsnode/shared/clipboard.js'

test('pasted screenshots use clipboard files; ordinary text and HTML stay untouched', () => {
  const screenshot = new File(['image'], 'screenshot.png', { type: 'image/png' })
  const other = new File(['pdf'], 'ticket.pdf', { type: 'application/pdf' })
  assert.equal(pastedImage({ items: [{kind:'file',type:'image/png',getAsFile:()=>screenshot}], files:[screenshot] }),screenshot)
  assert.equal(pastedImage({ items: [{kind:'file',type:'image/png',getAsFile:()=>null}], files:[screenshot] }),screenshot)
  assert.equal(pastedImage({ items: [], files:[other,screenshot] }),screenshot)
  assert.equal(pastedImage({ items: [{kind:'string',type:'text/html',getAsFile:()=>{throw new Error('must not read text as image')}}], files:[] }),null)
  assert.equal(pastedImage({ items:[],files:[other] }),null)
  assert.equal(pastedImage({ items:[],files:[] }),null)
})
