import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'
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
  odkaz,
}: {
  popisek: string
  hodnota: string | number
  poznamka?: string
  ikona: LucideIcon
  odstin?: 'klid' | 'dnes' | 'poterminu' | 'splneno'
  /** Kam dlaždice vede. Bez něj zůstává jen odečtem, jak byla. */
  odkaz?: string
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

  const obsah = (
    <CardContent className="pt-6">
      <div className="flex items-center gap-2">
        <Ikona aria-hidden="true" className={`h-4 w-4 shrink-0 ${barvaIkony}`} />
        <p className="navesti">{popisek}</p>
        {odkaz ? (
          <ChevronRight
            aria-hidden="true"
            className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          />
        ) : null}
      </div>
      {/* Odečet, ne nadpis: číslo je to jediné, co se z dlaždice čte přes halu,
          tak dostane celou váhu a raženou sazbu. Věta pod ním zůstává drobná. */}
      <p className="cislice-tabulkove mt-2 text-4xl font-semibold leading-none">{hodnota}</p>
      {poznamka ? <p className="mt-2 text-sm text-muted-foreground">{poznamka}</p> : null}
    </CardContent>
  )

  // Šipka a zvýraznění při najetí jen u dlaždice, která někam vede - jinak by
  // uživatel klikal do všech čtyř a nic by se nedělo.
  if (odkaz) {
    return (
      <Card className={`group border-l-4 transition-colors hover:bg-accent ${proužek}`}>
        <Link
          href={odkaz}
          className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          {obsah}
        </Link>
      </Card>
    )
  }

  return <Card className={`border-l-4 ${proužek}`}>{obsah}</Card>
}
