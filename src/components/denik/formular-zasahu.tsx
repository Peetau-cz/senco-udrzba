'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { DruhZasahu, StrojVNabidce } from '@/lib/denik/dotazy'
import { MAX_DELKA_POPISU, NABIDKA_DOBY_MIN } from '@/lib/denik/zasah'
import { PRIJIMANE_PRIPONY_FOTEK } from '@/lib/plan/fotky'
import type { StavZasahu } from '@/app/(aplikace)/denik/actions'

export type OsobaVNabidce = {
  id: string
  jmeno: string
  prijmeni: string
}

function TlacitkoZapsat() {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" size="dotyk" disabled={pending}>
      {pending ? 'Zapisuji…' : 'Zapsat zásah'}
    </Button>
  )
}

function Chyba({ text }: { text?: string }) {
  if (!text) return null

  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      {text}
    </p>
  )
}

/**
 * Formulář neplánovaného zásahu.
 *
 * Píše se na tabletu v hale, často po směně za víc zásahů najednou - proto je
 * povinné jen to, bez čeho je zápis k ničemu: stroj, druh, popis a kdy.
 * Doba trvání i fotka jsou volitelné (rozhodnutí z 26. 8. 2026); vyplněnost
 * se řeší pohodlím, ne povinností.
 */
export function FormularZasahu({
  akce,
  stroje,
  druhy,
  lide,
  vychoziZarizeniId,
  vychoziCas,
  vychoziProvedlId,
}: {
  akce: (predchozi: StavZasahu, formData: FormData) => Promise<StavZasahu>
  stroje: StrojVNabidce[]
  druhy: DruhZasahu[]
  lide: OsobaVNabidce[]
  vychoziZarizeniId?: string
  vychoziCas: string
  vychoziProvedlId: string
}) {
  const [stav, formAction] = useActionState<StavZasahu, FormData>(akce, {})
  const [doba, setDoba] = useState('')

  const chyby = stav.chybyPoli ?? {}

  return (
    <form action={formAction} className="space-y-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="zarizeni_id">Stroj</Label>
          <Select
            id="zarizeni_id"
            name="zarizeni_id"
            defaultValue={vychoziZarizeniId ?? ''}
            required
          >
            <option value="">— vyberte stroj —</option>
            {stroje.map((stroj) => (
              <option key={stroj.id} value={stroj.id}>
                {stroj.inventarni_cislo ? `${stroj.nazev} (${stroj.inventarni_cislo})` : stroj.nazev}
              </option>
            ))}
          </Select>
          <Chyba text={chyby.zarizeni_id} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="druh_zasahu_id">Druh zásahu</Label>
          <Select id="druh_zasahu_id" name="druh_zasahu_id" defaultValue="" required>
            <option value="">— vyberte druh —</option>
            {druhy.map((druh) => (
              <option key={druh.id} value={druh.id}>
                {druh.nazev}
              </option>
            ))}
          </Select>
          <Chyba text={chyby.druh_zasahu_id} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="popis">Co se dělo</Label>
        <Textarea
          id="popis"
          name="popis"
          rows={3}
          maxLength={MAX_DELKA_POPISU}
          placeholder="Vyměněna žárovka v panelu u dveří."
          required
        />
        <p className="text-xs text-muted-foreground">
          Za rok tenhle řádek někdo bude číst při poruše. Stačí jedna věta, ale konkrétní.
        </p>
        <Chyba text={chyby.popis} />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="provedeno">Kdy se to provedlo</Label>
          {/* Zpětný zápis je běžný provoz - píše se po směně, někdy až druhý
              den. Dopředu to nejde, hlídá si to databáze (migrace 0020). */}
          <Input
            id="provedeno"
            name="provedeno"
            type="datetime-local"
            defaultValue={vychoziCas}
            required
          />
          <Chyba text={chyby.provedeno} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="provedl_id">Kdo zásah provedl</Label>
          {/* V hale je jeden tablet a zapisuje se za partu. Předvyplněný je
              přihlášený, ale dá se přepsat - jinak by historie tvrdila, že
              u stroje byl někdo jiný. */}
          <Select id="provedl_id" name="provedl_id" defaultValue={vychoziProvedlId}>
            <option value="">— neuvedeno —</option>
            {lide.map((osoba) => (
              <option key={osoba.id} value={osoba.id}>
                {`${osoba.jmeno} ${osoba.prijmeni}`.trim()}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="doba_trvani_min">Jak dlouho to trvalo</Label>
        {/* Tři nejčastější délky jedním klepnutím. Bez nich by pole zůstalo
            prázdné - na tabletu v rukavicích nikdo minuty nevyťukává. */}
        <div className="flex flex-wrap items-center gap-2">
          {NABIDKA_DOBY_MIN.map((minut) => (
            <Button
              key={minut}
              type="button"
              size="sm"
              variant={doba === String(minut) ? 'default' : 'outline'}
              onClick={() => setDoba(doba === String(minut) ? '' : String(minut))}
            >
              {minut} min
            </Button>
          ))}
          <Input
            id="doba_trvani_min"
            name="doba_trvani_min"
            inputMode="numeric"
            className="w-28"
            placeholder="minut"
            value={doba}
            onChange={(udalost) => setDoba(udalost.target.value)}
          />
          <span className="text-xs text-muted-foreground">nepovinné</span>
        </div>
        <Chyba text={chyby.doba_trvani_min} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="fotka">Fotka</Label>
        <input
          id="fotka"
          name="fotka"
          type="file"
          accept={PRIJIMANE_PRIPONY_FOTEK}
          capture="environment"
          className="flex h-dotyk w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:h-8 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          Nepovinná. Na tabletu se otevře rovnou fotoaparát.
        </p>
        <Chyba text={chyby.fotka} />
      </div>

      <Chyba text={stav.chyba} />

      <div className="flex flex-wrap items-center gap-3">
        <TlacitkoZapsat />
        <Button asChild variant="outline" size="dotyk">
          <Link href="/denik">Zpět na deník</Link>
        </Button>
      </div>
    </form>
  )
}
