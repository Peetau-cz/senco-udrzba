# Návrh systému pro centrální řízení údržby — SENCO Příbram

Verze návrhu: 1.1 · Stav: **schváleno, předpoklady potvrzeny 12. 8. 2026** · Zdroj požadavků: `docs/zadani.txt`

Tento dokument pokrývá všech sedm výstupů požadovaných v části *Způsob vývoje* (ř. 193–199 zadání).

---

## 0. Potvrzené předpoklady

Zadání neurčuje šest věcí, které přímo ovlivňují datový model. Všechny byly potvrzeny
12. 8. 2026 a jsou závazné pro implementaci.

| # | Otázka | Rozhodnutí | Poznámka |
|---|--------|------------|----------|
| P1 | Základ intervalu údržby | **POTVRZENO: pouze kalendářní intervaly** (dny, týdny, měsíce, roky) | Motohodiny se neevidují. Výpočet termínu je uzavřen v jediné SQL funkci `dalsi_termin()`, aby případné pozdější doplnění motohodin byla lokální změna, ne přepis plánovače. |
| P2 | Výpočet dalšího termínu | **POTVRZENO: nastavitelné na úkonu, výchozí plovoucí** (od skutečného provedení) | Odpovídá reálné praxi údržby; fixní varianta zůstává pro revize s pevným datem. Sloupec `interval_zaklad`. |
| P3 | Definice „Plnění %" | **POTVRZENO:** `splněno / (splněno + po termínu)` za kalendářní měsíc | Údržba dokončená po termínu se počítá jako *po termínu*. Úkony, jejichž termín ještě nenastal, se nepočítají. Sedí na příklad v zadání (124 / 126 = 98 %). |
| P4 | Přihlašování | **POTVRZENO 12. 8. 2026:** Supabase Auth e-mail + heslo, s připravenou vazbou na **Entra ID (SSO)** | Rychlý start; SSO se zapíná konfigurací, model rolí se nemění. Ověřit, že firemní účet mají i všichni údržbáři v dílně, nejen kancelář. |
| P5 | Kde poběží data | **POTVRZENO:** Supabase Cloud, **region EU** | Vývoj běží rovnou proti cloudovému vývojovému projektu, bez Dockeru. Self-hosting zůstává možný bez zásahu do kódu. |
| P6 | Migrace ze stávajících Excelů | **POTVRZENO:** Import **zařízení a šablon** přes CSV; historii nepřevádět, staré Excely archivovat jako přílohu | Import nekonzistentní historie by znehodnotil KPI plnění hned na startu. |

### Rozhodnutí o náběhu

**Spouští se všech pět oblastí najednou** (potvrzeno 12. 8. 2026), nikoli pilotem na jedné.
Důsledek: kritickou cestou projektu přestává být vývoj a stává se jí **naplnění daty** —
systém nelze spustit dřív, než budou hotové šablony údržby pro všech pět oblastí. Postup
a odpovědnosti řeší `docs/PRIPRAVA_DAT.md`.

Dále zadání vůbec nezmiňuje čtyři věci, které jsem do návrhu **zahrnul jako připravené, ale
neimplementované v první fázi**: notifikace, náhradní díly a sklad, evidence prostojů (MTBF/MTTR)
a schvalování provedené údržby druhou osobou. Viz kap. 8.

---

## 1. Architektura systému

### 1.1 Celkový obraz

