import { createServer } from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdirSync, readFileSync, existsSync, statSync, chmodSync } from 'node:fs'
import { resolve, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApiRequest, assertItinerary } from '../build/ai.js'

const derive = promisify(scrypt)
const digest = value => createHash('sha256').update(value).digest('hex')
const token = () => randomBytes(32).toString('hex')
const day = 86_400_000
const fail = (status, message) => { throw Object.assign(new Error(message), { status }) }
const text = (value, max, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, '输入内容不符合要求')
  return value
}
const username = value => {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9]{4,20}$/.test(value)) fail(400, '账号须为 4–20 位英文字母或数字')
  return value.toLowerCase()
}
const password = value => {
  if (typeof value !== 'string' || [...value].length < 8 || [...value].length > 64) fail(400, '密码须为 8–64 位')
  return value
}
async function hashPassword(value, salt = randomBytes(16).toString('hex')) {
  const hash = await derive(value, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  return `${salt}:${hash.toString('hex')}`
}
async function matches(value, stored) {
  const candidate = await hashPassword(value, stored.split(':')[0])
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(stored))
}
async function body(req, limit) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail(415, '请使用 JSON 请求')
  if (Number(req.headers['content-length']) > limit) fail(413, '请求内容过大')
  const chunks = []; let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) fail(413, '请求内容过大')
    chunks.push(chunk)
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, '请求格式错误')
    return value
  } catch { fail(400, '请求格式错误') }
}

