// 读取请求体：Vercel Node 运行时多数会把 application/json 解析进 req.body；
// 兜底自己读流，跨运行时都稳。
export async function readBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return await new Promise((resolve) => {
    let d = ''
    req.on('data', (c: any) => (d += c))
    req.on('end', () => {
      try {
        resolve(d ? JSON.parse(d) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}
