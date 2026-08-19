import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

/**
 * Číslo na dashboardu.
 *
 * Barvu nese proužek u levé hrany a ikona, ne samotné číslo — text zůstává
 * černý, aby se dal číst i přes halu. Stejný přístup jako u značek stavu.
 *
 * Nula není totéž co „nic k řešení": nula po termínu je dobrá zpráva, nula
 * v dnešním plánu je jen prázdný den. Proto se pod číslo píše věta, ne jednotka.
 */
export function Dlazdice({
  popisek,
  hodnota,
  poznamka,
  ikona: Ikona,
  odstin = 'klid',
}: {
  popisek: string
  hodnota: string | number
  poznamka?: string
  ikona: LucideIcon
  odstin?: 'klid' | 'dnes' | 'poterminu' | 'splneno'
}) {
  const proužek = {
    klid: 'border-l-border',
    dnes: 'border-l-stav-dnes',
    poterminu: 'border-l-stav-poterminu',
    splneno: 'border-l-stav-splneno',
  }[odstin]

  const barvaIkony = {
    klid: 'text-muted-foreground',
    dnes: 'text-stav-dnes',
    poterminu: 'text-stav-poterminu',
    splneno: 'text-stav-splneno',
  }[odstin]

  return (
    <Card className={`border-l-4 ${proužek}`}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          <Ikona aria-hidden="true" className={`h-4 w-4 shrink-0 ${barvaIkony}`} />
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{popisek}</p>
        </div>
        <p className="cislice-tabulkove mt-2 text-3xl font-semibold">{hodnota}</p>
        {poznamka ? <p className="mt-1 text-sm text-muted-foreground">{poznamka}</p> : null}
      </CardContent>
    </Card>
  )
}
