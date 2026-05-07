import type { Metadata } from 'next'
import { Nunito } from 'next/font/google'
import './globals.css'

const nunito = Nunito({ subsets: ['latin'], weight: ['400', '600', '700', '800'] })

export const metadata: Metadata = {
  title: 'Sign In | Holiday Extras',
  description: 'Sign in to your Holiday Extras account',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${nunito.className} min-h-full flex flex-col bg-white text-[#232323]`}>
        <main className="flex-1 flex flex-col">
          {children}
        </main>
      </body>
    </html>
  )
}
