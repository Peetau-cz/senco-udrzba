'use client'

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'

/**
 * Hlavička seznamu zařízení: názvy sloupců a pod nimi filtr každého z nich.
 *
 * Filtruje se pořád na serveru - klient jen přepisuje adresu a Next stránku
 * překreslí. Druhé, klientské síto nad načtenými řádky by bylo rychlejší, ale
 * vzniklo by tím druhé místo, kde se rozhoduje, co uživatel vidí; pravidlo R1
 * z návrhu (jedna pravda) platí i tady.
 *
 * Formulář zůstává: bez javascriptu se filtr odešle lupou a stránka funguje
 * dál. Živé filtrování je nadstavba, ne podmínka. Lupa se ale ukazuje jen
 * tehdy, když má co dělat - jakmile se stránka oživí, filtruje se samo při
 * psaní a tlačítko by bylo ovládací prvek, který nic nespouští.
 */

/**
 * Jak dlouho se čeká, než se rozepsaný text pošle na server.
 *
 * Bez prodlevy by „Mazak" znamenal pět dotazů. Třetina vteřiny je zhruba mezera
 * mezi slovy - kdo píše souvisle, počká si jednou na konci, ne po každém písmenu.
 */
const PRODLEVA_MS = 300

/**
 * Trojice pro `useSyncExternalStore`, kterou se pozná oživená stránka.
 *
 * Jsou to konstanty, ne vnořené funkce: kdyby se vytvářely při každém
 * překreslení, React by pokaždé zakládal nový odběr. Odebírat není co - hodnota
 * se po oživení stránky už nikdy nezmění - takže odhlašovací funkce nic nedělá.
 */
const BEZ_ODBERU = () => () => {}
const ZIVA_NA_KLIENTU = () => true
const ZIVA_NA_SERVERU = () => false

export type HodnotyFiltru = {
  oblast?: string
  nazev?: string
  inv?: string
  typ?: string
  umisteni?: string
  plan?: string
  stav?: string
}

type Polozka = { id: string; kod: string; nazev: string }

type Vlastnosti = {
  idFormulare: string
  hodnoty: HodnotyFiltru
  typy: Polozka[]
  haly: (Polozka & { provozy: Polozka[] })[]
  stavy: readonly { hodnota: string; popisek: string }[]
  smiSpravovat: boolean
  jeFiltrovano: boolean
}

