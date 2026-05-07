'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { basePath } from '@/lib/basePath'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-white" />}>
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
    <div className="flex-1 flex flex-col items-center justify-start px-5 pt-10 pb-16">

      {/* Logo */}
      <div className="mb-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://d17s4kc6349e5h.cloudfront.net/holidayextras/assets/images/logos/HolidayExtras-logo-stacked-transparent.svg"
          alt="Holiday Extras"
          className="h-24 w-auto"
          style={{ filter: 'invert(20%) sepia(80%) saturate(600%) hue-rotate(240deg) brightness(60%)' }}
        />
      </div>

      {/* Content */}
      <div className="w-full max-w-md">
        <div
          style={{ transition: 'opacity 0.18s ease, transform 0.18s ease', opacity: animating ? 0 : 1, transform: animating ? 'translateX(10px)' : 'none' }}
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
            <ProfileStep loading={loading} onSubmit={handleProfileSubmit}
              onSkip={() => onAuthenticated()} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

const inputCls = [
  'block w-full px-5 text-base text-[#232323] bg-white',
  'border border-[#D0D0D0] rounded-2xl',
  'placeholder-[#542E91] outline-none h-[58px]',
  'transition-[border-color,box-shadow] duration-150',
  'focus:border-[#542E91] focus:shadow-[0_0_0_3px_rgba(84,46,145,0.15)]',
].join(' ')

const inputErrorCls = 'border-[#FF5962] focus:border-[#FF5962] focus:shadow-[0_0_0_3px_rgba(255,89,98,0.15)]'

