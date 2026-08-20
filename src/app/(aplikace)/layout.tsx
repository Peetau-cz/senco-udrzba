import { redirect } from 'next/navigation'
import { BocniMenu } from '@/components/layout/bocni-menu'
import { Hlavicka } from '@/components/layout/hlavicka'
import { LogoSenco } from '@/components/layout/logo-senco'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { polozkyMenu } from '@/lib/auth/opravneni'

export default async function AplikacniLayout({ children }: { children: React.ReactNode }) {
  const uzivatel = await nactiPrihlaseneho()

  // Middleware sem nepřihlášeného nepustí; tohle je druhá pojistka pro případ,
  // že by se matcher někdy změnil.
  if (!uzivatel) redirect('/login')

  const polozky = polozkyMenu(uzivatel.role)

  return (
    <div className="flex min-h-svh">
      {/* Lišta je celá ve firemní fialové - pravidlo „fialová = navigace"
          uplatněné na plochu, ne na jednu položku. Logo na ní ale nemůže ležet
          přímo: je samo fialové a zmizelo by. Sedí proto na bílém štítku,
          jako nýtovaný výrobní štítek na boku stroje. */}
      <aside className="hidden w-60 shrink-0 bg-navigace text-navigace-foreground md:block">
        <div className="p-3">
          <div className="flex items-center gap-3 rounded-md bg-card p-3 text-card-foreground">
            <LogoSenco vyska={28} />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">SENCO Údržba</p>
              <p className="navesti pt-0.5">Příbram</p>
            </div>
          </div>
        </div>
        <BocniMenu polozky={polozky} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <Hlavicka uzivatel={uzivatel} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
