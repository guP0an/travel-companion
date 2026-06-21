import { extractBookings } from './_deepseek.js'
import { readBody } from './_body.js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    return res.end('Method Not Allowed')
  }
  res.setHeader('content-type', 'application/json')
  try {
    const body = await readBody(req)
    const bookings = await extractBookings(String(body.text || ''), process.env)
    res.end(JSON.stringify({ bookings }))
  } catch (e) {
    res.end(JSON.stringify({ ok: false, friendlyMessage: '这张图没读清，手动填一下也行～', error: String((e as Error).message) }))
  }
}
