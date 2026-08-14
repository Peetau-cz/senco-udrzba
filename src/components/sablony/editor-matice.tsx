'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  TYPY_INTERVALU,
  ZAKLADY_INTERVALU,
  jeTypIntervalu,
  popisIntervalu,
} from '@/lib/sablony/interval'
import {
  DRUHY_BODU,
  prazdnyBod,
  type DruhBodu,
  type KontrolniBod,
} from '@/lib/sablony/kontrolni-body'
import { prazdnyRadek, type RadekUkonu } from '@/lib/sablony/matice'
import type { StavMatice } from '@/app/(aplikace)/sablony/actions'

type Props = {
  akce: (predchozi: StavMatice, formData: FormData) => Promise<StavMatice>
  profese: { id: string; nazev: string }[]
  ukony: RadekUkonu[]
}

function TlacitkoUlozit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="dotyk" disabled={pending}>
      {pending ? 'Ukládám…' : 'Uložit matici'}
    </Button>
  )
}

/**
 * Editor matice úkonů rozdělané verze.
 *
 * Kreslí se jako karty pod sebou, ne jako tabulka: úkon má patnáct polí a do
 * řádku tabulky se nevejdou ani na monitoru, natož na tabletu v dílně.
 */
export function EditorMatice({ akce, profese, ukony }: Props) {
  const [stav, formAction] = useActionState<StavMatice, FormData>(akce, {})
  const [radky, setRadky] = useState<RadekUkonu[]>(ukony)

  function zmenRadek(index: number, zmeny: Partial<RadekUkonu>) {
    setRadky((puvodni) => puvodni.map((r, i) => (i === index ? { ...r, ...zmeny } : r)))
  }

  function pridejRadek() {
    setRadky((puvodni) => [...puvodni, prazdnyRadek()])
  }

  function odeberRadek(index: number) {
    setRadky((puvodni) => puvodni.filter((_, i) => i !== index))
  }

  function zmenBod(index: number, poradiBodu: number, zmeny: Partial<KontrolniBod>) {
    zmenRadek(index, {
      kontrolni_body: radky[index]!.kontrolni_body.map((bod, i) =>
        i === poradiBodu ? { ...bod, ...zmeny } : bod,
      ),
    })
  }

  function pridejBod(index: number) {
    zmenRadek(index, { kontrolni_body: [...radky[index]!.kontrolni_body, prazdnyBod()] })
  }

  function odeberBod(index: number, poradiBodu: number) {
    zmenRadek(index, {
      kontrolni_body: radky[index]!.kontrolni_body.filter((_, i) => i !== poradiBodu),
    })
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
    <form action={formAction} className="space-y-4">
      {/* Řádky editoru jdou na server jako JSON v jednom poli. */}
      <input type="hidden" name="ukony" value={JSON.stringify(radky)} />

      {radky.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="font-medium">Matice je zatím prázdná.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Bez jediného úkonu nejde verze aktivovat — nebylo by co plánovat.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {radky.map((radek, index) => {
        // Náhled intervalu slovy. Dokud je pole rozepsané, prostě se neukáže.
        const pocet = Number(radek.interval_hodnota)
        const interval =
          jeTypIntervalu(radek.interval_typ) && Number.isInteger(pocet) && pocet > 0
            ? popisIntervalu(radek.interval_typ, pocet)
            : null

        return (
          <Card key={index}>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
              <div>
                <CardTitle className="text-base">{index + 1}. úkon</CardTitle>
                {interval ? <CardDescription>{interval}</CardDescription> : null}
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => presunRadek(index, -1)}
                  disabled={index === 0}
                  aria-label={`Posunout ${radek.nazev || 'úkon'} nahoru`}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => presunRadek(index, 1)}
                  disabled={index === radky.length - 1}
                  aria-label={`Posunout ${radek.nazev || 'úkon'} dolů`}
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
                  <span className="sr-only">Odebrat {radek.nazev || 'úkon'}</span>
                </Button>
              </div>
            </CardHeader>

            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor={`nazev-${index}`}>Název úkonu</Label>
                <Input
                  id={`nazev-${index}`}
                  value={radek.nazev}
                  onChange={(e) => zmenRadek(index, { nazev: e.target.value })}
                  placeholder="Kontrola hladiny oleje"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor={`popis-${index}`}>Postup pro technika</Label>
                <Textarea
                  id={`popis-${index}`}
                  value={radek.popis}
                  onChange={(e) => zmenRadek(index, { popis: e.target.value })}
                  placeholder="nepovinné — co přesně se má udělat"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`interval-${index}`}>Interval</Label>
                <div className="flex gap-2">
                  <Input
                    id={`interval-${index}`}
                    value={radek.interval_hodnota}
                    onChange={(e) => zmenRadek(index, { interval_hodnota: e.target.value })}
                    inputMode="numeric"
                    className="cislice-tabulkove w-24"
                  />
                  <Select
                    value={radek.interval_typ}
                    onChange={(e) => zmenRadek(index, { interval_typ: e.target.value })}
                    aria-label="Jednotka intervalu"
                  >
                    {TYPY_INTERVALU.map((t) => (
                      <option key={t.hodnota} value={t.hodnota}>
                        {t.popisek}
                      </option>
                    ))}
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Jen kalendářní intervaly — motohodiny stroje nehlásí.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`zaklad-${index}`}>Další termín se počítá</Label>
                <Select
                  id={`zaklad-${index}`}
                  value={radek.interval_zaklad}
                  onChange={(e) => zmenRadek(index, { interval_zaklad: e.target.value })}
                >
                  {ZAKLADY_INTERVALU.map((z) => (
                    <option key={z.hodnota} value={z.hodnota}>
                      {z.popisek}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  Rozdíl je vidět u zpožděné údržby: od plánu drží původní kalendář, od provedení se
                  posunou i všechny další termíny.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`profese-${index}`}>Provádí profese</Label>
                <Select
                  id={`profese-${index}`}
                  value={radek.profese_role_id}
                  onChange={(e) => zmenRadek(index, { profese_role_id: e.target.value })}
                >
                  <option value="">— vyberte —</option>
                  {profese.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nazev}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`tolerance-${index}`}>Tolerance po termínu (dny)</Label>
                <Input
                  id={`tolerance-${index}`}
                  value={radek.tolerance_dny}
                  onChange={(e) => zmenRadek(index, { tolerance_dny: e.target.value })}
                  inputMode="numeric"
                  className="cislice-tabulkove"
                />
                <p className="text-xs text-muted-foreground">
                  Do kolika dnů po termínu se úkon ještě počítá jako splněný.
                </p>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Kontrolní body</Label>
                <p className="text-xs text-muted-foreground">
                  Dílčí kroky uvnitř úkonu. U každého se určí, co technik zapíše: naměřenou hodnotu,
                  nebo prosté ano/ne.
                </p>

                {radek.kontrolni_body.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Žádné — úkon je jeden krok.</p>
                ) : (
                  <ul className="space-y-2">
                    {radek.kontrolni_body.map((bod, poradiBodu) => (
                      <li key={poradiBodu} className="flex gap-2">
                        <Input
                          value={bod.nazev}
                          onChange={(e) => zmenBod(index, poradiBodu, { nazev: e.target.value })}
                          placeholder="Kryt dotažen"
                          aria-label={`Název ${poradiBodu + 1}. kontrolního bodu`}
                        />
                        <Select
                          value={bod.typ}
                          onChange={(e) =>
                            zmenBod(index, poradiBodu, { typ: e.target.value as DruhBodu })
                          }
                          aria-label={`Druh zápisu ${poradiBodu + 1}. kontrolního bodu`}
                          className="w-48"
                        >
                          {DRUHY_BODU.map((d) => (
                            <option key={d.hodnota} value={d.hodnota}>
                              {d.popisek}
                            </option>
                          ))}
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => odeberBod(index, poradiBodu)}
                          className="shrink-0 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">Odebrat bod {bod.nazev || poradiBodu + 1}</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}

                <Button type="button" variant="outline" size="sm" onClick={() => pridejBod(index)}>
                  <Plus className="size-4" />
                  Přidat kontrolní bod
                </Button>
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label>Co technik u úkonu zapíše</Label>
                {/* Potvrzení ano/ne má každý úkon z podstaty - je to odpověď na
                    otázku „proběhlo a je to v pořádku?". Nastavuje se jen to,
                    co k němu přibude navíc. */}
                <p className="rounded-md bg-secondary px-3 py-2 text-xs">
                  <strong>Ano / ne</strong> má úkon vždycky — technik potvrdí, že proběhl a je v
                  pořádku. Níž se přidává, co k tomu ještě dostane.
                </p>

                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={radek.nabizi_poznamku}
                      onChange={(e) => zmenRadek(index, { nabizi_poznamku: e.target.checked })}
                      className="size-5 rounded border-input"
                    />
                    <span className="text-sm">Pole na rozepsání</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={radek.vyzaduje_foto}
                      onChange={(e) => zmenRadek(index, { vyzaduje_foto: e.target.checked })}
                      className="size-5 rounded border-input"
                    />
                    <span className="text-sm">Fotografii</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={radek.vyzaduje_hodnotu}
                      onChange={(e) => zmenRadek(index, { vyzaduje_hodnotu: e.target.checked })}
                      className="size-5 rounded border-input"
                    />
                    <span className="text-sm">Naměřenou hodnotu</span>
                  </label>
                </div>
              </div>

              {/* Jednotka a meze mají smysl jen u měření - jinak by je databáze
                  odmítla omezením sablona_ukon_meze_jen_pri_mereni. */}
              {radek.vyzaduje_hodnotu ? (
                <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor={`jednotka-${index}`}>Jednotka</Label>
                    <Input
                      id={`jednotka-${index}`}
                      value={radek.jednotka}
                      onChange={(e) => zmenRadek(index, { jednotka: e.target.value })}
                      placeholder="mm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`mezmin-${index}`}>Dolní mez</Label>
                    <Input
                      id={`mezmin-${index}`}
                      value={radek.mez_min}
                      onChange={(e) => zmenRadek(index, { mez_min: e.target.value })}
                      inputMode="decimal"
                      className="cislice-tabulkove"
                      placeholder="nepovinné"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`mezmax-${index}`}>Horní mez</Label>
                    <Input
                      id={`mezmax-${index}`}
                      value={radek.mez_max}
                      onChange={(e) => zmenRadek(index, { mez_max: e.target.value })}
                      inputMode="decimal"
                      className="cislice-tabulkove"
                      placeholder="nepovinné"
                    />
                  </div>
                </div>
              ) : null}

              {stav.chybyUkonu?.[index] ? (
                <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2">
                  {stav.chybyUkonu[index]}
                </p>
              ) : null}
            </CardContent>
          </Card>
        )
      })}

      <Button type="button" variant="outline" onClick={pridejRadek}>
        <Plus className="size-4" />
        Přidat úkon
      </Button>

      {stav.chyba ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {stav.chyba}
        </p>
      ) : null}

      {stav.hotovo ? (
        <p role="status" className="text-sm font-medium text-primary">
          {stav.hotovo}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3 border-t pt-4">
        <TlacitkoUlozit />
      </div>
    </form>
  )
}
