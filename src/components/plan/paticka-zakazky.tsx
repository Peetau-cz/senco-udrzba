'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import type { StavKroku } from '@/app/(aplikace)/zakazky/[id]/actions'

function Tlacitko({
  popisek,
  probiha,
  varianta = 'default',
}: {
  popisek: string
  probiha: string
  varianta?: 'default' | 'outline'
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="dotyk" variant={varianta} disabled={pending}>
      {pending ? probiha : popisek}
    </Button>
  )
}

/**
 * Patička checklistu: zahájit, převzít, dokončit.
 *
 * Dokončení je jediné tlačítko, které může selhat s hláškou - nevyřízený krok
 * nebo chybějící povinná fotka. Kontroluje to databázová funkce, ne tenhle
 * komponent: má na to čerstvá data a nikdo ji neobejde. Tlačítko se proto
 * nezakazuje ani při nevyřízených krocích, jen se u něj napíše, co zbývá -
 * zašedlé tlačítko bez vysvětlení je horší než hláška po kliknutí.
 */
export function PatickaZakazky({
  zbyva,
  zahajena,
  mam,
  zahajAkce,
  prevezmiAkce,
  dokonciAkce,
}: {
  zbyva: number
  zahajena: boolean
  mam: boolean
  zahajAkce: () => Promise<void>
  prevezmiAkce: () => Promise<void>
  dokonciAkce: () => Promise<StavKroku>
}) {
  const [stav, dokonciFormAction] = useActionState<StavKroku, FormData>(async () => dokonciAkce(), {})

  return (
    <div className="sticky bottom-0 -mx-4 border-t bg-background/95 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-md sm:border">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm">
          {zbyva > 0 ? (
            <p className="text-muted-foreground">
              Zbývá vyřídit {zbyva} {zbyva === 1 ? 'krok' : zbyva <= 4 ? 'kroky' : 'kroků'}. Co
              nešlo udělat, označte jako neproveditelné s důvodem.
            </p>
          ) : (
            <p className="font-medium text-stav-splneno">Všechny kroky jsou vyřízené.</p>
          )}

          {stav.chyba ? (
            <p role="alert" className="mt-1 font-medium text-destructive">
              {stav.chyba}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          {!zahajena ? (
            <form action={zahajAkce}>
              <Tlacitko popisek="Zahájit" probiha="Zahajuji…" varianta="outline" />
            </form>
          ) : null}

          <form action={prevezmiAkce}>
            <Tlacitko
              popisek={mam ? 'Pustit' : 'Vzít si'}
              probiha="Ukládám…"
              varianta="outline"
            />
          </form>

          <form action={dokonciFormAction}>
            <Tlacitko popisek="Dokončit údržbu" probiha="Dokončuji…" />
          </form>
        </div>
      </div>
    </div>
  )
}
