'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { prihlasit, type StavPrihlaseni } from './actions'

function TlacitkoOdeslat() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="dotyk" className="w-full" disabled={pending}>
      {pending ? 'Přihlašuji…' : 'Přihlásit se'}
    </Button>
  )
}

export function PrihlasovaciFormular({ pokracovat }: { pokracovat?: string }) {
  const [stav, formAction] = useActionState<StavPrihlaseni, FormData>(prihlasit, {})

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="pokracovat" value={pokracovat ?? ''} />

      <div className="space-y-2">
        <Label htmlFor="email">Firemní e-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          placeholder="jmeno@senco.cz"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="heslo">Heslo</Label>
        <Input id="heslo" name="heslo" type="password" autoComplete="current-password" required />
      </div>

      {stav.chyba ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {stav.chyba}
        </p>
      ) : null}

      <TlacitkoOdeslat />
    </form>
  )
}
