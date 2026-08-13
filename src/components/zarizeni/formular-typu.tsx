'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TYPY_PARAMETRU } from '@/lib/zarizeni/parametry'
import { PRAZDNY_RADEK, klicZPopisku, type RadekParametru } from '@/lib/zarizeni/schema-typu'
import type { StavFormulareTypu } from '@/app/(aplikace)/zarizeni/typy/actions'

const POPISKY_TYPU: Record<string, string> = {
  text: 'Text',
  cislo: 'Číslo',
  ano_ne: 'Ano/ne',
  vyber: 'Výběr z možností',
}

type Props = {
  akce: (predchozi: StavFormulareTypu, formData: FormData) => Promise<StavFormulareTypu>
  oblasti: { id: string; nazev: string }[]
  hodnoty: {
    nazev: string
    kod: string
    oblast_id: string
    popis: string
    aktivni: boolean
    parametry: RadekParametru[]
  }
  /** Kód a oblast se po založení nemění - jsou to trvalé identifikátory typu. */
  jeNovy: boolean
  /** Klíče, které typ měl při načtení. Podle nich se pozná ztráta dat. */
  puvodniKlice: string[]
  /** Kolik strojů tohoto typu je v evidenci. Kvůli varování při mazání parametru. */
  pocetZarizeni: number
  zpetHref: string
  popisekTlacitka: string
}

function TlacitkoUlozit({ popisek }: { popisek: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="dotyk" disabled={pending}>
      {pending ? 'Ukládám…' : popisek}
    </Button>
  )
}

