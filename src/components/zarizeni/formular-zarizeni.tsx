'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { STAVY_ZARIZENI } from '@/lib/zarizeni/formular'
import {
  poleParametru,
  popisekParametru,
  prectiSchema,
  type HodnotyParametru,
} from '@/lib/zarizeni/parametry'
import type { NabidkaUmisteni } from '@/lib/umisteni/dotazy'
import type { StavFormulareZarizeni } from '@/app/(aplikace)/zarizeni/actions'

export type TypProFormular = {
  id: string
  nazev: string
  schema_parametru: unknown
}

export type HodnotyZarizeni = {
  nazev: string
  typ_zarizeni_id: string
  inventarni_cislo: string
  vyrobce: string
  model: string
  vyrobni_cislo: string
  rok_vyroby: string
  umisteni_id: string
  odpovedna_osoba_id: string
  stav: string
  poznamka: string
  parametry: HodnotyParametru
}

type Props = {
  akce: (predchozi: StavFormulareZarizeni, formData: FormData) => Promise<StavFormulareZarizeni>
  typy: TypProFormular[]
  umisteni: NabidkaUmisteni
  osoby: { id: string; jmeno: string }[]
  hodnoty: HodnotyZarizeni
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

function ChybaPole({ hlaska }: { hlaska?: string }) {
  if (!hlaska) return null
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      {hlaska}
    </p>
  )
}

/**
 * Formulář zařízení, společný pro založení i úpravu.
 *
 * Vlastní technické parametry se vykreslují podle schématu vybraného typu, proto
 * je typ v `useState` - přepnutí typu musí okamžitě proměnit spodní část
 * formuláře. Pevné údaje karty zůstávají beze změny.
 */
