import { readFile, readdir } from 'node:fs/promises'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

export const root = new URL('../', import.meta.url)
export const base = 'https://contracts.nomenu.invalid/v1/'
export const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), 'utf8'))

async function jsonFiles(url) {
  const result = []
  for (const entry of await readdir(url, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), url)
    if (entry.isDirectory()) result.push(...await jsonFiles(child))
    else if (entry.name.endsWith('.json')) result.push(child)
  }
  return result
}

// x-event-schema documents the intentionally separate per-event validation pass.
export const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false })
ajv.addKeyword('x-event-schema')
addFormats(ajv)
export const schemaFiles = await jsonFiles(new URL('schemas/', root))
for (const url of schemaFiles) ajv.addSchema(JSON.parse(await readFile(url, 'utf8')))
for (const url of schemaFiles) {
  const schema = JSON.parse(await readFile(url, 'utf8'))
  ajv.getSchema(schema.$id) // Compile every schema, not just those reached by fixtures.
}

export function validate(name, data) {
  const fn = ajv.getSchema(base + name)
  if (!fn) throw new Error(`Missing schema: ${name}`)
  const ok = fn(data)
  return { ok, errors: structuredClone(fn.errors) }
}

export const valid = await readJson('fixtures/valid/cases.json')
export const invalid = await readJson('fixtures/invalid/cases.json')
export const fixture = name => structuredClone(valid.find(f => f.name === name).data)
