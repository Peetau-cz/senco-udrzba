'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

function Tlacitko() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
    >
      {pending ? 'Mažu…' : 'Smazat'}
    </Button>
  )
}

/**
 * Mazání přílohy. Ptá se na potvrzení, protože smazaný návod se z aplikace
 * nevrátí - v úložišti po něm nezůstane ani řádek v tabulce.
 */
export function TlacitkoSmazatSoubor({
  akce,
  nazev,
}: {
  akce: (formData: FormData) => Promise<void>
  nazev: string
}) {
  return (
    <form
      action={akce}
      onSubmit={(udalost) => {
        if (!window.confirm(`Opravdu smazat „${nazev}"?`)) udalost.preventDefault()
      }}
    >
      <Tlacitko />
    </form>
  )
}
