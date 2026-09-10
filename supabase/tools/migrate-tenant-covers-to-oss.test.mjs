import assert from 'node:assert/strict'
import test from 'node:test'
import { coverResumeAction, selectCoverCandidates } from './migrate-tenant-covers-to-oss.mjs'

const tenantId = '1cff208a-4424-4867-966d-a7839ac59f6f'
const oldUrl = `https://agtujigvxxdppngirqtu.supabase.co/storage/v1/object/public/taplist-media/${tenantId}/cover/store.jpg`

test('selects only a cover owned by the same tenant', () => {
  const rows = [
    { id: tenantId, cover_image_url: oldUrl },
    { id: '00000000-0000-0000-0000-000000000001', cover_image_url: oldUrl },
    { id: tenantId, cover_image_url: 'https://example.com/store.jpg' },
  ]
  assert.deepEqual(selectCoverCandidates(rows, 10), [rows[0]])
})

test('resumes only when the database still has the planned URL', () => {
  const item = { tenantId, oldUrl, status: 'pending' }
  assert.equal(coverResumeAction(item, oldUrl), 'promote')
  assert.throws(() => coverResumeAction(item, 'https://example.com/changed.jpg'), /changed/)
})

test('recognizes a completed database update after interruption', () => {
  const newUrl = `https://img.nomenuapp.com/prod/tenants/${tenantId}/covers/new.jpg`
  assert.equal(coverResumeAction({ tenantId, oldUrl, newUrl, status: 'pending' }, newUrl), 'complete')
})
