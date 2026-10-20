import { createAiServiceServer } from './app.js'
import { loadConfig } from './config.js'
import { createQwenBeerLabelRecognizer } from './qwen-client.js'
import { createUserRateLimiter } from './rate-limit.js'
import { createSupabaseUserAuthorizer } from './supabase-auth.js'

const config = loadConfig()
const server = createAiServiceServer({
  config,
  authorizeUser: createSupabaseUserAuthorizer(config),
  recognizeBeerLabels: createQwenBeerLabelRecognizer(config),
  checkRateLimit: createUserRateLimiter(config.maxRequestsPerMinute),
})

server.listen(config.port, '127.0.0.1', () => {
  console.log(`No Menu AI service listening on 127.0.0.1:${config.port}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
