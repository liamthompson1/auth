import type { Metadata } from 'next'
import { Nunito } from 'next/font/google'
import './globals.css'

const nunito = Nunito({ subsets: ['latin'], weight: ['400', '600', '700'] })

export const metadata: Metadata = {
  title: 'Sign In | Holiday Extras',
  description: 'Sign in to your Holiday Extras account',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${nunito.className} min-h-full flex flex-col bg-[#F5F5F5] text-[#232323]`}>
        {/* HX Nav */}
        <nav className="bg-[#542E91] shrink-0">
          <div className="max-w-5xl mx-auto px-4 flex items-center h-[60px] sm:h-[72px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://d17s4kc6349e5h.cloudfront.net/holidayextras/assets/images/logos/HolidayExtras-logo-horizontal-transparent.svg"
              alt="Holiday Extras"
              className="h-8 sm:h-10 w-auto"
            />
          </div>
        </nav>

        <main className="flex-1 flex flex-col">
          {children}
        </main>

        <footer className="shrink-0 text-center text-xs text-[#999] py-6">
          © {new Date().getFullYear()} Holiday Extras. All rights reserved.
        </footer>
      </body>
    </html>
  )
}
