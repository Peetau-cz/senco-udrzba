import { describe, expect, it } from 'vitest'
import { MAX_DELKA_KODU, odvozKod, volnyKod } from './kod'

describe('odvozKod', () => {
  it('shodí diakritiku a mezery nahradí podtržítkem', () => {
    expect(odvozKod('Výměna filtru')).toBe('vymena_filtru')
    expect(odvozKod('Kontrola tlaku  vzduchu')).toBe('kontrola_tlaku_vzduchu')
  })

  it('umí i velká písmena, na kterých stojí kódy umístění', () => {
    expect(odvozKod('Hala 2', 'velke')).toBe('HALA_2')
    expect(odvozKod('Údržbářská dílna', 'velke')).toBe('UDRZBARSKA_DILNA')
  })

  it('z názvu bez písmen a číslic nevymýšlí nic', () => {
    expect(odvozKod('   ')).toBe('')
    expect(odvozKod('---')).toBe('')
    expect(odvozKod('???')).toBe('')
  })

  it('drží limit délky a nikdy nekončí podtržítkem, ani po zkrácení', () => {
    // Zkrácení padne doprostřed slova „provozu", takže by jinak zbylo „_".
    const kod = odvozKod('Hala s velmi dlouhym nazvem provozu a linky', 'velke')

    expect(kod.length).toBeLessThanOrEqual(MAX_DELKA_KODU)
    expect(kod.endsWith('_')).toBe(false)
  })
})

describe('volnyKod', () => {
  it('volný kód nechá být', () => {
    expect(volnyKod('HALA_2', ['HALA_1'])).toBe('HALA_2')
  })

  it('obsazený očísluje', () => {
    expect(volnyKod('serizeni', ['serizeni'])).toBe('serizeni_2')
    expect(volnyKod('serizeni', ['serizeni', 'serizeni_2'])).toBe('serizeni_3')
  })

  it('číslování se vejde do limitu délky', () => {
    const zaklad = 'A'.repeat(MAX_DELKA_KODU)
    const kod = volnyKod(zaklad, [zaklad])

    expect(kod.length).toBeLessThanOrEqual(MAX_DELKA_KODU)
    expect(kod.endsWith('_2')).toBe(true)
  })

  it('z prázdného základu kód neudělá', () => {
    expect(volnyKod('', [])).toBe('')
  })
})
