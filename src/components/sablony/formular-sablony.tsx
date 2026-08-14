'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
// Obecná funkce „udělej z popisku kód", ne nic specifického pro zařízení.
import { klicZPopisku } from '@/lib/zarizeni/schema-typu'
import type { StavFormulareSablony } from '@/app/(aplikace)/sablony/actions'

type Props = {
  akce: (predchozi: StavFormulareSablony, formData: FormData) => Promise<StavFormulareSablony>
  oblasti: { id: string; nazev: string }[]
  hodnoty: {
    nazev: string
    kod: string
    oblast_id: string
    popis: string
    aktivni: boolean
  }
  jeNova: boolean
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

export function FormularSablony({
  akce,
  oblasti,
  hodnoty,
  jeNova,
  zpetHref,
  popisekTlacitka,
}: Props) {
  const [stav, formAction] = useActionState<StavFormulareSablony, FormData>(akce, {})
  const [nazev, setNazev] = useState(hodnoty.nazev)
  const [kod, setKod] = useState(hodnoty.kod)
  // Dokud uživatel kód nesáhne, odvozuje se z názvu. Pak se drží jeho.
  const [kodRucne, setKodRucne] = useState(!jeNova)

  const chyba = (pole: string) => stav.chybyPoli?.[pole]

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Šablona údržby</CardTitle>
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
              placeholder="Mazak Quick Turn 250"
            />
            <p className="text-xs text-muted-foreground">
              Pojmenujte ji podle typu stroje, ne podle jednoho kusu — přiřadí se všem strojům
              stejného typu.
            </p>
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
              readOnly={!jeNova}
              required
              className={jeNova ? undefined : 'bg-muted'}
            />
            <p className="text-xs text-muted-foreground">
              {jeNova
                ? 'Odvozuje se z názvu. Po založení už ho nelze změnit.'
                : 'Kód se po založení nemění — odkazuje se na něj import dat.'}
            </p>
            <ChybaPole hlaska={chyba('kod')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="oblast_id">Oblast údržby</Label>
            <Select
              id="oblast_id"
              name="oblast_id"
              defaultValue={hodnoty.oblast_id}
              disabled={!jeNova}
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
            {!jeNova ? <input type="hidden" name="oblast_id" value={hodnoty.oblast_id} /> : null}
            <p className="text-xs text-muted-foreground">
              {jeNova
                ? 'Šablonu půjde přiřadit jen strojům z téže oblasti.'
                : 'Oblast se nemění — šablona už může být přiřazená strojům.'}
            </p>
            <ChybaPole hlaska={chyba('oblast_id')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="popis">Popis</Label>
            <Textarea
              id="popis"
              name="popis"
              defaultValue={hodnoty.popis}
              placeholder="nepovinné — čeho se šablona týká"
            />
          </div>

          <label className="flex items-center gap-3 sm:col-span-2">
            <input
              type="checkbox"
              name="aktivni"
              defaultChecked={hodnoty.aktivni}
              className="size-5 rounded border-input"
            />
            <span className="text-sm">
              Nabízet při přiřazování
              <span className="block text-xs text-muted-foreground">
                Vypnutím šablona zmizí ze seznamu, ale stroje, které ji mají, ji mají dál.
              </span>
            </span>
          </label>
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

function ChybaPole({ hlaska }: { hlaska?: string }) {
  if (!hlaska) return null
  return (
    <p role="alert" className="text-sm font-medium text-destructive">
      {hlaska}
    </p>
  )
}
