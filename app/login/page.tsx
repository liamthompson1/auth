import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createCallbackToken, getSession, SESSION_COOKIE } from '@/lib/auth'
import LoginForm from './LoginForm'

/**
 * Server-rendered login page.
 *
 * If the visitor already has a valid session AND a `returnTo` was supplied,
 * skip the form entirely: mint a fresh callback token and redirect to
 * `<returnTo>?heha_token=<jwt>` (or `&heha_token=…` if the URL already has a
 * query string). Mirrors `onAuthenticated()` in LoginForm.tsx so the manual
 * and automatic paths produce identical redirects.
 *
 * If `returnTo` is missing or the session is absent/expired, render the form.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const returnToRaw = params.returnTo
  const returnTo = typeof returnToRaw === 'string' ? returnToRaw : ''

  if (returnTo) {
    const sessionCookie = (await cookies()).get(SESSION_COOKIE)?.value
    const session = await getSession(sessionCookie)
    if (session) {
      const token = await createCallbackToken({
        email: session.email,
        userId: session.userId,
        userHash: session.userHash,
      })
      const sep = returnTo.includes('?') ? '&' : '?'
      redirect(`${returnTo}${sep}heha_token=${token}`)
    }
  }

  return <LoginForm />
}
