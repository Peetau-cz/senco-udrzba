import { describe, expect, it } from 'vitest'
import { spoctiRozdil } from './rozdil'

describe('rozdíl při založení', () => {
  it('vypíše vyplněná pole nového záznamu', () => {
    const rozdil = spoctiRozdil('INSERT', null, {
      id: 'a1',
      nazev: 'Soustruh SV-18',
      inventarni_cislo: '1042',
    })

    expect(rozdil).toEqual([
      { sloupec: 'nazev', pred: null, po: 'Soustruh SV-18' },
      { sloupec: 'inventarni_cislo', pred: null, po: '1042' },
    ])
  })

  it('nevypisuje pole, která zůstala prázdná', () => {
    const rozdil = spoctiRozdil('INSERT', null, { nazev: 'Fréza', poznamka: null })

    expect(rozdil).toEqual([{ sloupec: 'nazev', pred: null, po: 'Fréza' }])
  })
})

describe('rozdíl při změně', () => {
  it('vypíše jen to, co se opravdu změnilo', () => {
    const rozdil = spoctiRozdil(
      'UPDATE',
      { nazev: 'Soustruh', stav: 'naplanovano', poznamka: 'beze změny' },
      { nazev: 'Soustruh', stav: 'probiha', poznamka: 'beze změny' },
    )

    expect(rozdil).toEqual([{ sloupec: 'stav', pred: 'naplanovano', po: 'probiha' }])
  })

  it('změna, která nic nezměnila, je prázdný rozdíl', () => {
    // Stane se, když uživatel formulář odešle bez úpravy. Záznam v auditu
    // vznikne, ale nemá co ukázat - obrazovka to musí umět vypsat.
    expect(spoctiRozdil('UPDATE', { stav: 'probiha' }, { stav: 'probiha' })).toEqual([])
  })

  it('vyplnění prázdného pole je změna', () => {
    const rozdil = spoctiRozdil('UPDATE', { prirazeno: null }, { prirazeno: 'Josef Svoboda' })

    expect(rozdil).toEqual([{ sloupec: 'prirazeno', pred: null, po: 'Josef Svoboda' }])
  })

  it('vyprázdnění pole je taky změna', () => {
    const rozdil = spoctiRozdil('UPDATE', { poznamka: 'text' }, { poznamka: null })

    expect(rozdil).toEqual([{ sloupec: 'poznamka', pred: 'text', po: null }])
  })

  it('sloupec, který v původním stavu ještě neexistoval, se ukáže jako doplněný', () => {
    // Schéma se za běhu mění. Starý auditní záznam nemá sloupec, který přibyl
    // pozdější migrací - nesmí to spadnout ani se tiše zamlčet.
    const rozdil = spoctiRozdil('UPDATE', { nazev: 'Fréza' }, { nazev: 'Fréza', vyrobce: 'TOS' })

    expect(rozdil).toEqual([{ sloupec: 'vyrobce', pred: null, po: 'TOS' }])
  })
})

describe('rozdíl při smazání', () => {
  it('vypíše, co v záznamu bylo', () => {
    const rozdil = spoctiRozdil('DELETE', { nazev: 'Stará fréza', poznamka: null }, null)

    expect(rozdil).toEqual([{ sloupec: 'nazev', pred: 'Stará fréza', po: null }])
  })
})

describe('sloupce, které do rozdílu nepatří', () => {
  it('zmeneno_at se nikdy nezobrazí', () => {
    // Mění se při každé úpravě a v rozdílu by přehlušil to podstatné.
    // Čas změny je stejně v hlavičce záznamu.
    const rozdil = spoctiRozdil(
      'UPDATE',
      { stav: 'naplanovano', zmeneno_at: '2026-08-26T10:00:00Z' },
      { stav: 'probiha', zmeneno_at: '2026-08-27T09:41:00Z' },
    )

    expect(rozdil).toEqual([{ sloupec: 'stav', pred: 'naplanovano', po: 'probiha' }])
  })

  it('id a vytvoreno_at se nezobrazí ani při založení', () => {
    const rozdil = spoctiRozdil('INSERT', null, {
      id: 'a1',
      vytvoreno_at: '2026-08-27T09:41:00Z',
      nazev: 'Fréza',
    })

    expect(rozdil).toEqual([{ sloupec: 'nazev', pred: null, po: 'Fréza' }])
  })
})

describe('složené hodnoty', () => {
  it('shodné kontrolní body se neberou jako změna', () => {
    // Porovnává se hodnota, ne odkaz - dva stejné objekty z JSONB by jinak
    // vypadaly jako změna při každé úpravě řádku.
    const body = [{ nazev: 'Hladina oleje', typ: 'ano_ne' }]
    const rozdil = spoctiRozdil(
      'UPDATE',
      { kontrolni_body: body, stav: 'nesplneno' },
      { kontrolni_body: [{ nazev: 'Hladina oleje', typ: 'ano_ne' }], stav: 'splneno' },
    )

    expect(rozdil).toEqual([{ sloupec: 'stav', pred: 'nesplneno', po: 'splneno' }])
  })

  it('změna uvnitř kontrolních bodů se pozná', () => {
    const rozdil = spoctiRozdil(
      'UPDATE',
      { kontrolni_body: [{ nazev: 'Hladina oleje', odpoved: null }] },
      { kontrolni_body: [{ nazev: 'Hladina oleje', odpoved: true }] },
    )

    expect(rozdil).toHaveLength(1)
    expect(rozdil[0]?.sloupec).toBe('kontrolni_body')
  })

  it('nezáleží na pořadí klíčů', () => {
    const rozdil = spoctiRozdil(
      'UPDATE',
      { parametry: { vykon: 5, napeti: 400 } },
      { parametry: { napeti: 400, vykon: 5 } },
    )

    expect(rozdil).toEqual([])
  })
})
