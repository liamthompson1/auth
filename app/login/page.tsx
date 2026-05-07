'use client'

import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { basePath } from '@/lib/basePath'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-[#F5F5F5]" />}>
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
        setPasswordError(data.error ?? "That password doesn't look right, please try again.")
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
    if (!EMAIL_RE.test(email)) { setEmailError('Needs to be a valid email'); triggerShake('email'); return }
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
    <div className="flex-1 flex items-start justify-center px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">

        {/* Step heading outside card */}
        <div className="mb-5 text-center">
          {step === 'email' && (
            <>
              <h1 className="text-2xl font-bold text-[#232323]">Sign in or create an account</h1>
              <p className="mt-1 text-sm text-[#656F7E]">Enter your email to get started</p>
            </>
          )}
          {step === 'otp' && (
            <h1 className="text-2xl font-bold text-[#232323]">Enter your one-time passcode</h1>
          )}
          {step === 'passwordFallback' && (
            <h1 className="text-2xl font-bold text-[#232323]">Enter your password</h1>
          )}
          {step === 'profile' && (
            <>
              <h1 className="text-2xl font-bold text-[#232323]">Complete your profile</h1>
              <p className="mt-1 text-sm text-[#656F7E]">Tell us a bit about yourself</p>
            </>
          )}
        </div>

        {/* Card */}
        <div className="bg-white rounded-[6px] shadow-sm border border-[#E0E0E0] p-6 sm:p-8">
          <div style={{ transition: 'opacity 0.2s, transform 0.2s', opacity: animating ? 0 : 1, transform: animating ? 'translateX(12px)' : 'none' }}>
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

        {/* Trust badges */}
        <p className="mt-5 text-center text-xs text-[#999]">
          Trusted by over 20 million customers · Secure login
        </p>
      </div>
    </div>
  )
}

// ─── Shared ───────────────────────────────────────────────────────────────────

const inputCls = [
  'block w-full px-3 py-[6px] text-base text-[#232323] bg-white',
  'border border-[#CCC] rounded-[6px]',
  'shadow-[inset_0_1px_1px_rgba(0,0,0,0.075)]',
  'placeholder-[#999] outline-none',
  'transition-[border-color,box-shadow] duration-150 ease-in-out',
  'focus:border-[#542E91] focus:shadow-[inset_0_1px_1px_rgba(0,0,0,0.075),0_0_0_3px_rgba(84,46,145,0.2)]',
  'h-[42px]',
].join(' ')

const inputErrorCls = 'border-[#FF5962] focus:border-[#FF5962] focus:shadow-[inset_0_1px_1px_rgba(0,0,0,0.075),0_0_0_3px_rgba(255,89,98,0.2)]'

function PrimaryBtn({ label, loading, disabled }: { label: string; loading: boolean; disabled?: boolean }) {
  return (
    <button type="submit" disabled={disabled ?? loading}
      className="inline-block w-full rounded-[6px] bg-[#542E91] hover:bg-[#3E226A] active:bg-[#2E194F] disabled:opacity-60 text-white text-base font-semibold px-3 py-[6px] h-[42px] transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed">
      {loading ? '…' : label}
    </button>
  )
}

