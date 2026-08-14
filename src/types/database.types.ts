/**
 * Typy databáze odpovídající migracím 0001 až 0005 ze `supabase/migrations/`.
 *
 * Tento soubor se běžně GENERUJE příkazem `npm run db:types`. Než bude projekt
 * propojený se Supabase (`supabase link`), je napsaný ručně podle migrací, aby
 * šel projekt přeložit a typová kontrola měla o co se opřít. Po každé nové
 * migraci je proto potřeba doplnit tabulky, enumy a funkce sem taky — jinak
 * typecheck spadne na `SelectQueryError`.
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

      // --- M1: evidence zařízení (migrace 0003) --------------------------------

      typ_zarizeni: {
        Row: {
          id: string
          oblast_id: string
          kod: string
          nazev: string
          popis: string | null
          schema_parametru: Json
          aktivni: boolean
          vytvoreno_at: string
          zmeneno_at: string
        }
        Insert: {
          id?: string
          oblast_id: string
          kod: string
          nazev: string
          popis?: string | null
          schema_parametru?: Json
          aktivni?: boolean
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Update: {
          id?: string
          oblast_id?: string
          kod?: string
          nazev?: string
          popis?: string | null
          schema_parametru?: Json
          aktivni?: boolean
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'typ_zarizeni_oblast_id_fkey'
            columns: ['oblast_id']
            isOneToOne: false
            referencedRelation: 'oblast'
            referencedColumns: ['id']
          },
        ]
      }
      zarizeni: {
        Row: {
          id: string
          oblast_id: string
          typ_zarizeni_id: string
          nazev: string
          inventarni_cislo: string | null
          vyrobce: string | null
          model: string | null
          vyrobni_cislo: string | null
          rok_vyroby: number | null
          umisteni_id: string | null
          odpovedna_osoba_id: string | null
          stav: Database['public']['Enums']['stav_zarizeni']
          parametry: Json
          poznamka: string | null
          vytvoreno_at: string
          zmeneno_at: string
        }
        Insert: {
          id?: string
          oblast_id: string
          typ_zarizeni_id: string
          nazev: string
          inventarni_cislo?: string | null
          vyrobce?: string | null
          model?: string | null
          vyrobni_cislo?: string | null
          rok_vyroby?: number | null
          umisteni_id?: string | null
          odpovedna_osoba_id?: string | null
          stav?: Database['public']['Enums']['stav_zarizeni']
          parametry?: Json
          poznamka?: string | null
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Update: {
          id?: string
          oblast_id?: string
          typ_zarizeni_id?: string
          nazev?: string
          inventarni_cislo?: string | null
          vyrobce?: string | null
          model?: string | null
          vyrobni_cislo?: string | null
          rok_vyroby?: number | null
          umisteni_id?: string | null
          odpovedna_osoba_id?: string | null
          stav?: Database['public']['Enums']['stav_zarizeni']
          parametry?: Json
          poznamka?: string | null
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'zarizeni_oblast_id_fkey'
            columns: ['oblast_id']
            isOneToOne: false
            referencedRelation: 'oblast'
            referencedColumns: ['id']
          },
          {
            // Složený klíč: typ i zařízení musí být ve stejné oblasti.
            foreignKeyName: 'zarizeni_typ_ze_stejne_oblasti'
            columns: ['typ_zarizeni_id', 'oblast_id']
            isOneToOne: false
            referencedRelation: 'typ_zarizeni'
            referencedColumns: ['id', 'oblast_id']
          },
          {
            foreignKeyName: 'zarizeni_umisteni_id_fkey'
            columns: ['umisteni_id']
            isOneToOne: false
            referencedRelation: 'umisteni'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'zarizeni_odpovedna_osoba_id_fkey'
            columns: ['odpovedna_osoba_id']
            isOneToOne: false
            referencedRelation: 'profil'
            referencedColumns: ['id']
          },
        ]
      }
      zarizeni_soubor: {
        Row: {
          id: string
          zarizeni_id: string
          druh: Database['public']['Enums']['druh_souboru']
          nazev: string
          cesta: string
          mime: string | null
          velikost_b: number | null
          nahral_id: string | null
          vytvoreno_at: string
        }
        Insert: {
          id?: string
          zarizeni_id: string
          druh: Database['public']['Enums']['druh_souboru']
          nazev: string
          cesta: string
          mime?: string | null
          velikost_b?: number | null
          nahral_id?: string | null
          vytvoreno_at?: string
        }
        Update: {
          id?: string
          zarizeni_id?: string
          druh?: Database['public']['Enums']['druh_souboru']
          nazev?: string
          cesta?: string
          mime?: string | null
          velikost_b?: number | null
          nahral_id?: string | null
          vytvoreno_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'zarizeni_soubor_zarizeni_id_fkey'
            columns: ['zarizeni_id']
            isOneToOne: false
            referencedRelation: 'zarizeni'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'zarizeni_soubor_nahral_id_fkey'
            columns: ['nahral_id']
            isOneToOne: false
            referencedRelation: 'profil'
            referencedColumns: ['id']
          },
        ]
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
      spravuje_zarizeni_v_oblasti: {
        Args: { p_oblast: string }
        Returns: boolean
      }
      je_platne_schema_parametru: {
        Args: { p_schema: Json }
        Returns: boolean
      }
    }
    Enums: {
      vztah_k_oblasti: 'garant' | 'spolupracujici'
      stav_zarizeni: 'v_provozu' | 'odstaveno' | 'v_oprave' | 'vyrazeno'
      druh_souboru: 'foto' | 'navod' | 'certifikat'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
