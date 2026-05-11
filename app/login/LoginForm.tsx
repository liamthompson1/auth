'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { basePath } from '@/lib/basePath'

export default function LoginForm() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
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
    setAnimating(true); setTimeout(() => { setStep(next); setAnimating(false) }, 180)
  }

  async function onAuthenticated() {
    if (!returnTo) { window.location.href = '/'; return }
    try {
      const res = await fetch(`${basePath}/api/auth/callback-token`, { method: 'POST' })
      const data = await res.json()
      const sep = returnTo.includes('?') ? '&' : '?'
      window.location.href = `${returnTo}${sep}heha_token=${data.token}`
    } catch {
      window.location.href = returnTo
    }
  }

  async function submitPassword() {
    if (!password || loading) return
    setPasswordError(null); setLoading(true)
    try {
      const res = await fetch(`${basePath}/api/auth/login-password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        setPasswordError(data.error ?? "That password doesn't look right.")
        triggerShake('passwordFallback'); return
      }
      await onAuthenticated()
    } catch { setPasswordError('Network error, please try again'); triggerShake('passwordFallback') }
    finally { setLoading(false) }
  }

  async function submitOtp(code: string) {
    if (code.length < OTP_LENGTH || loading) return
    setOtpError(null); setLoading(true)
    try {
      const res = await fetch(`${basePath}/api/auth/verify-otp`, {
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

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!EMAIL_RE.test(email)) { setEmailError('Please enter a valid email address'); triggerShake('email'); return }
    setEmailError(null); setGeneralError(null); setLoading(true)
    try {
      const res = await fetch(`${basePath}/api/auth/request-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        // OTP couldn't be sent — fall back to password
        transitionTo('passwordFallback'); return
      }
      if (data.isNewAccount) {
        // New account: HX session is already established by request-otp.
        // Collect optional profile info before redirecting to returnTo.
        transitionTo('profile'); return
      }
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
      const res = await fetch(`${basePath}/api/auth/request-otp`, {
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
        await fetch(`${basePath}/api/auth/complete-profile`, {
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

  return (
    <div className="flex-1 flex items-start justify-center px-4 py-10 sm:py-14">
      <div
        className="w-full max-w-[480px] bg-white rounded-2xl shadow-sm p-8 sm:p-10"
        style={{ transition: 'opacity 0.18s ease, transform 0.18s ease', opacity: animating ? 0 : 1, transform: animating ? 'translateX(8px)' : 'none' }}
      >
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
            email={email} onSubmit={submitPassword} onBack={goBackToEmail} />
        )}
        {step === 'profile' && (
          <ProfileStep loading={loading} onSubmit={handleProfileSubmit} onSkip={() => onAuthenticated()} />
        )}
      </div>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

const inputCls = [
  'block w-full px-4 text-base text-[#232323] bg-white h-[54px]',
  'border border-[#CFCFCF] rounded-xl outline-none',
  'placeholder-[#999]',
  'transition-[border-color,box-shadow] duration-150',
  'focus:border-[#542E91] focus:shadow-[0_0_0_3px_rgba(84,46,145,0.12)]',
].join(' ')

const inputErrorCls = 'border-[#FF5962] focus:border-[#FF5962] focus:shadow-[0_0_0_3px_rgba(255,89,98,0.12)]'

function StepHeading({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-extrabold text-[#542E91]">{title}</h1>
      {sub && <p className="mt-1.5 text-[#656F7E]">{sub}</p>}
    </div>
  )
}

function Spinner() {
  return (
    <span
      role="status"
      aria-label="Loading"
      className="inline-block h-5 w-5 rounded-full border-2 border-current border-r-transparent animate-spin"
    />
  )
}

function PrimaryBtn({ label, loading, disabled, onClick }: { label: string; loading: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button type={onClick ? 'button' : 'submit'} onClick={onClick} disabled={disabled ?? loading}
      className="w-full flex items-center justify-center rounded-xl bg-[#542E91] hover:bg-[#3E226A] active:bg-[#2E194F] disabled:opacity-50 text-white text-base font-bold h-[54px] transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed">
      {loading ? <Spinner /> : label}
    </button>
  )
}

function OutlineBtn({ label, loading, disabled, onClick }: { label: string; loading: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button type={onClick ? 'button' : 'submit'} onClick={onClick} disabled={disabled ?? loading}
      className="w-full flex items-center justify-center rounded-xl border-2 border-[#542E91] text-[#542E91] text-base font-bold h-[54px] hover:bg-[#F5F0FF] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150">
      {loading ? <Spinner /> : label}
    </button>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return <p className="mt-1.5 text-sm text-[#FF5962] font-semibold">{msg}</p>
}

function DiffEmail({ onClick }: { onClick: () => void }) {
  return (
    <p className="text-center text-sm text-[#999]">
      Wrong email?{' '}
      <button type="button" onClick={onClick} className="text-[#542E91] font-semibold hover:underline">Change it</button>
    </p>
  )
}

function PasswordInput({ value, onChange, placeholder = 'Password', shake = false, error }: {
  value: string; onChange: (v: string) => void; placeholder?: string; shake?: boolean; error?: string | null
}) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <div className={`relative ${shake ? 'animate-shake' : ''}`}>
        <input type={show ? 'text' : 'password'} autoComplete="current-password" value={value}
          onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className={`${inputCls} pr-16 ${error ? inputErrorCls : ''}`} />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#542E91] font-bold hover:underline">
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <ErrorMsg msg={error} />}
    </div>
  )
}

// ─── Email step ───────────────────────────────────────────────────────────────

function EmailStep({ email, setEmail, emailError, generalError, loading, shake, onSubmit }: {
  email: string; setEmail: (v: string) => void; emailError: string | null; generalError: string | null
  loading: boolean; shake: boolean; onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <StepHeading title="Sign in or Join" sub="Let's get started with your email address" />
      <div className={shake ? 'animate-shake' : ''}>
        <input type="email" autoComplete="email" autoFocus value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email" required className={`${inputCls} ${emailError ? inputErrorCls : ''}`} />
        {emailError && <ErrorMsg msg={emailError} />}
      </div>
      {generalError && <ErrorMsg msg={generalError} />}
      <PrimaryBtn label="Continue" loading={loading} disabled={loading || !email} />
    </form>
  )
}

// ─── OTP step ─────────────────────────────────────────────────────────────────

function OtpStep({ email, smsSentTo, digits, digitRefs, password, setPassword, loading, otpError, passwordError,
  otpShake, passwordShake, resendCountdown, onDigitChange, onDigitKeyDown, onResend, onOtpSubmit, onPasswordSubmit, onBack }: {
  email: string; smsSentTo: string | null; digits: string[]
  digitRefs: React.MutableRefObject<(HTMLInputElement | null)[]>
  password: string; setPassword: (v: string) => void; loading: boolean
  otpError: string | null; passwordError: string | null
  otpShake: boolean; passwordShake: boolean; resendCountdown: number
  onDigitChange: (i: number, v: string) => void
  onDigitKeyDown: (i: number, e: React.KeyboardEvent<HTMLInputElement>) => void
  onResend: () => void; onOtpSubmit: () => void; onPasswordSubmit: () => void; onBack: () => void
}) {
  const otpComplete = digits.every(d => d !== '')
  return (
    <div className="space-y-4">
      <StepHeading
        title="One-time-passcode sent"
        sub={smsSentTo
          ? <>We&rsquo;ve sent your code to <strong>••••{smsSentTo}</strong> and <strong>{email}</strong></>
          : <>We&rsquo;ve sent your code to <strong>{email}</strong></>} />

      <div>
        <div className={`flex gap-2 ${otpShake ? 'animate-shake' : ''}`}>
          {digits.map((d, i) => (
            <input key={i} ref={el => { digitRefs.current[i] = el }} type="text" inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={OTP_LENGTH} value={d}
              onChange={e => onDigitChange(i, e.target.value)} onKeyDown={e => onDigitKeyDown(i, e)}
              onFocus={e => e.target.select()}
              className={[
                'flex-1 min-w-0 h-[54px] rounded-xl border text-center text-2xl font-bold outline-none bg-white text-[#232323] transition-[border-color,box-shadow] duration-150',
                otpError
                  ? 'border-[#FF5962] focus:border-[#FF5962] focus:shadow-[0_0_0_3px_rgba(255,89,98,0.12)]'
                  : 'border-[#CFCFCF] focus:border-[#542E91] focus:shadow-[0_0_0_3px_rgba(84,46,145,0.12)]',
              ].join(' ')} />
          ))}
        </div>
        {otpError && <ErrorMsg msg={otpError} />}
      </div>

      <PrimaryBtn label="Verify" loading={loading} disabled={!otpComplete || loading} onClick={onOtpSubmit} />

      <p className="text-center text-sm text-[#999]">
        {resendCountdown > 0
          ? <>Resend in {resendCountdown}s</>
          : <button onClick={onResend} disabled={loading} className="text-[#542E91] font-semibold hover:underline disabled:opacity-40">Resend code</button>}
      </p>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#EBEBEB]" />
        <span className="text-xs font-semibold text-[#BBB] uppercase tracking-wide">or</span>
        <div className="flex-1 h-px bg-[#EBEBEB]" />
      </div>

      <form
        className="space-y-4"
        onSubmit={e => { e.preventDefault(); if (password && !loading) onPasswordSubmit() }}
      >
        <PasswordInput value={password} onChange={setPassword} shake={passwordShake} error={passwordError} />
        <OutlineBtn label="Sign in with password" loading={loading} disabled={!password || loading} />
      </form>
      <DiffEmail onClick={onBack} />
    </div>
  )
}

// ─── Password fallback ────────────────────────────────────────────────────────

function PasswordFallbackStep({ password, setPassword, loading, passwordError, shake, email, onSubmit, onBack }: {
  password: string; setPassword: (v: string) => void; loading: boolean
  passwordError: string | null; shake: boolean; email: string; onSubmit: () => void; onBack: () => void
}) {
  return (
    <form
      className="space-y-4"
      onSubmit={e => { e.preventDefault(); if (password && !loading) onSubmit() }}
    >
      <StepHeading title="Enter your password" sub={`Signing in as ${email}`} />
      <PasswordInput value={password} onChange={setPassword} shake={shake} error={passwordError} />
      <PrimaryBtn label="Sign in" loading={loading} disabled={!password || loading} />
      <DiffEmail onClick={onBack} />
    </form>
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
    <form onSubmit={e => { e.preventDefault(); onSubmit(givenName, familyName, contactNumber) }} className="space-y-4">
      <StepHeading title="Complete your profile" sub="Tell us a bit about yourself" />
      <div className="flex gap-3">
        <input type="text" autoComplete="given-name" autoFocus value={givenName}
          onChange={e => setGivenName(e.target.value)} placeholder="First name"
          className={inputCls} style={{ flex: 1 }} />
        <input type="text" autoComplete="family-name" value={familyName}
          onChange={e => setFamilyName(e.target.value)} placeholder="Last name"
          className={inputCls} style={{ flex: 1 }} />
      </div>
      <input type="tel" autoComplete="tel" value={contactNumber}
        onChange={e => setContactNumber(e.target.value)} placeholder="Phone number" className={inputCls} />
      <PrimaryBtn label="Continue" loading={loading} disabled={loading || !contactNumber} />
      <p className="text-center text-sm">
        <button type="button" onClick={onSkip} disabled={loading}
          className="text-[#542E91] font-semibold hover:underline disabled:opacity-40">
          Skip for now
        </button>
      </p>
    </form>
  )
}
