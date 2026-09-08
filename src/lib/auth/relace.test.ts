import { describe, expect, it } from 'vitest'
import {
  NAZEV_COOKIE,
  jeCasProdlouzit,
  moznostiCookie,
  overRelaci,
  vytvorRelaci,
  type Relace,
} from './relace'

const TAJEMSTVI = 'x'.repeat(32)
const JINE_TAJEMSTVI = 'y'.repeat(32)
const OSOBA = '3f1c2a9e-7b4d-4c1e-9a2b-0d5e6f7a8b9c'
const TED = new Date('2026-09-08T10:00:00Z')

describe('vytvorRelaci a overRelaci', () => {
  it('podepsaná relace se přečte zpět', () => {
    const hodnota = vytvorRelaci({ osobaId: OSOBA, ted: TED, platnostH: 12 }, TAJEMSTVI)
    const relace = overRelaci(hodnota, TAJEMSTVI, TED)
    expect(relace).toEqual<Relace>({
      osobaId: OSOBA,
      vydano: TED.toISOString(),
      platiDo: new Date('2026-09-08T22:00:00Z').toISOString(),
    })
  })

  it('hodnota cookie neobsahuje nic než bezpečné znaky', () => {
    const hodnota = vytvorRelaci({ osobaId: OSOBA, ted: TED, platnostH: 12 }, TAJEMSTVI)
    expect(hodnota).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
  })

  it('odmítne relaci podepsanou jiným tajemstvím', () => {
    const hodnota = vytvorRelaci({ osobaId: OSOBA, ted: TED, platnostH: 12 }, TAJEMSTVI)
    expect(overRelaci(hodnota, JINE_TAJEMSTVI, TED)).toBeNull()
  })

  it('odmítne relaci se změněným obsahem', () => {
    const hodnota = vytvorRelaci({ osobaId: OSOBA, ted: TED, platnostH: 12 }, TAJEMSTVI)
    const [obsah, podpis] = hodnota.split('.')
    const upraveny = Buffer.from(obsah!, 'base64url')
      .toString('utf8')
      .replace(OSOBA, OSOBA.replace('3f', '4f'))
    const podvrh = `${Buffer.from(upraveny, 'utf8').toString('base64url')}.${podpis}`
    expect(overRelaci(podvrh, TAJEMSTVI, TED)).toBeNull()
  })

  it('odmítne prošlou relaci', () => {
    const hodnota = vytvorRelaci({ osobaId: OSOBA, ted: TED, platnostH: 12 }, TAJEMSTVI)
    const poPlatnosti = new Date('2026-09-08T22:00:01Z')
    expect(overRelaci(hodnota, TAJEMSTVI, poPlatnosti)).toBeNull()
  })

  it('odmítne poškozený zápis místo výjimky', () => {
    expect(overRelaci('', TAJEMSTVI, TED)).toBeNull()
    expect(overRelaci('neco', TAJEMSTVI, TED)).toBeNull()
    expect(overRelaci('a.b.c', TAJEMSTVI, TED)).toBeNull()
    expect(overRelaci('bm9uc2Vuc2U.podpis', TAJEMSTVI, TED)).toBeNull()
  })

  it('odmítne obsah, který podpis má, ale není to relace', () => {
    // Správně podepsaný, ale bez id osoby - třeba z jiné verze aplikace.
    const hodnota = vytvorRelaci({ osobaId: OSOBA, ted: TED, platnostH: 12 }, TAJEMSTVI)
    const [, podpis] = hodnota.split('.')
    const cizi = Buffer.from(JSON.stringify({ neco: 1 }), 'utf8').toString('base64url')
    expect(overRelaci(`${cizi}.${podpis}`, TAJEMSTVI, TED)).toBeNull()
  })

  it('krátké tajemství odmítne už při vytváření', () => {
    expect(() => vytvorRelaci({ osobaId: OSOBA, ted: TED, platnostH: 12 }, 'kratke')).toThrow(/32/)
  })
})

describe('jeCasProdlouzit', () => {
  const relace: Relace = {
    osobaId: OSOBA,
    vydano: TED.toISOString(),
    platiDo: new Date('2026-09-08T22:00:00Z').toISOString(),
  }

  it('v první polovině platnosti se neprodlužuje', () => {
    expect(jeCasProdlouzit(relace, new Date('2026-09-08T15:59:00Z'))).toBe(false)
  })

  it('po polovině platnosti ano', () => {
    expect(jeCasProdlouzit(relace, new Date('2026-09-08T16:01:00Z'))).toBe(true)
  })
})

describe('moznostiCookie', () => {
  it('cookie je HttpOnly, Lax a končí s relací', () => {
    const platiDo = new Date('2026-09-08T22:00:00Z')
    const moznosti = moznostiCookie(platiDo, { produkce: false })
    expect(NAZEV_COOKIE).toBe('udrzba_relace')
    expect(moznosti).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
      expires: platiDo,
    })
  })

  it('v produkci je Secure', () => {
    expect(moznostiCookie(new Date(), { produkce: true }).secure).toBe(true)
  })
})
