import { readdir, readFile } from 'node:fs/promises'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { fail } from './errors.js'

const base = 'https://contracts.nomenu.invalid/v1/'
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false })
ajv.addKeyword('x-event-schema')
addFormats(ajv)
async function load(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir)
    if (entry.isDirectory()) await load(path)
    else if (entry.name.endsWith('.json')) ajv.addSchema(JSON.parse(await readFile(path, 'utf8')))
  }
}
await load(new URL('../contracts/schemas/', import.meta.url))
export function valid(name, value) { return ajv.getSchema(base + name)(value) }
export function assertSchema(name, value, code = 'INVALID_REQUEST') {
  if (!valid(name, value)) fail(400, code)
  return value
}
