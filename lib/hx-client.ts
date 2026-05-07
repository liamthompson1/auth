const GRAPHQL_URL = process.env.HX_AUTH_GRAPHQL_URL!

const OTP_DEFAULTS = {
  language: 'en',
  masterBrand: 'holidayextras',
  referrerUrl: 'https://www.holidayextras.com',
  browser: 'Chrome',
  operatingSystem: 'Unknown',
}

export async function createAccountAndSignIn(email: string, password: string) {
  const createRes = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation { createCustomerAccount(userInput: { email: ${JSON.stringify(email)}, password: ${JSON.stringify(password)} }) { id } }`,
    }),
  })
  const createJson = await createRes.json()
  if (createJson.errors?.length) throw new Error(createJson.errors[0].message)

  return signInWithPassword(email, password)
}

export async function signInWithPassword(email: string, password: string) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation SignIn($email: String!, $password: String!, $language: String, $masterBrand: String, $referrerUrl: String, $browser: String, $operatingSystem: String) {
        signInCustomerWithEmailAndPassword(email: $email, password: $password, language: $language, masterBrand: $masterBrand, referrerUrl: $referrerUrl, browser: $browser, operatingSystem: $operatingSystem) {
          success firebaseToken
        }
      }`,
      variables: { email, password, ...OTP_DEFAULTS },
    }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  if (!json.data?.signInCustomerWithEmailAndPassword?.success) throw new Error('Invalid credentials')
  const hxCookies = res.headers.getSetCookie?.() ?? []
  return { firebaseToken: json.data.signInCustomerWithEmailAndPassword.firebaseToken ?? null, hxCookies }
}

export async function requestOtp(email: string) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation GenerateOTP($email: String!, $language: String!, $masterBrand: String!, $referrerUrl: String!, $browser: String!, $operatingSystem: String!) {
        generateOTPCode(email: $email, language: $language, masterBrand: $masterBrand, referrerUrl: $referrerUrl, browser: $browser, operatingSystem: $operatingSystem) {
          smsError emailError smsSentToContactNumberEnding
        }
      }`,
      variables: { email, ...OTP_DEFAULTS },
    }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data.generateOTPCode as { smsError: boolean; emailError: boolean; smsSentToContactNumberEnding: string | null }
}

export async function verifyOtp(email: string, otp: string) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `mutation SignInWithOTP($email: String!, $otp: String!, $language: String, $masterBrand: String, $referrerUrl: String, $browser: String, $operatingSystem: String) {
        signInCustomerWithOTP(email: $email, otp: $otp, language: $language, masterBrand: $masterBrand, referrerUrl: $referrerUrl, browser: $browser, operatingSystem: $operatingSystem) {
          success firebaseToken
        }
      }`,
      variables: { email, otp, ...OTP_DEFAULTS },
    }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  const hxCookies = res.headers.getSetCookie?.() ?? []
  return { ...(json.data.signInCustomerWithOTP as { success: boolean; firebaseToken: string | null }), hxCookies }
}

export async function completeProfile(hxToken: string, profile: { givenName?: string; familyName?: string; contactNumber?: string }) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${hxToken}`,
      'Cookie': `auth_session=${hxToken}`,
    },
    body: JSON.stringify({
      query: `mutation CompleteProfile($givenName: String, $familyName: String, $contactNumber: String) {
        completeRegistration(givenName: $givenName, familyName: $familyName, contactNumber: $contactNumber) { success }
      }`,
      variables: profile,
    }),
  })
  const json = await res.json()
  if (json.errors?.length) throw new Error(json.errors[0].message)
  return json.data?.completeRegistration?.success ?? false
}
