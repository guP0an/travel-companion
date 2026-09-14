import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createApp } from '../server/index.mjs'

const origin = 'http://localhost:5173'
const plan = { meta: { destination:'杭州', days:1 }, greeting:'你好', prep:[], highlights:[], days:[{ dayIndex:1,theme:'西湖',segments:['morning','afternoon','evening'].map(period=>({period,items:[]})) }], closing:'旅途愉快',disclaimer:'请核实' }
test('real HTTP auth, recovery, owner isolation and persistence work without Supabase', async () => {
  const dir = await mkdtemp(join(tmpdir(),'wanwan-'))
  const dbPath = join(dir,'test.sqlite')
  const env = { PUBLIC_ORIGIN:origin,DEEPSEEK_API_KEY:'test-only' }
  let calls = 0
  const fetcher = async (url) => { assert.match(url,/api\.deepseek\.com/); calls++; return Response.json({choices:[{message:{content:JSON.stringify({bookings:[]})}}]}) }
  let app; let base
  async function start() { app = await createApp({env,dbPath,fetcher}); await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve)); base='http://127.0.0.1:'+app.server.address().port }
  async function call(path,{method='GET',data,cookie='',requestOrigin=origin,raw}={}) {
    const res = await fetch(base+path,{method,headers:{origin:requestOrigin,'content-type':'application/json',cookie},body:raw ?? (data===undefined ? undefined : JSON.stringify(data))})
    const json = (res.headers.get('content-type')||'').includes('application/json') ? await res.json() : await res.arrayBuffer()
    return {status:res.status,json,cookie:res.headers.get('set-cookie')?.split(';')[0],headers:res.headers}
  }
  await start()
  try {
    assert.equal((await call('/api/health')).status,200)
    assert.equal((await call('/api/itineraries')).status,401)
    assert.equal((await call('/api/ai',{method:'POST',data:{op:'extract',text:'test'}})).status,401)
    assert.equal(calls,0)
    assert.equal((await call('/api/auth/register',{method:'POST',data:{username:'测试',password:'safe-pass1'}})).status,400)
    assert.equal((await call('/api/auth/register',{method:'POST',data:{username:'Abcd',password:'short'}})).status,400)
    assert.equal((await call('/api/auth/register',{method:'POST',data:{username:'Abcd',password:'safe-pass1'},requestOrigin:'https://evil.example'})).status,403)
    const alice = await call('/api/auth/register',{method:'POST',data:{username:'Alice1',password:'safe-pass1'}})
    assert.equal(alice.status,201); assert.equal(alice.json.user.username,'alice1'); assert.match(alice.json.recoveryCode,/^[a-f0-9]{64}$/)
    assert.match(alice.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/)
    const a = alice.cookie
    assert.equal((await call('/api/auth/register',{method:'POST',data:{username:'ALICE1',password:'safe-pass1'}})).status,409)
    assert.equal((await call('/api/auth/login',{method:'POST',data:{username:'Alice1',password:'wrong-password'}})).status,401)
    assert.equal((await call('/api/auth/login',{method:'POST',data:{username:'ALICE1',password:'safe-pass1'}})).status,200)
    const bob = await call('/api/auth/register',{method:'POST',data:{username:'12345',password:'safe-pass2'}}); const b=bob.cookie
    assert.equal(bob.status,201)
    assert.equal((await call('/api/itineraries',{method:'POST',cookie:a,data:{plan:{}}})).status,400)
    const saved = await call('/api/itineraries',{method:'POST',cookie:a,data:{plan,user_id:bob.json.user.id}})
    assert.equal(saved.status,201)
    assert.equal((await call('/api/itineraries',{cookie:b})).json.length,0)
    assert.equal((await call('/api/itineraries',{cookie:a})).json[0].plan.meta.destination,'杭州')
    assert.equal((await call('/api/ai',{method:'POST',cookie:a,data:{op:'extract',text:'车票'}})).status,200); assert.equal(calls,1)
    const expense=await call('/api/expenses',{method:'POST',cookie:a,data:{category:'餐饮',amount:12.5,note:'午饭',receipt_paths:[]}})
    assert.equal(expense.status,201)
    assert.equal((await call('/api/expenses/'+expense.json.id,{method:'DELETE',cookie:b})).status,404)
    assert.equal((await call('/api/expenses',{cookie:b})).json.length,0)
    assert.equal((await call('/api/checkins',{method:'POST',cookie:a,data:{spot:'杭州 西湖',rating:5,review:'好',checked:true,photos:[]}})).status,200)
    assert.equal((await call('/api/checkins',{cookie:b})).json.length,0)
    assert.equal((await call('/api/photos',{method:'POST',cookie:a,data:{kind:'checkin',image:'data:image/svg+xml;base64,PHN2Zz4='}})).status,400)
    const photo=await call('/api/photos',{method:'POST',cookie:a,data:{kind:'receipt',image:'data:image/jpeg;base64,'+Buffer.from([255,216,255,224,255,217]).toString('base64')}})
    assert.equal(photo.status,201)
    assert.equal((await call(photo.json.url,{cookie:b})).status,404)
    assert.equal((await call(photo.json.url,{cookie:a})).status,200)
    assert.equal((await call('/api/expenses',{method:'POST',cookie:b,data:{category:'餐饮',amount:1,note:'',receipt_paths:[photo.json.url]}})).status,400)
    assert.equal((await call('/api/auth/login',{method:'POST',raw:'{' })).status,400)
    assert.equal((await call('/api/auth/login',{method:'POST',data:{padding:'a'.repeat(5000)}})).status,413)
    const stored = new DatabaseSync(dbPath)
    const row=stored.prepare('SELECT * FROM users WHERE username=?').get('alice1')
    assert.notEqual(row.password,'safe-pass1'); assert.notEqual(row.recovery,alice.json.recoveryCode)
    assert.equal(stored.prepare('SELECT hash FROM sessions WHERE user_id=?').get(row.id).hash.includes(a.split('=')[1]),false)
    stored.close()
    await app.close(); await start()
    assert.equal((await call('/api/auth/session',{cookie:a})).json.user.username,'alice1')
    assert.equal((await call('/api/itineraries',{cookie:a})).json.length,1)
    assert.equal((await call('/api/auth/recover',{method:'POST',data:{username:'Alice1',password:'new-pass1',recoveryCode:'0'.repeat(64)}})).status,401)
    const reset = await call('/api/auth/recover',{method:'POST',data:{username:'Alice1',password:'new-pass1',recoveryCode:alice.json.recoveryCode}})
    assert.equal(reset.status,200); assert.notEqual(reset.json.recoveryCode,alice.json.recoveryCode)
    assert.equal((await call('/api/auth/session',{cookie:a})).json.user,null)
    assert.equal((await call('/api/itineraries',{cookie:a})).status,401)
    assert.equal((await call('/api/auth/recover',{method:'POST',data:{username:'Alice1',password:'new-pass2',recoveryCode:alice.json.recoveryCode}})).status,401)
    assert.equal((await call('/api/auth/login',{method:'POST',data:{username:'alice1',password:'safe-pass1'}})).status,401)
    const login = await call('/api/auth/login',{method:'POST',data:{username:'alice1',password:'new-pass1'}})
    assert.equal(login.status,200)
    assert.equal((await call('/api/itineraries',{cookie:login.cookie})).json.length,1)
    assert.equal((await call('/api/auth/logout',{method:'POST',cookie:login.cookie,data:{}})).status,200)
    assert.equal((await call('/api/itineraries',{cookie:login.cookie})).status,401)
    for(let i=0;i<15;i++) await call('/api/auth/login',{method:'POST',data:{username:'NoUser',password:'wrong-pass'}})
    assert.equal((await call('/api/auth/login',{method:'POST',data:{username:'NoUser',password:'wrong-pass'}})).status,429)
  } finally { await app.close(); await rm(dir,{recursive:true,force:true}) }
})

test('production requires HTTPS and uses a Secure host-only session cookie', async () => {
  await assert.rejects(createApp({env:{NODE_ENV:'production'},dbPath:':memory:'}),/HTTPS/)
  const app = await createApp({env:{NODE_ENV:'production',PUBLIC_ORIGIN:'https://wanwan.example'},dbPath:':memory:'})
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve))
  try {
    const result=await fetch(`http://127.0.0.1:${app.server.address().port}/api/auth/register`,{method:'POST',headers:{origin:'https://wanwan.example','content-type':'application/json'},body:JSON.stringify({username:'secureuser',password:'safe-password'})})
    assert.equal(result.status,201)
    assert.match(result.headers.get('set-cookie'),/^__Host-wanwan=.*; Secure$/)
  } finally { await app.close() }
})
