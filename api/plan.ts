import { generate } from './_deepseek'
import { readBody } from './_body'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    return res.end('Method Not Allowed')
  }
  res.setHeader('content-type', 'application/json')
  try {
    const body = await readBody(req)
    res.end(JSON.stringify(await generate(body, process.env)))
  } catch (e) {
    res.end(JSON.stringify({ ok: false, friendlyMessage: '丸丸这会儿有点忙，稍后再让我排一次好吗～', error: String((e as Error).message) }))
  }
}