function ErrorMessage({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 bg-[#FFEFF0] border-l-[3px] border-[#FF5962] rounded-[6px] px-3 py-2 text-sm text-[#FF5962] font-semibold">
      {msg}
    </div>
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
          className={`${inputCls} pr-14 ${error ? inputErrorCls : ''}`} />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#542E91] hover:text-[#3E226A] font-semibold transition">
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-[#FF5962] font-semibold">{error}</p>}
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <div className="text-center mt-1">
      <button onClick={onClick} className="text-sm text-[#0094FF] hover:text-[#0068B3] hover:underline transition">
        Use a different email
      </button>
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
      <div>
        <label className="block text-sm font-semibold text-[#232323] mb-1">Email address</label>
        <div className={shake ? 'animate-shake' : ''}>
          <input type="email" autoComplete="email" autoFocus value={email} onChange={e => setEmail(e.target.value)}
            placeholder="e.g. jane@example.com" required
            className={`${inputCls} ${emailError ? inputErrorCls : ''}`} />
        </div>
        {emailError && <p className="mt-1 text-xs text-[#FF5962] font-semibold">{emailError}</p>}
      </div>
      {generalError && <ErrorMessage msg={generalError} />}
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
      <p className="text-sm text-[#656F7E]">
        {smsSentTo
          ? <>Code sent to <strong className="text-[#232323]">{email}</strong> and SMS ********{smsSentTo}.</>
          : <>Code sent to <strong className="text-[#232323]">{email}</strong> and your phone.</>}
      </p>

      <div>
        <div className={`flex gap-2 ${otpShake ? 'animate-shake' : ''}`}>
          {digits.map((d, i) => (
            <input key={i} ref={el => { digitRefs.current[i] = el }} type="text" inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={OTP_LENGTH} value={d}
              onChange={e => onDigitChange(i, e.target.value)} onKeyDown={e => onDigitKeyDown(i, e)}
              onFocus={e => e.target.select()}
              className={[
                'flex-1 min-w-0 h-[52px] rounded-[6px] border text-center text-2xl font-bold outline-none transition-[border-color,box-shadow] duration-150',
                'bg-white text-[#232323] shadow-[inset_0_1px_1px_rgba(0,0,0,0.075)]',
                otpError
                  ? 'border-[#FF5962] focus:border-[#FF5962] focus:shadow-[inset_0_1px_1px_rgba(0,0,0,0.075),0_0_0_3px_rgba(255,89,98,0.2)]'
                  : 'border-[#CCC] focus:border-[#542E91] focus:shadow-[inset_0_1px_1px_rgba(0,0,0,0.075),0_0_0_3px_rgba(84,46,145,0.2)]',
              ].join(' ')} />
          ))}
        </div>
        {otpError && <p className="mt-1.5 text-xs text-[#FF5962] font-semibold">{otpError}</p>}
      </div>

      <button type="button" onClick={onOtpSubmit} disabled={!otpComplete || loading}
        className="inline-block w-full rounded-[6px] bg-[#542E91] hover:bg-[#3E226A] disabled:opacity-60 text-white text-base font-semibold h-[42px] transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed">
        {loading ? '…' : 'Verify code'}
      </button>

      <div className="text-center text-sm">
        {resendCountdown > 0
          ? <span className="text-[#999]">Resend in {resendCountdown}s</span>
          : <button onClick={onResend} disabled={loading} className="text-[#0094FF] hover:text-[#0068B3] hover:underline disabled:opacity-40 transition">Resend code</button>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-[#E0E0E0]" />
        <span className="text-xs text-[#999] font-semibold">OR</span>
        <div className="flex-1 h-px bg-[#E0E0E0]" />
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-semibold text-[#232323]">Sign in with password instead</label>
        <PasswordInput value={password} onChange={setPassword} shake={passwordShake} error={passwordError} />
        <button type="button" onClick={onPasswordSubmit} disabled={!password || loading}
          className="inline-block w-full rounded-[6px] border border-[#542E91] bg-white hover:bg-[#F5F0FF] text-[#542E91] text-base font-semibold h-[42px] transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
          Sign in with password
        </button>
      </div>

      <BackLink onClick={onBack} />

      <p className="text-center text-[11px] text-[#999]">
        Protected by reCAPTCHA —{' '}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy</a>
        {' '}·{' '}
        <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms</a>
      </p>
    </div>
  )
}

// ─── Password fallback ────────────────────────────────────────────────────────

function PasswordFallbackStep({ password, setPassword, loading, passwordError, shake, email, onSubmit, onBack }: {
  password: string; setPassword: (v: string) => void; loading: boolean; passwordError: string | null; shake: boolean; email: string; onSubmit: () => void; onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#656F7E]">
        We couldn&apos;t send a passcode to <strong className="text-[#232323]">{email}</strong>. Enter your password to continue.
      </p>
      <PasswordInput value={password} onChange={setPassword} shake={shake} error={passwordError} />
      <button type="button" onClick={onSubmit} disabled={!password || loading}
        className="inline-block w-full rounded-[6px] bg-[#542E91] hover:bg-[#3E226A] disabled:opacity-60 text-white text-base font-semibold h-[42px] transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed">
        {loading ? '…' : 'Sign in'}
      </button>
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
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="block text-sm font-semibold text-[#232323] mb-1">First name</label>
          <input type="text" autoComplete="given-name" autoFocus value={givenName} onChange={e => setGivenName(e.target.value)} placeholder="Jane" className={inputCls} />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-semibold text-[#232323] mb-1">Last name</label>
          <input type="text" autoComplete="family-name" value={familyName} onChange={e => setFamilyName(e.target.value)} placeholder="Smith" className={inputCls} />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold text-[#232323] mb-1">Phone number</label>
        <input type="tel" autoComplete="tel" value={contactNumber} onChange={e => setContactNumber(e.target.value)} placeholder="+44 7700 900000" className={inputCls} />
      </div>
      <PrimaryBtn label="Continue" loading={loading} disabled={loading || !contactNumber} />
      <div className="text-center">
        <button type="button" onClick={onSkip} disabled={loading} className="text-sm text-[#0094FF] hover:text-[#0068B3] hover:underline disabled:opacity-40 transition">
          Skip for now
        </button>
      </div>
    </form>
  )
}
