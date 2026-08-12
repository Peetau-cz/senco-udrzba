import type { NextRequest } from 'next/server'
import { obnovSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return obnovSession(request)
}

export const config = {
  matcher: [
    /*
     * Všechny cesty kromě statických souborů a obrázků. Jinak by se session
     * obnovovala i pro každý .png, což je zbytečná zátěž.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
