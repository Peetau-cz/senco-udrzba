import { z } from 'zod'

/**
 * Jediné místo, kde se sahá na process.env. ESLint to jinde zakazuje
 * (viz eslint.config.mjs) - chyba v názvu proměnné tak spadne při startu
 * a s jasnou hláškou, ne až za běhu někde uprostřed stránky.
 *
 * Pozor: service_role klíč zde záměrně NENÍ. Patří výhradně do
 * scripts/seed-users.mjs. Viz docs/PROVOZ.md kap. 3.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL musí být platná URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY chybí'),
})

const vysledek = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
})

if (!vysledek.success) {
  const chyby = vysledek.error.issues.map((i) => `  - ${i.message}`).join('\n')
  throw new Error(
    `Chybí nastavení prostředí:\n${chyby}\n\nZkopírujte .env.example jako .env.local a doplňte hodnoty.`,
  )
}

export const env = vysledek.data
