import { createMediaUploadServer } from './app.js'
import { loadConfig } from './config.js'
import { createOssSigner } from './oss-signer.js'
import { createSupabaseAuthorizer } from './supabase-auth.js'

const config = loadConfig()
const server = createMediaUploadServer({
  config,
  authorizeTenant: createSupabaseAuthorizer(config),
  signPutUrl: createOssSigner(config),
})

server.listen(config.port, '127.0.0.1', () => {
  console.log(`No Menu media upload service listening on 127.0.0.1:${config.port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