export async function createApp({ env = process.env, dbPath = env.DATABASE_PATH || './data/wanwan.sqlite', staticDir = './dist', fetcher = fetch } = {}) {
  const publicOrigin = new URL(env.PUBLIC_ORIGIN || 'http://localhost:5173').origin
  const production = env.NODE_ENV === 'production'
  if (production && (!env.PUBLIC_ORIGIN || !publicOrigin.startsWith('https://'))) throw new Error('Production requires an HTTPS PUBLIC_ORIGIN')
  if (dbPath !== ':memory:') mkdirSync(resolve(dbPath, '..'), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(dbPath)
  if (dbPath !== ':memory:') chmodSync(dbPath, 0o600)
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, recovery TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, value TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(user_id,kind,id));
    CREATE INDEX IF NOT EXISTS records_user ON records(user_id,kind);
    CREATE TABLE IF NOT EXISTS photos(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, bytes BLOB NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS photos_user ON photos(user_id);
  `)
  // ponytail: SQLite and local concurrency limits target one server process; use a shared store before adding replicas.
  let hashing = 0; let aiActive = 0
  const dummy = await hashPassword(token())
  const cleanup = () => {
    db.prepare("DELETE FROM photos WHERE created<? AND NOT EXISTS(SELECT 1 FROM records WHERE records.user_id=photos.user_id AND instr(records.value, '/api/photos/' || photos.id)>0)").run(Date.now()-day)
    db.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now())
    db.prepare('DELETE FROM limits WHERE expires <= ?').run(Date.now())
  }
  cleanup()
  const timer = setInterval(cleanup, 60_000); timer.unref()
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE')
    try { const result = fn(); db.exec('COMMIT'); return result } catch (error) { db.exec('ROLLBACK'); throw error }
  }
  const limit = (key, max, interval) => {
    const now = Date.now()
    db.prepare(`INSERT INTO limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN expires<=? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END`).run(key, now + interval, now, now)
    if (db.prepare('SELECT count FROM limits WHERE key=?').get(key).count > max) fail(429, '操作太频繁，请稍后再试')
  }
  const cookieName = production ? '__Host-wanwan' : 'wanwan_session'
  const sessionHash = req => {
    const value = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(cookieName + '='))?.slice(cookieName.length + 1)
    return value && /^[a-f0-9]{64}$/.test(value) ? digest(value) : ''
  }
  const current = req => db.prepare(`SELECT users.id,username FROM sessions JOIN users ON users.id=sessions.user_id WHERE hash=? AND expires>?`).get(sessionHash(req), Date.now()) || null
  const setCookie = (res, value, age) => res.setHeader('Set-Cookie', `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${production ? '; Secure' : ''}`)
  const establish = (req, res, user) => {
    const value = token()
    db.prepare('DELETE FROM sessions WHERE hash=?').run(sessionHash(req))
    db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(value), user.id, Date.now() + 7 * day)
    setCookie(res, value, 7 * day / 1000)
  }
  const json = (res, value, status = 200) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(value))
  }
  const records = (user, kind) => db.prepare('SELECT id,value,created_at FROM records WHERE user_id=? AND kind=? ORDER BY created_at DESC').all(user.id, kind).map(r => ({ ...JSON.parse(r.value), id: r.id, created_at: r.created_at }))
  const save = (user, kind, value, id = randomUUID()) => {
    if (db.prepare('SELECT count(*) n FROM records WHERE user_id=?').get(user.id).n >= 2000 && !db.prepare('SELECT id FROM records WHERE id=? AND user_id=?').get(id,user.id)) fail(413, '已达到记录数量上限')
    const existing = db.prepare('SELECT value FROM records WHERE id=? AND user_id=?').get(id,user.id)
    const size = db.prepare('SELECT coalesce(sum(length(value)),0) n FROM records WHERE user_id=?').get(user.id).n
    if (size - (existing?.value.length || 0) + JSON.stringify(value).length > 20_000_000) fail(413, '记录空间已达到上限')
    const created = new Date().toISOString()
    db.prepare('INSERT INTO records VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id, user.id, kind, JSON.stringify(value), created)
    return { ...value, id, created_at: created }
  }
  const photoList = (user, paths, kind, max) => {
    if (!Array.isArray(paths) || paths.length > max) fail(400, '照片数量超过限制')
    return paths.map(path => {
      if (typeof path !== 'string' || !/^\/api\/photos\/[a-f0-9-]{36}$/.test(path)) fail(400, '照片地址不正确')
      if (!db.prepare('SELECT id FROM photos WHERE id=? AND user_id=? AND kind=?').get(path.split('/').pop(), user.id, kind)) fail(400, '照片不可用')
      return path
    })
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('X-Frame-Options', 'DENY')
    try {
      const url = new URL(req.url, publicOrigin); const path = url.pathname
      if (!path.startsWith('/api/')) {
        if (!['GET','HEAD'].includes(req.method)) fail(405, '请求方法不支持')
        const root = resolve(staticDir); let target = resolve(root, '.' + decodeURIComponent(path))
        if (!target.startsWith(root + sep) && target !== root) fail(404, '页面不存在')
        if (!existsSync(target) || !statSync(target).isFile()) {
          if (extname(path)) fail(404, '文件不存在')
          target = resolve(root, 'index.html')
        }
        if (!existsSync(target)) fail(503, '前端尚未构建，请先运行 pnpm build')
        const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.woff2':'font/woff2' }
        res.setHeader('Content-Type', types[extname(target)] || 'application/octet-stream')
        res.setHeader('Cache-Control', path.startsWith('/assets/') ? 'public,max-age=31536000,immutable' : 'no-cache')
        res.end(req.method === 'HEAD' ? undefined : readFileSync(target)); return
      }
      if (!['GET','POST','DELETE'].includes(req.method)) fail(405, '请求方法不支持')
      if (req.headers['sec-fetch-site'] === 'cross-site') fail(403, '请求来源不允许')
      if (req.method !== 'GET' && req.headers.origin !== publicOrigin) fail(403, '请求来源不允许')
      if (path === '/api/health' && req.method === 'GET') { db.prepare('SELECT 1').get(); return json(res, { ok: true }) }
      const ip = digest(req.socket.remoteAddress || 'unknown') // Never trust client-provided X-Forwarded-For.
      limit('all:' + ip, 600, 60_000)
      if (path === '/api/auth/session' && req.method === 'GET') return json(res, { user: current(req) })
      if (path === '/api/auth/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE hash=?').run(sessionHash(req)); setCookie(res, '', 0)
        return json(res, { ok: true })
      }
      if (['/api/auth/register','/api/auth/login','/api/auth/recover'].includes(path) && req.method === 'POST') {
        limit('auth:' + ip, 30, 15 * 60_000)
        const input = await body(req, 4096); const name = username(input.username); const pw = password(input.password)
        limit('account:' + name, 15, 15 * 60_000)
        if (hashing >= 4) fail(429, '服务繁忙，请稍后再试')
        hashing++
        try {
          const row = db.prepare('SELECT * FROM users WHERE username=?').get(name)
          if (path.endsWith('/register')) {
            limit('register:' + ip, 5, day)
            if (row) fail(409, '账号已被使用')
            const hash = await hashPassword(pw); const recoveryCode = token(); const user = { id: randomUUID(), username: name }
            transaction(() => {
              if (db.prepare('SELECT id FROM users WHERE username=?').get(name)) fail(409, '账号已被使用')
              db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(user.id,name,hash,digest(recoveryCode),new Date().toISOString())
              establish(req,res,user)
            })
            return json(res, { user, recoveryCode }, 201)
          }
          if (path.endsWith('/login')) {
            const valid = await matches(pw, row?.password || dummy)
            if (!row || !valid) fail(401, '账号或密码不正确')
            // A concurrent reset must not allow an old password to issue a new session.
            const latest = db.prepare('SELECT password FROM users WHERE id=?').get(row.id)
            if (latest?.password !== row.password) fail(401, '账号或密码不正确')
            const user = { id: row.id, username: name }; establish(req,res,user)
            return json(res, { user })
          }
          const supplied = text(input.recoveryCode, 64, true).toLowerCase()
          if (!row || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(digest(supplied)),Buffer.from(row.recovery))) fail(401, '账号或恢复码不正确')
          const hash = await hashPassword(pw); const recoveryCode = token()
          transaction(() => {
            const changed = db.prepare('UPDATE users SET password=?,recovery=? WHERE id=? AND recovery=?').run(hash,digest(recoveryCode),row.id,row.recovery)
            if (!changed.changes) fail(401, '恢复码已使用')
            db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id)
          })
          setCookie(res, '', 0)
          return json(res, { recoveryCode, user: null })
        } finally { hashing-- }
      }
      const user = current(req)
      if (!user) fail(401, '请先登录')
      if (path === '/api/ai' && req.method === 'POST') {
        limit('ai:' + user.id, 10, 10 * 60_000); limit('ai-global', 200, day)
        if (aiActive >= 4) fail(429, '规划请求较多，请稍后再试')
        req.body = await body(req, 3_000_000)
        aiActive++
        try { return await handleApiRequest(req,res,env,(url, init = {}) => fetcher(url, { ...init, signal: AbortSignal.timeout(45_000) }),async () => user) } finally { aiActive-- }
      }
      if (path === '/api/itineraries') {
        if (req.method === 'GET') return json(res, records(user,'itinerary'))
        if (req.method === 'POST') {
          const input = await body(req, 500_000)
          try { assertItinerary(input.plan) } catch { fail(400, '行程格式不正确') }
          return json(res, save(user,'itinerary',{ plan: input.plan, meta: input.plan.meta }),201)
        }
      }
      if (path === '/api/expenses') {
        if (req.method === 'GET') return json(res, records(user,'expense').map(r => ({ ...r,receipt_urls:r.receipt_paths })))
        if (req.method === 'POST') {
          const input = await body(req,16_384)
          const category = text(input.category,32,true), note = text(input.note,4000)
          if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1e8 || Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.00001) fail(400, '金额须为正数，最多两位小数')
          const spent = input.spent_at || null
          if (spent !== null && (typeof spent !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(spent) || !Number.isFinite(Date.parse(spent)) || new Date(spent).toISOString().slice(0,10) !== spent)) fail(400, '日期不正确')
          const receipt_paths = photoList(user,input.receipt_paths || [],'receipt',3)
          return json(res,save(user,'expense',{category,note,amount:input.amount,spent_at:spent,receipt_paths}),201)
        }
      }
      if (path.startsWith('/api/expenses/') && req.method === 'DELETE') {
        const id = path.split('/').pop()
        const row = db.prepare('SELECT value FROM records WHERE id=? AND user_id=? AND kind=?').get(id,user.id,'expense')
        if (!row) fail(404,'记录不存在')
        db.prepare('DELETE FROM records WHERE id=? AND user_id=?').run(id,user.id)
        return json(res,{ok:true})
      }
      if (path === '/api/checkins') {
        if (req.method === 'GET') return json(res,records(user,'checkin'))
        if (req.method === 'POST') {
          const input = await body(req,20_000); const spot = text(input.spot,300,true), review = text(input.review,10_000)
          if (typeof input.checked !== 'boolean' || (input.rating !== null && (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5))) fail(400,'评分或打卡状态不正确')
          const id = digest(user.id + ':' + spot)
          const old = db.prepare('SELECT value FROM records WHERE id=? AND user_id=?').get(id,user.id)
          const previous = old ? JSON.parse(old.value) : {}
          const photos = photoList(user,input.photos ?? previous.photos ?? [],'checkin',12)
          return json(res,save(user,'checkin',{spot,rating:input.rating,review,photos,checked_at:input.checked ? previous.checked_at || new Date().toISOString() : null},id))
        }
      }
      if (path === '/api/photos' && req.method === 'POST') {
        limit('upload:' + user.id,60,day)
        const input = await body(req,3_000_000)
        if (!['receipt','checkin'].includes(input.kind)) fail(400,'照片类型不正确')
        if (typeof input.image !== 'string' || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(input.image)) fail(400,'仅支持 JPEG 图片')
        const bytes = Buffer.from(input.image.split(',')[1],'base64')
        if (bytes.length < 4 || bytes.length > 2_000_000 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) fail(400,'图片无效或超过 2MB')
        const usage = db.prepare('SELECT coalesce(sum(length(bytes)),0) n FROM photos WHERE user_id=?').get(user.id).n
        if (usage + bytes.length > 50_000_000) fail(413,'照片空间已达到 50MB 上限')
        const id = randomUUID(); db.prepare('INSERT INTO photos VALUES (?,?,?,?,?)').run(id,user.id,input.kind,bytes,Date.now())
        return json(res,{url:'/api/photos/'+id},201)
      }
      if (path.startsWith('/api/photos/') && req.method === 'GET') {
        const row = db.prepare('SELECT bytes FROM photos WHERE id=? AND user_id=?').get(path.split('/').pop(),user.id)
        if (!row) fail(404,'照片不存在')
        res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','Content-Security-Policy':"default-src 'none'"}); return res.end(row.bytes)
      }
      fail(404,'接口不存在')
    } catch (error) {
      if (!res.headersSent) {
        if (error.status === 429) res.setHeader('Retry-After','60')
        json(res,{message:error.status ? error.message : '服务暂时不可用'},error.status || 500)
      } else res.end()
      if (!error.status) console.error('[server]',error.code || error.name) // Do not log passwords, recovery codes or request bodies.
    }
  })
  server.requestTimeout = 30_000; server.headersTimeout = 15_000
  return { server, close: async () => { clearInterval(timer); server.closeIdleConnections(); await new Promise(resolve => server.close(resolve)); db.close() } }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077)
  const app = await createApp()
  app.server.listen(Number(process.env.PORT || 3001), process.env.HOST || '127.0.0.1', () => console.log(`丸丸后端：http://${process.env.HOST || '127.0.0.1'}:${process.env.PORT || 3001}`))
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0) })
}
