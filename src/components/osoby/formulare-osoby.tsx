'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import { CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormularSPotvrzenim } from '@/components/ui/potvrzeni'
import { Select } from '@/components/ui/select'
import type { StavOsoby } from '@/app/(aplikace)/nastaveni/uzivatele/actions'
import { MAX_DELKA_JMENA, MAX_DELKA_KARTY, MAX_DELKA_OSOBNIHO_CISLA } from '@/lib/osoby/osoba'

type Akce = (predchozi: StavOsoby, formData: FormData) => Promise<StavOsoby>

function Tlacitko({ popisek, cekaci }: { popisek: string; cekaci: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending}>
      {pending ? cekaci : popisek}
    </Button>
  )
}

function Chyba({ hlaska }: { hlaska?: string }) {
  if (!hlaska) return null
  return (
    <p role="alert" className="mt-2 text-sm font-medium text-destructive">
      {hlaska}
    </p>
  )
}

export type UdajeFormulare = {
  jmeno: string
  prijmeni: string
  osobniCislo: string | null
  email: string | null
}

/**
 * Údaje o osobě.
 *
 * Povinné je jen jméno. Mail je schválně až poslední a s vysvětlením: většina
 * lidí v dílně žádný nemá a prázdné pole tu není nedodělek, ale běžný stav.
 */
export function FormularOsoby({
  akce,
  hodnoty,
  popisekTlacitka,
}: {
  akce: Akce
  hodnoty?: UdajeFormulare
  popisekTlacitka: string
}) {
  const [stav, formAction] = useActionState<StavOsoby, FormData>(akce, {})

  return (
    <div>
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="jmeno">Jméno</Label>
            <Input
              id="jmeno"
              name="jmeno"
              defaultValue={hodnoty?.jmeno ?? ''}
              maxLength={MAX_DELKA_JMENA}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prijmeni">Příjmení</Label>
            <Input
              id="prijmeni"
              name="prijmeni"
              defaultValue={hodnoty?.prijmeni ?? ''}
              maxLength={MAX_DELKA_JMENA}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="osobni_cislo">Osobní číslo</Label>
            <Input
              id="osobni_cislo"
              name="osobni_cislo"
              defaultValue={hodnoty?.osobniCislo ?? ''}
              maxLength={MAX_DELKA_OSOBNIHO_CISLA}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Z podnikové evidence. Slouží i jako záloha, když člověk zapomene kartu.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={hodnoty?.email ?? ''}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Jen pro ty, kdo se přihlašují do webu. Dílna ho nemá — nechte prázdné.
            </p>
          </div>
        </div>

        <Tlacitko popisek={popisekTlacitka} cekaci="Ukládám…" />
      </form>
      <Chyba hlaska={stav.chyba} />
    </div>
  )
}

/**
 * Zařazení: role a oblasti.
 *
 * Role není jen oprávnění, ale zároveň PROFESE — podle ní kiosek vybírá, co
 * člověku po přiložení karty ukázat. Proto se vyplňuje i lidem bez přihlášení.
 */
export function FormularZarazeni({
  akce,
  role,
  oblasti,
  zvoleneRole,
  zvoleneOblasti,
}: {
  akce: Akce
  role: { id: string; kod: string; nazev: string; popis: string | null }[]
  oblasti: { id: string; kod: string; nazev: string }[]
  zvoleneRole: string[]
  zvoleneOblasti: Map<string, string>
}) {
  const [stav, formAction] = useActionState<StavOsoby, FormData>(akce, {})

  return (
    <div>
      <form action={formAction} className="space-y-6">
        <fieldset className="space-y-2">
          <legend className="pb-2 text-sm font-medium">Role a profese</legend>

          {role.map((r) => (
            <label
              key={r.id}
              className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:border-primary/50"
            >
              <input
                type="checkbox"
                name="role"
                value={r.id}
                defaultChecked={zvoleneRole.includes(r.id)}
                className="mt-1 size-4 accent-primary"
              />
              <span className="min-w-0">
                <span className="font-medium">{r.nazev}</span>
                {r.popis ? (
                  <span className="block text-xs text-muted-foreground">{r.popis}</span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="pb-2 text-sm font-medium">Oblasti</legend>

          {oblasti.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <Label htmlFor={`oblast-${o.id}`} className="min-w-0 flex-1 font-medium">
                {o.nazev}
              </Label>
              <Select
                id={`oblast-${o.id}`}
                name={`oblast-${o.id}`}
                defaultValue={zvoleneOblasti.get(o.id) ?? ''}
                className="h-10 w-48"
              >
                <option value="">nezařazen</option>
                <option value="spolupracujici">spolupracující</option>
                <option value="garant">garant</option>
              </Select>
            </div>
          ))}
        </fieldset>

        <Tlacitko popisek="Uložit zařazení" cekaci="Ukládám…" />
      </form>
      <Chyba hlaska={stav.chyba} />
    </div>
  )
}

/**
 * Spárování karty.
 *
 * Pole je zaostřené hned po načtení, protože čtečka se chová jako klávesnice —
 * číslo prostě napíše tam, kde je kurzor, a odešle. Ruční zadání funguje
 * stejně, takže na výběru čtečky nic nestojí.
 */
export function FormularKarty({ akce }: { akce: Akce }) {
  const [stav, formAction] = useActionState<StavOsoby, FormData>(akce, {})
  const formular = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!stav.chyba) formular.current?.reset()
  }, [stav])

  return (
    <div>
      <form ref={formular} action={formAction} className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="cislo">Číslo karty</Label>
          {/* Zaostřeno schválně: čtečka se chová jako klávesnice a píše tam,
              kde je kurzor. Bez toho by se muselo pokaždé kliknout do pole. */}
          <Input
            id="cislo"
            name="cislo"
            autoFocus
            autoComplete="off"
            maxLength={MAX_DELKA_KARTY}
            placeholder="přiložte kartu ke čtečce"
            className="h-10 w-64"
          />
        </div>
        <Tlacitko popisek="Spárovat kartu" cekaci="Páruji…" />
      </form>
      <Chyba hlaska={stav.chyba} />
    </div>
  )
}

export function TlacitkoVyraditKartu({
  akce,
  cislo,
}: {
  akce: (formData: FormData) => Promise<void>
  cislo: string
}) {
  return (
    <FormularSPotvrzenim
      akce={akce}
      otazka={`Vyřadit kartu ${cislo}?`}
      popis="Karta přestane u kiosku fungovat. Nesmaže se — zůstane dohledatelná a její číslo se uvolní."
      potvrdit="Vyřadit kartu"
      nebezpecne
    >
      <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
        <CreditCard className="size-4" aria-hidden="true" />
        Vyřadit
      </Button>
    </FormularSPotvrzenim>
  )
}

export function PrepnoutAktivituOsoby({
  akce,
  aktivni,
  jmeno,
}: {
  akce: (formData: FormData) => Promise<void>
  aktivni: boolean
  jmeno: string
}) {
  if (aktivni) {
    return (
      <FormularSPotvrzenim
        akce={akce}
        otazka={`Vyřadit ${jmeno} z evidence?`}
        popis="Zmizí z nabídek a od kiosku se neprokáže. Jeho podpis u starých záznamů ale zůstane — historie se nemění."
        potvrdit="Vyřadit"
        nebezpecne
      >
        <Button type="submit" variant="outline" size="sm">
          Vyřadit z evidence
        </Button>
      </FormularSPotvrzenim>
    )
  }

  return (
    <form action={akce}>
      <Button type="submit" variant="outline" size="sm">
        Vrátit do evidence
      </Button>
    </form>
  )
}
