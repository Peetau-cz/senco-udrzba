/**
 * Typy databáze odpovídající migracím 0001 až 0014 ze `supabase/migrations/`.
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
      sablona: {
        Row: {
          id: string
          oblast_id: string
          kod: string
          nazev: string
          popis: string | null
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
          aktivni?: boolean
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sablona_oblast_id_fkey'
            columns: ['oblast_id']
            isOneToOne: false
            referencedRelation: 'oblast'
            referencedColumns: ['id']
          },
        ]
      }
      sablona_verze: {
        Row: {
          id: string
          sablona_id: string
          cislo_verze: number
          stav: Database['public']['Enums']['stav_verze']
          platna_od: string | null
          vytvoril_id: string | null
          poznamka_ke_zmene: string | null
          vytvoreno_at: string
        }
        Insert: {
          id?: string
          sablona_id: string
          cislo_verze: number
          stav?: Database['public']['Enums']['stav_verze']
          platna_od?: string | null
          vytvoril_id?: string | null
          poznamka_ke_zmene?: string | null
          vytvoreno_at?: string
        }
        Update: {
          id?: string
          sablona_id?: string
          cislo_verze?: number
          stav?: Database['public']['Enums']['stav_verze']
          platna_od?: string | null
          vytvoril_id?: string | null
          poznamka_ke_zmene?: string | null
          vytvoreno_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sablona_verze_sablona_id_fkey'
            columns: ['sablona_id']
            isOneToOne: false
            referencedRelation: 'sablona'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sablona_verze_vytvoril_id_fkey'
            columns: ['vytvoril_id']
            isOneToOne: false
            referencedRelation: 'profil'
            referencedColumns: ['id']
          },
        ]
      }
      sablona_ukon: {
        Row: {
          id: string
          sablona_verze_id: string
          klic: string
          poradi: number
          nazev: string
          popis: string | null
          interval_typ: Database['public']['Enums']['interval_typ']
          interval_hodnota: number
          interval_zaklad: Database['public']['Enums']['interval_zaklad']
          tolerance_dny: number
          profese_role_id: string
          kontrolni_body: Json
          vyzaduje_foto: boolean
          vyzaduje_hodnotu: boolean
          nabizi_poznamku: boolean
          jednotka: string | null
          mez_min: number | null
          mez_max: number | null
          vytvoreno_at: string
        }
        Insert: {
          id?: string
          sablona_verze_id: string
          klic?: string
          poradi: number
          nazev: string
          popis?: string | null
          interval_typ: Database['public']['Enums']['interval_typ']
          interval_hodnota: number
          interval_zaklad?: Database['public']['Enums']['interval_zaklad']
          tolerance_dny?: number
          profese_role_id: string
          kontrolni_body?: Json
          vyzaduje_foto?: boolean
          vyzaduje_hodnotu?: boolean
          nabizi_poznamku?: boolean
          jednotka?: string | null
          mez_min?: number | null
          mez_max?: number | null
          vytvoreno_at?: string
        }
        Update: {
          id?: string
          sablona_verze_id?: string
          klic?: string
          poradi?: number
          nazev?: string
          popis?: string | null
          interval_typ?: Database['public']['Enums']['interval_typ']
          interval_hodnota?: number
          interval_zaklad?: Database['public']['Enums']['interval_zaklad']
          tolerance_dny?: number
          profese_role_id?: string
          kontrolni_body?: Json
          vyzaduje_foto?: boolean
          vyzaduje_hodnotu?: boolean
          nabizi_poznamku?: boolean
          jednotka?: string | null
          mez_min?: number | null
          mez_max?: number | null
          vytvoreno_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'sablona_ukon_sablona_verze_id_fkey'
            columns: ['sablona_verze_id']
            isOneToOne: false
            referencedRelation: 'sablona_verze'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'sablona_ukon_profese_role_id_fkey'
            columns: ['profese_role_id']
            isOneToOne: false
            referencedRelation: 'role'
            referencedColumns: ['id']
          },
        ]
      }
      zarizeni_sablona: {
        Row: {
          zarizeni_id: string
          sablona_id: string
          oblast_id: string
          prirazeno_od: string
          prirazil_id: string | null
          vytvoreno_at: string
        }
        Insert: {
          zarizeni_id: string
          sablona_id: string
          oblast_id: string
          prirazeno_od?: string
          prirazil_id?: string | null
          vytvoreno_at?: string
        }
        Update: {
          zarizeni_id?: string
          sablona_id?: string
          oblast_id?: string
          prirazeno_od?: string
          prirazil_id?: string | null
          vytvoreno_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'zarizeni_sablona_zarizeni_fk'
            columns: ['zarizeni_id', 'oblast_id']
            isOneToOne: false
            referencedRelation: 'zarizeni'
            referencedColumns: ['id', 'oblast_id']
          },
          {
            foreignKeyName: 'zarizeni_sablona_sablona_fk'
            columns: ['sablona_id', 'oblast_id']
            isOneToOne: false
            referencedRelation: 'sablona'
            referencedColumns: ['id', 'oblast_id']
          },
          {
            foreignKeyName: 'zarizeni_sablona_prirazil_id_fkey'
            columns: ['prirazil_id']
            isOneToOne: false
            referencedRelation: 'profil'
            referencedColumns: ['id']
          },
        ]
      }
      plan_udrzby: {
        Row: {
          id: string
          zarizeni_id: string
          sablona_id: string
          ukon_klic: string
          /** Null = garant termín ještě nezadal, plánovač řádek přeskočí. */
          dalsi_termin: string | null
          posledni_provedeno_at: string | null
          aktivni: boolean
          vytvoreno_at: string
          zmeneno_at: string
        }
        Insert: {
          id?: string
          zarizeni_id: string
          sablona_id: string
          ukon_klic: string
          dalsi_termin?: string | null
          posledni_provedeno_at?: string | null
          aktivni?: boolean
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Update: {
          id?: string
          zarizeni_id?: string
          sablona_id?: string
          ukon_klic?: string
          dalsi_termin?: string | null
          posledni_provedeno_at?: string | null
          aktivni?: boolean
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'plan_udrzby_prirazeni_fk'
            columns: ['zarizeni_id', 'sablona_id']
            isOneToOne: false
            referencedRelation: 'zarizeni_sablona'
            referencedColumns: ['zarizeni_id', 'sablona_id']
          },
        ]
      }
      zakazka: {
        Row: {
          id: string
          zarizeni_id: string
          sablona_verze_id: string
          profese_role_id: string
          planovany_termin: string
          stav: Database['public']['Enums']['stav_zakazky']
          prirazeno_uzivateli_id: string | null
          zahajeno_at: string | null
          dokonceno_at: string | null
          dokoncil_id: string | null
          poznamka: string | null
          vytvoreno_at: string
          zmeneno_at: string
        }
        Insert: {
          id?: string
          zarizeni_id: string
          sablona_verze_id: string
          profese_role_id: string
          planovany_termin: string
          stav?: Database['public']['Enums']['stav_zakazky']
          prirazeno_uzivateli_id?: string | null
          zahajeno_at?: string | null
          dokonceno_at?: string | null
          dokoncil_id?: string | null
          poznamka?: string | null
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Update: {
          id?: string
          zarizeni_id?: string
          sablona_verze_id?: string
          profese_role_id?: string
          planovany_termin?: string
          stav?: Database['public']['Enums']['stav_zakazky']
          prirazeno_uzivateli_id?: string | null
          zahajeno_at?: string | null
          dokonceno_at?: string | null
          dokoncil_id?: string | null
          poznamka?: string | null
          vytvoreno_at?: string
          zmeneno_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'zakazka_zarizeni_id_fkey'
            columns: ['zarizeni_id']
            isOneToOne: false
            referencedRelation: 'zarizeni'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'zakazka_sablona_verze_id_fkey'
            columns: ['sablona_verze_id']
            isOneToOne: false
            referencedRelation: 'sablona_verze'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'zakazka_profese_role_id_fkey'
            columns: ['profese_role_id']
            isOneToOne: false
            referencedRelation: 'role'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'zakazka_prirazeno_uzivateli_id_fkey'
            columns: ['prirazeno_uzivateli_id']
            isOneToOne: false
            referencedRelation: 'profil'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'zakazka_dokoncil_id_fkey'
            columns: ['dokoncil_id']
            isOneToOne: false
            referencedRelation: 'profil'
            referencedColumns: ['id']
          },
        ]
      }
      zakazka_ukon: {
        Row: {
          id: string
          zakazka_id: string
          plan_udrzby_id: string | null
          sablona_ukon_id: string | null
          poradi: number
          nazev_snapshot: string
          popis_snapshot: string | null
          /** Zadání bodů i odpovědi technika v jednom poli, viz migrace 0011. */
          kontrolni_body: Json
          vyzaduje_foto: boolean
          vyzaduje_hodnotu: boolean
          nabizi_poznamku: boolean
          jednotka_snapshot: string | null
          mez_min_snapshot: number | null
          mez_max_snapshot: number | null
          stav: Database['public']['Enums']['stav_ukonu']
          hodnota: number | null
          poznamka: string | null
          potvrzeno_at: string | null
          potvrdil_id: string | null
          vytvoreno_at: string
        }
        Insert: {
          id?: string
          zakazka_id: string
          plan_udrzby_id?: string | null
          sablona_ukon_id?: string | null
          poradi: number
          nazev_snapshot: string
          popis_snapshot?: string | null
          kontrolni_body?: Json
          vyzaduje_foto?: boolean
          vyzaduje_hodnotu?: boolean
          nabizi_poznamku?: boolean
          jednotka_snapshot?: string | null
          mez_min_snapshot?: number | null
          mez_max_snapshot?: number | null
          stav?: Database['public']['Enums']['stav_ukonu']
          hodnota?: number | null
          poznamka?: string | null
          potvrzeno_at?: string | null
          potvrdil_id?: string | null
          vytvoreno_at?: string
        }
        Update: {
          id?: string
          zakazka_id?: string
          plan_udrzby_id?: string | null
          sablona_ukon_id?: string | null
          poradi?: number
          nazev_snapshot?: string
          popis_snapshot?: string | null
          kontrolni_body?: Json
          vyzaduje_foto?: boolean
          vyzaduje_hodnotu?: boolean
          nabizi_poznamku?: boolean
          jednotka_snapshot?: string | null
          mez_min_snapshot?: number | null
          mez_max_snapshot?: number | null
          stav?: Database['public']['Enums']['stav_ukonu']
          hodnota?: number | null
          poznamka?: string | null
          potvrzeno_at?: string | null
          potvrdil_id?: string | null
          vytvoreno_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'zakazka_ukon_zakazka_id_fkey'
            columns: ['zakazka_id']
            isOneToOne: false
            referencedRelation: 'zakazka'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'zakazka_ukon_plan_udrzby_id_fkey'
            columns: ['plan_udrzby_id']
            isOneToOne: false
            referencedRelation: 'plan_udrzby'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'zakazka_ukon_sablona_ukon_id_fkey'
            columns: ['sablona_ukon_id']
            isOneToOne: false
            referencedRelation: 'sablona_ukon'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'zakazka_ukon_potvrdil_id_fkey'
            columns: ['potvrdil_id']
            isOneToOne: false
            referencedRelation: 'profil'
            referencedColumns: ['id']
          },
        ]
      }
      zakazka_foto: {
        Row: {
          id: string
          zakazka_ukon_id: string
          storage_path: string
          popis: string | null
          nahral_id: string | null
          vytvoreno_at: string
        }
        Insert: {
          id?: string
          zakazka_ukon_id: string
          storage_path: string
          popis?: string | null
          nahral_id?: string | null
          vytvoreno_at?: string
        }
        Update: {
          id?: string
          zakazka_ukon_id?: string
          storage_path?: string
          popis?: string | null
          nahral_id?: string | null
          vytvoreno_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'zakazka_foto_zakazka_ukon_id_fkey'
            columns: ['zakazka_ukon_id']
            isOneToOne: false
            referencedRelation: 'zakazka_ukon'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'zakazka_foto_nahral_id_fkey'
            columns: ['nahral_id']
            isOneToOne: false
            referencedRelation: 'profil'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      v_dnesni_plan: {
        Row: {
          zakazka_id: string
          zarizeni_id: string
          oblast_id: string
          zarizeni_nazev: string
          inventarni_cislo: string | null
          planovany_termin: string
          stav: Database['public']['Enums']['stav_zakazky']
          prirazeno_uzivateli_id: string | null
          profese_role_id: string
          profese_nazev: string
          kroku: number
          vyrizeno: number
        }
        Relationships: []
      }
      v_po_terminu: {
        Row: {
          zakazka_id: string
          zarizeni_id: string
          oblast_id: string
          zarizeni_nazev: string
          inventarni_cislo: string | null
          planovany_termin: string
          stav: Database['public']['Enums']['stav_zakazky']
          prirazeno_uzivateli_id: string | null
          profese_role_id: string
          profese_nazev: string
          dnu_zpozdeni: number
          kroku: number
          vyrizeno: number
        }
        Relationships: []
      }
      v_plneni_matice: {
        Row: {
          oblast_id: string
          /** První den měsíce, podle plánovaného termínu. */
          obdobi: string
          celkem: number
          splneno: number
          po_terminu: number
          /** „Nelze provést" — mimo výpočet, vykazuje se vedle. */
          neprovedeno: number
        }
        Relationships: []
      }
      /** Migrace 0019. Vyřazené stroje pohled vynechává. */
      v_pripravenost_zarizeni: {
        Row: {
          zarizeni_id: string
          oblast_id: string
          sablon: number
          /** Jen aktivní úkony — vyřazené z matice se nepočítají. */
          ukonu_celkem: number
          ukonu_bez_terminu: number
          stav_planu: 'bez_sablony' | 'bez_ukonu' | 'bez_terminu' | 'ok'
        }
        Relationships: []
      }
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
      spravuje_sablony_v_oblasti: {
        Args: { p_oblast: string }
        Returns: boolean
      }
      zaloz_navrh_verze: {
        Args: { p_sablona_id: string }
        Returns: string
      }
      aktivuj_verzi: {
        Args: { p_verze_id: string }
        Returns: undefined
      }
      srovnej_plan: {
        Args: { p_zarizeni: string; p_sablona: string }
        Returns: undefined
      }
      provadi_udrzbu_v_oblasti: {
        Args: { p_oblast: string }
        Returns: boolean
      }
      jsou_platne_odpovedi_bodu: {
        Args: { p_body: Json }
        Returns: boolean
      }
      zadani_kontrolnich_bodu: {
        Args: { p_body: Json }
        Returns: Json
      }
      dalsi_termin: {
        Args: {
          p_planovany: string
          p_provedeno: string | null
          p_typ: Database['public']['Enums']['interval_typ']
          p_hodnota: number
          p_zaklad: Database['public']['Enums']['interval_zaklad']
        }
        Returns: string
      }
      dokonci_zakazku: {
        Args: { p_zakazka: string }
        Returns: undefined
      }
      naplanuj_zarizeni: {
        Args: { p_zarizeni: string }
        Returns: number
      }
      // zaloz_zakazky tu schválně není: právo EXECUTE nemá `authenticated`
      // ani `anon` (migrace 0015), protože jede napříč všemi oblastmi. Ven
      // vede jen cesta přes jedno zařízení, tedy naplanuj_zarizeni.
    }
    Enums: {
      vztah_k_oblasti: 'garant' | 'spolupracujici'
      stav_zarizeni: 'v_provozu' | 'odstaveno' | 'v_oprave' | 'vyrazeno'
      druh_souboru: 'foto' | 'navod' | 'certifikat'
      stav_verze: 'navrh' | 'aktivni' | 'archivovana'
      interval_typ: 'dny' | 'tydny' | 'mesice' | 'roky'
      interval_zaklad: 'od_provedeni' | 'od_planu'
      stav_zakazky: 'naplanovano' | 'probiha' | 'dokonceno' | 'zruseno'
      stav_ukonu: 'nesplneno' | 'splneno' | 'nelze_provest'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
