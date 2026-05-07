import { NextRequest, NextResponse } from 'next/server'
import { completeProfile } from '@/lib/hx-client'
import { getSession, SESSION_COOKIE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await getSession(req.cookies.get(SESSION_COOKIE)?.value)
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { givenName, familyName, contactNumber } = await req.json().catch(() => ({}))

  // best-effort — not fatal if it fails
  try { await completeProfile(session.userId, { givenName, familyName, contactNumber }) } catch { /* silent */ }

  return NextResponse.json({ success: true })
}
