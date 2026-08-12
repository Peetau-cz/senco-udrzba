'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Oblast } from '@/lib/auth/session'

/**
 * Přepínač oblasti. Nabízí jen oblasti, které uživatel smí vidět - ty přicházejí
 * z dotazu filtrovaného RLS, ne z rozhodnutí aplikace. Specialista CNC tu proto
 * uvidí jedinou položku, vedoucí údržby všech pět.
 *
 * Volba se drží v adrese, aby šla nasdílet odkazem a přežila obnovení stránky.
 */
export function PrepinacOblasti({ oblasti }: { oblasti: Oblast[] }) {
  const router = useRouter()
  const cesta = usePathname()
  const parametry = useSearchParams()
  const vybrana = parametry.get('oblast') ?? ''

  if (oblasti.length === 0) return null

  function zmen(hodnota: string) {
    const nove = new URLSearchParams(parametry.toString())
    if (hodnota) {
      nove.set('oblast', hodnota)
    } else {
      nove.delete('oblast')
    }
    router.replace(`${cesta}?${nove.toString()}`)
  }

  // Jediná oblast se nepřepíná, jen se ukáže.
  if (oblasti.length === 1) {
    return (
      <span className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
        {oblasti[0]!.nazev}
      </span>
    )
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">Oblast</span>
      <select
        value={vybrana}
        onChange={(e) => zmen(e.target.value)}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Všechny</option>
        {oblasti.map((o) => (
          <option key={o.id} value={o.kod}>
            {o.nazev}
          </option>
        ))}
      </select>
    </label>
  )
}
