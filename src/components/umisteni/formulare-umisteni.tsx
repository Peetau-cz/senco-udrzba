'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { StavUmisteni } from '@/app/(aplikace)/nastaveni/umisteni/actions'

type Akce = (predchozi: StavUmisteni, formData: FormData) => Promise<StavUmisteni>

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

/** Přidání haly nebo provozu. Po úspěchu se políčko vyprázdní pro další zápis. */
export function PridatUmisteni({
  akce,
  popisek,
  placeholder,
}: {
  akce: Akce
  popisek: string
  placeholder: string
}) {
  const [stav, formAction] = useActionState<StavUmisteni, FormData>(akce, {})
  const formular = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!stav.chyba) formular.current?.reset()
  }, [stav])

  return (
    <div>
      <form ref={formular} action={formAction} className="flex flex-wrap items-center gap-2">
        <Input
          name="nazev"
          placeholder={placeholder}
          required
          maxLength={100}
          className="h-10 max-w-xs"
          aria-label={popisek}
        />
        <Tlacitko popisek={popisek} cekaci="Přidávám…" />
      </form>
      <Chyba hlaska={stav.chyba} />
    </div>
  )
}

/** Přejmenování. Kód se nemění, proto se needituje. */
export function PrejmenovatUmisteni({ akce, nazev }: { akce: Akce; nazev: string }) {
  const [stav, formAction] = useActionState<StavUmisteni, FormData>(akce, {})

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
