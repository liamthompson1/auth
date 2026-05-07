import { NextResponse } from 'next/server'
import { createAccountAndSignIn, requestOtp } from '@/lib/hx-client'
import { createSession, hashEmail, SESSION_COOKIE, SESSION_COOKIE_OPTS } from '@/lib/auth'
import { randomBytes } from 'crypto'

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}))
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }

  try {
    // Try creating new account first
    try {
      const password = randomBytes(16).toString('base64url')
      await createAccountAndSignIn(email, password)
      const userId = await hashEmail(email)
      const token = await createSession({ email: email.toLowerCase().trim(), userId, userHash: userId })
      const res = NextResponse.json({ success: true, isNewAccount: true })
      res.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTS)
      return res
    } catch { /* account exists — fall through to OTP */ }

    // Existing account: send OTP
    const result = await requestOtp(email)
    if (result.smsError && result.emailError) {
      return NextResponse.json({ success: false, error: 'Failed to send OTP' }, { status: 502 })
    }
    return NextResponse.json({ success: true, isNewAccount: false, smsSentTo: result.smsSentToContactNumberEnding ?? null })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 502 })
  }
}
