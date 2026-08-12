'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { vytvorServerovehoKlienta } from '@/lib/supabase/server'

const schema = z.object({
  email: z.string().min(1, 'Zadejte e-mail').email('E-mail nemá platný tvar'),
  heslo: z.string().min(1, 'Zadejte heslo'),
  pokracovat: z.string().optional(),
})

export type StavPrihlaseni = { chyba?: string }

export async function prihlasit(
  _predchozi: StavPrihlaseni,
  formData: FormData,
): Promise<StavPrihlaseni> {
  const vstup = schema.safeParse({
    email: formData.get('email'),
    heslo: formData.get('heslo'),
    pokracovat: formData.get('pokracovat') ?? undefined,
  })

  if (!vstup.success) {
    return { chyba: vstup.error.issues[0]?.message ?? 'Neplatný vstup' }
  }

  const supabase = await vytvorServerovehoKlienta()
  const { error } = await supabase.auth.signInWithPassword({
    email: vstup.data.email,
    password: vstup.data.heslo,
  })

  if (error) {
    // Záměrně neprozrazujeme, jestli účet existuje - jinak by šlo zjišťovat,
    // kdo ve firmě účet má.
    return { chyba: 'Nesprávný e-mail nebo heslo.' }
  }

  // Otevřené přesměrování by šlo zneužít k odvedení uživatele na cizí web,
  // proto přijímáme jen cestu v rámci aplikace.
  const cil = vstup.data.pokracovat
  const bezpecnyCil = cil && cil.startsWith('/') && !cil.startsWith('//') ? cil : '/'

  redirect(bezpecnyCil)
}

export async function odhlasit() {
  const supabase = await vytvorServerovehoKlienta()
  await supabase.auth.signOut()
  redirect('/login')
}
