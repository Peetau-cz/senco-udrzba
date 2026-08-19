import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { nactiPrihlaseneho } from '@/lib/auth/session'
import { dnesVPraze } from '@/lib/plan/terminy'
import { nactiPlneni } from '@/lib/plneni/dotazy'
import {
  nabidkaObdobi,
  popisObdobi,
  procentoPlneni,
  souhrnPlneni,
  zacatekMesice,
} from '@/lib/plneni/vypocet'

/**
 * Export plnění matice do XLSX (zadání ř. 51-52 o přehledu pro management).
 *
 * Čte přesně z téhož zdroje jako obrazovka — `nactiPlneni`. Kdyby si export
 * sestavoval vlastní dotaz, dřív nebo později by v tabulce, kterou někdo pošle
 * vedení, bylo jiné číslo než na obrazovce, a nikdo by nepoznal které platí.
 *
 * Route handler, ne serverová akce: prohlížeč má dostat soubor ke stažení,
 * ne odpověď k překreslení stránky.
 *
 * Oprávnění řeší RLS pod pohledem `v_plneni_matice`. Specialista CNC dostane
 * sešit jen se svou oblastí, aniž by to tenhle soubor musel řešit.
 */
export async function GET(request: Request) {
  const uzivatel = await nactiPrihlaseneho()
  if (!uzivatel) return new NextResponse('Nepřihlášen', { status: 401 })

  const dnes = dnesVPraze()
  const nabidka = nabidkaObdobi(dnes)
  const zadane = new URL(request.url).searchParams.get('obdobi')
  const obdobi = zadane && nabidka.includes(zadane) ? zadane : zacatekMesice(dnes)

  const radky = await nactiPlneni(obdobi)
  const souhrn = souhrnPlneni(radky)

  const sesit = new ExcelJS.Workbook()
  sesit.creator = 'SENCO Údržba'
  const list = sesit.addWorksheet(popisObdobi(obdobi))

  list.columns = [
    { header: 'Oblast', key: 'oblast', width: 28 },
    { header: 'Splněno v termínu', key: 'splneno', width: 18 },
    { header: 'Po termínu', key: 'poTerminu', width: 14 },
    { header: 'Nešlo provést', key: 'neprovedeno', width: 16 },
    { header: 'Celkem do výpočtu', key: 'celkem', width: 18 },
    { header: 'Plnění', key: 'plneni', width: 10 },
  ]

  list.getRow(1).font = { bold: true }

  for (const r of radky) {
    list.addRow({
      oblast: r.oblastNazev,
      splneno: r.splneno,
      poTerminu: r.poTerminu,
      neprovedeno: r.neprovedeno,
      celkem: r.celkem,
      // Číslo, ne text: v Excelu se s procentem jako s textem nedá počítat
      // a vedení si v tom skoro jistě bude dělat vlastní součty.
      plneni: r.celkem === 0 ? null : procentoPlneni(r.splneno, r.celkem) / 100,
    })
  }

  const celkovy = list.addRow({
    oblast: 'CELKEM',
    splneno: souhrn.splneno,
    poTerminu: souhrn.poTerminu,
    neprovedeno: souhrn.neprovedeno,
    celkem: souhrn.celkem,
    plneni: souhrn.celkem === 0 ? null : procentoPlneni(souhrn.splneno, souhrn.celkem) / 100,
  })
  celkovy.font = { bold: true }

  list.getColumn('plneni').numFmt = '0 %'

  // Poznámka pod tabulkou. Bez ní by se čtenář ptal, proč součet splněných
  // a po termínu nesedí s počtem úkonů v matici.
  list.addRow([])
  list.addRow([
    'Do výpočtu vstupují úkony, jejichž plánovaný termín už nastal. Úkon označený jako ' +
      'neproveditelný se nepočítá ani do splněných, ani do celku. Tolerance po termínu je nula.',
  ])

  const data = await sesit.xlsx.writeBuffer()
  const nazev = `plneni-matice-${obdobi.slice(0, 7)}.xlsx`

  return new NextResponse(data as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nazev}"`,
      // Sešit se počítá z živých dat a k dnešnímu dni; uložená kopie by druhý
      // den lhala.
      'Cache-Control': 'no-store',
    },
  })
}
