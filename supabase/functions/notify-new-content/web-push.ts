const TE = new TextEncoder()

function bufToB64url(buf: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBuf(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const bin = atob(padded)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let total = 0
  for (const a of arrays) total += a.length
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    out.set(a, offset)
    offset += a.length
  }
  return out
}

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const extractKey = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', extractKey, ikm))

  const out = new Uint8Array(length)
  let t = new Uint8Array(0)
  let counter = 1
  const counterSuffix = new Uint8Array(1)
  while (true) {
    if (out.length >= length) break
    counterSuffix[0] = counter
    const toSign = concatBytes(t, info, counterSuffix)
    const expandKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    t = new Uint8Array(await crypto.subtle.sign('HMAC', expandKey, toSign))
    const remaining = length - out.length
    if (remaining <= 0) break
    out.set(t.slice(0, Math.min(t.length, remaining)), length - remaining)
    counter++
  }
  return out
}

async function createVapidToken(
  subject: string,
  publicKeyB64: string,
  privateKeyB64: string,
  audience: string
): Promise<string> {
  const pub = b64urlToBuf(publicKeyB64)
  const x = pub.slice(1, 33)
  const y = pub.slice(33, 65)
  const d = b64urlToBuf(privateKeyB64)

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: bufToB64url(x), y: bufToB64url(y), d: bufToB64url(d) },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  )

  const header = bufToB64url(TE.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT' })))
  const nowSec = Math.floor(Date.now() / 1000)
  const payload = bufToB64url(
    TE.encode(JSON.stringify({ aud: audience, exp: nowSec + 12 * 3600, sub: subject }))
  )
  const signingInput = `${header}.${payload}`
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, TE.encode(signingInput))
  )
  return `${signingInput}.${bufToB64url(sig)}`
}

async function encryptPayloadAes128gcm(
  payload: Uint8Array,
  p256dhB64: string,
  authB64: string
): Promise<Uint8Array> {
  const rawClientKey = b64urlToBuf(p256dhB64)
  const clientPub = rawClientKey.length === 65 ? rawClientKey : concatBytes(new Uint8Array([0x04]), rawClientKey)

  const clientKey = await crypto.subtle.importKey(
    'raw',
    clientPub,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  )
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, eph.privateKey, 256)
  )
  const authSecret = b64urlToBuf(authB64)

  const ikm = await hkdf(sharedSecret, authSecret, concatBytes(TE.encode('WebPush: info\0'), clientPub, asPublic), 32)
  const cek = await hkdf(ikm, new Uint8Array(32), TE.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(ikm, new Uint8Array(32), TE.encode('Content-Encoding: nonce\0'), 12)

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const rs = 4096
  const header = concatBytes(
    salt,
    new Uint8Array([(rs >> 24) & 0xff, (rs >> 16) & 0xff, (rs >> 8) & 0xff, rs & 0xff]),
    new Uint8Array([asPublic.length]),
    asPublic
  )

  let padLen = (16 - (payload.length % 16)) % 16
  if (padLen === 0) padLen = 16
  const padding = new Uint8Array(padLen)
  padding[0] = 0x02
  const plaintext = concatBytes(padding, payload)

  const encKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: header, tagLength: 128 },
      encKey,
      plaintext
    )
  )
  return concatBytes(header, encrypted)
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: string | Uint8Array,
  vapid: { subject: string; publicKey: string; privateKey: string },
  ttlSeconds = 60 * 60 * 24 * 3
): Promise<void> {
  if (!subscription.endpoint || !subscription.p256dh || !subscription.auth) return

  const body = typeof payload === 'string' ? TE.encode(payload) : payload
  const encrypted = await encryptPayloadAes128gcm(body, subscription.p256dh, subscription.auth)
  const audience = new URL(subscription.endpoint).origin
  const token = await createVapidToken(vapid.subject, vapid.publicKey, vapid.privateKey, audience)

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${token}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'high',
      Priority: 'high',
    },
    body: encrypted,
  })

  if (!res.ok) {
    const error = new Error(`Push service responded with status ${res.status}`) as Error & { statusCode: number }
    error.statusCode = res.status
    throw error
  }
}