import assert from 'node:assert/strict'
import test from 'node:test'

import {
  annotatePublicVisibility,
  resumeAction,
  selectCandidates,
  selectGlobalCandidates,
} from './migrate-product-images-to-oss.mjs'

const projectRef = 'agtujigvxxdppngirqtu'
const tenantId = 'c953fa59-932b-45a9-99de-6148433d7c9f'
const sourceUrl = `https://${projectRef}.supabase.co/storage/v1/object/public/taplist-media/${tenantId}/drinks/11111111-1111-4111-8111-111111111111/image.jpg`

test('selects only unshared products whose tenant drink still has the product source URL', () => {
  const products = [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', image_url: sourceUrl },
    { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', image_url: sourceUrl },
    { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', image_url: 'https://example.com/image.jpg' },
  ]
  const drinks = [
    { id: '1', tenant_id: tenantId, product_id: products[0].id, image_url: sourceUrl },
    { id: '2', tenant_id: tenantId, product_id: products[1].id, image_url: sourceUrl },
    { id: '3', tenant_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', product_id: products[1].id, image_url: sourceUrl },
    { id: '4', tenant_id: tenantId, product_id: products[2].id, image_url: products[2].image_url },
  ]

  const selected = selectCandidates({ drinks, products, tenantId, projectRef, limit: 10 })
  assert.deepEqual(selected.map((candidate) => candidate.product.id), [products[0].id])
})

test('does not overwrite a tenant-specific image', () => {
  const product = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', image_url: sourceUrl }
  const drinks = [{
    id: '1',
    tenant_id: tenantId,
    product_id: product.id,
    image_url: `${sourceUrl}?merchant-version=1`,
  }]

  assert.deepEqual(selectCandidates({ drinks, products: [product], tenantId, projectRef, limit: 10 }), [])
})

test('global selection includes shared products and only syncs exact legacy URL copies', () => {
  const product = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', image_url: sourceUrl }
  const drinks = [
    { id: '1', tenant_id: tenantId, product_id: product.id, image_url: sourceUrl },
    {
      id: '2',
      tenant_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      product_id: product.id,
      image_url: sourceUrl,
    },
    {
      id: '3',
      tenant_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      product_id: product.id,
      image_url: 'https://img.nomenuapp.com/prod/tenants/custom.jpg',
    },
  ]

  const selected = selectGlobalCandidates({
    drinks,
    products: [product],
    projectRef,
    limit: 25,
  })
  assert.equal(selected.length, 1)
  assert.deepEqual(selected[0].matchingUsages.map((drink) => drink.id), ['1', '2'])
  assert.equal(selected[0].tenantCount, 2)
})

test('global selection skips external and already migrated product images', () => {
  const products = [
    { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', image_url: 'https://example.com/image.jpg' },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      image_url: 'https://img.nomenuapp.com/prod/products/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/image.jpg',
    },
  ]
  assert.deepEqual(selectGlobalCandidates({ drinks: [], products, projectRef, limit: 25 }), [])
})

test('annotates only drinks actually returned by the public Taplist RPC', () => {
  const candidates = [{
    product: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', image_url: sourceUrl },
    matchingUsages: [
      { id: 'visible', tenant_id: tenantId, name: '公开酒款' },
      { id: 'hidden', tenant_id: tenantId, name: '隐藏酒款' },
    ],
  }]
  const tenants = [{ id: tenantId, display_name: '测试门店', slug: 'test-bar' }]
  const annotated = annotatePublicVisibility(candidates, new Set(['visible']), tenants)

  assert.deepEqual(annotated[0].publicMatchingUsages, [{
    id: 'visible',
    tenant_id: tenantId,
    name: '公开酒款',
    tenant: tenants[0],
  }])
})

test('resumes drink synchronization after promotion was recorded', () => {
  const newUrl = 'https://img.nomenuapp.com/prod/products/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/new.jpg'
  assert.deepEqual(
    resumeAction({ productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'promoted', newUrl }, newUrl),
    { action: 'sync', newUrl },
  )
})

test('recovers a promoted URL when the process stopped before saving state', () => {
  const productId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const newUrl = `https://img.nomenuapp.com/prod/products/${productId}/recovered.jpg`
  assert.deepEqual(
    resumeAction({ productId, status: 'planned', oldUrl: sourceUrl, newUrl: null }, newUrl),
    { action: 'sync', newUrl },
  )
})

test('rejects an unexpected product image change', () => {
  assert.throws(
    () => resumeAction({
      productId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'planned',
      oldUrl: sourceUrl,
      newUrl: null,
    }, 'https://example.com/replaced.jpg'),
    /changed since the migration plan/,
  )
})
