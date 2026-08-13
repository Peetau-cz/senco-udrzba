'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Boxes,
  CalendarCheck,
  ClipboardList,
  FileStack,
  GaugeCircle,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Modul, PolozkaMenu } from '@/lib/auth/opravneni'

const IKONY: Record<Modul, React.ComponentType<{ className?: string }>> = {
  dashboard: GaugeCircle,
  plan: CalendarCheck,
  plneni: ClipboardList,
  zarizeni: Boxes,
  sablony: FileStack,
  denik: ScrollText,
  historie: ScrollText,
  provedeni: ClipboardList,
  uzivatele: Users,
  ciselniky: Settings,
  audit: ShieldCheck,
}

export function BocniMenu({ polozky }: { polozky: PolozkaMenu[] }) {
  const cesta = usePathname()

  return (
    <nav aria-label="Hlavní navigace" className="flex flex-col gap-1 p-3">
      {polozky.map((polozka) => {
        const Ikona = IKONY[polozka.modul]
        const jeAktivni =
          polozka.href === '/' ? cesta === '/' : cesta.startsWith(polozka.href)

        return (
          <Link
            key={polozka.modul}
            href={polozka.href}
            aria-current={jeAktivni ? 'page' : undefined}
            className={cn(
              'flex min-h-dotyk items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
              // Aktivní položka nese firemní fialovou. Zelená patří akcím -
              // kdyby ji měla i navigace, tlačítko „Uložit" by splynulo s menu.
              jeAktivni
                ? 'bg-zvyrazneni text-zvyrazneni-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Ikona className="size-5 shrink-0" />
            <span>{polozka.popisek}</span>
          </Link>
        )
      })}
    </nav>
  )
}
