# Příprava dat pro spuštění systému údržby

Určeno garantům oblastí. · Vazba: `docs/NAVRH.md` kap. 0 (rozhodnutí P6 a náběh), `docs/zadani.txt` ř. 20–36

---

## Proč je tento dokument důležitý

Bylo rozhodnuto spustit **všech pět oblastí najednou**, nikoli pilotem na jedné. Tím se
kritickou cestou projektu přestává být vývoj a stává se jí příprava dat: **aplikace nelze
spustit dřív, než budou hotové šablony údržby pro všech pět oblastí.**

Systémy řízení údržby typicky neztroskotají na programování. Ztroskotají na tom, že se
aplikace dokončí a nikdo mezitím nesepsal, co se vlastně na kterém stroji dělá a jak často.
Tato práce je na garantech oblastí a běží **paralelně s vývojem**, ne po něm.

Odhad rozsahu: počet zařízení × počet údržbových úkonů na zařízení. U padesáti strojů
s deseti úkony je to pět set řádků, které musí někdo promyslet a napsat.

---

## Kdo co dodává

| Oblast | Garant (zadání ř. 20–36) | Dodá |
|---|---|---|
| Údržba CNC strojů | Specialista CNC | zařízení, typy, šablony a úkony pro CNC |
| Údržba strojních zařízení | Pracovníci údržby | zařízení, typy, šablony a úkony pro strojní |
| Údržba elektro zařízení | Specialista elektro | zařízení, typy, šablony a úkony pro elektro |
| Údržba VZV | Pracovník skladu | zařízení, typy, šablony a úkony pro VZV |
| Údržba procesu lakování | Vedoucí lakovny (spolupráce: pracovník údržby) | zařízení, typy, šablony a úkony pro lakovnu |
| Napříč | Vedoucí údržby | strom umístění, seznam uživatelů, schválení číselníků |

---

## Co je potřeba odsouhlasit dřív, než se začne vyplňovat

Tyto tři věci se špatně mění zpětně:

1. **Formát inventárních čísel.** Musí být jednoznačný a stabilní — je to klíč, přes který
   se páruje všechno ostatní. Použijte to, co už máte v majetkové evidenci.
2. **Struktura umístění.** Kolik úrovní: hala → provoz → linka? Nebo stačí hala → stroj?
3. **Kódy oblastí a rolí.** Číselníky dodá systém (viz `supabase/seed.sql`), jen je potvrďte.

---

## Formát souborů

Osm souborů CSV, **kódování UTF-8**, oddělovač **středník** (`;`), desetinný oddělovač
**tečka**, datum ve tvaru `RRRR-MM-DD`. Logické hodnoty `ano` / `ne`.
Prázdná buňka znamená „nevyplněno", ne nulu.

Soubory se na sebe odkazují kódy, ne pořadovými čísly — proto lze vyplňovat souběžně.

### 1. `umisteni.csv`
| Sloupec | Povinné | Popis |
|---|---|---|
| `kod` | ano | jednoznačný kód, např. `H2-LB` |
| `nazev` | ano | „Hala 2 / Linka B" |
| `nadrazene_umisteni_kod` | ne | kód nadřazeného uzlu; prázdné = kořen |

### 2. `uzivatele.csv`
| Sloupec | Povinné | Popis |
|---|---|---|
| `osobni_cislo` | ano | klíč pro párování |
| `jmeno`, `prijmeni` | ano | |
| `email` | ano | firemní e-mail — slouží k přihlášení (P4) |
| `role_kody` | ano | více rolí oddělte svislítkem, např. `specialista_cnc\|udrzbar` |
| `oblast_kody` | ne | oblasti, ke kterým má přístup |
| `vztah` | ne | `garant` nebo `spolupracujici` (lakovna má obojí) |

> Ověřte, že firemní e-mail mají **i všichni údržbáři v dílně**, nejen kancelář.
> Bez e-mailu se uživatel nepřihlásí.

### 3. `typy_zarizeni.csv`
| Sloupec | Povinné | Popis |
|---|---|---|
| `kod` | ano | např. `cnc_soustruh` |
| `nazev` | ano | „CNC soustruh" |
| `oblast_kod` | ano | |

### 4. `parametry_typu.csv` — vlastní technické parametry (zadání ř. 93)
| Sloupec | Povinné | Popis |
|---|---|---|
| `typ_kod` | ano | odkaz do `typy_zarizeni.csv` |
| `parametr_kod` | ano | např. `vreteno_otacky` |
| `nazev` | ano | „Otáčky vřetena" |
| `datovy_typ` | ano | `text` / `cislo` / `datum` / `ano_ne` |
| `jednotka` | ne | `1/min`, `kW`, `mm` |
| `povinne` | ano | `ano` / `ne` |

