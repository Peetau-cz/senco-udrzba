# Provozní rozhodnutí a otevřené body

Evidence věcí, které nejsou vývojem, ale bez kterých nelze systém spustit do ostrého provozu.
Vazba: `docs/NAVRH.md`, `docs/zadani.txt` ř. 164–173

---

## Stav rozhodnutí

| Téma | Stav | Rozhodnuto |
|---|---|---|
| Přihlašování (e-mail + heslo) | ✅ rozhodnuto | 12. 8. 2026 |
| Umístění dat (Supabase Cloud, EU) | ✅ rozhodnuto | 12. 8. 2026 |
| Vývojová databáze (cloud, bez Dockeru) | ✅ rozhodnuto | 12. 8. 2026 |
| Náběh všech pěti oblastí najednou | ✅ rozhodnuto | 12. 8. 2026 |
| Tarif Supabase pro ostrý provoz | ⬜ otevřené | |
| Retence osobních údajů | ⬜ otevřené | |
| Příjemci a četnost notifikací | ⬜ otevřené | |
| Správce systému po předání | ⬜ otevřené | |
| Vlastník produktu | ⬜ otevřené | |

---

## 1. Zálohování a obnova

Zadání zálohování výslovně požaduje (ř. 172).

- Point-in-time recovery je u Supabase dostupné **až na placených tarifech**. Je potřeba
  vybrat tarif podle toho, kolik dat zpětně chcete umět obnovit.
- **Zálohu je nutné jednou vyzkoušet obnovit.** Zapnuté zálohy bez ověřené obnovy nejsou
  záloha. Doporučuji provést na vývojovém projektu ještě před ostrým spuštěním
  a výsledek zapsat sem.

**Otevřené:** kdo obnovu provede a do kdy; jaká je přijatelná ztráta dat (RPO) a doba
výpadku (RTO).

## 2. Osobní údaje

Systém eviduje, **kdo co kdy udělal** — to je zpracování osobních údajů zaměstnanců.

Zadání zároveň zakazuje mazat historii (ř. 155) a požaduje neměnný audit (ř. 162).
To je v napětí s právem na výmaz. Obvyklé řešení je opřít uchování o oprávněný zájem
a archivační povinnost a stanovit retenční dobu, po které se záznamy anonymizují
(jméno se nahradí odkazem na zaniklý účet, samotný záznam o údržbě zůstane).

**Otevřené:** retenční doba; kdo za zpracování odpovídá; zda je potřeba doplnit záznam
o činnostech zpracování. **Rozhodnutí patří firmě, ne vývojáři.**

## 3. Prostředí a přístupy

| Prostředí | Účel | Stav |
|---|---|---|
| Vývojové (Supabase Cloud, EU) | vývoj a testy | zakládá zákazník, viz plán Krok 0 |
| Ostré | provoz | zatím nezaloženo |

Zásady:
- `service_role` klíč se používá **výhradně** v lokálním seed skriptu, nikdy v aplikačním
  kódu a nikdy v gitu. Aplikace pracuje jen uživatelským JWT — oprávnění vynucuje RLS (R1).
- `.env.local` se necommituje. Do gitu jde pouze `.env.example` bez hodnot.
- `supabase db reset` proti propojenému cloudovému projektu **maže data**. Na ostrém
  prostředí se nesmí spustit.

**Otevřené:** kdo má přístup k ostrému projektu a kdo spravuje klíče.

## 4. Notifikace

Zadání notifikace nezmiňuje, ale požaduje přehled o údržbách po termínu. Bez upozornění
se o skluzu nikdo nedozví, dokud se nepodívá do aplikace.

**Otevřené:** komu chodí (technikovi, garantovi, vedoucímu?), jak často (denní souhrn
vs. okamžitě), od kolika dnů po termínu eskalovat výš. Blokuje modul M6.

## 5. Objem dat a náklady

Odhad je potřeba pro volbu tarifu:

- počet zařízení × počet úkonů × frekvence = počet zakázek za rok,
- kolik fotografií se u zakázky pořídí a jak dlouho se uchovávají → velikost Storage,
- počet souběžně pracujících uživatelů.

Fotky z tabletů budou před nahráním komprimované na straně klienta, jinak Storage poroste
zbytečně rychle.

**Otevřené:** dodat odhady po vyplnění `docs/PRIPRAVA_DAT.md` — teprve pak je čím počítat.

## 6. Provoz po předání

**Otevřené:** kdo zakládá a ruší uživatelské účty; kdo řeší výpadek; kdo je vlastník
produktu a uzavírá spory mezi garanty oblastí při návrhu matic. Bez jedné rozhodující
osoby se obsah šablon dohaduje donekonečna.

## 7. Sledování chyb

V provozu bez sledování chyb neuvidíte, na co uživatelé narážejí — dozvíte se to jen
z ústních stížností. V návrhu je počítáno se Sentry (kap. 7).

**Otevřené:** zda je nasazení nástroje třetí strany v souladu s firemními pravidly.
