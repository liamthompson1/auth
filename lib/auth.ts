import { SignJWT, jwtVerify } from 'jose'

const SESSION_SECRET = new TextEncoder().encode(process.env.SESSION_SECRET!)
const CALLBACK_SECRET = new TextEncoder().encode(process.env.CALLBACK_SECRET!)

export const ALLOWED_HOSTS = (process.env.ALLOWED_RETURN_HOSTS ?? '').split(',').map(h => h.trim()).filter(Boolean)

// Internal session (browser cookie)
export async function createSession(payload: { email: string; userId: string; userHash: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SESSION_SECRET)
}

export async function getSession(token: string | undefined) {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, SESSION_SECRET)
    return payload as { email: string; userId: string; userHash: string }
  } catch { return null }
}

// Short-lived callback token returned to the calling app
export async function createCallbackToken(payload: { email: string; userId: string; userHash: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(CALLBACK_SECRET)
}

// Verify a callback token (for apps that want to validate on their side)
export async function verifyCallbackToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, CALLBACK_SECRET)
    return payload as { email: string; userId: string; userHash: string }
  } catch { return null }
}

export async function hashEmail(email: string) {
  const data = new TextEncoder().encode(email.toLowerCase().trim())
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function isAllowedReturnHost(url: string) {
  try {
    const { hostname } = new URL(url)
    return ALLOWED_HOSTS.length === 0 || ALLOWED_HOSTS.includes(hostname)
  } catch { return false }
}

/**
 * Forward all HX cookies from the API response onto our NextResponse.
 * Also mirrors auth_session as auth_token (with domain=holidayextras.com)
 * because HX sets auth_token separately but with the same value.
 */
export function forwardHxCookies(res: import('next/server').NextResponse, rawCookies: string[]) {
  // Cookies we skip (internal HX infra cookies that aren't useful cross-domain)
  const SKIP = new Set(['_ga', '_gid', '_fbp'])
  let authSessionValue: string | null = null

  for (const cookieStr of rawCookies) {
    const [nameValue, ...rest] = cookieStr.split(';')
    const eqIdx = nameValue.indexOf('=')
    if (eqIdx === -1) continue
    const name = nameValue.slice(0, eqIdx).trim()
    const value = nameValue.slice(eqIdx + 1).trim()
    if (SKIP.has(name)) continue

    // Parse MaxAge from the original cookie if present
    const maxAgeStr = rest.find(p => p.trim().toLowerCase().startsWith('max-age='))
    const maxAge = maxAgeStr ? parseInt(maxAgeStr.split('=')[1]) : 60 * 60 * 24 * 30

    res.cookies.set(name, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    })

    if (name === 'auth_session') authSessionValue = value
  }

  // auth_token is the same value as auth_session but scoped to .holidayextras.com
  // so it's visible across all subdomains. HX doesn't return it from the API but
  // the website expects it. We set it ourselves.
  if (authSessionValue) {
    res.cookies.set('auth_token', authSessionValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      domain: 'holidayextras.com',
      maxAge: 60 * 60 * 24 * 30,
    })
  }
}

export const SESSION_COOKIE = 'hxauth_session'
export const SESSION_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7,
}
