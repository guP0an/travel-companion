import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleApiRequest } from './api/ai'

// 本地 serverless 代理：藏 DeepSeek key（用 process 环境，不进前端 bundle）。
// 线上等价逻辑在 api/plan.ts、api/extract.ts、api/revise.ts（Vercel serverless 函数）。
function deepseekApi(env: Record<string, string>): Plugin {
  return {
    name: 'deepseek-api',
    configureServer(server) {
      // 单一入口 /api/ai，按 op 分发——与线上 serverless 完全一致
      server.middlewares.use('/api/ai', async (req: any, res: any) => {
        return handleApiRequest(req, res, env)
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
