import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Odkaz o úroveň zpět v hlavičce stránky.
 *
 * Dřív to byl drobný šedý text se znakem „‹" - na tabletu nebyl skoro vidět
 * a nedal se pořádně trefit. Teď je to tlačítko s rámečkem, takže má obrys
 * i dotykovou plochu. Prohlížečové tlačítko Zpět tím nenahrazujeme: po uložení
 * formuláře vede tenhle odkaz tam, kam uživatel chce (na kartu), kdežto historie
 * prohlížeče by ho vrátila do rozepsaného formuláře.
 *
 * Záměrně jedna komponenta pro celou aplikaci - dokud byl odkaz opsaný na
 * každé stránce zvlášť, rozcházel se.
 */
export function OdkazZpet({ href, popisek }: { href: string; popisek: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="mb-1">
      <Link href={href}>
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        {popisek}
      </Link>
    </Button>
  )
}