```
┌──────────────────────────────────────────────────────────────┐
│  Prohlížeč (desktop kancelář · tablet dílna · mobil)          │
│  Next.js 15 App Router — React Server Components + klient     │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTPS
┌───────────────▼──────────────────────────────────────────────┐
│  Aplikační vrstva (Next.js server)                            │
│  · Server Actions — zápisy                                    │
│  · RSC dotazy — čtení                                         │
│  · Zod validace na hranici                                    │
└───────────────┬──────────────────────────────────────────────┘
                │ Supabase JS (uživatelský JWT — nikdy service_role)
┌───────────────▼──────────────────────────────────────────────┐
│  Supabase                                                     │
│  ┌────────────┬──────────┬──────────┬─────────┬────────────┐ │
│  │ PostgreSQL │   Auth   │ Storage  │Realtime │ Edge Funcs │ │
│  │  + RLS     │          │ (fotky,  │(dashb.) │ (notifikace│ │
│  │  + pg_cron │          │  návody) │         │  , exporty)│ │
│  └────────────┴──────────┴──────────┴─────────┴────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 Pět architektonických rozhodnutí

**R1 — RLS je bezpečnostní hranice, ne aplikační kód.**
Oprávnění se vynucují v databázi politikami Row Level Security. Aplikace pracuje výhradně
uživatelským JWT; servisní klíč se nepoužívá pro běžné operace. Důsledek: obejít oprávnění
nejde ani chybou v UI, ani přímým voláním API.

**R2 — Oblasti údržby jsou data, ne kód.**
CNC, strojní, elektro, VZV a lakovna jsou řádky v tabulce `oblast`, nikoli hodnoty výčtu
v TypeScriptu. Přidání šesté oblasti (např. vzduchotechnika) je záznam v číselníku a přiřazení
garanta — bez nasazení nové verze. Přímo naplňuje požadavek na modularitu (ř. 5 zadání).

**R3 — Zakázka si zamrazí verzi šablony.**
Klíčové rozhodnutí, které řeší rozpor v zadání mezi „změna šablony se automaticky projeví
u všech zařízení" (ř. 107) a „historii nebude možné mazat" (ř. 155). Podrobně v kap. 2.3.

**R4 — Plán a provozní deník jsou oddělené entity.**
Zadání explicitně říká, že záznamy z deníku *neovlivňují plán preventivní údržby ani plnění
matice* (ř. 144). Dvě samostatné tabulky sjednocené až v pohledu historie. Jedna polymorfní
tabulka by to pravidlo dřív nebo později porušila.

**R6 — Schéma neví, kdo obstarává přihlašování.**
Doplněno 12. 8. 2026 na základě úvahy o budoucím přesunu na firemní PostgreSQL.
Migrace `0001` je čistý PostgreSQL, `0002` je jediný soubor závislý na Supabase.
Politiky se ptají funkce `public.aktualni_uzivatel()`, ne `auth.uid()`, a `profil`
nemá cizí klíč do `auth.users`. Výměna systému přihlašování je tak změna jedné funkce
místo deseti politik. Podrobně v `docs/PORTABILITA.md`.

**R5 — Neměnnost se vynucuje granty a triggery, ne konvencí.**
Na `audit_log`, dokončených zakázkách a záznamech deníku jsou odebrána práva `DELETE`
a `UPDATE`. RLS řídí viditelnost, nikoli nemazatelnost — to je častý omyl.

### 1.3 Plánovač

Noční úloha `pg_cron` (03:00) prochází `plan_udrzby` a zakládá zakázky pro úkony, jejichž
termín spadá do plánovacího okna (výchozí 14 dní dopředu). Úloha je **idempotentní** —
opakované spuštění nevytvoří duplicity, protože kombinace `(plan_udrzby_id, planovany_termin)`
je unikátní. Další termín počítá jediná funkce `dalsi_termin(posledni, interval_typ,
interval_hodnota, interval_zaklad)` — veškerá logika intervalů žije na jednom místě.

---

## 2. Databázový model

Postgres 15, schéma `public`, veškeré názvy česky bez diakritiky, `snake_case`.

### 2.1 Organizace a lidé

| Tabulka | Klíčové sloupce | Poznámka |
|---|---|---|
| `oblast` | `id`, `kod`, `nazev`, `poradi`, `aktivni` | 5 oblastí ze zadání, rozšiřitelné |
| `profil` | `id` (= `auth.users.id`), `jmeno`, `prijmeni`, `osobni_cislo`, `aktivni` | rozšíření Supabase Auth |
| `role` | `id`, `kod`, `nazev` | 8 rolí ze zadání |
| `uzivatel_role` | `uzivatel_id`, `role_id` | uživatel může mít víc rolí |
| `uzivatel_oblast` | `uzivatel_id`, `oblast_id`, `vztah` (`garant` / `spolupracujici`) | pokrývá lakovnu: vedoucí = garant, údržbář = spolupracující |
| `umisteni` | `id`, `nazev`, `parent_id` | hierarchie hala → provoz → linka |

### 2.2 Zařízení

```
typ_zarizeni (id, oblast_id, nazev, schema_parametru JSONB)
    │  schema_parametru = definice vlastních technických parametrů (ř. 93)
    │  např. {"vreteno_otacky": {"typ":"cislo","jednotka":"1/min","povinne":true}}
    ▼
