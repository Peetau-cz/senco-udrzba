import { popisTerminu, stavTerminu, type StavTerminu } from '@/lib/plan/terminy'

/**
 * Odznak termínu údržby.
 *
 * Barvy nesou význam, ne značku, a zrcadlí ty ze značky stavu zařízení:
 * po termínu je červená, dnešek fialový jako „dnešní plán", blížící se termín
 * jantarový. Vzdálený termín zůstává šedý - není na něm nic k řešení.
 *
 * Chybějící termín je vlastní stav, ne prázdno: řádek plánu bez data čeká na
 * garanta a plánovač ho přeskakuje. Kdyby se zobrazoval jen pomlčkou, vypadalo
 * by to jako údaj navíc, ne jako nedodělek.
 */
const VZHLED: Record<StavTerminu, string> = {
  chybi: 'bg-stav-poterminu/10 text-stav-poterminu ring-1 ring-inset ring-stav-poterminu/30',
  po_terminu: 'bg-stav-poterminu/10 text-stav-poterminu',
  dnes: 'bg-stav-dnes/10 text-stav-dnes',
  brzy: 'bg-secondary text-secondary-foreground',
  pozdeji: 'bg-muted text-muted-foreground',
}

export function ZnackaTerminu({ termin, dnes }: { termin: string | null; dnes: string }) {
  const stav = stavTerminu(termin, dnes)

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium ${VZHLED[stav]}`}
    >
      {popisTerminu(termin, dnes)}
    </span>
  )
}
