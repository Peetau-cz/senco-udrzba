/**
 * Hashování hesel pro vlastní přihlášení (docs/NASAZENI.md).
 *
 * scrypt z `node:crypto` - žádná nativní závislost, kterou by bylo potřeba
 * kompilovat na serveru u IT. Parametry N=2^14, r=8, p=1 jsou dnešní běžné
 * minimum; jsou součástí uloženého zápisu, takže se dají později zvednout
 * a stará hesla se přehashují při dalším přihlášení.
 *
 * Zápis: `scrypt$N$r$p$sůl$hash` (sůl i hash base64url), vejde se do
 * `nvarchar(300)`. Heslo se před hashováním normalizuje na NFC, aby stejná
 * diakritika napsaná dvěma způsoby dala stejný hash.
 *
 * Soubor je bez závislostí na zbytku aplikace a používá jen syntaxi, kterou
 * Node umí odstranit sám - importují ho i skripty v `scripts/` (seed).
 */

import { randomBytes, scrypt as scryptSCallbackem, scryptSync, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptSCallbackem) as (
  heslo: string,
  sul: Buffer,
  delka: number,
  volby: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

const N = 16384
const R = 8
const P = 1
const DELKA_SOLI = 16
const DELKA_HASHE = 32
const MAXMEM = 64 * 1024 * 1024

function slozZapis(sul: Buffer, hash: Buffer, n = N, r = R, p = P): string {
  return ['scrypt', n, r, p, sul.toString('base64url'), hash.toString('base64url')].join('$')
}

export async function zahashujHeslo(heslo: string): Promise<string> {
  const sul = randomBytes(DELKA_SOLI)
  const hash = await scrypt(heslo.normalize('NFC'), sul, DELKA_HASHE, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  })
  return slozZapis(sul, hash)
}

/**
 * Porovná heslo s uloženým zápisem. Poškozený nebo cizí zápis znamená
 * „nesedí", ne výjimku - přihlášení nemá co vysvětlovat.
 */
export async function overHeslo(heslo: string, ulozeny: string): Promise<boolean> {
  const casti = ulozeny.split('$')
  if (casti.length !== 6 || casti[0] !== 'scrypt') return false

  const n = Number(casti[1])
  const r = Number(casti[2])
  const p = Number(casti[3])
  if (![n, r, p].every((x) => Number.isInteger(x) && x > 0)) return false

  const sul = Buffer.from(casti[4] ?? '', 'base64url')
  const ocekavany = Buffer.from(casti[5] ?? '', 'base64url')
  if (sul.length === 0 || ocekavany.length === 0) return false

  try {
    const hash = await scrypt(heslo.normalize('NFC'), sul, ocekavany.length, {
      N: n,
      r,
      p,
      maxmem: MAXMEM,
    })
    return timingSafeEqual(hash, ocekavany)
  } catch {
    return false
  }
}

/**
 * Zápis, proti kterému se ověřuje heslo u NEZNÁMÉHO e-mailu.
 *
 * Kdyby se u neznámého e-mailu neověřovalo nic, odpověď by přišla znatelně
 * rychleji než u známého a šlo by tak zjišťovat, kdo ve firmě účet má.
 * Výsledek porovnání se u neznámého e-mailu vždycky zahodí - proto nevadí,
 * že heslo za atrapou je v kódu vidět.
 */
export const ATRAPA_HASHE: string = (() => {
  const sul = Buffer.from('atrapa-neznamy-email', 'utf8').subarray(0, DELKA_SOLI)
  const hash = scryptSync('atrapa: tohle heslo nikoho nepřihlásí', sul, DELKA_HASHE, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  })
  return slozZapis(sul, hash)
})()
