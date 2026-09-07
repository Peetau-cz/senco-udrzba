import { describe, expect, it } from 'vitest'
import {
  duvodNelzeSmazat,
  maAktivnihoGaranta,
  overNazevOblasti,
  seradLidiOblasti,
  type ClovekVOblasti,
} from './oblast'

function clovek(vlastnosti: Partial<ClovekVOblasti> & { celeJmeno: string }): ClovekVOblasti {
  return {
    id: vlastnosti.celeJmeno,
    vztah: 'spolupracujici',
    aktivni: true,
    ...vlastnosti,
  }
}

describe('overNazevOblasti', () => {
  it('běžný název projde', () => {
    expect(overNazevOblasti('Údržba CNC strojů')).toBeNull()
  })

  it('prázdný název nepustí', () => {
    expect(overNazevOblasti('')).not.toBeNull()
    expect(overNazevOblasti('   ')).not.toBeNull()
  })

  it('příliš dlouhý název nepustí', () => {
    expect(overNazevOblasti('a'.repeat(101))).not.toBeNull()
  })
})

describe('maAktivnihoGaranta', () => {
  it('oblast s garantem je v pořádku', () => {
    expect(maAktivnihoGaranta([clovek({ celeJmeno: 'Jan Novák', vztah: 'garant' })])).toBe(true)
  })

  it('oblast bez lidí garanta nemá', () => {
    expect(maAktivnihoGaranta([])).toBe(false)
  })

  it('spolupracující garanta nenahradí', () => {
    expect(maAktivnihoGaranta([clovek({ celeJmeno: 'Jan Novák' })])).toBe(false)
  })

  // Tohle je jádro výstrahy: garant, který ve firmě skončil, oblast nepokrývá.
  it('vyřazená osoba se za garanta nepočítá', () => {
    const lide = [clovek({ celeJmeno: 'Jan Novák', vztah: 'garant', aktivni: false })]

    expect(maAktivnihoGaranta(lide)).toBe(false)
  })
})

describe('seradLidiOblasti', () => {
  it('garanti jdou před spolupracující', () => {
    const lide = [
      clovek({ celeJmeno: 'Adam Adamec' }),
      clovek({ celeJmeno: 'Zdeněk Zeman', vztah: 'garant' }),
    ]

    expect(seradLidiOblasti(lide).map((c) => c.celeJmeno)).toEqual(['Zdeněk Zeman', 'Adam Adamec'])
  })

  it('vyřazené řadí za činné, ať je vidět, kdo oblast opravdu drží', () => {
    const lide = [
      clovek({ celeJmeno: 'Adam Adamec', vztah: 'garant', aktivni: false }),
      clovek({ celeJmeno: 'Zdeněk Zeman', vztah: 'garant' }),
    ]

    expect(seradLidiOblasti(lide).map((c) => c.celeJmeno)).toEqual(['Zdeněk Zeman', 'Adam Adamec'])
  })

  it('ve stejné skupině řadí abecedně po česku', () => {
    const lide = [
      clovek({ celeJmeno: 'Čermák Petr' }),
      clovek({ celeJmeno: 'Dvořák Jan' }),
      clovek({ celeJmeno: 'Cach Ivo' }),
    ]

    expect(seradLidiOblasti(lide).map((c) => c.celeJmeno)).toEqual([
      'Cach Ivo',
      'Čermák Petr',
      'Dvořák Jan',
    ])
  })

  it('původní pole nechá být', () => {
    const lide = [
      clovek({ celeJmeno: 'Adam Adamec' }),
      clovek({ celeJmeno: 'Zdeněk Zeman', vztah: 'garant' }),
    ]

    seradLidiOblasti(lide)

    expect(lide[0]?.celeJmeno).toBe('Adam Adamec')
  })
})

describe('duvodNelzeSmazat', () => {
  it('prázdnou oblast smazat lze', () => {
    expect(duvodNelzeSmazat({ zarizeni: 0, typy: 0, sablony: 0 })).toBeNull()
  })

  it('pojmenuje, co oblast drží', () => {
    expect(duvodNelzeSmazat({ zarizeni: 3, typy: 0, sablony: 0 })).toBe('váže 3 zařízení')
    expect(duvodNelzeSmazat({ zarizeni: 0, typy: 1, sablony: 0 })).toBe('váže 1 typ zařízení')
  })

  it('skloňuje podle počtu', () => {
    expect(duvodNelzeSmazat({ zarizeni: 0, typy: 0, sablony: 1 })).toBe('váže 1 šablonu')
    expect(duvodNelzeSmazat({ zarizeni: 0, typy: 0, sablony: 2 })).toBe('váže 2 šablony')
    expect(duvodNelzeSmazat({ zarizeni: 0, typy: 0, sablony: 5 })).toBe('váže 5 šablon')
  })

  it('víc věcí spojí do jedné věty', () => {
    expect(duvodNelzeSmazat({ zarizeni: 2, typy: 1, sablony: 4 })).toBe(
      'váže 2 zařízení, 1 typ zařízení a 4 šablony',
    )
  })

  // Lidé mazání nebrání - vazbu ruší `on delete cascade`, na rozdíl od zařízení.
  it('samotné osazenstvo mazání nebrání', () => {
    expect(duvodNelzeSmazat({ zarizeni: 0, typy: 0, sablony: 0 })).toBeNull()
  })
})
