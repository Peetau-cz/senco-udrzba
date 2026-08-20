import { Suspense } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormularSPotvrzenim } from '@/components/ui/potvrzeni'
import { PrepinacOblasti } from '@/components/layout/prepinac-oblasti'
import { odhlasit } from '@/app/login/actions'
import type { PrihlasenyUzivatel } from '@/lib/auth/session'

export function Hlavicka({ uzivatel }: { uzivatel: PrihlasenyUzivatel }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3">
      <Suspense fallback={null}>
        <PrepinacOblasti oblasti={uzivatel.oblasti} />
      </Suspense>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{uzivatel.celeJmeno}</span>
        {/* Odhlášení se ptá: tlačítko sedí vedle přepínače oblastí, kam se na
            tabletu sahá běžně, a rozdělaný checklist by odhlášení zahodilo. */}
        <FormularSPotvrzenim
          akce={odhlasit}
          otazka="Opravdu se odhlásit?"
          popis="Rozepsaný checklist se neuloží. Příště se budete znovu přihlašovat."
          potvrdit="Odhlásit"
        >
          <Button type="submit" variant="ghost" size="sm">
            <LogOut className="size-4" />
            Odhlásit
          </Button>
        </FormularSPotvrzenim>
      </div>
    </header>
  )
}
