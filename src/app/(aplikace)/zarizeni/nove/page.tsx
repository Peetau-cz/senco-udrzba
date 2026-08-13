import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FormularZarizeni } from '@/components/zarizeni/formular-zarizeni'
import { maPravo } from '@/lib/auth/opravneni'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { nactiCiselniky } from '@/lib/zarizeni/dotazy'
import { ulozZarizeni } from '../actions'

export const metadata = { title: 'Nové zařízení' }

export default async function StrankaNoveZarizeni() {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) redirect('/login')

  // Zápis stejně vynucuje politika zarizeni_insert. Tahle kontrola jen šetří
  // uživateli cestu formulářem, který by mu databáze na konci odmítla.
  if (!maPravo(uzivatel.role, 'zarizeni', 'zapis')) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Nové zařízení</CardTitle>
          <CardDescription>Zakládat stroje smí garant oblasti.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Vaše role eviduje údržbu, ale karty strojů nezakládá. Obraťte se na garanta své
            oblasti nebo na vedoucího údržby.
          </p>
          <Link href="/zarizeni" className="mt-4 inline-block underline">
            Zpět na seznam zařízení
          </Link>
        </CardContent>
      </Card>
    )
  }

  const ciselniky = await nactiCiselniky()

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-1">
        <Link href="/zarizeni" className="text-sm text-muted-foreground hover:underline">
          ‹ Zařízení
        </Link>
        <h1 className="text-2xl font-semibold">Nové zařízení</h1>
        <p className="text-muted-foreground">
          Povinný je název a typ. Zbytek se dá doplnit kdykoli později.
        </p>
      </div>

      {ciselniky.typy.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Chybí typy zařízení</CardTitle>
            <CardDescription>
              Bez typu nelze stroj založit — typ určuje oblast i technické parametry.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Nahrajte číselník typů (<code>supabase/seed_cnc.sql</code>) nebo požádejte
            administrátora.
          </CardContent>
        </Card>
      ) : (
        <FormularZarizeni
          akce={ulozZarizeni.bind(null, null)}
          typy={ciselniky.typy}
          umisteni={ciselniky.umisteni}
          osoby={ciselniky.osoby}
          zpetHref="/zarizeni"
          popisekTlacitka="Založit zařízení"
          hodnoty={{
            nazev: '',
            typ_zarizeni_id: '',
            inventarni_cislo: '',
            vyrobce: '',
            model: '',
            vyrobni_cislo: '',
            rok_vyroby: '',
            umisteni_id: '',
            odpovedna_osoba_id: '',
            stav: 'v_provozu',
            poznamka: '',
            parametry: {},
          }}
        />
      )}
    </div>
  )
}
