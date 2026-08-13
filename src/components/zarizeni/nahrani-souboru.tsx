'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { DRUHY_SOUBORU, MAX_VELIKOST_B, PRIJIMANE_PRIPONY, formatVelikost } from '@/lib/zarizeni/soubory'
import type { StavNahrani } from '@/app/(aplikace)/zarizeni/[id]/soubory-actions'

function TlacitkoNahrat() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="dotyk" disabled={pending}>
      {pending ? 'Nahrávám…' : 'Nahrát'}
    </Button>
  )
}

export function NahraniSouboru({
  akce,
}: {
  akce: (predchozi: StavNahrani, formData: FormData) => Promise<StavNahrani>
}) {
  const [stav, formAction] = useActionState<StavNahrani, FormData>(akce, {})
  const formular = useRef<HTMLFormElement>(null)

  // Po úspěchu vyprázdnit výběr, jinak by druhé kliknutí nahrálo tentýž soubor
  // znovu. Sleduje se celý stav, ne text hlášky - ta se u dvou stejných souborů
  // za sebou neliší.
  useEffect(() => {
    if (stav.hotovo) formular.current?.reset()
  }, [stav])

  return (
    <form ref={formular} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <div className="space-y-2">
          <Label htmlFor="druh">Druh</Label>
          <Select id="druh" name="druh" defaultValue="navod">
            {DRUHY_SOUBORU.map((d) => (
              <option key={d.hodnota} value={d.hodnota}>
                {d.popisek}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="soubor">Soubor</Label>
          <input
            id="soubor"
            name="soubor"
            type="file"
            accept={PRIJIMANE_PRIPONY}
            required
            className="flex h-dotyk w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:h-8 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Obrázky (JPG, PNG, WEBP) a PDF do {formatVelikost(MAX_VELIKOST_B)}.
          </p>
        </div>
      </div>

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
  )
}
