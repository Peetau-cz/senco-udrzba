'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Camera } from 'lucide-react'
import { TlacitkoSmazat } from '@/components/ui/tlacitko-smazat'
import type { FotkaZapisu } from '@/lib/denik/dotazy'
import { PRIJIMANE_PRIPONY_FOTEK } from '@/lib/plan/fotky'
import type { StavFotky } from '@/app/(aplikace)/denik/actions'

/**
 * Průběh nahrávání místo potvrzovacího tlačítka.
 *
 * Fotka se ukládá sama hned po vyfocení, takže tlačítko „Přidat fotku" by se
 * vedle toho četlo jako povinný druhý krok. Zbývá jediné, co je opravdu
 * potřeba: říct, že se něco děje. Stejně je to u kroku checklistu.
 */
function PrubehNahravani() {
  const { pending } = useFormStatus()
  if (!pending) return null

  return (
    <p role="status" className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <Camera aria-hidden="true" className="size-4" />
      Nahrávám fotku…
    </p>
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

  // Po nahrání vyprázdnit výběr, jinak by druhé vyfocení téhož souboru
  // nespustilo onChange - hodnota pole by se nezměnila. Sleduje se celý stav,
  // ne text hlášky: ta je u dvou fotek za sebou stejná.
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
        <form ref={formular} action={formAction} className="space-y-3">
          <input
            name="fotka"
            type="file"
            accept={PRIJIMANE_PRIPONY_FOTEK}
            capture="environment"
            required
            aria-label="Fotka k zásahu"
            // Nahraje se hned po vyfocení, bez druhého kliknutí - stejně jako
            // u kroku checklistu (M3). Kdo místo tlačítka klepl na něco jiného,
            // o fotku tiše přišel: stránka se překreslila a výběr se zahodil.
            onChange={(udalost) => {
              if (udalost.target.files?.length) udalost.target.form?.requestSubmit()
            }}
            className="flex h-dotyk w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:h-8 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

          <PrubehNahravani />

          <p className="text-xs text-muted-foreground">
            Fotka se uloží hned po vyfocení. Odebrat ji jde, dokud je zápis v okně na opravu.
          </p>
        </form>
      ) : null}
    </div>
  )
}
