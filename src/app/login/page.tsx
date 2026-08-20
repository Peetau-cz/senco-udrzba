import type { Metadata } from 'next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LogoSenco } from '@/components/layout/logo-senco'
import { PrihlasovaciFormular } from './prihlasovaci-formular'

export const metadata: Metadata = { title: 'Přihlášení · SENCO Údržba' }

export default async function StrankaPrihlaseni({
  searchParams,
}: {
  searchParams: Promise<{ pokracovat?: string }>
}) {
  const { pokracovat } = await searchParams

  return (
    // Fialová plocha je táž jako u boční lišty: první obrazovka má vypadat
    // jako aplikace, do které se člověk hlásí, ne jako formulář na bílém listu.
    <main className="flex min-h-svh items-center justify-center bg-navigace p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <LogoSenco vyska={72} className="mb-3" />
          <CardTitle className="text-xl">SENCO Údržba</CardTitle>
          <CardDescription>Centrální systém řízení údržby</CardDescription>
        </CardHeader>
        <CardContent>
          <PrihlasovaciFormular pokracovat={pokracovat} />
        </CardContent>
      </Card>
    </main>
  )
}
