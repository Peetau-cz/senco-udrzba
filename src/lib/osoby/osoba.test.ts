import { describe, expect, it } from 'vitest'
import { celeJmeno, normalizujCisloKarty, overCisloKarty, overOsobu } from './osoba'

/**
 * Testy drží to, co odlišuje osobu od účtu (migrace 0024): člověk z dílny
 * nemá mail ani přihlášení a stejně musí jít založit.
 */

describe('ověření osoby', () => {
  const zaklad = { jmeno: 'Karel', prijmeni: 'Zámečník', osobniCislo: '2001', email: null }

  it('osoba bez mailu je v pořádku - právě kvůli ní celá změna vznikla', () => {
    expect(overOsobu(zaklad)).toBeNull()
  })

  it('osoba bez osobního čísla je taky v pořádku', () => {
    expect(overOsobu({ ...zaklad, osobniCislo: null })).toBeNull()
  })

  it('stačí příjmení', () => {
    expect(overOsobu({ ...zaklad, jmeno: '' })).toBeNull()
  })

  it('bez jména i příjmení to nejde - takový záznam nikdo nepozná', () => {
    expect(overOsobu({ ...zaklad, jmeno: '', prijmeni: '' })).toBe('Zadejte jméno nebo příjmení.')
  })

  it('mezery se nepočítají za jméno', () => {
    expect(overOsobu({ ...zaklad, jmeno: '   ', prijmeni: '  ' })).not.toBeNull()
  })

  it('příliš dlouhé jméno se odmítne', () => {
    expect(overOsobu({ ...zaklad, jmeno: 'x'.repeat(61) })).toBe('Jméno je příliš dlouhé.')
  })

  it('vyplněný mail musí mít platný tvar', () => {
    expect(overOsobu({ ...zaklad, email: 'garant' })).toMatch(/platný tvar/)
    expect(overOsobu({ ...zaklad, email: 'garant@senco.cz' })).toBeNull()
  })
})

describe('číslo karty', () => {
  it('čtečka posílá mezery navíc, ty se srovnají', () => {
    expect(normalizujCisloKarty('  a1b2c3  ')).toBe('A1B2C3')
  })

  it('velikost písmen se sjednotí, aby se karta poznala i po ručním zadání', () => {
    expect(normalizujCisloKarty('abc123')).toBe(normalizujCisloKarty('ABC123'))
  })

  it('prázdné číslo se odmítne', () => {
    expect(overCisloKarty('   ')).toMatch(/Přiložte kartu/)
  })

  it('platné číslo projde', () => {
    expect(overCisloKarty('KARTA-2001')).toBeNull()
  })
})

describe('jméno do seznamu', () => {
  it('skládá se ze jména a příjmení', () => {
    expect(celeJmeno({ jmeno: 'Karel', prijmeni: 'Zámečník' })).toBe('Karel Zámečník')
  })

  it('bez jména padne na mail', () => {
    expect(celeJmeno({ jmeno: '', prijmeni: '', email: 'garant@senco.cz' })).toBe('garant@senco.cz')
  })

  it('a když není ani mail, tak na osobní číslo - dílna mail nemá', () => {
    expect(celeJmeno({ jmeno: '', prijmeni: '', email: null, osobniCislo: '2001' })).toBe('2001')
  })

  it('úplně prázdná osoba má aspoň výplň, ne prázdné místo', () => {
    expect(celeJmeno({})).toBe('bez jména')
  })
})
