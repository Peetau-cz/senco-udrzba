import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'
import animate from 'tailwindcss-animate'

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        // Proměnné nastavuje next/font v src/app/layout.tsx. Náhradní stack je
        // za nimi schválně - než se písmo stáhne, text se vykreslí systémovým.
        sans: ['var(--pismo)', ...defaultTheme.fontFamily.sans],
        razene: ['var(--pismo-razene)', ...defaultTheme.fontFamily.mono],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        // Firemní fialová v roli zvýraznění - aktivní položka menu, aktivní
        // záložka. Akce zůstávají zelené (primary), viz globals.css.
        zvyrazneni: {
          DEFAULT: 'hsl(var(--zvyrazneni))',
          foreground: 'hsl(var(--zvyrazneni-foreground))',
        },
        // Plocha boční lišty. Vlastní token, ne `zvyrazneni`: v tmavém režimu
        // musí lišta ztmavnout, kdežto zvýrazňovací fialová naopak zesvětlá.
        navigace: {
          DEFAULT: 'hsl(var(--navigace))',
          foreground: 'hsl(var(--navigace-foreground))',
          tlumene: 'hsl(var(--navigace-tlumene))',
        },
        // Přímý přístup k firemním barvám. Používat jen tam, kde nejde o roli
        // v rozhraní, ale skutečně o značku (proužek u názvu aplikace).
        znacka: {
          zelena: 'hsl(var(--znacka-zelena))',
          fialova: 'hsl(var(--znacka-fialova))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Stavy údržby - používají se napříč dashboardem, plněním i checklistem.
        stav: {
          splneno: 'hsl(var(--stav-splneno))',
          dnes: 'hsl(var(--stav-dnes))',
          poterminu: 'hsl(var(--stav-poterminu))',
        },
      },
      // Odsazení fokusového prstence musí mít barvu podkladu, ne bílou.
      // Na dílenské šedi by bílá mezera kolem tlačítka vypadala jako díra.
      ringOffsetColor: {
        DEFAULT: 'hsl(var(--background))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      spacing: {
        // Minimální dotykový cíl pro obsluhu tabletu v rukavicích.
        dotyk: '3rem',
      },
    },
  },
  plugins: [animate],
}

export default config
