import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Build selže při typové chybě. Záměrně - vadná verze se nesmí dostat do provozu.
  // (Next.js 16 zrušil integraci ESLintu do next.config — lint se řeší samostatně
  // přes `npm run lint`, které je stejně povinným krokem před mergem PR.)
  typescript: { ignoreBuildErrors: false },
  experimental: {
    // Přílohy karty zařízení jdou přes server action, a ta má ve výchozím stavu
    // strop 1 MB. Návod ke stroji bývá větší; hranice je o kousek nad limitem
    // úložiště (10 MB v migraci 0004), aby se soubor odmítl s vysvětlením, ne
    // obecnou chybou o velikosti požadavku.
    serverActions: { bodySizeLimit: '12mb' },
  },
}

export default nextConfig