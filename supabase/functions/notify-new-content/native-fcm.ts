const TE = new TextEncoder()

interface NativeNotification {
  title: string
  body: string
  url: string
  tag: string
  icon?: string
}

function bufToB64url(buf: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToPkcs8(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN (RSA |EC |)PRIVATE KEY-----/g, '')
    .replace(/-----END (RSA |EC |)PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '')
  const bin = atob(base64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function createOAuthAssertion(
  clientEmail: string,
  privateKeyPem: string
): Promise<string> {
  const header = bufToB64url(TE.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const nowSec = Math.floor(Date.now() / 1000)
  const payload = bufToB64url(
    TE.encode(
      JSON.stringify({
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSec,
        exp: nowSec + 3600,
      })
    )
  )
  const signingInput = `${header}.${payload}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, TE.encode(signingInput))
  )
  return `${signingInput}.${bufToB64url(sig)}`
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt) {
    return cachedAccessToken.token
  }

  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL')
  const privateKeyPem = Deno.env.get('FIREBASE_PRIVATE_KEY')
  if (!clientEmail || !privateKeyPem) {
    throw new Error('Native push not configured (missing FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)')
  }

  const assertion = await createOAuthAssertion(clientEmail, privateKeyPem)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  })

  if (!res.ok) {
    throw new Error(`OAuth token request failed with status ${res.status}`)
  }

  const data = await res.json()
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  return cachedAccessToken.token
}

export function isNativeConfigured(): boolean {
  return Boolean(
    Deno.env.get('FIREBASE_PROJECT_ID') &&
    Deno.env.get('FIREBASE_CLIENT_EMAIL') &&
    Deno.env.get('FIREBASE_PRIVATE_KEY')
  )
}

export async function sendNativeNotification(
  token: string,
  notification: NativeNotification
): Promise<void> {
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID')
  if (!projectId) throw new Error('Native push not configured (missing FIREBASE_PROJECT_ID)')

  const accessToken = await getAccessToken()

  const message: Record<string, unknown> = {
    token,
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data: {
      url: notification.url,
      tag: notification.tag,
    },
    android: {
      priority: 'HIGH',
      notification: {
        tag: notification.tag,
        channel_id: 'push_notifications',
      },
    },
  }

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  })

  if (!res.ok) {
    const bodyText = await res.text()
    const error = new Error(
      `FCM v1 responded with status ${res.status}: ${bodyText.slice(0, 200)}`
    ) as Error & { statusCode: number }
    error.statusCode = res.status
    throw error
  }
}