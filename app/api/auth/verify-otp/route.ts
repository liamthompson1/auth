import { NextResponse } from 'next/server'
import { verifyOtp } from '@/lib/hx-client'
import { createSession, forwardHxCookies, hashEmail, SESSION_COOKIE, SESSION_COOKIE_OPTS } from '@/lib/auth'

export async function POST(req: Request) {
  const { email, otp } = await req.json().catch(() => ({}))
  if (!email || !otp) return NextResponse.json({ error: 'email and otp required' }, { status: 400 })

  try {
    const data = await verifyOtp(email, otp)
    if (!data.success) return NextResponse.json({ success: false, error: 'Invalid OTP' }, { status: 401 })

    const userId = await hashEmail(email)
    const token = await createSession({ email: email.toLowerCase().trim(), userId, userHash: userId })
    const res = NextResponse.json({ success: true })
    res.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTS)
    forwardHxCookies(res, data.hxCookies)
    return res
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 502 })
  }
}
