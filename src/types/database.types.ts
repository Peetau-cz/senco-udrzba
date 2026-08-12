/**
 * Typy databáze odpovídající supabase/migrations/0001_identita_a_opravneni.sql.
 *
 * Tento soubor se běžně GENERUJE příkazem `npm run db:types`. Než bude projekt
 * propojený se Supabase (`supabase link`), je napsaný ručně podle migrace, aby
 * šel projekt přeložit a typová kontrola měla o co se opřít.
 *
 * Po propojení spusťte `npm run db:types` — generátor soubor přepíše. Pokud se
 * vygenerovaný obsah bude lišit od tohoto, je to signál, že migrace a kód se
 * rozešly.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      oblast: {
        Row: {
          id: string
          kod: string
          nazev: string
          poradi: number
          aktivni: boolean
          vytvoreno_at: string
          zmeneno_at: string
        }
        Insert: {
          id?: string
          kod: string
          nazev: string
          poradi?: number
          aktivni?: boolean
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Update: {
          id?: string
          kod?: string
          nazev?: string
          poradi?: number
          aktivni?: boolean
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Relationships: []
      }
      role: {
        Row: {
          id: string
          kod: string
          nazev: string
          popis: string | null
          poradi: number
        }
        Insert: {
          id?: string
          kod: string
          nazev: string
          popis?: string | null
          poradi?: number
        }
        Update: {
          id?: string
          kod?: string
          nazev?: string
          popis?: string | null
          poradi?: number
        }
        Relationships: []
      }
      umisteni: {
        Row: {
          id: string
          kod: string
          nazev: string
          nadrazene_id: string | null
          vytvoreno_at: string
          zmeneno_at: string
        }
        Insert: {
          id?: string
          kod: string
          nazev: string
          nadrazene_id?: string | null
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Update: {
          id?: string
          kod?: string
          nazev?: string
          nadrazene_id?: string | null
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'umisteni_nadrazene_id_fkey'
            columns: ['nadrazene_id']
            isOneToOne: false
            referencedRelation: 'umisteni'
            referencedColumns: ['id']
          },
        ]
      }
      profil: {
        Row: {
          id: string
          jmeno: string
          prijmeni: string
          osobni_cislo: string | null
          email: string
          aktivni: boolean
          vytvoreno_at: string
          zmeneno_at: string
        }
        Insert: {
          id: string
          jmeno?: string
          prijmeni?: string
          osobni_cislo?: string | null
          email: string
          aktivni?: boolean
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Update: {
          id?: string
          jmeno?: string
          prijmeni?: string
          osobni_cislo?: string | null
          email?: string
          aktivni?: boolean
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Relationships: []
      }
      uzivatel_role: {
        Row: {
          uzivatel_id: string
          role_id: string
        }
        Insert: {
          uzivatel_id: string
          role_id: string
        }
        Update: {
          uzivatel_id?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'uzivatel_role_uzivatel_id_fkey'
            columns: ['uzivatel_id']
            isOneToOne: false
            referencedRelation: 'profil'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'uzivatel_role_role_id_fkey'
            columns: ['role_id']
            isOneToOne: false
            referencedRelation: 'role'
            referencedColumns: ['id']
          },
        ]
      }
      uzivatel_oblast: {
        Row: {
          uzivatel_id: string
          oblast_id: string
          vztah: Database['public']['Enums']['vztah_k_oblasti']
        }
        Insert: {
          uzivatel_id: string
          oblast_id: string
          vztah?: Database['public']['Enums']['vztah_k_oblasti']
        }
        Update: {
          uzivatel_id?: string
          oblast_id?: string
          vztah?: Database['public']['Enums']['vztah_k_oblasti']
        }
        Relationships: [
          {
            foreignKeyName: 'uzivatel_oblast_uzivatel_id_fkey'
            columns: ['uzivatel_id']
            isOneToOne: false
            referencedRelation: 'profil'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'uzivatel_oblast_oblast_id_fkey'
            columns: ['oblast_id']
            isOneToOne: false
            referencedRelation: 'oblast'
            referencedColumns: ['id']
          },
        ]
      }
      audit_log: {
        Row: {
          id: number
          tabulka: string
          zaznam_id: string
          operace: string
          stary_stav: Json | null
          novy_stav: Json | null
          uzivatel_id: string | null
          cas: string
        }
        Insert: {
          id?: never
          tabulka: string
          zaznam_id: string
          operace: string
          stary_stav?: Json | null
          novy_stav?: Json | null
          uzivatel_id?: string | null
          cas?: string
        }
        Update: {
          id?: never
          tabulka?: string
          zaznam_id?: string
          operace?: string
          stary_stav?: Json | null
          novy_stav?: Json | null
          uzivatel_id?: string | null
          cas?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ma_roli: {
        Args: { p_kod: string }
        Returns: boolean
      }
      ma_pristup_k_oblasti: {
        Args: { p_oblast: string }
        Returns: boolean
      }
      je_garantem_oblasti: {
        Args: { p_oblast: string }
        Returns: boolean
      }
      muze_zapisovat: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      spravuje_ciselniky: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      vztah_k_oblasti: 'garant' | 'spolupracujici'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
