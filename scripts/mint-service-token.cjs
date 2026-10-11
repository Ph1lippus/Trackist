// Mints a short-lived service_role JWT from the Supabase project's JWT secret.
// The new-format API keys (sb_secret_...) are opaque tokens that the Storage
// API cannot parse - it only accepts JWTs. Signing an HS256 JWT with the
// project's JWT secret and role=service_role reproduces exactly what the
// legacy service_role key was, and works with every Supabase API.
const crypto = require('node:crypto')

const secret = process.argv[2]
if (!secret) {
    console.error('Usage: node scripts/mint-service-token.cjs <SUPABASE_JWT_SECRET>')
    process.exit(1)
}

const b64url = (value) =>
    Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

const now = Math.floor(Date.now() / 1000)
const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
const payload = b64url(JSON.stringify({
    role: 'service_role',
    iss: 'supabase',
    aud: 'authenticated',
    iat: now,
    exp: now + 3600
}))
const signature = b64url(
    crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest()
)

process.stdout.write(`${header}.${payload}.${signature}`)
