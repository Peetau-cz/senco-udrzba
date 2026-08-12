import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'

/** Cesty dostupné bez přihlášení. */
const VEREJNE_CESTY = ['/login', '/auth']

/**
 * Obnovuje session a hlídá přístup. Běží před každým požadavkem.
 *
 * Pozor: tohle je pohodlí pro uživatele, ne bezpečnostní hranice. Tou zůstává
 * RLS v databázi - proto se používá getUser(), který token ověří na serveru,
 * a nikoli getSession(), který jen přečte cookie.
 */
export async function obnovSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        // Typ ručně - viz komentář v src/lib/supabase/server.ts.
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const cesta = request.nextUrl.pathname
  const jeVerejna = VEREJNE_CESTY.some((v) => cesta === v || cesta.startsWith(`${v}/`))

  if (!user && !jeVerejna) {
    const cil = request.nextUrl.clone()
    cil.pathname = '/login'
    // Po přihlášení vrátíme uživatele tam, kam mířil.
    cil.searchParams.set('pokracovat', cesta)
    return NextResponse.redirect(cil)
  }

  if (user && cesta === '/login') {
    const cil = request.nextUrl.clone()
    cil.pathname = '/'
    cil.search = ''
    return NextResponse.redirect(cil)
  }

  return response
}