export function FormularTypu({
  akce,
  oblasti,
  hodnoty,
  jeNovy,
  puvodniKlice,
  pocetZarizeni,
  zpetHref,
  popisekTlacitka,
}: Props) {
  const [stav, formAction] = useActionState<StavFormulareTypu, FormData>(akce, {})
  const [radky, setRadky] = useState<RadekParametru[]>(hodnoty.parametry)
  const [nazev, setNazev] = useState(hodnoty.nazev)
  const [kod, setKod] = useState(hodnoty.kod)
  // Dokud uživatel kód nesáhne, odvozuje se z názvu. Jakmile ho přepíše, drží se jeho.
  const [kodRucne, setKodRucne] = useState(!jeNovy)

  const chyba = (pole: string) => stav.chybyPoli?.[pole]

  // Parametry, které typ měl a v editoru už nejsou. Databáze po uložení smaže
  // jejich hodnoty u všech strojů (trigger z migrace 0005), proto to varování.
  const odebrane = puvodniKlice.filter((klic) => !radky.some((r) => r.klic === klic))

  function zmenRadek(index: number, zmeny: Partial<RadekParametru>) {
    setRadky((puvodni) => puvodni.map((r, i) => (i === index ? { ...r, ...zmeny } : r)))
  }

  function pridejRadek() {
    setRadky((puvodni) => [...puvodni, { ...PRAZDNY_RADEK }])
  }

  function odeberRadek(index: number) {
    setRadky((puvodni) => puvodni.filter((_, i) => i !== index))
  }

  function presunRadek(index: number, smer: -1 | 1) {
    const cil = index + smer
    if (cil < 0 || cil >= radky.length) return

    setRadky((puvodni) => {
      const kopie = [...puvodni]
      const [vyjmuty] = kopie.splice(index, 1)
      kopie.splice(cil, 0, vyjmuty!)
      return kopie
    })
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Řádky editoru jdou na server jako JSON v jednom poli. */}
      <input type="hidden" name="parametry" value={JSON.stringify(radky)} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Typ zařízení</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nazev">Název</Label>
            <Input
              id="nazev"
              name="nazev"
              value={nazev}
              onChange={(e) => {
                setNazev(e.target.value)
                if (!kodRucne) setKod(klicZPopisku(e.target.value))
              }}
              required
              autoFocus
              placeholder="Frézka"
            />
            <ChybaPole hlaska={chyba('nazev')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="kod">Kód</Label>
            <Input
              id="kod"
              name="kod"
              value={kod}
              onChange={(e) => {
                setKod(e.target.value)
                setKodRucne(true)
              }}
              readOnly={!jeNovy}
              required
              className={jeNovy ? undefined : 'bg-muted'}
            />
            <p className="text-xs text-muted-foreground">
              {jeNovy
                ? 'Odvozuje se z názvu. Po založení už ho nelze změnit.'
                : 'Kód se po založení nemění — odkazují se na něj data i importy.'}
            </p>
            <ChybaPole hlaska={chyba('kod')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="oblast_id">Oblast údržby</Label>
            <Select
              id="oblast_id"
              name="oblast_id"
              defaultValue={hodnoty.oblast_id}
              disabled={!jeNovy}
              required
            >
              <option value="">— vyberte —</option>
              {oblasti.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nazev}
                </option>
              ))}
            </Select>
            {/* Zakázaný select se neodesílá, hodnotu proto veze skryté pole. */}
            {!jeNovy ? <input type="hidden" name="oblast_id" value={hodnoty.oblast_id} /> : null}
            <ChybaPole hlaska={chyba('oblast_id')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="popis">Popis</Label>
            <Input id="popis" name="popis" defaultValue={hodnoty.popis} placeholder="nepovinné" />
          </div>

          <label className="flex items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              name="aktivni"
              defaultChecked={hodnoty.aktivni}
              className="size-5 rounded border-input"
            />
            <span className="text-sm">
              Nabízet při zakládání zařízení
              <span className="block text-xs text-muted-foreground">
                Vypnutím typ zmizí z výběru, ale stroje, které ho už mají, zůstanou.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vlastní technické parametry</CardTitle>
          <CardDescription>
            Co se u strojů tohoto typu eviduje nad rámec výrobního štítku (zadání ř. 93). Pořadí
            určuje, jak se pole zobrazí v kartě zařízení.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {radky.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Zatím žádné parametry. Typ bez nich funguje — karta pak ukazuje jen výrobní štítek.
            </p>
          ) : null}

          {radky.map((radek, index) => (
            <div key={index} className="space-y-3 rounded-md border p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {index + 1}. parametr
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => presunRadek(index, -1)}
                    disabled={index === 0}
                    aria-label={`Posunout ${radek.popisek || 'parametr'} nahoru`}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => presunRadek(index, 1)}
                    disabled={index === radky.length - 1}
                    aria-label={`Posunout ${radek.popisek || 'parametr'} dolů`}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => odeberRadek(index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Odebrat {radek.popisek || 'parametr'}</span>
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`popisek-${index}`}>Popisek</Label>
                  <Input
                    id={`popisek-${index}`}
                    value={radek.popisek}
                    onChange={(e) => {
                      const popisek = e.target.value
                      zmenRadek(index, {
                        popisek,
                        // Klíč se dopisuje, jen dokud ho nikdo nezadal ručně.
                        klic: radek.klic === '' || radek.klic === klicZPopisku(radek.popisek)
                          ? klicZPopisku(popisek)
                          : radek.klic,
                      })
                    }}
                    placeholder="Otáčky vřetene"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`typ-${index}`}>Druh hodnoty</Label>
                  <Select
                    id={`typ-${index}`}
                    value={radek.typ}
                    onChange={(e) =>
                      zmenRadek(index, { typ: e.target.value as RadekParametru['typ'] })
                    }
                  >
                    {TYPY_PARAMETRU.map((t) => (
                      <option key={t} value={t}>
                        {POPISKY_TYPU[t]}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`klic-${index}`}>Klíč v datech</Label>
                  <Input
                    id={`klic-${index}`}
                    value={radek.klic}
                    onChange={(e) => zmenRadek(index, { klic: e.target.value })}
                    placeholder="otacky_vretene"
                    className="cislice-tabulkove"
                  />
                </div>

                {radek.typ === 'cislo' || radek.typ === 'text' ? (
                  <div className="space-y-2">
                    <Label htmlFor={`jednotka-${index}`}>Jednotka</Label>
                    <Input
                      id={`jednotka-${index}`}
                      value={radek.jednotka}
                      onChange={(e) => zmenRadek(index, { jednotka: e.target.value })}
                      placeholder="1/min"
                    />
                  </div>
                ) : null}

                {radek.typ === 'vyber' ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor={`moznosti-${index}`}>Možnosti, každá na svém řádku</Label>
                    <Textarea
                      id={`moznosti-${index}`}
                      value={radek.moznosti}
                      onChange={(e) => zmenRadek(index, { moznosti: e.target.value })}
                      placeholder={'Fanuc\nSiemens\nHeidenhain'}
                    />
                  </div>
                ) : null}

                <label className="flex items-center gap-3 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={radek.povinne}
                    onChange={(e) => zmenRadek(index, { povinne: e.target.checked })}
                    className="size-5 rounded border-input"
                  />
                  <span className="text-sm">Povinný údaj</span>
                </label>
              </div>

              <ChybaPole hlaska={stav.chybyParametru?.[index]} />
            </div>
          ))}

          <Button type="button" variant="outline" onClick={pridejRadek}>
            <Plus className="size-4" />
            Přidat parametr
          </Button>
        </CardContent>
      </Card>

      {odebrane.length > 0 && pocetZarizeni > 0 ? (
        <div
          role="status"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm"
        >
          <p className="font-medium text-destructive">Uložením přijdete o vyplněné hodnoty</p>
          <p className="mt-1">
            Ubyl {odebrane.length === 1 ? 'parametr' : 'parametrů: ' + odebrane.length}{' '}
            <strong>{odebrane.join(', ')}</strong>. U {pocetZarizeni}{' '}
            {pocetZarizeni === 1 ? 'stroje' : 'strojů'} tohoto typu se jeho hodnoty smažou — v kartě
            by se stejně neměly kde ukázat.
          </p>
        </div>
      ) : null}

      {stav.chyba ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {stav.chyba}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <TlacitkoUlozit popisek={popisekTlacitka} />
        <Button type="button" variant="outline" size="dotyk" asChild>
          <Link href={zpetHref}>Zrušit</Link>
        </Button>
      </div>
    </form>
  )
}

function ChybaPole({ hlaska }: { hlaska?: string }) {
  if (!hlaska) return null
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      {hlaska}
    </p>
  )
}
