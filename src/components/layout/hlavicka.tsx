import { Suspense } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PrepinacOblasti } from '@/components/layout/prepinac-oblasti'
import { odhlasit } from '@/app/login/actions'
import type { PrihlasenyUzivatel } from '@/lib/auth/session'

export function Hlavicka({ uzivatel }: { uzivatel: PrihlasenyUzivatel }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3">
      <Suspense fallback={null}>
        <PrepinacOblasti oblasti={uzivatel.oblasti} />
      </Suspense>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">{uzivatel.celeJmeno}</span>
        <form action={odhlasit}>
          <Button type="submit" variant="ghost" size="sm">
            <LogOut className="size-4" />
            Odhlásit
          </Button>
        </form>
      </div>
    </header>
  )
}
