// Reviewed local experiments only. An asset cannot authorize its own checksum.
export const frozenVersion = 'rules-v2-e1:240441109ea62d4947212562ee820ebaf5385828c6996874c67b120134c354ca'
export const jointVersion = 'rules-v2-e1:9c2850ca626b57505c25d74296cbaac20b45ed0141188661ac1cb9c32fc39661'
// This signature authenticates a local audit artifact, not production deployment permission.
export const offlineSigningKeys = Object.freeze({
  [jointVersion]: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAzcJFdt5Ah+0xlnQSLt23cFUNjpdQujsvo7mXAgA0lDQ=\n-----END PUBLIC KEY-----\n'
})
export const offlineTrust = Object.freeze({
  [frozenVersion]: 'Phase 1 frozen parity / 36 offline bridges',
  [jointVersion]: '2026-11-07 reviewed aliases, canonical products and conservative semantic holds; lambda=1 local only',
  'rules-v2-e1:8c3ff6ef850a6c5d6d48dd0a1c7f110d77c3e91fa9bf40ff30e06230e35df907': 'Synthetic local release B / one test-only discriminator / same 36 bridges'
})

// Internal Feed release approved for authenticated For You. The external launcher pins this reader.
export const legacyInternalVersion = 'rules-v2-e1:181cfb6fbf986d7d98a4a555fcc143b737d5a749dce653f48853ea9fd2f4efaa'
export const internalVersion = 'rules-v2-e1:2f8ac785a4825063c94c4cd2bb52c7a6cc65290c4b21e7cb139ee89d04965750'
export const internalTrust = Object.freeze({
  [legacyInternalVersion]: 'Original authenticated internal Feed; retained immutable instance reader',
  [internalVersion]: 'User-authorized Internal Test V2, 2026-11-07; unpublished authenticated Feed only'
})
export const internalSigningKeys = Object.freeze({
  [internalVersion]: '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAJsiIi7fe57LFlM+rWnF7shn32ws0KdsKhiKA6o9JBC0=\n-----END PUBLIC KEY-----\n'
})