zarizeni (id, oblast_id, typ_zarizeni_id, nazev, inventarni_cislo UNIQUE,
          vyrobce, model, vyrobni_cislo, rok_vyroby, umisteni_id,
          odpovedna_osoba_id, stav, parametry JSONB)
    │
    └── zarizeni_soubor (typ: foto | navod | certifikat, storage_path, ...)
```

`parametry` je `JSONB` validovaný proti `schema_parametru` — na serveru přes Zod, v databázi
`CHECK`. Hybrid pevných sloupců a JSONB je zvolen záměrně: čistý EAV by znemožnil rozumně
psát dotazy nad plněním matice.

### 2.3 Šablony, verzování a matice — jádro systému

```
sablona (id, oblast_id, nazev, popis, aktivni_verze_id)
    │
    ├── sablona_verze (id, sablona_id, cislo_verze, stav, platna_od,
    │                  vytvoril_id, poznamka_ke_zmene)
    │       stav: navrh → aktivni → archivovana
    │       PO AKTIVACI JE ŘÁDEK NEMĚNNÝ (trigger blokuje UPDATE)
    │
    └── sablona_ukon (id, sablona_verze_id, poradi, nazev, popis,
                      interval_typ, interval_hodnota, interval_zaklad,
                      tolerance_dny, profese_role_id, kontrolni_body JSONB,
                      vyzaduje_foto, vyzaduje_hodnotu, jednotka, mez_min, mez_max)
            ← TOTO JE „MATICE ÚDRŽBY"

zarizeni_sablona (zarizeni_id, sablona_id, prirazeno_od)
    ← jedna šablona → N zařízení stejného typu (Mazak QT250-01/02/03)
```

`interval_typ`: `dny` · `tydny` · `mesice` · `roky` (P1 — pouze kalendářní)
`interval_zaklad`: `od_provedeni` (výchozí) · `od_planu` (P2 — nastavitelné na úkonu)

**Jak se řeší rozpor verzování × neměnná historie:**

- Zařízení ukazuje na **šablonu**. Úprava obsahu založí novou `sablona_verze`, ta se stane
  aktivní a *automaticky se projeví u všech přiřazených zařízení* — tak, jak zadání žádá.
- Hotová zakázka ukazuje na **konkrétní verzi** a navíc má zkopírovaný text úkonů.
  Květnový záznam tedy navždy ukazuje květnovou matici, i když se šablona v červnu změní.
- Bez tohoto oddělení by úprava šablony zpětně přepsala, co technik odškrtal — a historie
  by ztratila důkazní hodnotu.

### 2.4 Plánování a provedení

```
plan_udrzby (id, zarizeni_id, sablona_ukon_id, dalsi_termin,
             posledni_provedeno_at, aktivni)
    ← živý stav plánovače, jeden řádek na kombinaci zařízení × úkon
    ▼  pg_cron zakládá
