import { describe, expect, it } from 'vitest'
import {
  hodnotyZFormulare,
  overParametry,
  poleParametru,
  prectiSchema,
  zobrazHodnotu,
  type SchemaParametru,
} from './parametry'

/**
 * Testy drží zdvojenou kontrolu parametrů v souladu s triggerem
 * zkontroluj_parametry_zarizeni() z migrace 0003. Když se tady něco změní,
 * musí se změnit i tam - jinak uživatel projde formulářem a spadne až na
 * databázi.
 */

const SCHEMA: SchemaParametru = {
  vreteno_otacky: { typ: 'cislo', popisek: 'Otáčky vřetene', jednotka: '1/min', povinne: true },
  poznamka: { typ: 'text' },
  chlazeni: { typ: 'ano_ne', popisek: 'Chlazení' },
  rizeni: { typ: 'vyber', popisek: 'Řídicí systém', moznosti: ['Fanuc', 'Siemens', 'Heidenhain'] },
}

describe('čtení schématu z databáze', () => {
  it('propustí platnou definici', () => {
    const schema = prectiSchema({
      otacky: { typ: 'cislo', popisek: 'Otáčky', jednotka: '1/min', povinne: true },
    })

    expect(schema.otacky).toEqual({
      typ: 'cislo',
      popisek: 'Otáčky',
      jednotka: '1/min',
      povinne: true,
      moznosti: undefined,
    })
  })

  it('zahodí neznámý typ i výběr bez možností', () => {
    const schema = prectiSchema({
      barva: { typ: 'duha' },
      rizeni: { typ: 'vyber', moznosti: [] },
      napeti: { typ: 'cislo' },
    })

    expect(Object.keys(schema)).toEqual(['napeti'])
  })

  it('nespadne na nesmyslném vstupu', () => {
    expect(prectiSchema(null)).toEqual({})
    expect(prectiSchema('text')).toEqual({})
    expect(prectiSchema([1, 2, 3])).toEqual({})
  })
})

describe('ověření hodnot', () => {
  it('platné hodnoty projdou', () => {
    const chyby = overParametry(SCHEMA, {
      vreteno_otacky: 4000,
      poznamka: 'po repasi',
      chlazeni: true,
      rizeni: 'Fanuc',
    })

    expect(chyby).toEqual({})
  })

  it('odmítne parametr, který schéma nezná', () => {
    const chyby = overParametry(SCHEMA, { vreteno_otacky: 4000, vymysl: 'x' })
    expect(chyby.vymysl).toContain('není v schématu')
  })

  it('hlídá typ hodnoty', () => {
    const chyby = overParametry(SCHEMA, {
      vreteno_otacky: 'hodně',
      chlazeni: 'ano',
      rizeni: 'Mazak',
    })

    expect(chyby.vreteno_otacky).toBe('Otáčky vřetene musí být číslo.')
    expect(chyby.chlazeni).toBe('Chlazení musí být ano/ne.')
    expect(chyby.rizeni).toBe('Řídicí systém má hodnotu mimo povolený seznam.')
  })

  it('povinný parametr nesmí chybět ani být prázdný', () => {
    expect(overParametry(SCHEMA, {}).vreteno_otacky).toBe('Otáčky vřetene je povinný.')
    expect(overParametry(SCHEMA, { vreteno_otacky: null }).vreteno_otacky).toBeDefined()
    expect(overParametry(SCHEMA, { vreteno_otacky: '  ' }).vreteno_otacky).toBeDefined()
  })

  it('u ano/ne je „ne" vyplněná hodnota, ne prázdná', () => {
    const schema: SchemaParametru = { chlazeni: { typ: 'ano_ne', povinne: true } }
    expect(overParametry(schema, { chlazeni: false })).toEqual({})
  })

  it('nepovinný parametr smí chybět', () => {
    const chyby = overParametry(SCHEMA, { vreteno_otacky: 1 })
    expect(chyby).toEqual({})
  })
})

describe('poskládání z formuláře', () => {
  function formular(pole: Record<string, string>) {
    return (nazev: string) => pole[nazev] ?? null
  }

  it('převede text na typy podle schématu', () => {
    const { hodnoty, chyby } = hodnotyZFormulare(
      SCHEMA,
      formular({
        [poleParametru('vreteno_otacky')]: '4000',
        [poleParametru('poznamka')]: ' po repasi ',
        [poleParametru('chlazeni')]: 'on',
        [poleParametru('rizeni')]: 'Siemens',
      }),
    )

    expect(chyby).toEqual({})
    expect(hodnoty).toEqual({
      vreteno_otacky: 4000,
      poznamka: 'po repasi',
      chlazeni: true,
      rizeni: 'Siemens',
    })
  })

  it('přijme desetinnou čárku - v dílně se píše česky', () => {
    const { hodnoty } = hodnotyZFormulare(
      { tlak: { typ: 'cislo' } },
      formular({ [poleParametru('tlak')]: '6,5' }),
    )

    expect(hodnoty.tlak).toBe(6.5)
  })

  it('nevyplněné pole se do hodnot vůbec nedostane', () => {
    const { hodnoty } = hodnotyZFormulare(
      { poznamka: { typ: 'text' } },
      formular({ [poleParametru('poznamka')]: '   ' }),
    )

    expect(hodnoty).toEqual({})
  })

  it('nezaškrtnuté ano/ne je false, ne chybějící hodnota', () => {
    const { hodnoty } = hodnotyZFormulare({ chlazeni: { typ: 'ano_ne' } }, formular({}))
    expect(hodnoty.chlazeni).toBe(false)
  })

  it('u nečíselného vstupu vrátí konkrétní hlášku, ne „je povinný"', () => {
    const { chyby } = hodnotyZFormulare(
      SCHEMA,
      formular({ [poleParametru('vreteno_otacky')]: 'asi hodně' }),
    )

    expect(chyby.vreteno_otacky).toBe('Otáčky vřetene musí být číslo.')
  })
})

describe('zobrazení hodnoty v kartě', () => {
  it('připojí jednotku a přeloží ano/ne', () => {
    // České formátování odděluje tisíce pevnou mezerou, proto ta náhrada.
    const otacky = zobrazHodnotu(SCHEMA.vreteno_otacky!, 4000).replace(/ /g, ' ')
    expect(otacky).toBe('4 000 1/min')
    expect(zobrazHodnotu(SCHEMA.chlazeni!, true)).toBe('Ano')
    expect(zobrazHodnotu(SCHEMA.chlazeni!, false)).toBe('Ne')
  })

  it('prázdnou hodnotu ukáže jako pomlčku', () => {
    expect(zobrazHodnotu(SCHEMA.poznamka!, null)).toBe('—')
  })
})
