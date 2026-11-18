import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'dist')
await mkdir(resolve(output, 'server'), { recursive: true })
await mkdir(resolve(output, '.openai'), { recursive: true })
await cp(resolve(root, 'public'), resolve(output, 'client'), { recursive: true })
await cp(resolve(root, 'server'), resolve(output, 'server/server'), { recursive: true })
await cp(resolve(root, 'worker.mjs'), resolve(output, 'server/index.js'))
await cp(resolve(root, '.openai/hosting.json'), resolve(output, '.openai/hosting.json'))
await cp(resolve(root, 'drizzle'), resolve(output, '.openai/drizzle'), { recursive: true })

const config = JSON.parse(await readFile(resolve(root, 'wrangler.jsonc'), 'utf8'))
config.main = './index.js'
config.assets.directory = '../client'
config.d1_databases[0].migrations_dir = '../.openai/drizzle'
await writeFile(resolve(output, 'server/wrangler.json'), JSON.stringify(config, null, 2) + '\n')
console.log('已生成站点构建产物')