zakazka (id, zarizeni_id, sablona_verze_id, plan_udrzby_id,
         planovany_termin, stav, prirazeno_uzivateli_id,
         zahajeno_at, dokonceno_at, dokoncil_id, poznamka)
    │   stav: naplanovano | probiha | dokonceno | zruseno
    │   UNIQUE (plan_udrzby_id, planovany_termin)  ← idempotence plánovače
    │
    └── zakazka_ukon (id, zakazka_id, sablona_ukon_id, poradi,
                      nazev_snapshot, popis_snapshot, kontrolni_body_snapshot,
                      stav, hodnota, poznamka, potvrzeno_at, potvrdil_id)
            │   stav: nesplneno | splneno | nelze_provest
            │   ← materializovaný checklist, viz R3
            └── zakazka_foto (storage_path, popis, nahral_id)
```

Typ údržby uživatel nevybírá — vyplývá z matice přiřazené zařízení (ř. 119–120 zadání).

### 2.5 Provozní deník a historie

```
provozni_denik (id, zarizeni_id, oblast_id, typ_zasahu, popis,
                provedeno_at, provedl_id, doba_trvani_min, zapsal_id)
    └── denik_foto
```

Neovlivňuje `plan_udrzby` ani výpočet plnění. Pohled `v_historie_zarizeni` sjednocuje
dokončené zakázky a záznamy deníku do jedné časové osy — to je „kompletní historie" ze ř. 147.

### 2.6 Audit

```
audit_log (id, tabulka, zaznam_id, operace, stary_stav JSONB,
           novy_stav JSONB, uzivatel_id, cas)
```

Plněno univerzálním triggerem nad sledovanými tabulkami. `REVOKE UPDATE, DELETE ON audit_log
FROM authenticated, anon` — zápis jen triggerem, mazání nelze ani administrátorem přes aplikaci.

### 2.7 Odvozené pohledy

| Pohled | Účel |
|---|---|
| `v_historie_zarizeni` | sjednocená historie (zakázky + deník) |
| `v_plneni_matice` | agregace splněno / po termínu / % za oblast a měsíc |
| `v_dnesni_plan` | podklad pro dashboard |
| `v_po_terminu` | úkony po termínu včetně počtu dnů zpoždění |

---

## 3. Uživatelské role a oprávnění

### 3.1 Matice oprávnění

`Č` = čtení · `Z` = zápis · `—` = bez přístupu · *(v)* = jen vlastní oblast

| Modul | Administrátor | Vedoucí údržby | Specialista CNC | Specialista elektro | Údržbář | Vedoucí lakovny | Prac. skladu | Management |
|---|---|---|---|---|---|---|---|---|
| Dashboard | Č | Č | Č *(v)* | Č *(v)* | Č *(v)* | Č *(v)* | Č *(v)* | Č |
| Plnění matice | Č | Č | Č *(v)* | Č *(v)* | Č *(v)* | Č *(v)* | Č *(v)* | Č |
| Zařízení | Z | Z | Z *(v)* | Z *(v)* | Č *(v)* | Z *(v)* | Z *(v)* | Č |
| Šablony a matice | Z | Z | Z *(v)* | Z *(v)* | Č *(v)* | Z *(v)* | Z *(v)* | Č |
| Plán údržby | Z | Z | Z *(v)* | Z *(v)* | Č *(v)* | Z *(v)* | Z *(v)* | Č |
| Provedení údržby | Z | Z | Z *(v)* | Z *(v)* | Z *(v)* | Z *(v)* | Z *(v)* | — |
| Provozní deník | Z | Z | Z *(v)* | Z *(v)* | Z *(v)* | Z *(v)* | Z *(v)* | Č |
| Historie zařízení | Č | Č | Č *(v)* | Č *(v)* | Č *(v)* | Č *(v)* | Č *(v)* | Č |
| Uživatelé a role | Z | — | — | — | — | — | — | — |
| Číselníky (oblasti, typy) | Z | Z | — | — | — | — | — | — |
| Audit | Č | Č | — | — | — | — | — | Č |

Vedoucí údržby a Management vidí **všechny oblasti** (ř. 51). Specialisté pracují standardně
jen se svou (ř. 52) — přiřazení je v `uzivatel_oblast`, takže výjimku lze udělit bez zásahu do kódu.
Management je **výhradně pro čtení** (ř. 49) a nemá přístup k provedení údržby.

### 3.2 Technické provedení v RLS

Dvě pomocné funkce `SECURITY DEFINER STABLE`:

```sql
ma_roli(kod text) returns boolean
ma_pristup_k_oblasti(oblast uuid) returns boolean
```

Typická politika:

```sql
create policy "cteni zarizeni dle oblasti" on zarizeni for select
  using (ma_pristup_k_oblasti(oblast_id));

