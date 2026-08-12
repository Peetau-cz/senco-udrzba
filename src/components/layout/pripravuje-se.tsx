import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Zástupná obrazovka pro moduly, které ještě nejsou hotové.
 *
 * Existuje proto, aby navigace v M0 nikam nepadala a šlo ověřit, že se menu
 * skutečně liší podle role. Každý výskyt zmizí s příslušným modulem.
 */
export function PripravujeSe({ nazev, modul }: { nazev: string; modul: string }) {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>{nazev}</CardTitle>
        <CardDescription>Připravuje se v modulu {modul}.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        <p>
          Vidíte tuto položku, protože na ni má vaše role právo. Obsah doplní modul {modul} podle
          plánu v <code>docs/NAVRH.md</code> kap. 8.
        </p>
      </CardContent>
    </Card>
  )
}
