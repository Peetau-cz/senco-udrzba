'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Boxes,
  CalendarCheck,
  ClipboardList,
  FileStack,
  GaugeCircle,
  MapPin,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PolozkaMenu } from '@/lib/auth/opravneni'

/**
 * Ikony podle adresy, ne podle modulu: dvě položky mohou spadat pod stejné
 * právo (číselníky a umístění) a přesto potřebují každá svou ikonu.
 */
const IKONY: Record<string, React.ComponentType<{ className?: string }>> = {
  '/': GaugeCircle,
  '/plan': CalendarCheck,
  '/plneni': ClipboardList,
  '/zarizeni': Boxes,
  '/sablony': FileStack,
  '/denik': ScrollText,
  '/nastaveni/uzivatele': Users,
  '/nastaveni/oblasti': Settings,
  '/nastaveni/umisteni': MapPin,
  '/audit': ShieldCheck,
}

export function BocniMenu({ polozky }: { polozky: PolozkaMenu[] }) {
  const cesta = usePathname()

  return (
    <nav aria-label="Hlavní navigace" className="flex flex-col gap-1 p-3">
      {polozky.map((polozka) => {
        const Ikona = IKONY[polozka.href] ?? Settings
        const jeAktivni =
          polozka.href === '/' ? cesta === '/' : cesta.startsWith(polozka.href)

        return (
          <Link
            key={polozka.href}
            href={polozka.href}
            aria-current={jeAktivni ? 'page' : undefined}
            className={cn(
              'relative flex min-h-dotyk items-center gap-3 rounded-md pl-4 pr-3 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navigace-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-navigace',
              // Lišta je celá fialová, takže fialovou už nejde nic vyznačit.
              // Značku „jsi tady" nese druhá firemní barva: zelený pruh u hrany
              // plus světlejší plocha. Zelená tady neznamená akci, ale polohu -
              // je to jediné místo v aplikaci, kde má tuhle roli, a plyne to
              // z toho, že pod ní není bílé pozadí, ale fialové.
              jeAktivni
                ? 'bg-white/15 text-navigace-foreground'
                : 'text-navigace-tlumene hover:bg-white/10 hover:text-navigace-foreground',
            )}
          >
            {jeAktivni ? (
              <span
                aria-hidden="true"
                className="absolute inset-y-2 left-0 w-1 rounded-full bg-znacka-zelena"
              />
            ) : null}
            <Ikona className="size-5 shrink-0" />
            <span>{polozka.popisek}</span>
          </Link>
        )
      })}
    </nav>
  )
}
