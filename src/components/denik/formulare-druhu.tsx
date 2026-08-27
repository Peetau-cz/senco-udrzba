'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { StavDruhu } from '@/app/(aplikace)/nastaveni/druhy-zasahu/actions'

type Akce = (predchozi: StavDruhu, formData: FormData) => Promise<StavDruhu>

function Tlacitko({ popisek, cekaci }: { popisek: string; cekaci: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      {pending ? cekaci : popisek}
    </Button>
  )
}

function Chyba({ hlaska }: { hlaska?: string }) {
  if (!hlaska) return null
  return (
    <p role="alert" className="mt-1 text-sm font-medium text-destructive">
      {hlaska}
    </p>
  )
}

/** Přidání druhu. Po úspěchu se políčko vyprázdní pro další zápis. */
export function PridatDruh({ akce }: { akce: Akce }) {
  const [stav, formAction] = useActionState<StavDruhu, FormData>(akce, {})
  const formular = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!stav.chyba) formular.current?.reset()
  }, [stav])

  return (
    <div>
      <form ref={formular} action={formAction} className="flex flex-wrap items-center gap-2">
        <Input
          name="nazev"
          placeholder="Výměna filtru"
          required
          maxLength={100}
          className="h-10 max-w-xs"
          aria-label="Přidat druh zásahu"
        />
        <Tlacitko popisek="Přidat druh" cekaci="Přidávám…" />
      </form>
      <Chyba hlaska={stav.chyba} />
    </div>
  )
}

/** Přejmenování druhu. Kód se nemění, proto se needituje. */
export function PrejmenovatDruh({ akce, nazev }: { akce: Akce; nazev: string }) {
  const [stav, formAction] = useActionState<StavDruhu, FormData>(akce, {})

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <Input
          name="nazev"
          defaultValue={nazev}
          required
          maxLength={100}
          className="h-10 max-w-xs"
          aria-label={`Název: ${nazev}`}
        />
        <Tlacitko popisek="Přejmenovat" cekaci="Ukládám…" />
      </form>
      <Chyba hlaska={stav.chyba} />
    </div>
  )
}

/**
 * Vyřazení druhu z nabídky a jeho vrácení zpět.
 *
 * Druh, na který visí zápisy, se smazat nedá a nemá - historie by přišla o svůj
 * název. Tohle je způsob, jak ho dostat z formuláře a nechat v minulosti.
 */
export function PrepnoutAktivitu({
  akce,
  aktivni,
  nazev,
}: {
  akce: () => Promise<void>
  aktivni: boolean
  nazev: string
}) {
  return (
    <form action={akce}>
      <Button type="submit" variant="outline" size="sm">
        {aktivni ? 'Vyřadit' : 'Vrátit do nabídky'}
        <span className="sr-only"> — {nazev}</span>
      </Button>
    </form>
  )
}
