import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'
import type { Database } from '@/types/database.types'

/**
 * Serverový klient pro React Server Components a server actions.
 *
 * Používá VÝHRADNĚ uživatelský JWT z cookies - nikdy service_role klíč.
 * Oprávnění vynucuje Row Level Security v databázi (zásada R1 v docs/NAVRH.md),
 * takže i chyba v UI nemůže vést k zobrazení cizích dat.
 */
export async function vytvorServerovehoKlienta() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        // Typ je nutné uvést ručně: volba `cookies` je v @supabase/ssr sjednocený
        // typ (nové getAll/setAll vs. zastaralé get/set/remove) a přes union se
        // kontextové odvození parametru nechytí.
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Volání ze Server Componenty, kde cookies zapisovat nelze.
            // Obnovu session zajišťuje middleware, takže je to bezpečné ignorovat.
          }
        },
      },
    },
  )
}
