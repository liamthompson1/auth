import { NextResponse } from 'next/server'
import { signInWithPassword } from '@/lib/hx-client'
import { createSession, hashEmail, SESSION_COOKIE, SESSION_COOKIE_OPTS } from '@/lib/auth'

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}))
  if (!email || !password) return NextResponse.json({ error: 'email and password required' }, { status: 400 })

  try {
    await signInWithPassword(email, password)
    const userId = await hashEmail(email)
    const token = await createSession({ email: email.toLowerCase().trim(), userId, userHash: userId })
    const res = NextResponse.json({ success: true })
    res.cookies.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTS)
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed'
    const invalid = msg.toLowerCase().includes('invalid')
    return NextResponse.json(
      { error: invalid ? "That password doesn't look right, please try again." : msg },
      { status: invalid ? 401 : 502 },
    )
  }
}
