'use client'

import { useFormStatus } from 'react-dom'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

function Tlacitko({
  popisek,
  nazev,
  vyrazne,
}: {
  popisek?: string
  nazev: string
  vyrazne: boolean
}) {
  const { pending } = useFormStatus()

  return (
    <Button
      type="submit"
      variant={vyrazne ? 'outline' : 'ghost'}
      size="sm"
      disabled={pending}
      className={
        vyrazne
          ? 'w-full border-destructive/40 text-destructive hover:bg-destructive/10'
          : 'text-muted-foreground hover:text-destructive'
      }
    >
      {/* Ikona se přidává k textu jen u výrazné varianty. Jinde zůstává vzhled
          přesně takový, jaký byl v M1 - měnit schválené obrazovky kvůli opravě
          jinde není důvod. */}
      {popisek === undefined || vyrazne ? (
        <Trash2 className="size-4" aria-hidden="true" />
      ) : null}
      {popisek ? (pending ? 'Mažu…' : popisek) : null}
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
  vyrazne = false,
}: {
  akce: (formData: FormData) => Promise<void>
  /** Co se maže. Doplní se do potvrzení i do skryté části popisku. */
  nazev: string
  /** Viditelný text tlačítka. Bez něj se vykreslí jen ikona koše. */
  popisek?: string
  otazka?: string
  /**
   * Ohraničené tlačítko místo ghost varianty. Pro místa, kde mazání stojí
   * samostatně a nemá se o co opřít — třeba pod náhledem fotky, kde se šedý
   * text bez rámečku čte jako popiska obrázku.
   */
  vyrazne?: boolean
}) {
  return (
    <form
      action={akce}
      onSubmit={(udalost) => {
        if (!window.confirm(otazka ?? `Opravdu smazat „${nazev}"?`)) udalost.preventDefault()
      }}
    >
      <Tlacitko popisek={popisek} nazev={nazev} vyrazne={vyrazne} />
    </form>
  )
}
