-- =============================================================================
-- Srovnání práv: co migrace neudělily, to nesmí být udělené
--
-- Supabase má na schématu public nastavená výchozí práva (ALTER DEFAULT
-- PRIVILEGES), díky kterým každá nově vzniklá tabulka rovnou dostane GRANT ALL
-- pro anon i authenticated. Migrace 0001, 0003, 0006, 0010 a 0011 proto
-- odebíraly plošně jen `anon` a u `authenticated` spoléhaly na to, že co
-- neudělí, to uživatel nemá. To ale neplatilo: plošné právo tam bylo od
-- začátku a každý sloupcový grant byl jen ozdoba - GRANT na jednotlivé sloupce
-- se s tabulkovým právem sčítá, nepřebíjí ho.
--
-- Odhalila to kontrola č. 6 v supabase/tests/denik.sql (26. 8. 2026): pokus
-- zapsat do deníku vlastní vytvoreno_at měl selhat na sloupcových právech
-- a místo toho prošel.
--
-- Co bylo skutečně otevřené:
--
--   * zakazka - technik směl u OTEVŘENÉ zakázky ve své oblasti přepsat
--     planovany_termin, zarizeni_id i sablona_verze_id. Termín je přitom to,
--     podle čeho se počítá zpoždění a plnění matice, a verze šablony je jádro
--     rozhodnutí R3 (zamrazená matice).
--   * zakazka_ukon - směl přepsat nazev_snapshot, meze a jednotku, tedy zadání
--     kroku, který zrovna odklikává. Kontrolní body chránil trigger, text kroku
--     ale nic.
--   * plan_udrzby - garant směl řádek plánu SMAZAT i s posledním provedením,
--     ačkoli 0010 právo DELETE schválně neudělila.
--   * profil - authenticated měl DELETE, který 0001 neudělila.
--
-- Co otevřené NEBYLO: hranice oblastí (drží RLS), neměnnost UZAVŘENÉ zakázky
-- (drží triggery ze 0011), nemazatelnost auditu (0001 odebírá práva výslovně
-- i pro authenticated) a zakládání zakázek mimo plánovač (na zakazka není
-- politika pro INSERT, takže RLS zápis nepustí bez ohledu na práva).
--
-- Tahle migrace NEMĚNÍ, co má kdo smět. Srovnává skutečný stav s tím, co
-- migrace 0001, 0010 a 0011 vždycky říkaly.
--
-- PRAVIDLO PRO DALŠÍ MIGRACE: `revoke ... from anon, authenticated`, nikdy jen
-- od anon. Ověřuje to supabase/tests/prava_zakazek.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Zakázky a checklist (původně migrace 0011)
-- -----------------------------------------------------------------------------

revoke all on public.zakazka, public.zakazka_ukon, public.zakazka_foto
  from anon, authenticated;

-- Beze změny proti 0011: bez INSERT nemůže ani garant založit údržbu mimo
-- matici (to patří do provozního deníku), bez DELETE nejde historii umazat.
grant select on public.zakazka to authenticated;
grant update (stav, prirazeno_uzivateli_id, zahajeno_at, dokonceno_at, dokoncil_id, poznamka)
  on public.zakazka to authenticated;

grant select on public.zakazka_ukon to authenticated;
grant update (stav, hodnota, poznamka, kontrolni_body, potvrzeno_at, potvrdil_id)
  on public.zakazka_ukon to authenticated;

grant select, insert, delete on public.zakazka_foto to authenticated;
grant update (popis) on public.zakazka_foto to authenticated;

-- -----------------------------------------------------------------------------
-- Plán údržby (původně migrace 0010)
--
-- Bez DELETE: řádky plánu ruší kaskáda od přiřazení šablony, ne uživatel.
-- Vyřazený úkon se drží se sloupcem aktivni = false, protože nese poslední
-- provedení - a to je jediný záznam o tom, kdy se úkon naposled dělal.
-- -----------------------------------------------------------------------------

revoke all on public.plan_udrzby from anon, authenticated;

grant select, insert, update on public.plan_udrzby to authenticated;

-- -----------------------------------------------------------------------------
-- Profil (původně migrace 0001)
--
-- Uživatel se vyřazuje sloupcem aktivni, nemaže se - jinak by se ztratilo,
-- kdo úkon provedl. Mazání dosud bránila jen chybějící politika, teď i právo.
-- -----------------------------------------------------------------------------

revoke all on public.profil from anon, authenticated;

grant select on public.profil to authenticated;
grant insert, update on public.profil to authenticated;

-- -----------------------------------------------------------------------------
-- Ostatní tabulky se nechávají být
--
-- U oblasti, role, umisteni, uzivatel_role, uzivatel_oblast, typ_zarizeni,
-- zarizeni, zarizeni_soubor, sablona a spol. udělily migrace plný CRUD, takže
-- plošné právo dává přesně to, co mají mít. Co kdo smí, tam rozhoduje RLS.
-- audit_log si práva odebral výslovně už v 0001, deník v 0020.
-- -----------------------------------------------------------------------------