create policy "zapis zarizeni jen garant a vedouci" on zarizeni for update
  using (ma_pristup_k_oblasti(oblast_id)
         and (ma_roli('vedouci_udrzby') or ma_roli('administrator')
              or exists (select 1 from uzivatel_oblast uo
                         where uo.uzivatel_id = auth.uid()
                           and uo.oblast_id = zarizeni.oblast_id
                           and uo.vztah = 'garant')));
```

Role a přiřazené oblasti se vkládají do JWT jako custom claims, aby politiky nemusely
při každém řádku sahat do tabulek — jinak výkon na seznamech znatelně spadne.

---

## 4. Navigace aplikace

```
/                        Dashboard              ← výchozí obrazovka po přihlášení
/plan                    Plán údržby            (kalendář / seznam, filtr oblast + osoba)
/zakazky/[id]            Provedení údržby       (checklist)
/plneni                  Přehled plnění matice
/plneni/[oblast]         Detail oblasti — nesplněné a blížící se údržby
/zarizeni                Evidence zařízení
/zarizeni/[id]           Karta zařízení         (parametry · soubory · plán · historie)
/sablony                 Šablony údržby
/sablony/[id]            Detail šablony         (verze · matice úkonů · přiřazená zařízení)
/denik                   Provozní deník
/denik/novy              Nový neplánovaný zásah
/historie/[zarizeni]     Kompletní historie zařízení
/nastaveni/uzivatele     Uživatelé a role       — administrátor
/nastaveni/oblasti       Oblasti a garanti      — administrátor, vedoucí údržby
/nastaveni/typy          Typy zařízení a parametry
/audit                   Auditní log            — administrátor, vedoucí, management
```

Levé menu zobrazuje pouze položky, na které má přihlášená role právo. V hlavičce je
přepínač oblasti (pro role s přístupem k více oblastem) a globální vyhledávání zařízení
podle názvu nebo inventárního čísla.

**Zásadní pravidlo z ř. 56:** po přihlášení se nikdy nezobrazuje databáze zařízení.
Kořenová cesta `/` je vždy dashboard.

---

## 5. Wireframy hlavních obrazovek

### 5.1 Dashboard

```
┌────────────────────────────────────────────────────────────────────────┐
│ SENCO Údržba    [ Oblast: Všechny ▾ ]   [ hledat… ]      Novák ▾       │
├────────┬───────────────────────────────────────────────────────────────┤
│        │  Dobrý den, Petře. Dnes je čtvrtek 12. srpna.                 │
│Dashb.  │                                                                │
│Plán    │  ┌──────────┐┌──────────┐┌──────────┐┌──────────┐             │
│Plnění  │  │ DNES     ││ PO TERM. ││ TENTO M. ││ PLNĚNÍ   │             │
│Zařízení│  │    7     ││    3     ││  38/45   ││   97 %   │             │
│Šablony │  │ úkonů    ││ ⚠ kritic.││ splněno  ││ ▲ +2 %   │             │
│Deník   │  └──────────┘└──────────┘└──────────┘└──────────┘             │
│Audit   │                                                                │
│        │  ┌─ DNEŠNÍ PLÁN ─────────────────────────────────────────────┐│
│        │  │ ⬤ Mazak QT250-02  Týdenní kontrola vřetena   CNC   [Začít]││
│        │  │ ⬤ Lis LZ-40       Mazání vodicích ploch      Stroj [Začít]││
│        │  │ ⬤ VZV Linde H25   Kontrola hydrauliky        VZV   [Začít]││
│        │  │                                          … a další 4       ││
│        │  └───────────────────────────────────────────────────────────┘│
│        │                                                                │
│        │  ┌─ PO TERMÍNU ──────────────┐ ┌─ PŘEHLED OBLASTÍ ───────────┐│
│        │  │ ⚠ Mazak QT250-01  −6 dní  │ │ CNC        ████████░ 98 %   ││
│        │  │ ⚠ Kompresor K-2   −3 dny  │ │ Strojní    ███████░░ 94 %   ││
│        │  │ ⚠ Rozvaděč RH1    −1 den  │ │ Elektro    ████████░ 98 %   ││
│        │  └───────────────────────────┘ │ Lakovna    █████████ 100 %  ││
│        │                                │ VZV        █████████ 100 %  ││
│        │  ┌─ POSLEDNÍ PROVEDENÉ ──────┐ └─────────────────────────────┘│
│        │  │ ✓ Bruska BU-7   Novák  9:41                                │
│        │  │ ✓ Lis LZ-12     Dvořák 8:20                                │
│        │  └───────────────────────────────────────────────────────────┘│
└────────┴───────────────────────────────────────────────────────────────┘
```

### 5.2 Přehled plnění matice

```
┌────────────────────────────────────────────────────────────────────────┐
│  Plnění matice údržby        Období: [ Srpen 2026 ▾ ]   [ Export XLSX ]│
├────────────────────────────────────────────────────────────────────────┤
│  Oblast              Splněno   Po termínu   Plnění                     │
│  ─────────────────────────────────────────────────────────────────     │
│  CNC stroje            124          2       ████████████████░  98 %  › │
│  Strojní zařízení       81          5       ███████████████░░  94 %  › │
│  Elektro zařízení       47          1       ████████████████░  98 %  › │
│  Lakovna                36          0       █████████████████ 100 %  › │
│  VZV                    18          0       █████████████████ 100 %  › │
│  ─────────────────────────────────────────────────────────────────     │
│  CELKEM                306          8                          97 %    │
│                                                                         │
│  Kliknutím na oblast → seznam nesplněných a blížících se údržeb        │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Provedení údržby (checklist) — optimalizováno pro tablet

