'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Camera, Check, CircleAlert, CircleDashed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { TlacitkoSmazat } from '@/components/ui/tlacitko-smazat'
import { jeVMezich, popisMezi, prectiVyplneneBody, type VyplnenyBod } from '@/lib/plan/body'
import { PRIJIMANE_PRIPONY_FOTEK } from '@/lib/plan/fotky'
import type { KrokZakazky } from '@/lib/plan/dotazy'
import type { StavKroku } from '@/app/(aplikace)/zakazky/[id]/actions'

type Akce = (predchozi: StavKroku, formData: FormData) => Promise<StavKroku>

function TlacitkoPotvrdit() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" name="zamer" value="splneno" size="dotyk" disabled={pending}>
      <Check aria-hidden="true" className="size-4" />
      {pending ? 'Ukládám…' : 'Potvrdit'}
    </Button>
  )
}

function TlacitkoNelze() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      name="zamer"
      value="nelze_provest"
      size="dotyk"
      variant="outline"
      disabled={pending}
    >
      Nelze provést
    </Button>
  )
}

function TlacitkoFotka() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" size="dotyk" variant="outline" disabled={pending}>
      <Camera aria-hidden="true" className="size-4" />
      {pending ? 'Nahrávám…' : 'Přidat fotku'}
    </Button>
  )
}

/**
 * Jeden krok checklistu podle wireframu v docs/NAVRH.md kap. 5.3.
 *
 * Rozbalený je jen jeden krok - ten, na kterém se pracuje. Šestnáct rozbalených
 * formulářů pod sebou by na tabletu znamenalo metry rolování a technik by
 * netušil, kde skončil. Který krok je otevřený, drží adresa, takže se stav
 * neztratí ani po obnovení stránky ani po odeslání.
 *
 * Formuláře jsou dva a jsou vedle sebe, ne do sebe: HTML vnořené formuláře
 * nedovolí. Jeden potvrzuje krok, druhý nahrává fotku.
 */
