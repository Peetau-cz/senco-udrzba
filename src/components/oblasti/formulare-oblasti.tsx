'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { StavOblasti } from '@/app/(aplikace)/nastaveni/oblasti/actions'

type Akce = (predchozi: StavOblasti, formData: FormData) => Promise<StavOblasti>

const MAX_DELKA_NAZVU = 100

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

/** Přidání oblasti. Po úspěchu se políčko vyprázdní pro další zápis. */
export function PridatOblast({ akce }: { akce: Akce }) {
  const [stav, formAction] = useActionState<StavOblasti, FormData>(akce, {})
  const formular = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!stav.chyba) formular.current?.reset()
  }, [stav])

  return (
    <div>
      <form ref={formular} action={formAction} className="flex flex-wrap items-center gap-2">
        <Input
          name="nazev"
          placeholder="Údržba svařoven"
          required
          maxLength={MAX_DELKA_NAZVU}
          className="h-10 max-w-xs"
          aria-label="Přidat oblast údržby"
        />
        <Tlacitko popisek="Přidat oblast" cekaci="Přidávám…" />
      </form>
      <Chyba hlaska={stav.chyba} />
    </div>
  )
}

/** Přejmenování oblasti. Kód se nemění, proto se needituje. */
export function PrejmenovatOblast({ akce, nazev }: { akce: Akce; nazev: string }) {
  const [stav, formAction] = useActionState<StavOblasti, FormData>(akce, {})

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <Input
          name="nazev"
          defaultValue={nazev}
          required
          maxLength={MAX_DELKA_NAZVU}
          className="h-10 max-w-sm"
          aria-label={`Název: ${nazev}`}
        />
        <Tlacitko popisek="Přejmenovat" cekaci="Ukládám…" />
      </form>
      <Chyba hlaska={stav.chyba} />
    </div>
  )
}

/**
 * Vyřazení oblasti z nabídek a její vrácení zpět.
 *
 * Zařízení ve vyřazené oblasti o zařazení nepřijdou - jen se oblast přestane
 * nabízet tam, kde se zakládá něco nového.
 */
export function PrepnoutAktivituOblasti({
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
