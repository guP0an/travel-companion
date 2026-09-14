import { DatabaseSync } from 'node:sqlite'
import { resolve, dirname } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
const destination = process.argv[2]
if (!destination || existsSync(destination)) throw new Error('请指定一个尚不存在的私有备份文件路径')
process.umask(0o077)
mkdirSync(dirname(resolve(destination)),{recursive:true,mode:0o700})
const db = new DatabaseSync(process.env.DATABASE_PATH || './data/wanwan.sqlite', { readOnly: true })
try { db.prepare('VACUUM INTO ?').run(resolve(destination)); console.log('数据库一致性备份完成') } finally { db.close() }
