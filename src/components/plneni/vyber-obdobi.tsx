'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { popisObdobi } from '@/lib/plneni/vypocet'

/**
 * Přepínač měsíce.
 *
 * Volba se drží v adrese, ne ve stavu prohlížeče — konkrétní měsíc jde poslat
 * odkazem a přežije obnovení stránky. Stejná úmluva jako u přepínače oblasti
 * v hlavičce.
 */
export function VyberObdobi({ nabidka, vybrane }: { nabidka: string[]; vybrane: string }) {
  const router = useRouter()
  const cesta = usePathname()
  const parametry = useSearchParams()

  function zmen(hodnota: string) {
    const nove = new URLSearchParams(parametry.toString())
    nove.set('obdobi', hodnota)
    router.replace(`${cesta}?${nove.toString()}`)
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Období</span>
      <select
        value={vybrane}
        onChange={(e) => zmen(e.target.value)}
        className="h-dotyk rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {nabidka.map((o) => (
          <option key={o} value={o}>
            {popisObdobi(o)}
          </option>
        ))}
      </select>
    </label>
  )
}