export function KrokChecklistu({
  krok,
  otevreny,
  hotovaZakazka,
  smiZapisovat,
  odkazOtevrit,
  ulozAkce,
  fotkaAkce,
  smazFotkuAkce,
}: {
  krok: KrokZakazky
  otevreny: boolean
  hotovaZakazka: boolean
  smiZapisovat: boolean
  odkazOtevrit: string
  ulozAkce: Akce
  fotkaAkce: Akce
  smazFotkuAkce: (fotkaId: string) => Promise<void>
}) {
  const [stavUlozeni, ulozFormAction] = useActionState<StavKroku, FormData>(ulozAkce, {})
  const [stavFotky, fotkaFormAction] = useActionState<StavKroku, FormData>(fotkaAkce, {})

  const body = prectiVyplneneBody(krok.kontrolni_body)
  const vyrizeny = krok.stav !== 'nesplneno'
  const chybiPovinnaFotka = krok.vyzaduje_foto && krok.fotky.length === 0

  return (
    <li className="border-b last:border-0">
      <div className="flex flex-wrap items-start gap-3 p-4">
        <Ikona stav={krok.stav} />

        <div className="min-w-0 flex-1">
          <p className="font-medium">
            <span className="cislice-tabulkove text-muted-foreground">{krok.poradi}. </span>
            {krok.nazev_snapshot}
          </p>

          {krok.popis_snapshot ? (
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
              {krok.popis_snapshot}
            </p>
          ) : null}

          {vyrizeny && !otevreny ? (
            <Souhrn krok={krok} body={body} />
          ) : null}

          {chybiPovinnaFotka ? (
            <p className="mt-1 text-xs font-medium text-stav-poterminu">
              U tohoto kroku je fotka povinná — bez ní nepůjde zakázku dokončit.
            </p>
          ) : null}
        </div>

        {!otevreny && smiZapisovat && !hotovaZakazka ? (
          <Button asChild size="dotyk" variant={vyrizeny ? 'ghost' : 'default'}>
            <a href={odkazOtevrit}>{vyrizeny ? 'Upravit' : 'Vyřídit'}</a>
          </Button>
        ) : null}
      </div>

      {otevreny ? (
        <div className="space-y-6 border-t bg-secondary/30 p-4">
          <form action={ulozFormAction} className="space-y-4">
            {body.length > 0 ? (
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium">Kontrolní body</legend>
                {body.map((bod, poradi) => (
                  <PoleBodu
                    key={`${bod.nazev}-${poradi}`}
                    bod={bod}
                    poradi={poradi}
                    jednotka={krok.jednotka_snapshot}
                    zamceno={!smiZapisovat || hotovaZakazka}
                  />
                ))}
              </fieldset>
            ) : null}

            {krok.vyzaduje_hodnotu ? (
              <div className="space-y-2">
                <Label htmlFor={`hodnota-${krok.id}`}>
                  Naměřeno{krok.jednotka_snapshot ? ` (${krok.jednotka_snapshot})` : ''}
                </Label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    id={`hodnota-${krok.id}`}
                    name="hodnota"
                    inputMode="decimal"
                    defaultValue={krok.hodnota ?? ''}
                    disabled={!smiZapisovat || hotovaZakazka}
                    className="h-dotyk w-40 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                  />
                  {popisMezi(krok.mez_min_snapshot, krok.mez_max_snapshot, krok.jednotka_snapshot) ? (
                    <span className="text-sm text-muted-foreground">
                      {popisMezi(
                        krok.mez_min_snapshot,
                        krok.mez_max_snapshot,
                        krok.jednotka_snapshot,
                      )}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {krok.nabizi_poznamku || krok.poznamka ? (
              <div className="space-y-2">
                <Label htmlFor={`poznamka-${krok.id}`}>Poznámka</Label>
                <textarea
                  id={`poznamka-${krok.id}`}
                  name="poznamka"
                  rows={3}
                  defaultValue={krok.poznamka ?? ''}
                  disabled={!smiZapisovat || hotovaZakazka}
                  placeholder="Co bylo divné, co sledovat příště."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              </div>
            ) : (
              // Pole se nenabízí, ale důvod u „Nelze provést" je povinný -
              // proto tu musí být, jen skryté, dokud ho není potřeba.
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">
                  Přidat poznámku
                </summary>
                <textarea
                  name="poznamka"
                  rows={3}
                  defaultValue={krok.poznamka ?? ''}
                  disabled={!smiZapisovat || hotovaZakazka}
                  className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                />
              </details>
            )}

            {stavUlozeni.chyba ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {stavUlozeni.chyba}
              </p>
            ) : null}

            {smiZapisovat && !hotovaZakazka ? (
              <div className="flex flex-wrap gap-3">
                <TlacitkoPotvrdit />
                <TlacitkoNelze />
              </div>
            ) : null}
          </form>

          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">
              Fotodokumentace
              {krok.vyzaduje_foto ? (
                <span className="ml-2 rounded-md bg-stav-poterminu/10 px-2 py-0.5 text-xs text-stav-poterminu">
                  povinná
                </span>
              ) : null}
            </p>

            {krok.fotky.length > 0 ? (
              <ul className="flex flex-wrap gap-3">
                {krok.fotky.map((f) => (
                  <li key={f.id} className="w-32 space-y-1">
                    {f.odkaz ? (
                      // Prosté <img>: odkaz je podepsaný a po hodině vyprší,
                      // takže by ho optimalizátor stejně neuložil do cache.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.odkaz}
                        alt={f.popis ?? `Fotka ke kroku ${krok.nazev_snapshot}`}
                        className="h-24 w-32 rounded-md border object-cover"
                      />
                    ) : (
                      <div className="flex h-24 w-32 items-center justify-center rounded-md border text-xs text-muted-foreground">
                        odkaz vypršel
                      </div>
                    )}

                    {smiZapisovat && !hotovaZakazka ? (
                      <TlacitkoSmazat
                        akce={smazFotkuAkce.bind(null, f.id)}
                        nazev="fotku"
                        popisek="Smazat"
                        otazka="Opravdu smazat tuhle fotku?"
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Zatím žádná fotka.</p>
            )}

            {smiZapisovat && !hotovaZakazka ? (
              <form action={fotkaFormAction} className="space-y-3">
                <input
                  type="file"
                  name="fotka"
                  accept={PRIJIMANE_PRIPONY_FOTEK}
                  capture="environment"
                  required
                  className="flex h-dotyk w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:h-8 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium file:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />

                {stavFotky.chyba ? (
                  <p role="alert" className="text-sm font-medium text-destructive">
                    {stavFotky.chyba}
                  </p>
                ) : null}

                <TlacitkoFotka />
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  )
}

// -----------------------------------------------------------------------------

function Ikona({ stav }: { stav: string }) {
  if (stav === 'splneno') {
    return <Check aria-label="splněno" className="mt-0.5 size-5 shrink-0 text-stav-splneno" />
  }
  if (stav === 'nelze_provest') {
    return (
      <CircleAlert aria-label="nelze provést" className="mt-0.5 size-5 shrink-0 text-stav-poterminu" />
    )
  }
  return (
    <CircleDashed aria-label="nevyřízeno" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
  )
}

/** Co technik zapsal, v jedné řádce - aby šlo hotový krok přečíst bez rozbalení. */
function Souhrn({ krok, body }: { krok: KrokZakazky; body: VyplnenyBod[] }) {
  const casti: string[] = []

  if (krok.stav === 'nelze_provest') {
    casti.push('nelze provést')
  } else if (krok.hodnota !== null) {
    const mimo = jeVMezich(krok.hodnota, krok.mez_min_snapshot, krok.mez_max_snapshot) === false
    casti.push(
      `naměřeno ${String(krok.hodnota).replace('.', ',')}${krok.jednotka_snapshot ? ` ${krok.jednotka_snapshot}` : ''}${mimo ? ' — mimo mez' : ''}`,
    )
  }

  for (const bod of body) {
    if (bod.typ === 'ano_ne' && bod.ano !== null) {
      casti.push(`${bod.nazev}: ${bod.ano ? 'ano' : 'ne'}`)
    }
    if (bod.typ === 'hodnota' && bod.hodnota !== null) {
      casti.push(`${bod.nazev}: ${String(bod.hodnota).replace('.', ',')}`)
    }
  }

  if (krok.fotky.length > 0) {
    casti.push(`${krok.fotky.length} × foto`)
  }

  return (
    <div className="mt-1 space-y-1 text-sm text-muted-foreground">
      {casti.length > 0 ? <p>{casti.join(' · ')}</p> : null}
      {krok.poznamka ? <p className="whitespace-pre-line italic">{krok.poznamka}</p> : null}
    </div>
  )
}

/** Jeden kontrolní bod: buď políčko na hodnotu, nebo přepínač ano/ne. */
function PoleBodu({
  bod,
  poradi,
  jednotka,
  zamceno,
}: {
  bod: VyplnenyBod
  poradi: number
  jednotka: string | null
  zamceno: boolean
}) {
  if (bod.typ === 'hodnota') {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <label className="min-w-[12rem] text-sm" htmlFor={`bod-hodnota-${poradi}`}>
          {bod.nazev}
        </label>
        <input
          id={`bod-hodnota-${poradi}`}
          name={`bod-hodnota-${poradi}`}
          inputMode="decimal"
          defaultValue={bod.hodnota ?? ''}
          disabled={zamceno}
          className="h-dotyk w-32 rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        {jednotka ? <span className="text-sm text-muted-foreground">{jednotka}</span> : null}
      </div>
    )
  }

  // Trojstav schválně: nevyplněno není totéž co „ne". Rádiová volba to udrží
  // i po odeslání, kdežto zaškrtávátko by odpověď „ne" nikdy neodlišilo od
  // kroku, na který se nikdo nepodíval.
  return (
    <fieldset className="flex flex-wrap items-center gap-3">
      <legend className="sr-only">{bod.nazev}</legend>
      <span className="min-w-[12rem] text-sm">{bod.nazev}</span>

      {(
        [
          { hodnota: 'ano', popisek: 'Ano', vybrano: bod.ano === true },
          { hodnota: 'ne', popisek: 'Ne', vybrano: bod.ano === false },
        ] as const
      ).map((volba) => (
        <label
          key={volba.hodnota}
          className="inline-flex h-dotyk cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 text-base has-[:checked]:border-zvyrazneni has-[:checked]:bg-zvyrazneni/10"
        >
          <input
            type="radio"
            name={`bod-ano-${poradi}`}
            value={volba.hodnota}
            defaultChecked={volba.vybrano}
            disabled={zamceno}
            className="size-4"
          />
          {volba.popisek}
        </label>
      ))}
    </fieldset>
  )
}