### 5. `zarizeni.csv`
| Sloupec | Povinné | Popis |
|---|---|---|
| `inventarni_cislo` | ano | klíč |
| `nazev` | ano | |
| `oblast_kod`, `typ_kod` | ano | |
| `vyrobce`, `model`, `vyrobni_cislo`, `rok_vyroby` | ne | |
| `umisteni_kod` | ano | |
| `odpovedna_osoba` | ano | osobní číslo |
| `stav` | ano | `v_provozu` / `odstaveno` / `vyrazeno` |

### 6. `sablony.csv`
| Sloupec | Povinné | Popis |
|---|---|---|
| `kod` | ano | např. `mazak_qt250` |
| `nazev` | ano | „Mazak Quick Turn 250" |
| `oblast_kod` | ano | |
| `popis` | ne | |

### 7. `sablona_ukony.csv` — **matice údržby, jádro celé přípravy**
| Sloupec | Povinné | Popis |
|---|---|---|
| `sablona_kod` | ano | |
| `poradi` | ano | pořadí kroku v checklistu |
| `nazev` | ano | „Kontrola hladiny oleje" |
| `popis` | ne | postup pro technika |
| `interval_typ` | ano | `dny` / `tydny` / `mesice` / `roky` — **jen kalendářní** (P1) |
| `interval_hodnota` | ano | celé číslo, např. `3` měsíce |
| `interval_zaklad` | ne | `od_provedeni` (výchozí) nebo `od_planu` (P2) |
| `tolerance_dny` | ne | kolik dní po termínu se ještě počítá jako splněné |
| `profese_role_kod` | ano | kdo úkon provádí |
| `kontrolni_body` | ne | body oddělené svislítkem, např. `1000\|3000\|6000 ot.` |
| `vyzaduje_foto` | ano | `ano` / `ne` |
| `vyzaduje_hodnotu` | ano | `ano` / `ne` — technik zapíše naměřenou hodnotu |
| `jednotka`, `mez_min`, `mez_max` | ne | pro měřené hodnoty, např. `l`, `3.5`, `5.0` |

### 8. `zarizeni_sablony.csv` — přiřazení šablon zařízením
| Sloupec | Povinné | Popis |
|---|---|---|
| `inventarni_cislo` | ano | |
| `sablona_kod` | ano | |

Jedna šablona se přiřazuje **více zařízením stejného typu** (zadání ř. 98–106). Nevytvářejte
samostatnou šablonu pro každý stroj — právě proto systém šablony má.

---

## Časté chyby, kterým se vyhnout

- **Šablona na každý stroj zvlášť.** Tři stejné Mazaky = jedna šablona, tři přiřazení.
  Jinak přijdete o hlavní výhodu systému: změna na jednom místě.
- **Interval „podle potřeby".** Systém plánuje podle intervalu; úkon bez intervalu nelze
  naplánovat. Patří do provozního deníku, ne do matice.
- **Úkon, který nikdo neprovádí.** Každý úkon musí mít odpovědnou profesi.
- **Míchání plánované údržby a oprav.** Do matice patří jen preventivní údržba. Výměna
  žárovky nebo oprava snímače jde do provozního deníku a plnění matice neovlivňuje
  (zadání ř. 134–144).
- **Meze bez jednotky.** `mez_min` a `mez_max` bez `jednotka` nelze zobrazit ani vyhodnotit.

---

## Kontrolní seznam: oblast je připravena

Zaškrtněte za každou z pěti oblastí zvlášť. Systém se spouští, až projde **všech pět**.

- [ ] Všechna zařízení oblasti jsou v `zarizeni.csv` s inventárním číslem a umístěním
- [ ] Každé zařízení má vyplněnou odpovědnou osobu, která existuje v `uzivatele.csv`
- [ ] Typy zařízení pokrývají všechna zařízení oblasti
- [ ] Vlastní technické parametry jsou definované u typů, kde jsou potřeba
- [ ] Každé zařízení má přiřazenou alespoň jednu šablonu
- [ ] Každá šablona má alespoň jeden úkon s vyplněným intervalem a profesí
- [ ] Úkony vyžadující měření mají jednotku a meze
- [ ] Garant oblasti obsah zkontroloval a odsouhlasil
- [ ] Vedoucí údržby obsah zkontroloval a odsouhlasil

---

## Postup

1. Vedoucí údržby odsouhlasí formát inventárních čísel a strukturu umístění (viz výše).
2. Vyplní se `umisteni.csv` a `uzivatele.csv` — společné pro všechny oblasti.
3. Každý garant vyplní své soubory 3–8 za svou oblast.
4. Data se nahrají do vývojového prostředí a projdou kontrolou konzistence.
5. Garanti si ověří výsledek v aplikaci na svých zařízeních.
6. Teprve po odsouhlasení všech pěti oblastí se plní ostré prostředí.

Kroky 4 až 6 jsou na mně; 1 až 3 na vás a jsou tím, co určuje termín spuštění.
