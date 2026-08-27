import Link from 'next/link'
import { ClipboardCheck, Image as IkonaFotky, NotebookPen } from 'lucide-react'
import { formatDatumCas } from '@/lib/datum'
import { formatDobu } from '@/lib/denik/zasah'
import type { UdalostHistorie } from '@/lib/denik/dotazy'

/**
 * Časová osa zařízení: dokončené údržby a zápisy z deníku vedle sebe.
 *
 * Obě poloviny mají vlastní ikonu a barvu, protože to jsou dva různé druhy
 * práce - plánovaná podle matice a neplánovaný zásah. Do jedné osy patří proto,
 * že při poruše se nikdo neptá „co bylo v plánu", ale „co se s tím dělo".
 *
 * Pořadí určuje stránka (`kdy` sestupně), ne tahle komponenta - pohled
 * v_historie_zarizeni sám pořadí neurčuje.
 */
export function CasovaOsa({ udalosti }: { udalosti: UdalostHistorie[] }) {
  return (
    <ol className="relative space-y-6 border-l pl-8">
      {udalosti.map((udalost) => {
        const jeUdrzba = udalost.puvod === 'udrzba'

        return (
          <li key={`${udalost.puvod}-${udalost.zaznamId}`} className="relative">
            {/* Puntík sedí na lince vlevo. `-left-[2.6rem]` odpovídá odsazení
                seznamu, aby ikona linku protínala a ne se jí vyhýbala. */}
            <span
              aria-hidden="true"
              className={`absolute -left-[2.6rem] flex size-7 items-center justify-center rounded-full border bg-card ${
                jeUdrzba ? 'border-stav-splneno text-stav-splneno' : 'border-zvyrazneni text-zvyrazneni'
              }`}
            >
              {jeUdrzba ? (
                <ClipboardCheck className="size-4" />
              ) : (
                <NotebookPen className="size-4" />
              )}
            </span>

            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="font-medium">
                <Link
                  href={jeUdrzba ? `/zakazky/${udalost.zaznamId}` : `/denik/${udalost.zaznamId}`}
                  className="underline-offset-4 hover:underline"
                >
                  {udalost.nazev}
                </Link>
                <span className="pl-2 text-xs font-normal text-muted-foreground">
                  {jeUdrzba ? 'plánovaná údržba' : 'zásah z deníku'}
                </span>
              </p>
              <p className="text-sm text-muted-foreground">{formatDatumCas(udalost.kdy)}</p>
            </div>

            {udalost.popis ? (
              <p className="mt-1 whitespace-pre-line text-sm">{udalost.popis}</p>
            ) : null}

            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {udalost.provedl ? <span>{udalost.provedl}</span> : null}

              {/* Kdo zápis pořídil se ukazuje jen tehdy, když to byl někdo jiný -
                  v hale zapisuje jeden tablet za partu. */}
              {udalost.zapsal && udalost.zapsal !== udalost.provedl ? (
                <span>zapsal {udalost.zapsal}</span>
              ) : null}

              {udalost.dobaTrvaniMin != null ? (
                <span>{formatDobu(udalost.dobaTrvaniMin)}</span>
              ) : null}

              {/* Počty kroků má jen zakázka. U zásahu z deníku jsou null, protože
                  checklist nemá - nula by tvrdila, že ho měl a byl prázdný. */}
              {udalost.ukonuCelkem != null ? (
                <span>
                  {udalost.ukonuSplneno ?? 0} z {udalost.ukonuCelkem} kroků splněno
                  {udalost.ukonuNeprovedeno ? `, ${udalost.ukonuNeprovedeno} nešlo provést` : ''}
                </span>
              ) : null}

              {udalost.fotek > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <IkonaFotky aria-hidden="true" className="size-3.5" />
                  {udalost.fotek}
                </span>
              ) : null}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
