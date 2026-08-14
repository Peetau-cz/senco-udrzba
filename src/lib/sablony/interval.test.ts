import { describe, expect, it } from 'vitest'
import {
  jeTypIntervalu,
  jeZakladIntervalu,
  jednotkaIntervalu,
  popisIntervalu,
  popisTolerance,
} from './interval'

describe('jednotka intervalu', () => {
  it('skloňuje podle počtu', () => {
    expect(jednotkaIntervalu('mesice', 1)).toBe('měsíc')
    expect(jednotkaIntervalu('mesice', 3)).toBe('měsíce')
    expect(jednotkaIntervalu('mesice', 5)).toBe('měsíců')
  })

  it('rok má v množném čísle nepravidelný tvar', () => {
    expect(jednotkaIntervalu('roky', 1)).toBe('rok')
    expect(jednotkaIntervalu('roky', 2)).toBe('roky')
    expect(jednotkaIntervalu('roky', 10)).toBe('let')
  })
})

describe('popis intervalu', () => {
  it('používá tvar podle počtu', () => {
    expect(popisIntervalu('mesice', 1)).toBe('každý měsíc')
    expect(popisIntervalu('mesice', 3)).toBe('každé 3 měsíce')
    expect(popisIntervalu('mesice', 6)).toBe('každých 6 měsíců')
  })

  it('zvládne všechny čtyři jednotky', () => {
    expect(popisIntervalu('dny', 1)).toBe('každý den')
    expect(popisIntervalu('tydny', 2)).toBe('každé 2 týdny')
    expect(popisIntervalu('roky', 1)).toBe('každý rok')
    expect(popisIntervalu('roky', 5)).toBe('každých 5 let')
  })
})

describe('popis tolerance', () => {
  it('nulová tolerance se řekne slovy', () => {
    expect(popisTolerance(0)).toBe('bez tolerance')
    expect(popisTolerance(-3)).toBe('bez tolerance')
  })

  it('skloňuje dny', () => {
    expect(popisTolerance(1)).toBe('+ 1 den')
    expect(popisTolerance(3)).toBe('+ 3 dny')
    expect(popisTolerance(7)).toBe('+ 7 dnů')
  })
})

describe('hodnoty z adresy a formuláře', () => {
  it('pozná platný typ intervalu', () => {
    expect(jeTypIntervalu('mesice')).toBe(true)
    expect(jeTypIntervalu('motohodiny')).toBe(false)
  })

  it('pozná platný základ intervalu', () => {
    expect(jeZakladIntervalu('od_planu')).toBe(true)
    expect(jeZakladIntervalu('od_cehokoli')).toBe(false)
  })
})