export function HlavickaTabulkyZarizeni({
  idFormulare,
  hodnoty,
  typy,
  haly,
  stavy,
  smiSpravovat,
  jeFiltrovano,
}: Vlastnosti) {
  const router = useRouter()
  const [ceka, zahaj] = useTransition()

  // Zadané hodnoty si drží komponenta, nečtou se z props. Odpověď serveru chodí
  // se zpožděním a `useTransition` do té doby ukazuje původní stav - políčka by
  // tedy po každé změně na okamžik skočila zpátky na to, co tam bylo předtím.
  const [volby, setVolby] = useState<HodnotyFiltru>(hodnoty)

  const casovac = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (casovac.current) clearTimeout(casovac.current)
    },
    [],
  )

  // Na serveru false, po oživení v prohlížeči true. Tím se pozná, jestli je
  // javascript k dispozici - a podle toho, jestli je tlačítko lupy k něčemu,
  // nebo je to jen zbytečný ovládací prvek navíc.
  //
  // Dřív to byl useEffect, který hned volal setState. Next 16 to zakazuje
  // pravidlem react-hooks/set-state-in-effect, protože takový zápis vyvolá
  // druhé překreslení navíc. useSyncExternalStore říká totéž rovnou: tohle je
  // hodnota na serveru, tohle na klientovi.
  const jeZiva = useSyncExternalStore(BEZ_ODBERU, ZIVA_NA_KLIENTU, ZIVA_NA_SERVERU)

  function adresa(dalsi: HodnotyFiltru): string {
    const parametry = new URLSearchParams()
    for (const [klic, hodnota] of Object.entries(dalsi)) {
      if (hodnota) parametry.set(klic, hodnota)
    }

    const dotaz = parametry.toString()
    return dotaz ? `/zarizeni?${dotaz}` : '/zarizeni'
  }

  function prejdi(dalsi: HodnotyFiltru) {
    // `replace`, ne `push`: každé písmeno by jinak přibylo do historie a
    // tlačítko Zpět by uživatele vracelo přes celé rozepsané slovo. Vedlejší
    // užitek je, že Zpět vede rovnou pryč ze seznamu, takže se nemůže vrátit
    // adresa, které by neodpovídala políčka v hlavičce.
    // `scroll: false`, aby se stránka pod rukama neposunula na začátek.
    zahaj(() => router.replace(adresa(dalsi), { scroll: false }))
  }

  /** Výběry jsou hotová volba - posílají se hned, není na co čekat. */
  function zmenVolbu(zmena: Partial<HodnotyFiltru>) {
    const dalsi = { ...volby, ...zmena }
    setVolby(dalsi)
    if (casovac.current) clearTimeout(casovac.current)
    prejdi(dalsi)
  }

  /** Rozepsaný text počká, ať se z „Mazak" nestane pět dotazů. */
  function zmenText(zmena: Partial<HodnotyFiltru>) {
    const dalsi = { ...volby, ...zmena }
    setVolby(dalsi)

    if (casovac.current) clearTimeout(casovac.current)
    casovac.current = setTimeout(() => prejdi(dalsi), PRODLEVA_MS)
  }

  // Zrušení filtru zachovává oblast - tu drží přepínač v hlavičce aplikace, ne
  // tabulka. Adresa se skládá stejnou cestou jako u ostatních změn, ať nevzniknou
  // dvě místa, kde se staví tentýž odkaz.
  const bezFiltru: HodnotyFiltru = { oblast: volby.oblast }

  return (
    <thead className="hlavicka-tabulky">
      <tr>
        {/* Průhledný pruh téže šířky, jakou má v řádcích pruh stavu - jinak by
            se názvy sloupců rozešly s buňkami pod sebou o čtyři pixely. */}
        <th className="border-l-4 border-l-transparent px-4 pt-3 font-medium">Zařízení</th>
        <th className="px-4 pt-3 font-medium">Inventární číslo</th>
        <th className="px-4 pt-3 font-medium">Typ</th>
        <th className="px-4 pt-3 font-medium">Umístění</th>
        <th className="px-4 pt-3 font-medium">Plán</th>
        <th className="px-4 pt-3 font-medium">Stav</th>
        {/* Tlačítka sedí přes obě řádky hlavičky vpravo. Sloupec s akcí se navíc
            vůbec nevykreslí těm, kdo evidenci měnit nesmějí - prázdný sloupec by
            jen zabíral místo. */}
        <th
          rowSpan={2}
          colSpan={smiSpravovat ? 2 : 1}
          className="whitespace-nowrap px-4 py-3 text-right align-middle"
        >
          <span className="sr-only">Akce</span>
          <div className="flex justify-end gap-2">
            {/* Lupa je záchranná síť pro prohlížeč bez javascriptu. Tam se filtr
                musí čím odeslat a Enter na to nestačí: formulář má dvě textová
                pole a implicitní odeslání funguje jen u jediného pole.

                Jakmile se stránka oživí, filtruje se samo při psaní a tlačítko
                už nemá co spustit - schová se tedy pro oko a zůstane jen pro
                odečítač obrazovky, aby Enter dál fungoval i jemu. */}
            <Button
              type="submit"
              form={idFormulare}
              size="icon"
              variant="secondary"
              className={jeZiva ? 'sr-only' : ''}
            >
              <Search aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only">Vyhledat</span>
            </Button>

            {/* Místo si drží pořád, i když se zrovna netočí - jinak by ostatní
                tlačítka poskočila při každém písmenu. Kolečko se točí, dokud
                server nevrátí zúžený seznam; bez něj by u pomalé sítě vypadala
                tabulka jako zamrzlá. */}
            <span aria-live="polite" className="flex size-10 items-center justify-center">
              {ceka ? (
                <>
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin text-muted-foreground"
                  />
                  <span className="sr-only">Filtruji…</span>
                </>
              ) : null}
            </span>
            {jeFiltrovano ? (
              <Button asChild size="icon" variant="ghost">
                {/* Odkaz zůstává odkazem, aby fungoval i bez javascriptu.
                    `onClick` k tomu jen vyprázdní políčka - navigace v rámci
                    téže stránky komponentu nezruší, takže by v nich text zůstal
                    stát, i když už se podle něj nefiltruje. */}
                <Link href={adresa(bezFiltru)} onClick={() => setVolby(bezFiltru)}>
                  <X aria-hidden="true" className="h-4 w-4" />
                  <span className="sr-only">Zrušit filtr</span>
                </Link>
              </Button>
            ) : null}
          </div>
        </th>
      </tr>

      {/* Filtr je přímo v hlavičce, aby bylo vidět, který sloupec zužuje.
          Podmínky platí zároveň - dá se tak dojít ke stroji postupně, ne jen
          jedním hledáním přes všechno. */}
      {/* Druhá řada hlavičky nese filtr, ne názvy sloupců, takže se z ní musí
          sazba návěští sundat celá - jinak by se v ní filtrovací pole vykreslila
          zúženě a s prostrkáním. */}
      <tr className="normal-case tracking-normal [font-stretch:100%]">
        <th className="border-l-4 border-l-transparent px-4 pb-3 pt-2 font-normal">
          <Input
            form={idFormulare}
            name="nazev"
            value={volby.nazev ?? ''}
            onChange={(e) => zmenText({ nazev: e.target.value })}
            placeholder="název, výrobce, model"
            aria-label="Hledat v názvu, výrobci a modelu"
          />
        </th>
        <th className="px-4 pb-3 pt-2 font-normal">
          <Input
            form={idFormulare}
            name="inv"
            value={volby.inv ?? ''}
            onChange={(e) => zmenText({ inv: e.target.value })}
            placeholder="číslo"
            aria-label="Hledat v inventárním čísle"
            className="cislice-tabulkove"
          />
        </th>
        <th className="px-4 pb-3 pt-2 font-normal">
          <Select
            form={idFormulare}
            name="typ"
            value={volby.typ ?? ''}
            onChange={(e) => zmenVolbu({ typ: e.target.value })}
            aria-label="Filtrovat podle typu"
          >
            <option value="">Všechny typy</option>
            {typy.map((t) => (
              <option key={t.id} value={t.kod}>
                {t.nazev}
              </option>
            ))}
          </Select>
        </th>
        <th className="px-4 pb-3 pt-2 font-normal">
          {/* Hala je skupina, ne položka - vybrat jde obojí a hala zabere
              i stroje ve svých provozech. */}
          <Select
            form={idFormulare}
            name="umisteni"
            value={volby.umisteni ?? ''}
            onChange={(e) => zmenVolbu({ umisteni: e.target.value })}
            aria-label="Filtrovat podle umístění"
          >
            <option value="">Všechna umístění</option>
            {haly.map((hala) => (
              <optgroup key={hala.id} label={hala.nazev}>
                <option value={hala.kod}>{hala.nazev} — celá hala</option>
                {hala.provozy.map((provoz) => (
                  <option key={provoz.id} value={provoz.kod}>
                    {provoz.nazev}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </th>
        <th className="px-4 pb-3 pt-2 font-normal">
          {/* Jen dvě volby, a obě záporné. „Plán je v pořádku" filtrovat nejde
              schválně - nikdo nehledá stroje, se kterými není co dělat. */}
          <Select
            form={idFormulare}
            name="plan"
            value={volby.plan ?? ''}
            onChange={(e) => zmenVolbu({ plan: e.target.value })}
            aria-label="Filtrovat podle stavu plánu"
          >
            <option value="">Plán: vše</option>
            <option value="nedodelany">Nedodělaný plán</option>
          </Select>
        </th>
        <th className="px-4 pb-3 pt-2 font-normal">
          <Select
            form={idFormulare}
            name="stav"
            value={volby.stav ?? ''}
            onChange={(e) => zmenVolbu({ stav: e.target.value })}
            aria-label="Filtrovat podle stavu"
          >
            <option value="">Všechny stavy</option>
            {stavy.map((s) => (
              <option key={s.hodnota} value={s.hodnota}>
                {s.popisek}
              </option>
            ))}
          </Select>
        </th>
      </tr>
    </thead>
  )
}
