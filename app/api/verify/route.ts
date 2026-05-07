import { NextRequest, NextResponse } from 'next/server'
import { verifyCallbackToken } from '@/lib/auth'

/**
 * GET /api/verify?token=<callback_token>
 * Lets any app verify a callback token and get the user's identity.
 * Returns { email, userId, userHash } on success.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const payload = await verifyCallbackToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })

  return NextResponse.json({ email: payload.email, userId: payload.userId, userHash: payload.userHash })
}
