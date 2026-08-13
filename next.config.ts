import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Build selže při typové nebo lint chybě. Záměrně - vadná verze se nesmí dostat do provozu.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
  experimental: {
    // Přílohy karty zařízení jdou přes server action, a ta má ve výchozím stavu
    // strop 1 MB. Návod ke stroji bývá větší; hranice je o kousek nad limitem
    // úložiště (10 MB v migraci 0004), aby se soubor odmítl s vysvětlením, ne
    // obecnou chybou o velikosti požadavku.
    serverActions: { bodySizeLimit: '12mb' },
  },
}

export default nextConfig
