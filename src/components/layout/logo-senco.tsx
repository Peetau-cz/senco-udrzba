import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * Firemní logo SENCO.
 *
 * Soubor v repozitáři není - očekává se v `public/` pod jedním z názvů níže.
 * Dokud tam není, vykreslí se firemní proužek, aby přihlašovací obrazovka
 * nevypadala rozbitě a nikde nevisel odkaz na neexistující obrázek.
 *
 * Jakmile logo přibude, komponenta ho vezme sama - žádná změna kódu.
 */

const MOZNE_NAZVY = [
  'logo-senco.svg',
  'logo-senco.png',
  'logo-senco.webp',
  'logo.svg',
  'logo.png',
]

/**
 * Hledá se při každém vykreslení schválně: přihlašovací obrazovka se stejně
 * generuje na požadavek a jedno `stat` navíc nikdo nepozná. Kdyby se výsledek
 * uložil do proměnné modulu, musel by se po nahrání loga restartovat server.
 */
function najdiLogo(): string | null {
  for (const nazev of MOZNE_NAZVY) {
    if (existsSync(path.join(process.cwd(), 'public', nazev))) return `/${nazev}`
  }
  return null
}

type Props = {
  /** Výška v pixelech. Šířka se dopočítá podle poměru stran. */
  vyska?: number
  className?: string
}

export function LogoSenco({ vyska = 40, className }: Props) {
  const cesta = najdiLogo()

  if (!cesta) {
    return (
      <div
        className={`znacka-pruh rounded-full ${className ?? ''}`}
        style={{ height: Math.max(4, Math.round(vyska / 8)), width: vyska * 1.6 }}
        aria-hidden="true"
      />
    )
  }

  return (
    // Záměrně <img>, ne next/image: logo je statický soubor známé velikosti
    // a u SVG by optimalizace vyžadovala dangerouslyAllowSVG v next.config.
    // Prázdný alt proto, že název firmy stojí čitelně hned vedle.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={cesta} alt="" height={vyska} style={{ height: vyska }} className={`w-auto ${className ?? ''}`} />
  )
}
