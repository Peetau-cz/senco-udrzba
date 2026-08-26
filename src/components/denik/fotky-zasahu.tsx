'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { TlacitkoSmazat } from '@/components/ui/tlacitko-smazat'
import type { FotkaZapisu } from '@/lib/denik/dotazy'
import { PRIJIMANE_PRIPONY_FOTEK } from '@/lib/plan/fotky'
import type { StavFotky } from '@/app/(aplikace)/denik/actions'

function TlacitkoNahrat() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? 'Nahrávám…' : 'Přidat fotku'}
    </Button>
  )
}

/**
 * Fotky u zápisu v deníku.
 *
 * Přidávat a mazat je jde jen v okně na opravu - stejně jako samotný zápis.
 * Neplatí to jen v rozhraní: politiky nad úložištěm i trigger nad denik_foto
 * se ptají téže funkce (migrace 0022), takže mimo okno to nepustí ani volání
 * API napřímo.
 */
export function FotkyZasahu({
  fotky,
  smiMenit,
  nahrajAkce,
  smazAkce,
}: {
  fotky: FotkaZapisu[]
  smiMenit: boolean
  nahrajAkce: (predchozi: StavFotky, formData: FormData) => Promise<StavFotky>
  smazAkce: (fotkaId: string) => Promise<void>
}) {
  const [stav, formAction] = useActionState<StavFotky, FormData>(nahrajAkce, {})
  const formular = useRef<HTMLFormElement>(null)

  // Po úspěchu vyprázdnit výběr, jinak by druhé kliknutí nahrálo tentýž soubor
  // znovu. Sleduje se celý stav, ne text hlášky - ta se u dvou stejných fotek
  // za sebou neliší.
  useEffect(() => {
    if (stav.hotovo) formular.current?.reset()
  }, [stav])

  return (
    <div className="space-y-4">
      {fotky.length === 0 ? (
        <p className="text-sm text-muted-foreground">U zápisu není žádná fotka.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {fotky.map((fotka) => (
            <li key={fotka.id} className="space-y-2">
              {fotka.odkaz ? (
                // Prosté <img>: odkaz je podepsaný a po hodině vyprší, takže by
                // ho optimalizátor obrázků stejně neměl jak uložit do cache.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fotka.odkaz}
                  alt="Fotka k zásahu"
                  className="max-h-64 w-full rounded-md border object-contain"
                />
              ) : (
                <p className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
                  Fotku se nepodařilo načíst z úložiště.
                </p>
              )}

              {smiMenit ? (
                <TlacitkoSmazat
                  akce={smazAkce.bind(null, fotka.id)}
                  nazev="fotku"
                  otazka="Opravdu odebrat tuhle fotku ze zápisu?"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {smiMenit ? (
        <form ref={formular} action={formAction} className="space-y-2">
          <input
            name="fotka"
            type="file"
            accept={PRIJIMANE_PRIPONY_FOTEK}
            capture="environment"
            required
            aria-label="Fotka k zásahu"
            className="flex h-dotyk w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:h-8 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />

          {stav.chyba ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {stav.chyba}
            </p>
          ) : null}

          {stav.hotovo ? (
            <p role="status" className="text-sm font-medium text-stav-splneno">
              {stav.hotovo}
            </p>
          ) : null}

          <TlacitkoNahrat />
        </form>
      ) : null}
    </div>
  )
}
