import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'SENCO Údržba',
    template: '%s · SENCO Údržba',
  },
  description: 'Centrální systém řízení údržby výrobní společnosti SENCO Příbram',
}

export const viewport: Viewport = {
  // Aplikace se ovládá i na tabletu v hale.
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs" suppressHydrationWarning>
      <body className="min-h-svh antialiased">{children}</body>
    </html>
  )
}
