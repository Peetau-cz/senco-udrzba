'use client'

import { useRef, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { CircleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Potvrzení akce ve vlastním okně.
 *
 * Nahrazuje `window.confirm`. Hláška z prohlížeče vypadá na tabletu jako
 * systémová chyba, nedá se ostylovat ani rozepsat a na některých zařízeních ji
 * jde umlčet zaškrtávátkem „už se neptat" - u mazání a uzavírání zakázek je to
 * nepřijatelné.
 *
 * Formulář zůstává tam, kde byl, okno se jen vloží mezi kliknutí a odeslání:
 * první odeslání se zadrží a otevře okno, potvrzení odešle tentýž formulář
 * doopravdy. Díky tomu funguje `useFormStatus` uvnitř tlačítka dál a bez
 * javascriptu se formulář odešle rovnou - přesně jak to dělalo `window.confirm`.
 */
export function FormularSPotvrzenim({
  akce,
  otazka,
  popis,
  potvrdit,
  nebezpecne = false,
  className,
  children,
}: {
  akce: (formData: FormData) => void | Promise<void>
  /** Nadpis okna. Ptá se na konkrétní věc: „Opravdu smazat halu „Hala A"?" */
  otazka: string
  /** Co se stane potvrzením. Hlavně to, co už nepůjde vzít zpět. */
  popis?: ReactNode
  /** Popisek potvrzovacího tlačítka. Sloveso, ne „OK" - „Smazat", „Aktivovat". */
  potvrdit: string
  /** Nevratná nebo ničivá akce: potvrzení zčervená. */
  nebezpecne?: boolean
  className?: string
  /** Spouštěcí tlačítko. Vykreslí se do formuláře, na svoje původní místo. */
  children: ReactNode
}) {
  const [otevreno, setOtevreno] = useState(false)
  const formular = useRef<HTMLFormElement>(null)
  const potvrzeno = useRef(false)

  return (
    <>
      <form
        ref={formular}
        action={akce}
        className={className}
        onSubmit={(udalost) => {
          if (potvrzeno.current) {
            potvrzeno.current = false
            return
          }

          udalost.preventDefault()
          setOtevreno(true)
        }}
      >
        {children}
      </form>

      <Dialog.Root open={otevreno} onOpenChange={setOtevreno}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/40 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

          <Dialog.Content
            {...(popis ? {} : { 'aria-describedby': undefined })}
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-md border bg-card p-6 text-card-foreground shadow-lg data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          >
            <div className="flex gap-3">
              <CircleAlert
                className={`mt-0.5 size-6 shrink-0 ${nebezpecne ? 'text-destructive' : 'text-primary'}`}
                aria-hidden="true"
              />
              <div className="min-w-0 space-y-2">
                <Dialog.Title className="text-base font-semibold">{otazka}</Dialog.Title>
                {popis ? (
                  <Dialog.Description className="text-sm text-muted-foreground">
                    {popis}
                  </Dialog.Description>
                ) : null}
              </div>
            </div>

            {/* Na tabletu v rukavicích musí být obě tlačítka plnohodnotný cíl.
                Na úzké obrazovce jdou pod sebe a potvrzení zůstává nahoře. */}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Dialog.Close asChild>
                <Button type="button" variant="outline" size="dotyk">
                  Zpět
                </Button>
              </Dialog.Close>

              <Button
                type="button"
                size="dotyk"
                variant={nebezpecne ? 'destructive' : 'default'}
                onClick={() => {
                  potvrzeno.current = true
                  setOtevreno(false)
                  formular.current?.requestSubmit()
                }}
              >
                {potvrdit}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