export function FormularZarizeni({
  akce,
  typy,
  umisteni,
  osoby,
  hodnoty,
  zpetHref,
  popisekTlacitka,
}: Props) {
  const [stav, formAction] = useActionState<StavFormulareZarizeni, FormData>(akce, {})
  const [typId, setTypId] = useState(hodnoty.typ_zarizeni_id)

  const chyba = (pole: string) => stav.chybyPoli?.[pole]
  const vybranyTyp = typy.find((t) => t.id === typId)
  const schema = prectiSchema(vybranyTyp?.schema_parametru)
  const parametry = Object.entries(schema)

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Základní údaje</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="nazev">Název zařízení</Label>
            <Input
              id="nazev"
              name="nazev"
              defaultValue={hodnoty.nazev}
              required
              autoFocus
              placeholder="Mazak Quick Turn 250"
            />
            <ChybaPole hlaska={chyba('nazev')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="typ_zarizeni_id">Typ zařízení</Label>
            <Select
              id="typ_zarizeni_id"
              name="typ_zarizeni_id"
              value={typId}
              onChange={(e) => setTypId(e.target.value)}
              required
            >
              <option value="">— vyberte —</option>
              {typy.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nazev}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              Typ určuje oblast údržby i vlastní technické parametry.
            </p>
            <ChybaPole hlaska={chyba('typ_zarizeni_id')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="inventarni_cislo">Inventární číslo</Label>
            <Input
              id="inventarni_cislo"
              name="inventarni_cislo"
              defaultValue={hodnoty.inventarni_cislo}
              inputMode="numeric"
              placeholder="nepovinné"
            />
            <ChybaPole hlaska={chyba('inventarni_cislo')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="stav">Stav</Label>
            <Select id="stav" name="stav" defaultValue={hodnoty.stav}>
              {STAVY_ZARIZENI.map((s) => (
                <option key={s.hodnota} value={s.hodnota}>
                  {s.popisek}
                </option>
              ))}
            </Select>
            <ChybaPole hlaska={chyba('stav')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="umisteni_id">Umístění</Label>
            {/*
              Skupiny podle hal. Vybrat jde i halu samotnou - ne každý stroj
              stojí v provozu. Nativní seznam se skupinami zvládne i tablet.
            */}
            <Select id="umisteni_id" name="umisteni_id" defaultValue={hodnoty.umisteni_id}>
              <option value="">— neurčeno —</option>

              {umisteni.koren ? (
                <option value={umisteni.koren.id}>{umisteni.koren.nazev} (bez zařazení)</option>
              ) : null}

              {umisteni.haly.map((hala) => (
                <optgroup key={hala.id} label={hala.nazev}>
                  <option value={hala.id}>{hala.nazev} — celá hala</option>
                  {hala.provozy.map((provoz) => (
                    <option key={provoz.id} value={provoz.id}>
                      {provoz.nazev}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
            {umisteni.haly.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Struktura areálu zatím není zadaná — doplní ji vedoucí údržby v Umístění.
              </p>
            ) : null}
            <ChybaPole hlaska={chyba('umisteni_id')} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stroj</CardTitle>
          <CardDescription>Údaje z výrobního štítku. Vyplňte, co je k dispozici.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="vyrobce">Výrobce</Label>
            <Input id="vyrobce" name="vyrobce" defaultValue={hodnoty.vyrobce} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Input id="model" name="model" defaultValue={hodnoty.model} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vyrobni_cislo">Výrobní číslo</Label>
            <Input id="vyrobni_cislo" name="vyrobni_cislo" defaultValue={hodnoty.vyrobni_cislo} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rok_vyroby">Rok výroby</Label>
            <Input
              id="rok_vyroby"
              name="rok_vyroby"
              inputMode="numeric"
              defaultValue={hodnoty.rok_vyroby}
              placeholder="2019"
            />
            <ChybaPole hlaska={chyba('rok_vyroby')} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="odpovedna_osoba_id">Odpovědná osoba</Label>
            <Select
              id="odpovedna_osoba_id"
              name="odpovedna_osoba_id"
              defaultValue={hodnoty.odpovedna_osoba_id}
            >
              <option value="">— neurčena —</option>
              {osoby.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.jmeno}
                </option>
              ))}
            </Select>
            <ChybaPole hlaska={chyba('odpovedna_osoba_id')} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vlastní parametry</CardTitle>
          <CardDescription>
            Technické údaje, které si k typu určuje garant oblasti (zadání ř. 93).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {!vybranyTyp ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Parametry se ukážou po výběru typu zařízení.
            </p>
          ) : parametry.length === 0 ? (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Typ <strong>{vybranyTyp.nazev}</strong> zatím nemá určené vlastní parametry.
            </p>
          ) : (
            parametry.map(([klic, definice]) => {
              const pole = poleParametru(klic)
              const popisek = popisekParametru(klic, definice)
              const hodnota = hodnoty.parametry[klic]

              return (
                <div key={klic} className="space-y-2">
                  <Label htmlFor={pole}>
                    {popisek}
                    {definice.jednotka ? (
                      <span className="ml-1 font-normal text-muted-foreground">
                        ({definice.jednotka})
                      </span>
                    ) : null}
                  </Label>

                  {definice.typ === 'ano_ne' ? (
                    <div className="flex h-dotyk items-center">
                      <input
                        id={pole}
                        name={pole}
                        type="checkbox"
                        defaultChecked={hodnota === true}
                        className="size-5 rounded border-input"
                      />
                    </div>
                  ) : definice.typ === 'vyber' ? (
                    <Select
                      id={pole}
                      name={pole}
                      defaultValue={typeof hodnota === 'string' ? hodnota : ''}
                    >
                      <option value="">— nevyplněno —</option>
                      {(definice.moznosti ?? []).map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      id={pole}
                      name={pole}
                      inputMode={definice.typ === 'cislo' ? 'decimal' : undefined}
                      defaultValue={hodnota === null || hodnota === undefined ? '' : String(hodnota)}
                      required={definice.povinne}
                    />
                  )}

                  <ChybaPole hlaska={chyba(pole)} />
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Poznámka</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            id="poznamka"
            name="poznamka"
            defaultValue={hodnoty.poznamka}
            placeholder="Cokoli, co se nevejde do políček výše."
          />
        </CardContent>
      </Card>

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
