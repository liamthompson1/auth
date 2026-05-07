import { NextRequest, NextResponse } from 'next/server'
import { getSession, createCallbackToken, SESSION_COOKIE } from '@/lib/auth'

/**
 * POST /api/auth/callback-token
 * Called by the login page after successful auth.
 * Returns a short-lived signed token to append to the returnTo redirect.
 */
export async function POST(req: NextRequest) {
  const session = await getSession(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const token = await createCallbackToken({
    email: session.email,
    userId: session.userId,
    userHash: session.userHash,
  })

  return NextResponse.json({ token })
}
