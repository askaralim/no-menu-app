const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const source = fs.readFileSync(
  path.join(__dirname, '../components/taplist/DrinkStatusSheet.tsx'),
  'utf8',
)

test('coming-soon drinks do not show the keg-change action', () => {
  assert.match(
    source,
    /tapNumber\s*&&\s*drink\.public_status\s*!==\s*'coming_soon'/,
  )
})

test('the keg-change action remains available for active and sold-out drinks', () => {
  assert.match(source, /drink\.public_status === 'sold_out' \? '换桶并恢复在售' : '记录换桶'/)
})