```
┌────────────────────────────────────────────────────────────────────────┐
│ ‹ Zpět    Mazak QT250-02 · Týdenní kontrola vřetena                    │
│           Plán 12. 8. 2026 · Šablona v3 · CNC              [Dokončit]  │
├────────────────────────────────────────────────────────────────────────┤
│  Postup                                              3 ze 6 hotovo     │
│  ██████████████████░░░░░░░░░░░░░░░░░                                   │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │ ✓ 1. Vizuální kontrola vřetena                                 │    │
│  │      Bez závad · Novák 9:12                                    │    │
│  ├────────────────────────────────────────────────────────────────┤    │
│  │ ✓ 2. Kontrola hladiny oleje                                    │    │
│  │      Naměřeno: 4,2 l   (mez 3,5–5,0 l)  ✓                      │    │
│  ├────────────────────────────────────────────────────────────────┤    │
│  │ ✓ 3. Kontrola upínacího systému                    📷 2        │    │
│  ├────────────────────────────────────────────────────────────────┤    │
│  │ ○ 4. Měření vibrací vřetena              ← aktuální krok       │    │
│  │      Kontrolní body: 1000 / 3000 / 6000 ot.                    │    │
│  │      Naměřeno [______] mm/s      Poznámka [______________]     │    │
│  │      [ 📷 Přidat foto ]   [ Nelze provést ]   [ ✓ Potvrdit ]   │    │
│  ├────────────────────────────────────────────────────────────────┤    │
│  │ ○ 5. Kontrola chladicí kapaliny                    📷 povinné  │    │
│  │ ○ 6. Závěrečná zkouška chodu                                   │    │
│  └────────────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────────────┘
```

