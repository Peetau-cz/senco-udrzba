import type { Metadata, Viewport } from 'next'
import { Archivo, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

/**
 * Písmo aplikace.
 *
 * Archivo je grotesk odvozený z dopravního a veřejného značení - tedy z téhož
 * světa jako popisky na strojích. Je variabilní a má osu šířky, takže nadpisy
 * jdou zúžit bez druhé rodiny: jedno písmo, dvě povahy.
 *
 * Plex Mono nese ražené údaje - inventární čísla, kódy, intervaly. Identifikátor
 * se na stroj razí, nepíše, a v jednotné šířce znaků jdou čísla porovnat pohledem
 * po sloupci.
 *
 * `latin-ext` je povinné, ne volitelné: bez něj by v ě, š, č, ř, ž chyběly glyfy
 * a prohlížeč by je dosadil z náhradního písma.
 */
const pismo = Archivo({
  subsets: ['latin', 'latin-ext'],
  axes: ['wdth'],
  variable: '--pismo',
  display: 'swap',
})

const pismoRazene = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--pismo-razene',
  display: 'swap',
})

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
    <html lang="cs" className={`${pismo.variable} ${pismoRazene.variable}`} suppressHydrationWarning>
      <body className="min-h-svh font-sans antialiased">{children}</body>
    </html>
  )
}
