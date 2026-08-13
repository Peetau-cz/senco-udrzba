import { describe, expect, it } from 'vitest'
import { prectiSchema } from './parametry'
import {
  PRAZDNY_RADEK,
  klicZPopisku,
  odebraneKlice,
  radkyNaSchema,
  schemaNaRadky,
  type RadekParametru,
} from './schema-typu'

function radek(zmeny: Partial<RadekParametru>): RadekParametru {
  return { ...PRAZDNY_RADEK, ...zmeny }
}

describe('odvození klíče z popisku', () => {
  it('shodí diakritiku a mezery', () => {
    expect(klicZPopisku('Otáčky vřetene')).toBe('otacky_vretene')
    expect(klicZPopisku('Příkon')).toBe('prikon')
    expect(klicZPopisku('Řídicí systém')).toBe('ridici_system')
  })

  it('poradí si se závorkami a jednotkami', () => {
    expect(klicZPopisku('Tlak vzduchu (bar)')).toBe('tlak_vzduchu_bar')
    expect(klicZPopisku('  Hmotnost  ')).toBe('hmotnost')
  })

  it('klíč nikdy nezačíná číslicí - byl by to nepoužitelný název', () => {
    expect(klicZPopisku('3. osa')).toBe('p_3_osa')
  })

  it('z prázdného popisku nevymýšlí nic', () => {
    expect(klicZPopisku('')).toBe('')
    expect(klicZPopisku('...')).toBe('')
  })
})

describe('sestavení schématu z řádků', () => {
  it('poskládá parametr včetně jednotky a povinnosti', () => {
    const { schema, chyby } = radkyNaSchema([
      radek({ popisek: 'Otáčky vřetene', typ: 'cislo', jednotka: '1/min', povinne: true }),
    ])

    expect(chyby).toEqual({})
    expect(schema).toEqual({
      otacky_vretene: {
        typ: 'cislo',
        popisek: 'Otáčky vřetene',
        jednotka: '1/min',
        povinne: true,
        poradi: 0,
      },
    })
  })

  it('výběr přebírá možnosti po řádcích', () => {
    const { schema } = radkyNaSchema([
      radek({ popisek: 'Řízení', typ: 'vyber', moznosti: 'Fanuc\n Siemens \n\nHeidenhain' }),
    ])

    expect(schema.rizeni?.moznosti).toEqual(['Fanuc', 'Siemens', 'Heidenhain'])
  })

  it('ručně zadaný klíč má přednost před odvozeným', () => {
    const { schema } = radkyNaSchema([radek({ klic: 'vreteno', popisek: 'Otáčky vřetene' })])
    expect(Object.keys(schema)).toEqual(['vreteno'])
  })

  it('výsledek projde čtením schématu z databáze', () => {
    const { schema } = radkyNaSchema([
      radek({ popisek: 'Otáčky', typ: 'cislo', jednotka: '1/min' }),
      radek({ popisek: 'Chlazení', typ: 'ano_ne' }),
      radek({ popisek: 'Řízení', typ: 'vyber', moznosti: 'Fanuc\nSiemens' }),
    ])

    // prectiSchema zahazuje vadné definice - když projdou všechny tři,
    // je tvar v pořádku i pro databázi.
    expect(Object.keys(prectiSchema(schema))).toHaveLength(3)
  })
})

describe('chyby v řádcích', () => {
  it('popisek je povinný', () => {
    const { chyby } = radkyNaSchema([radek({ popisek: '   ' })])
    expect(chyby[0]).toContain('popisek')
  })

  it('odmítne dva parametry se stejným klíčem', () => {
    const { chyby, schema } = radkyNaSchema([
      radek({ popisek: 'Otáčky' }),
      radek({ popisek: 'Otáčky' }),
    ])

    expect(chyby[1]).toContain('už má jiný parametr')
    expect(Object.keys(schema)).toEqual(['otacky'])
  })

  it('odmítne klíč s diakritikou nebo mezerou', () => {
    expect(radkyNaSchema([radek({ klic: 'otáčky', popisek: 'Otáčky' })]).chyby[0]).toContain('malá písmena')
    expect(radkyNaSchema([radek({ klic: 'dve slova', popisek: 'X' })]).chyby[0]).toContain('malá písmena')
  })

  it('výběr bez možností nedává smysl', () => {
    const { chyby } = radkyNaSchema([radek({ popisek: 'Řízení', typ: 'vyber' })])
    expect(chyby[0]).toContain('aspoň jednu možnost')
  })

  it('vadný řádek nezahodí ostatní', () => {
    const { schema, chyby } = radkyNaSchema([
      radek({ popisek: 'Otáčky', typ: 'cislo' }),
      radek({ popisek: '' }),
      radek({ popisek: 'Hmotnost', typ: 'cislo' }),
    ])

    expect(Object.keys(schema)).toEqual(['otacky', 'hmotnost'])
    expect(Object.keys(chyby)).toEqual(['1'])
  })
})

describe('cesta tam a zpět', () => {
  it('schéma přežije převod na řádky a zpátky', () => {
    const puvodni = {
      otacky: {
        typ: 'cislo' as const,
        popisek: 'Otáčky',
        jednotka: '1/min',
        povinne: true,
        poradi: 0,
      },
      rizeni: {
        typ: 'vyber' as const,
        popisek: 'Řízení',
        moznosti: ['Fanuc', 'Siemens'],
        poradi: 1,
      },
    }

    const { schema } = radkyNaSchema(schemaNaRadky(puvodni))
    expect(schema).toEqual(puvodni)
  })

  it('pořadí řádků rozhoduje, ne abeceda ani délka klíče', () => {
    const { schema } = radkyNaSchema([
      radek({ popisek: 'Zdvih' }),
      radek({ popisek: 'Otáčky vřetene' }),
    ])

    expect(Object.keys(schema)).toEqual(['zdvih', 'otacky_vretene'])
    expect(schema.zdvih?.poradi).toBe(0)
    expect(schema.otacky_vretene?.poradi).toBe(1)
  })
})

describe('odebrané parametry', () => {
  it('pozná, které klíče ubyly', () => {
    const puvodni = { a: { typ: 'text' as const }, b: { typ: 'text' as const } }
    const nove = { a: { typ: 'text' as const } }
    expect(odebraneKlice(puvodni, nove)).toEqual(['b'])
  })

  it('při přidání parametru nehlásí nic', () => {
    const puvodni = { a: { typ: 'text' as const } }
    const nove = { a: { typ: 'text' as const }, b: { typ: 'text' as const } }
    expect(odebraneKlice(puvodni, nove)).toEqual([])
  })
})