function PrimaryBtn({ label, loading, disabled, onClick }: { label: string; loading: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      onClick={onClick}
      disabled={disabled ?? loading}
      className="w-full rounded-2xl bg-[#542E91] hover:bg-[#3E226A] active:bg-[#2E194F] disabled:opacity-50 text-white text-lg font-bold h-[58px] transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed"
    >
      {loading ? '…' : label}
    </button>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <div className="text-center">
      <button onClick={onClick} className="text-sm text-[#542E91] hover:underline transition">
        Use a different email
      </button>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return <p className="text-sm text-[#FF5962] font-semibold mt-1">{msg}</p>
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
          className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#542E91] font-semibold hover:underline">
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
      <div className="mb-7">
        <h1 className="text-4xl font-extrabold text-[#542E91] leading-tight">Sign in or Join</h1>
        <p className="mt-2 text-base text-[#656F7E]">Let&apos;s get started with your email address</p>
      </div>
      <div className={shake ? 'animate-shake' : ''}>
        <input type="email" autoComplete="email" autoFocus value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email" required
          className={`${inputCls} ${emailError ? inputErrorCls : ''}`} />
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
  email: string; smsSentTo: string | null; digits: string[]; digitRefs: React.MutableRefObject<(HTMLInputElement | null)[]>
  password: string; setPassword: (v: string) => void; loading: boolean; otpError: string | null; passwordError: string | null
  otpShake: boolean; passwordShake: boolean; resendCountdown: number
  onDigitChange: (i: number, v: string) => void; onDigitKeyDown: (i: number, e: React.KeyboardEvent<HTMLInputElement>) => void
  onResend: () => void; onOtpSubmit: () => void; onPasswordSubmit: () => void; onBack: () => void
}) {
  const otpComplete = digits.every(d => d !== '')
  return (
    <div className="space-y-5">
      <div className="mb-7">
        <h1 className="text-4xl font-extrabold text-[#542E91] leading-tight">Enter your code</h1>
        <p className="mt-2 text-base text-[#656F7E]">
          {smsSentTo
            ? <>Sent to <strong className="text-[#232323]">{email}</strong> and SMS ********{smsSentTo}</>
            : <>Sent to <strong className="text-[#232323]">{email}</strong> and your phone</>}
        </p>
      </div>

      <div className={`flex gap-2 ${otpShake ? 'animate-shake' : ''}`}>
        {digits.map((d, i) => (
          <input key={i} ref={el => { digitRefs.current[i] = el }} type="text" inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={OTP_LENGTH} value={d}
            onChange={e => onDigitChange(i, e.target.value)} onKeyDown={e => onDigitKeyDown(i, e)}
            onFocus={e => e.target.select()}
            className={[
              'flex-1 min-w-0 h-[58px] rounded-2xl border text-center text-2xl font-bold outline-none transition-[border-color,box-shadow] duration-150 bg-white text-[#232323]',
              otpError
                ? 'border-[#FF5962] focus:border-[#FF5962] focus:shadow-[0_0_0_3px_rgba(255,89,98,0.15)]'
                : 'border-[#D0D0D0] focus:border-[#542E91] focus:shadow-[0_0_0_3px_rgba(84,46,145,0.15)]',
            ].join(' ')} />
        ))}
      </div>
      {otpError && <ErrorMsg msg={otpError} />}

      <PrimaryBtn label="Verify" loading={loading} disabled={!otpComplete || loading} onClick={onOtpSubmit} />

      <div className="text-center text-sm">
        {resendCountdown > 0
          ? <span className="text-[#999]">Resend in {resendCountdown}s</span>
          : <button onClick={onResend} disabled={loading} className="text-[#542E91] hover:underline disabled:opacity-40">Resend code</button>}
      </div>

      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-[#EBEBEB]" />
        <span className="text-xs text-[#999] font-semibold tracking-wide uppercase">Or sign in with password</span>
        <div className="flex-1 h-px bg-[#EBEBEB]" />
      </div>

      <PasswordInput value={password} onChange={setPassword} shake={passwordShake} error={passwordError} />
      <button type="button" onClick={onPasswordSubmit} disabled={!password || loading}
        className="w-full rounded-2xl border-2 border-[#542E91] text-[#542E91] text-lg font-bold h-[58px] hover:bg-[#F5F0FF] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150">
        Sign in with password
      </button>

      <BackLink onClick={onBack} />
    </div>
  )
}

// ─── Password fallback ────────────────────────────────────────────────────────

function PasswordFallbackStep({ password, setPassword, loading, passwordError, shake, email, onSubmit, onBack }: {
  password: string; setPassword: (v: string) => void; loading: boolean; passwordError: string | null
  shake: boolean; email: string; onSubmit: () => void; onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="mb-7">
        <h1 className="text-4xl font-extrabold text-[#542E91] leading-tight">Enter your password</h1>
        <p className="mt-2 text-base text-[#656F7E]">
          Signing in as <strong className="text-[#232323]">{email}</strong>
        </p>
      </div>
      <PasswordInput value={password} onChange={setPassword} shake={shake} error={passwordError} />
      <PrimaryBtn label="Sign in" loading={loading} disabled={!password || loading} onClick={onSubmit} />
      <BackLink onClick={onBack} />
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
    <form onSubmit={e => { e.preventDefault(); onSubmit(givenName, familyName, contactNumber) }} className="space-y-4">
      <div className="mb-7">
        <h1 className="text-4xl font-extrabold text-[#542E91] leading-tight">Complete your profile</h1>
        <p className="mt-2 text-base text-[#656F7E]">Tell us a bit about yourself</p>
      </div>
      <div className="flex gap-3">
        <input type="text" autoComplete="given-name" autoFocus value={givenName} onChange={e => setGivenName(e.target.value)}
          placeholder="First name" className={inputCls} style={{ flex: 1 }} />
        <input type="text" autoComplete="family-name" value={familyName} onChange={e => setFamilyName(e.target.value)}
          placeholder="Last name" className={inputCls} style={{ flex: 1 }} />
      </div>
      <input type="tel" autoComplete="tel" value={contactNumber} onChange={e => setContactNumber(e.target.value)}
        placeholder="Phone number" className={inputCls} />
      <PrimaryBtn label="Continue" loading={loading} disabled={loading || !contactNumber} />
      <div className="text-center">
        <button type="button" onClick={onSkip} disabled={loading}
          className="text-sm text-[#542E91] hover:underline disabled:opacity-40">
          Skip for now
        </button>
      </div>
    </form>
  )
}
