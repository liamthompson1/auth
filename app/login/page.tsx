'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <LoginContent />
    </Suspense>
  )
}

const OTP_LENGTH = 6
const RESEND_COOLDOWN = 30
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Step = 'email' | 'otp' | 'passwordFallback' | 'profile'

function LoginContent() {
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') ?? ''

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [smsSentTo, setSmsSentTo] = useState<string | null>(null)
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [loading, setLoading] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [otpError, setOtpError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [generalError, setGeneralError] = useState<string | null>(null)
  const [shake, setShake] = useState<Step | null>(null)
  const [resendCountdown, setResendCountdown] = useState(0)
  const [animating, setAnimating] = useState(false)

  const digitRefs = useRef<(HTMLInputElement | null)[]>([])
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (countdownRef.current) clearInterval(countdownRef.current) }, [])

  const startCountdown = useCallback(() => {
    setResendCountdown(RESEND_COOLDOWN)
    if (countdownRef.current) clearInterval(countdownRef.current)
    countdownRef.current = setInterval(() => {
      setResendCountdown(n => { if (n <= 1) { clearInterval(countdownRef.current!); return 0 } return n - 1 })
    }, 1000)
  }, [])

  const triggerShake = useCallback((target: Step) => {
    setShake(target); setTimeout(() => setShake(null), 500)
  }, [])

  function transitionTo(next: Step) {
    setAnimating(true); setTimeout(() => { setStep(next); setAnimating(false) }, 200)
  }

  // After successful auth — fetch a callback token then redirect
  async function onAuthenticated() {
    if (!returnTo) { window.location.href = '/'; return }
    try {
      const res = await fetch('/api/auth/callback-token', { method: 'POST' })
      const data = await res.json()
      const sep = returnTo.includes('?') ? '&' : '?'
      window.location.href = `${returnTo}${sep}heha_token=${data.token}`
    } catch {
      window.location.href = returnTo
    }
  }

  // ── Password login ──────────────────────────────────────────────────────────
  async function submitPassword() {
    if (!password || loading) return
    setPasswordError(null); setLoading(true)
    try {
      const res = await fetch('/api/auth/login-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setPasswordError(data.error ?? "That password doesn't look right, please try again.")
        triggerShake('passwordFallback'); return
      }
      await onAuthenticated()
    } catch { setPasswordError('Network error, please try again'); triggerShake('passwordFallback') }
    finally { setLoading(false) }
  }

  // ── OTP ─────────────────────────────────────────────────────────────────────
  async function submitOtp(code: string) {
    if (code.length < OTP_LENGTH || loading) return
    setOtpError(null); setLoading(true)
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: code }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setOtpError("That code isn't right. Please check and try again.")
        triggerShake('otp'); setDigits(Array(OTP_LENGTH).fill(''))
        setTimeout(() => digitRefs.current[0]?.focus(), 50); return
      }
      await onAuthenticated()
    } catch { setOtpError('Network error, please try again'); triggerShake('otp') }
    finally { setLoading(false) }
  }

  // ── Email submit ─────────────────────────────────────────────────────────────
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!EMAIL_RE.test(email)) { setEmailError('Needs to be a valid email'); triggerShake('email'); return }
    setEmailError(null); setGeneralError(null); setLoading(true)
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        if (data.isNewAccount) { await onAuthenticated(); return }
        transitionTo('passwordFallback'); return
      }
      if (data.isNewAccount) { await onAuthenticated(); return }
      setSmsSentTo(data.smsSentTo); startCountdown()
      setDigits(Array(OTP_LENGTH).fill('')); transitionTo('otp')
      setTimeout(() => digitRefs.current[0]?.focus(), 250)
    } catch { setGeneralError('Network error, please try again') }
    finally { setLoading(false) }
  }

  async function handleResend() {
    if (resendCountdown > 0 || loading) return
    setDigits(Array(OTP_LENGTH).fill('')); setOtpError(null); setLoading(true)
    try {
      const res = await fetch('/api/auth/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (res.ok && data.success) { setSmsSentTo(data.smsSentTo); startCountdown() }
      setTimeout(() => digitRefs.current[0]?.focus(), 50)
    } catch { /* silent */ } finally { setLoading(false) }
  }

  async function handleProfileSubmit(givenName: string, familyName: string, contactNumber: string) {
    if (givenName || familyName || contactNumber) {
      setLoading(true)
      try {
        await fetch('/api/auth/complete-profile', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ givenName, familyName, contactNumber }),
        })
      } catch { /* non-fatal */ } finally { setLoading(false) }
    }
    await onAuthenticated()
  }

  function goBackToEmail() {
    setPassword(''); setOtpError(null); setPasswordError(null); setGeneralError(null)
    setDigits(Array(OTP_LENGTH).fill('')); transitionTo('email')
  }

  function handleDigitChange(index: number, value: string) {
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, OTP_LENGTH)
      const next = Array(OTP_LENGTH).fill('')
      pasted.split('').forEach((ch, i) => { next[i] = ch })
      setDigits(next); digitRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus()
      if (pasted.length === OTP_LENGTH) submitOtp(pasted); return
    }
    const ch = value.replace(/\D/g, ''); const next = [...digits]; next[index] = ch; setDigits(next)
    if (ch && index < OTP_LENGTH - 1) digitRefs.current[index + 1]?.focus()
    const full = next.join('')
    if (full.length === OTP_LENGTH && !next.includes('')) submitOtp(full)
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[index]) { const next = [...digits]; next[index] = ''; setDigits(next) }
      else if (index > 0) digitRefs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && index > 0) digitRefs.current[index - 1]?.focus()
    else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) digitRefs.current[index + 1]?.focus()
  }

  const title = step === 'profile' ? 'Complete your profile' : 'Welcome'
  const subtitle = step === 'profile' ? 'Tell us a bit about yourself' : 'Enter your email to sign in or create an account'
  const showHeader = step === 'email' || step === 'profile'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="text-2xl font-bold tracking-tight text-purple-700 dark:text-purple-400">HEHA!</div>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8">

          {showHeader && (
            <div className="text-center mb-7">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
              <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
            </div>
          )}

          <div style={{ transition: 'opacity 0.2s, transform 0.2s', opacity: animating ? 0 : 1, transform: animating ? 'translateX(16px)' : 'none' }}>
            {step === 'email' && (
              <EmailStep email={email} setEmail={v => { setEmail(v); if (emailError) setEmailError(null) }}
                emailError={emailError} generalError={generalError} loading={loading}
                shake={shake === 'email'} onSubmit={handleEmailSubmit} />
            )}
            {step === 'otp' && (
              <OtpStep email={email} smsSentTo={smsSentTo} digits={digits} digitRefs={digitRefs}
                password={password} setPassword={v => { setPassword(v); if (passwordError) setPasswordError(null) }}
                loading={loading} otpError={otpError} passwordError={passwordError}
                otpShake={shake === 'otp'} passwordShake={shake === 'passwordFallback'}
                resendCountdown={resendCountdown} onDigitChange={handleDigitChange}
                onDigitKeyDown={handleDigitKeyDown} onResend={handleResend}
                onOtpSubmit={() => submitOtp(digits.join(''))}
                onPasswordSubmit={submitPassword} onBack={goBackToEmail} />
            )}
            {step === 'passwordFallback' && (
              <PasswordFallbackStep password={password}
                setPassword={v => { setPassword(v); if (passwordError) setPasswordError(null) }}
                loading={loading} passwordError={passwordError} shake={shake === 'passwordFallback'}
                onSubmit={submitPassword} onBack={goBackToEmail} />
            )}
            {step === 'profile' && (
              <ProfileStep loading={loading} onSubmit={handleProfileSubmit}
                onSkip={() => onAuthenticated()} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

const inputCls = "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition"

function PrimaryBtn({ label, loading, disabled }: { label: string; loading: boolean; disabled?: boolean }) {
  return (
    <button type="submit" disabled={disabled ?? loading}
      className="w-full rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-40 text-white text-sm font-semibold py-3 transition">
      {loading ? '…' : label}
    </button>
  )
}

function PasswordInput({ value, onChange, placeholder = 'Password', autoComplete = 'current-password', shake = false, error }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: string; shake?: boolean; error?: string | null
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <div className={`relative ${shake ? 'animate-shake' : ''}`}>
        <input type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value}
          onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className={inputCls + ' pr-14' + (error ? ' border-red-400 focus:ring-red-400' : '')} />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}

// ─── Email step ───────────────────────────────────────────────────────────────

function EmailStep({ email, setEmail, emailError, generalError, loading, shake, onSubmit }: {
  email: string; setEmail: (v: string) => void; emailError: string | null; generalError: string | null
  loading: boolean; shake: boolean; onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className={shake ? 'animate-shake' : ''}>
        <input type="email" autoComplete="email" autoFocus value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email address" required
          className={inputCls + (emailError ? ' border-red-400 focus:ring-red-400' : '')} />
        {emailError && <p className="mt-1 text-xs text-red-500">{emailError}</p>}
      </div>
      {generalError && <p className="text-xs text-red-500">{generalError}</p>}
      <PrimaryBtn label="Continue" loading={loading} disabled={loading || !email} />
    </form>
  )
}

// ─── OTP step ─────────────────────────────────────────────────────────────────

function OtpStep({ email, smsSentTo, digits, digitRefs, password, setPassword, loading, otpError, passwordError,
  otpShake, passwordShake, resendCountdown, onDigitChange, onDigitKeyDown, onResend, onOtpSubmit, onPasswordSubmit, onBack }: {
  email: string; smsSentTo: string | null; digits: string[]; digitRefs: React.MutableRefObject<(HTMLInputElement | null)[]>
  password: string; setPassword: (v: string) => void; loading: boolean; otpError: string | null; passwordError: string | null
  otpShake: boolean; passwordShake: boolean; resendCountdown: number
  onDigitChange: (i: number, v: string) => void; onDigitKeyDown: (i: number, e: React.KeyboardEvent<HTMLInputElement>) => void
  onResend: () => void; onOtpSubmit: () => void; onPasswordSubmit: () => void; onBack: () => void
}) {
  const otpComplete = digits.every(d => d !== '')
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Enter One-time-passcode</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {smsSentTo ? <>Code sent to <strong className="text-gray-700 dark:text-gray-300">{email}</strong> and SMS ********{smsSentTo}.</>
            : <>Code sent to <strong className="text-gray-700 dark:text-gray-300">{email}</strong> and your phone.</>}
        </p>
      </div>

      <div className={`flex gap-2 ${otpShake ? 'animate-shake' : ''}`}>
        {digits.map((d, i) => (
          <input key={i} ref={el => { digitRefs.current[i] = el }} type="text" inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={OTP_LENGTH} value={d}
            onChange={e => onDigitChange(i, e.target.value)} onKeyDown={e => onDigitKeyDown(i, e)}
            onFocus={e => e.target.select()}
            className={`flex-1 min-w-0 h-12 rounded-xl border text-center text-xl font-bold outline-none transition bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white
              ${otpError ? 'border-red-400 focus:ring-red-400' : 'border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-transparent'}`} />
        ))}
      </div>

      {otpError && <p className="text-xs text-red-500">{otpError}</p>}

      <button type="button" onClick={onOtpSubmit} disabled={!otpComplete || loading}
        className="w-full rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-40 text-white text-sm font-semibold py-3 transition">
        {loading ? '…' : 'Verify'}
      </button>

      <div className="text-center text-sm">
        {resendCountdown > 0
          ? <span className="text-gray-400">Resend in {resendCountdown}s</span>
          : <button onClick={onResend} disabled={loading} className="text-purple-600 hover:underline disabled:opacity-40">Resend code</button>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
        <span className="text-xs text-gray-400">OR</span>
        <div className="flex-1 h-px bg-gray-100 dark:bg-gray-800" />
      </div>

      <PasswordInput value={password} onChange={setPassword} shake={passwordShake} error={passwordError} />
      <button type="button" onClick={onPasswordSubmit} disabled={!password || loading}
        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-semibold py-3 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition">
        Sign in with password
      </button>

      <div className="text-center">
        <button onClick={onBack} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">Use a different email</button>
      </div>

      <p className="text-center text-[11px] text-gray-400">
        HEHA is protected by reCAPTCHA and the Google{' '}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a>
        {' '}and{' '}
        <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms of Service</a>
        {' '}apply.
      </p>
    </div>
  )
}

// ─── Password fallback ────────────────────────────────────────────────────────

function PasswordFallbackStep({ password, setPassword, loading, passwordError, shake, onSubmit, onBack }: {
  password: string; setPassword: (v: string) => void; loading: boolean; passwordError: string | null; shake: boolean; onSubmit: () => void; onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-gray-500 dark:text-gray-400">We couldn&apos;t send a passcode right now, enter your password.</p>
      <PasswordInput value={password} onChange={setPassword} shake={shake} error={passwordError} />
      <button type="button" onClick={onSubmit} disabled={!password || loading}
        className="w-full rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-40 text-white text-sm font-semibold py-3 transition">
        {loading ? '…' : 'Sign in'}
      </button>
      <div className="text-center">
        <button onClick={onBack} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">Use a different email</button>
      </div>
    </div>
  )
}

// ─── Profile step ─────────────────────────────────────────────────────────────

function ProfileStep({ loading, onSubmit, onSkip }: {
  loading: boolean; onSubmit: (g: string, f: string, c: string) => void; onSkip: () => void
}) {
  const [givenName, setGivenName] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(givenName, familyName, contactNumber) }} className="space-y-3">
      <div className="flex gap-2">
        <input type="text" autoComplete="given-name" autoFocus value={givenName} onChange={e => setGivenName(e.target.value)} placeholder="First name" className={inputCls} style={{ flex: 1 }} />
        <input type="text" autoComplete="family-name" value={familyName} onChange={e => setFamilyName(e.target.value)} placeholder="Last name" className={inputCls} style={{ flex: 1 }} />
      </div>
      <input type="tel" autoComplete="tel" value={contactNumber} onChange={e => setContactNumber(e.target.value)} placeholder="Phone number" className={inputCls} />
      <PrimaryBtn label="Continue" loading={loading} disabled={loading || !contactNumber} />
      <div className="text-center">
        <button type="button" onClick={onSkip} disabled={loading} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-40 transition">Skip for now</button>
      </div>
    </form>
  )
}
