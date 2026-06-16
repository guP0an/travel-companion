import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { generate, extractBookings, revise } from './api/_deepseek'

function readJson(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let d = ''
    req.on('data', (c: any) => (d += c))
    req.on('end', () => {
      try {
        resolve(d ? JSON.parse(d) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

// 本地 serverless 代理：藏 DeepSeek key（用 process 环境，不进前端 bundle）。
// 线上等价逻辑在 api/plan.ts、api/extract.ts、api/revise.ts（Vercel serverless 函数）。
function deepseekApi(env: Record<string, string>): Plugin {
  return {
    name: 'deepseek-api',
    configureServer(server) {
      server.middlewares.use('/api/plan', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        res.setHeader('content-type', 'application/json')
        try {
          const body = await readJson(req)
          res.end(JSON.stringify(await generate(body, env)))
        } catch (e) {
          res.end(JSON.stringify({ ok: false, friendlyMessage: '丸丸这会儿有点忙，稍后再让我排一次好吗～', error: String((e as Error).message) }))
        }
      })

      server.middlewares.use('/api/extract', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        res.setHeader('content-type', 'application/json')
        try {
          const body = await readJson(req)
          const bookings = await extractBookings(String(body.text || ''), env)
          res.end(JSON.stringify({ bookings }))
        } catch (e) {
          res.end(JSON.stringify({ ok: false, friendlyMessage: '这张图没读清，手动填一下也行～', error: String((e as Error).message) }))
        }
      })

      server.middlewares.use('/api/revise', async (req: any, res: any) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        res.setHeader('content-type', 'application/json')
        try {
          const body = await readJson(req)
          res.end(JSON.stringify(await revise(body, env)))
        } catch (e) {
          res.end(JSON.stringify({ ok: false, friendlyMessage: '丸丸没改明白，换句话说说看～', error: String((e as Error).message) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), deepseekApi(env)],
  }
})
