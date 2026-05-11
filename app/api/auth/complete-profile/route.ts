import { NextRequest, NextResponse } from 'next/server'
import { completeProfile } from '@/lib/hx-client'
import { getSession, SESSION_COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSession(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  // The real HX auth token lives in the auth_session cookie that
  // forwardHxCookies() set during request-otp / verify-otp / login-password.
  // (Previous version passed session.userId, the email hash, which HX rejects.)
  const hxToken = req.cookies.get('auth_session')?.value
  if (!hxToken) return NextResponse.json({ error: 'No HX session' }, { status: 401 })

  const { givenName, familyName, contactNumber } = await req.json().catch(() => ({}))

  // best-effort — not fatal if it fails
  try { await completeProfile(hxToken, { givenName, familyName, contactNumber }) } catch { /* silent */ }

  return NextResponse.json({ success: true })
}
