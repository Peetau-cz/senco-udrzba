import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { maPravo } from '@/lib/auth/opravneni'

export const metadata = { title: 'Dashboard' }

/**
 * Dashboard je podle zadání (ř. 56) první obrazovkou po přihlášení - nikdy ne
 * seznam zařízení.
 *
 * V modulu M0 zatím nejsou tabulky zakázek ani plánu, takže dlaždice s čísly
 * přijdou s modulem M4. Co už tady funguje a je předmětem schválení M0: obsah
 * se liší podle role a podle oblastí, na které má uživatel právo.
 */
export default async function Dashboard() {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  const smiProvadetUdrzbu = maPravo(uzivatel.role, 'provedeni', 'zapis')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dobrý den, {uzivatel.jmeno || uzivatel.email}.</h1>
        <p className="text-muted-foreground">
          {smiProvadetUdrzbu
            ? 'Tady uvidíte, co máte dnes udělat a co je po termínu.'
            : 'Tady uvidíte přehled plnění údržby napříč oblastmi.'}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Dlazdice popisek="Dnešní plán" />
        <Dlazdice popisek="Po termínu" />
        <Dlazdice popisek="Tento měsíc" />
        <Dlazdice popisek="Plnění" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vaše oblasti</CardTitle>
            <CardDescription>
              Oblasti, ke kterým máte přístup. Seznam vrací databáze podle vašich oprávnění.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {uzivatel.oblasti.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Zatím nemáte přiřazenou žádnou oblast. Obraťte se na administrátora.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {uzivatel.oblasti.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-4">
                    <span>{o.nazev}</span>
                    <span className="text-xs text-muted-foreground">{o.kod}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vaše role</CardTitle>
            <CardDescription>Určuje, které části systému se vám zobrazují.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {uzivatel.role.map((r) => (
                <li
                  key={r}
                  className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                >
                  {r}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Dlazdice({ popisek }: { popisek: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{popisek}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="cislice-tabulkove text-2xl font-semibold text-muted-foreground">—</p>
        <p className="mt-1 text-xs text-muted-foreground">Doplní modul M4</p>
      </CardContent>
    </Card>
  )
}
