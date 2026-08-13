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
      <aside className="hidden w-60 shrink-0 border-r bg-card md:block">
        <div className="space-y-2 border-b px-4 py-4">
          <LogoSenco vyska={36} />
          <div>
            <p className="font-semibold">SENCO Údržba</p>
            <p className="text-xs text-muted-foreground">Příbram</p>
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