Velké dotykové cíle, jeden aktivní krok, žádné zanořené formuláře — naplňuje požadavek
„celý proces musí být co nejjednodušší" (ř. 132).

### 5.4 Karta zařízení

```
┌────────────────────────────────────────────────────────────────────────┐
│ ‹ Zařízení    Mazak Quick Turn 250 — QT250-02          [Upravit]  ⋮    │
│               inv. č. 104782 · CNC · Hala 2 / Linka B · v provozu      │
├────────────────────────────────────────────────────────────────────────┤
│ [ Přehled ] [ Plán údržby ] [ Historie ] [ Dokumenty ] [ Parametry ]   │
├────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐   Výrobce        Yamazaki Mazak                       │
│  │             │   Model          Quick Turn 250                       │
│  │    foto     │   Výrobní číslo  QT250-2019-8841                      │
│  │             │   Rok výroby     2019                                 │
│  └─────────────┘   Odpovědná os.  Jan Novák (Specialista CNC)          │
│                    Šablona        Mazak QT250 · verze 3                │
│                                                                         │
│  Nejbližší údržba   Týdenní kontrola vřetena · 12. 8. · dnes           │
│  Poslední údržba    Měsíční servis · 1. 8. · Novák · bez závad         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Workflow jednotlivých rolí

### 6.1 Údržbář / specialista — každodenní práce

```
Přihlášení → Dashboard: „dnes mám 7 úkonů, 1 po termínu"
   → klik na úkon → checklist → odškrtávání kroků, foto, naměřené hodnoty
   → Dokončit → systém automaticky:
        · uzavře zakázku (stav = dokonceno)
        · zapíše do historie zařízení
        · přepočítá další termín v plan_udrzby
        · aktualizuje plnění matice
   → zpět na dashboard
```

Neplánovaný zásah jde mimo tuto cestu: `Deník → Nový zásah → zařízení, popis, foto → Uložit`.
Plán se tím nijak nemění.

### 6.2 Vedoucí údržby — řízení

```
Dashboard (všechny oblasti) → co je po termínu
   → Plnění matice → oblast pod 95 % → seznam nesplněných → přiřazení pracovníka
   → Šablony → úprava matice → nová verze → aktivace (projeví se u všech zařízení)
   → měsíčně: export XLSX pro poradu vedení
```

### 6.3 Management — pouze čtení

```
Přihlášení → Dashboard s celofiremním přehledem
   → Plnění matice za období → trend → detail oblasti
   → Historie konkrétního zařízení (bez možnosti zápisu)
```

### 6.4 Garant oblasti (specialista, vedoucí lakovny, pracovník skladu)

```
Zařízení své oblasti → zakládání a údržba karet
   → Šablony své oblasti → definice matice, intervalů, kontrolních bodů
   → přiřazení šablony zařízením stejného typu
   → dohled nad plněním ve své oblasti
