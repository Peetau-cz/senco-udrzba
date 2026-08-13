'use client'

import { useFormStatus } from 'react-dom'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

function Tlacitko({ popisek, nazev }: { popisek?: string; nazev: string }) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
    >
      {popisek ? (
        pending ? (
          'Mažu…'
        ) : (
          popisek
        )
      ) : (
        <Trash2 className="size-4" aria-hidden="true" />
      )}
      <span className="sr-only"> {nazev}</span>
    </Button>
  )
}

/**
 * Mazání s potvrzením.
 *
 * Ptá se přes window.confirm, protože smazaný záznam se z aplikace nevrátí.
 * Bez javascriptu potvrzení nepřijde a smazání proběhne rovnou - to je
 * přijatelné, obojí totiž stejně nakonec posoudí databáze.
 */
export function TlacitkoSmazat({
  akce,
  nazev,
  popisek,
  otazka,
}: {
  akce: (formData: FormData) => Promise<void>
  /** Co se maže. Doplní se do potvrzení i do skryté části popisku. */
  nazev: string
  /** Viditelný text tlačítka. Bez něj se vykreslí jen ikona koše. */
  popisek?: string
  otazka?: string
}) {
  return (
    <form
      action={akce}
      onSubmit={(udalost) => {
        if (!window.confirm(otazka ?? `Opravdu smazat „${nazev}"?`)) udalost.preventDefault()
      }}
    >
      <Tlacitko popisek={popisek} nazev={nazev} />
    </form>
  )
}
