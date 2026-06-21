import { revise } from './_deepseek.js'
import { readBody } from './_body.js'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    return res.end('Method Not Allowed')
  }
  res.setHeader('content-type', 'application/json')
  try {
    const body = await readBody(req)
    res.end(JSON.stringify(await revise(body, process.env)))
  } catch (e) {
    res.end(JSON.stringify({ ok: false, friendlyMessage: '丸丸没改明白，换句话说说看～', error: String((e as Error).message) }))
  }
}