```

Lakovna má podle zadání navíc spolupracující osobu — pracovník údržby má do oblasti zápis
přes `uzivatel_oblast.vztah = 'spolupracujici'`, ale nemůže měnit šablony.

### 6.5 Administrátor

```
Uživatelé a role → oblasti → typy zařízení a vlastní parametry → audit
```

---

## 7. Doporučený technologický stack

Stack v `package.json` potvrzuji — odpovídá požadavkům na cloudovou architekturu,
souběžnou práci více uživatelů a budoucí rozšiřitelnost (ř. 165–173).

| Vrstva | Volba | Zdůvodnění vůči zadání |
|---|---|---|
| Framework | Next.js 15 + React 19 | Server Components — rychlé načtení dashboardu i na tabletu v hale |
| Databáze | PostgreSQL (Supabase) | centrální DB, zálohování, RLS pro role |
| Autentizace | Supabase Auth (+ Entra ID) | bezpečné přihlášení |
| Synchronizace | Supabase Realtime | dashboard se aktualizuje bez obnovení stránky |
| Soubory | Supabase Storage | fotografie, návody, certifikáty |
| Plánované úlohy | `pg_cron` + Edge Functions | generování zakázek, notifikace |
| Dotazy | TanStack Query | cache, optimistické zápisy |
| Tabulky | TanStack Table | seznamy zařízení a plnění |
| Formuláře | react-hook-form + Zod | validace sdílená klientem i serverem |
| UI | Tailwind + Radix (shadcn) | responzivní, přístupné, moderní vzhled |
| Grafy | Recharts | trendy plnění |
| PDF | @react-pdf/renderer | protokoly o provedené údržbě |
| Testy | Playwright + **Vitest** | E2E i jednotkové testy výpočtu intervalů |

**Doplnit do `package.json`** (dnes chybí, zadání je vyžaduje nepřímo):

| Balíček | Pro co |
|---|---|
| `exceljs` | export plnění matice do Excelu pro management |
| `vitest` | jednotkové testy plánovače a výpočtu plnění |
| `react-day-picker` | výběr data (plán, období) |
| `resend` nebo `nodemailer` | notifikace o údržbách po termínu |
| `html5-qrcode` + `qrcode` | QR štítky na strojích — nahlášení zásahu naskenováním |
| `@sentry/nextjs` | sledování chyb v provozu |

---

## 8. Návrh postupu implementace

Zadání žádá implementaci po modulech s kontrolou a schválením po každém (ř. 200–201).

| Modul | Obsah | Výsledek k odsouhlasení |
|---|---|---|
| **M0** Základ | Supabase projekt, schéma, RLS, přihlášení, layout, role | uživatel se přihlásí, vidí prázdný dashboard dle role |
| **M1** Zařízení | typy, vlastní parametry, karty, umístění, fotky, návody | evidence použitelná samostatně |
| **M2** Šablony | matice úkonů, verzování, přiřazení zařízením | šablona pro Mazak QT250 nad 3 stroji |
| **M3** Plán a provedení | plánovač, zakázky, checklist, foto, přepočet termínů | technik provede reálnou údržbu |
| **M4** Dashboard a plnění | KPI, dnešní plán, po termínu, matice plnění, export | vedoucí a management mají přehled |
| **M5** Deník a historie | neplánované zásahy, sjednocená historie | kompletní historie zařízení |
| **M6** Audit a správa | auditní log, správa uživatelů, notifikace | provozní připravenost |
| **M7** Dílna | QR štítky, ladění pro tablet, tisk protokolů | nasazení do provozu |

Rozšíření mimo rozsah zadání, se kterými model počítá, ale neimplementují se teď:
náhradní díly a sklad, evidence prostojů (MTBF/MTTR), schvalování údržby druhou osobou,
offline režim pro halu se slabým signálem.

---

## 9. Otevřené body

1. Potvrdit nebo opravit předpoklady **P1–P6** z kapitoly 0.
2. Rozhodnout o notifikacích — kdo a jak se dozví o údržbě po termínu.
3. Určit, zda se má provedená údržba schvalovat druhou osobou (u některých revizí bývá nutné).
4. Upřesnit, zda je potřeba offline režim pro tablety ve výrobní hale.
5. Dodat vzorek stávajících Excelů — podle nich se navrhne importér a ověří, že model
   pokryje reálná data.

---

*Po schválení tohoto návrhu začnu implementovat modulem M0.*
