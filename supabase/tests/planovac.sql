-- =============================================================================
-- Ověření plánovače (modul M3, migrace 0013).
--
-- Dvě těžiště:
--   1. dalsi_termin - hlavně `od_planu` u zpožděné údržby. Naivní „přičti
--      jeden interval" by týdennímu úkonu udělanému o tři týdny později dal
--      termín v minulosti a byl by po termínu hned, jak ho technik odklikne.
--   2. zaloz_zakazky - idempotence a to, že rozdělaná zakázka brání založení
--      další za totéž.
--
-- Spuštění: v SQL editoru Supabase nebo přes psql, pod rolí postgres.
-- Předpoklad: proběhly migrace 0006-0013 a seed.sql.
--
-- Skript nic nemění - celý běží v transakci, která se na konci vrací.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Část 1: výpočet termínu (bez dat, čistá funkce)
-- -----------------------------------------------------------------------------

do $$
declare
  v_kontrol integer := 0;
begin
  -- 1. od_planu, hotovo včas: mřížka se posune o jeden krok ------------------
  if public.dalsi_termin(date '2026-09-01', date '2026-09-01', 'tydny', 1, 'od_planu')
     <> date '2026-09-08' then
    raise exception 'Týdenní úkon udělaný v termínu nevyšel na 8. 9.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 2. od_planu, hotovo pozdě: zameškané cykly se přeskočí --------------------
  -- Plán 1. 9., hotovo až 20. 9. Mřížka je 8., 15., 22. - první termín po
  -- provedení je 22. 9. Přičtení jednoho kroku by dalo 8. 9., tedy minulost.
  if public.dalsi_termin(date '2026-09-01', date '2026-09-20', 'tydny', 1, 'od_planu')
     <> date '2026-09-22' then
    raise exception 'Zpožděný týdenní úkon nevyšel na 22. 9. - mřížka se rozpadla.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 3. od_planu, hotovo předčasně: mřížka se nehýbe ---------------------------
  if public.dalsi_termin(date '2026-09-08', date '2026-09-01', 'tydny', 1, 'od_planu')
     <> date '2026-09-15' then
    raise exception 'Předčasně udělaný úkon posunul mřížku.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 4. od_provedeni se počítá od skutečnosti ---------------------------------
  if public.dalsi_termin(date '2026-09-01', date '2026-09-20', 'tydny', 1, 'od_provedeni')
     <> date '2026-09-27' then
    raise exception 'od_provedeni se nepočítalo od data provedení.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 5. Čtvrtletí jsou tři měsíce (rozhodnutí P1) ------------------------------
  if public.dalsi_termin(date '2026-01-15', date '2026-01-15', 'mesice', 3, 'od_planu')
     <> date '2026-04-15' then
    raise exception 'Čtvrtletní interval nevyšel na 15. 4.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 6. Krátký měsíc datum přitáhne, ne rozbije --------------------------------
  if public.dalsi_termin(date '2026-01-31', date '2026-01-31', 'mesice', 1, 'od_planu')
     <> date '2026-02-28' then
    raise exception 'Měsíční interval z 31. 1. nevyšel na 28. 2.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 7. Nekladný interval neprojde ---------------------------------------------
  begin
    perform public.dalsi_termin(date '2026-09-01', date '2026-09-01', 'dny', 0, 'od_planu');
    raise exception 'Nulový interval prošel výpočtem.';
  exception
    when sqlstate '22023' then null;
  end;
  v_kontrol := v_kontrol + 1;

  raise notice 'Test výpočtu termínů prošel: všech % kontrol v pořádku.', v_kontrol;
end;
$$;

-- -----------------------------------------------------------------------------
-- Část 2: zakládání zakázek
-- -----------------------------------------------------------------------------

do $$
declare
  v_oblast   uuid;
  v_cnc      uuid;
  v_elektro  uuid;
  v_typ      uuid;
  v_stroj    uuid;
  v_sablona  uuid;
  v_verze    uuid;
  v_zakazka  uuid;
  v_plan_a   uuid;
  v_plan_b   uuid;
  v_uzivatel uuid;
  v_pocet    integer;
  v_termin   date;
  v_kontrol  integer := 0;
begin
  select id into v_oblast   from public.oblast where kod = 'cnc';
  select id into v_cnc      from public.role   where kod = 'specialista_cnc';
  select id into v_elektro  from public.role   where kod = 'specialista_elektro';

  if v_oblast is null or v_cnc is null then
    raise exception 'Chybí číselníky. Spusťte nejdřív supabase/seed.sql';
  end if;

  v_elektro := coalesce(v_elektro, v_cnc);

  -- dokonci_zakazku ověřuje oprávnění samo, takže pod prázdnou identitou by
  -- skončila chybou 42501 bez ohledu na to, že skript běží jako postgres.
  -- Podstrčí se proto identita někoho, kdo do všech oblastí smí. Role se
  -- nepřepíná (`set local role`), RLS se tedy neuplatní a příprava dat projde -
  -- politiky ověřuje zvlášť supabase/tests/rls.sql.
  select ur.uzivatel_id into v_uzivatel
  from public.uzivatel_role ur
  join public.role r on r.id = ur.role_id
  where r.kod in ('administrator', 'vedouci_udrzby')
  limit 1;

  if v_uzivatel is null then
    raise exception 'Chybí uživatel s rolí administrátor nebo vedoucí údržby. '
      'Spusťte nejdřív: npm run seed:users a supabase/prirazeni_uzivatelu.sql';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uzivatel, 'role', 'authenticated')::text, true);

  insert into public.typ_zarizeni (oblast_id, kod, nazev)
  values (v_oblast, 'test_typ_planovac', 'Testovací typ pro plánovač')
  returning id into v_typ;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_oblast, v_typ, 'Testovací stroj pro plánovač', 'TEST-PLANOVAC-1')
  returning id into v_stroj;

  insert into public.sablona (oblast_id, kod, nazev)
  values (v_oblast, 'test_planovac', 'Testovací šablona pro plánovač')
  returning id into v_sablona;

  v_verze := public.zaloz_navrh_verze(v_sablona);

  -- Dva úkony CNC a jeden elektro, všechny se stejným intervalem. Skupina se
  -- tedy musí rozpadnout na dvě zakázky podle profese.
  insert into public.sablona_ukon (
    sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
    interval_zaklad, profese_role_id
  ) values
    (v_verze, 1, 'Vyčištění stolu',       'tydny', 1, 'od_planu', v_cnc),
    (v_verze, 2, 'Mazání vedení',         'tydny', 1, 'od_planu', v_cnc),
    (v_verze, 3, 'Revize připojení',      'tydny', 1, 'od_planu', v_elektro);

  perform public.aktivuj_verzi(v_verze);

  insert into public.zarizeni_sablona (zarizeni_id, sablona_id, oblast_id)
  values (v_stroj, v_sablona, v_oblast);

  -- 8. Plán bez termínů nezaloží nic ------------------------------------------
  perform public.zaloz_zakazky(14);

  select count(*) into v_pocet from public.zakazka where zarizeni_id = v_stroj;
  if v_pocet <> 0 then
    raise exception 'Plánovač založil % zakázek z řádků bez termínu.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- Garant zadá termíny na dnešek.
  update public.plan_udrzby set dalsi_termin = current_date where zarizeni_id = v_stroj;

  -- 9. Skupina se rozpadne podle profese --------------------------------------
  -- Počítá se vždy jen přes testovací stroj: zaloz_zakazky() jede nad celou
  -- databází a její návratová hodnota závisí na tom, co je jinde rozplánované.
  perform public.zaloz_zakazky(14);

  select count(*) into v_pocet
  from public.zakazka_ukon u
  join public.zakazka k on k.id = u.zakazka_id
  where k.zarizeni_id = v_stroj;

  if v_pocet <> 3 then
    raise exception 'Plánovač naplánoval % kroků, čekaly se tři.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  if v_elektro <> v_cnc then
    select count(*) into v_pocet from public.zakazka where zarizeni_id = v_stroj;
    if v_pocet <> 2 then
      raise exception 'Zakázek mají být dvě (CNC a elektro), je jich %.', v_pocet;
    end if;
    v_kontrol := v_kontrol + 1;
  end if;

  -- 10. Opakovaný běh nic nezdvojí --------------------------------------------
  -- Tohle je celá idempotence: noční úloha běží každý den nad týmž plánem.
  perform public.zaloz_zakazky(14);

  select count(*) into v_pocet
  from public.zakazka_ukon u
  join public.zakazka k on k.id = u.zakazka_id
  where k.zarizeni_id = v_stroj;

  if v_pocet <> 3 then
    raise exception 'Druhý běh plánovače kroky zdvojil, je jich %.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 11. Dva úkony CNC se sešly v jedné zakázce --------------------------------
  select id into v_zakazka
  from public.zakazka
  where zarizeni_id = v_stroj and profese_role_id = v_cnc and stav = 'naplanovano';

  select count(*) into v_pocet from public.zakazka_ukon where zakazka_id = v_zakazka;
  if v_pocet <> (case when v_elektro = v_cnc then 3 else 2 end) then
    raise exception 'Zakázka CNC má % kroků, čekaly se dva.', v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 12. Text úkonu je zkopírovaný, ne odkazovaný ------------------------------
  if not exists (
    select 1 from public.zakazka_ukon
    where zakazka_id = v_zakazka and nazev_snapshot = 'Vyčištění stolu'
  ) then
    raise exception 'Checklist nenese zkopírovaný text úkonu.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 13. Dokončení posune plán --------------------------------------------------
  select p.id into v_plan_a
  from public.plan_udrzby p
  join public.zakazka_ukon u on u.plan_udrzby_id = p.id
  where u.zakazka_id = v_zakazka and u.nazev_snapshot = 'Vyčištění stolu';

  select p.id into v_plan_b
  from public.plan_udrzby p
  join public.zakazka_ukon u on u.plan_udrzby_id = p.id
  where u.zakazka_id = v_zakazka and u.nazev_snapshot = 'Mazání vedení';

  -- Jeden krok splněn, druhý neproveditelný s důvodem.
  update public.zakazka_ukon
  set stav = 'splneno', potvrzeno_at = now()
  where zakazka_id = v_zakazka and plan_udrzby_id = v_plan_a;

  update public.zakazka_ukon
  set stav = 'nelze_provest', potvrzeno_at = now(), poznamka = 'Stroj byl v opravě.'
  where zakazka_id = v_zakazka and plan_udrzby_id = v_plan_b;

  -- Zbylé kroky (kdyby elektro spadlo pod CNC) doklikat, ať jde zakázka uzavřít.
  update public.zakazka_ukon
  set stav = 'splneno', potvrzeno_at = now()
  where zakazka_id = v_zakazka and stav = 'nesplneno';

  perform public.dokonci_zakazku(v_zakazka);

  select dalsi_termin into v_termin from public.plan_udrzby where id = v_plan_a;
  if v_termin <> current_date + 7 then
    raise exception 'Splněný týdenní úkon nemá termín za týden, má %.', v_termin;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 14. Neproveditelný krok termín neposune -----------------------------------
  -- Úkon se má pořád udělat, takže zůstává splatný.
  select dalsi_termin into v_termin from public.plan_udrzby where id = v_plan_b;
  if v_termin <> current_date then
    raise exception 'Neproveditelný krok posunul termín na %.', v_termin;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 15. Uzavřená zakázka neblokuje založení nové na tentýž den ----------------
  -- Právě kvůli tomuhle je index skupiny omezený na otevřené zakázky. Kdyby
  -- držel i dokončené, neproveditelný úkon by se už nikdy nenaplánoval.
  perform public.zaloz_zakazky(14);

  select count(*) into v_pocet
  from public.zakazka_ukon u
  join public.zakazka k on k.id = u.zakazka_id
  where k.zarizeni_id = v_stroj
    and u.plan_udrzby_id = v_plan_b
    and k.stav = 'naplanovano';

  if v_pocet <> 1 then
    raise exception 'Po uzavření zakázky se neproveditelný úkon znovu nenaplánoval.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 16. Nedoklikanou zakázku nelze dokončit -----------------------------------
  select id into v_zakazka
  from public.zakazka
  where zarizeni_id = v_stroj and stav = 'naplanovano'
  limit 1;

  begin
    perform public.dokonci_zakazku(v_zakazka);
    raise exception 'Zakázka s nevyřízenými kroky šla dokončit.';
  exception
    when check_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  -- 17. Bez povinné fotky to taky neprojde ------------------------------------
  update public.zakazka_ukon set vyzaduje_foto = true where zakazka_id = v_zakazka;
  update public.zakazka_ukon
  set stav = 'splneno', potvrzeno_at = now()
  where zakazka_id = v_zakazka and stav = 'nesplneno';

  begin
    perform public.dokonci_zakazku(v_zakazka);
    raise exception 'Zakázka s chybějící povinnou fotkou šla dokončit.';
  exception
    when check_violation then null;
  end;
  v_kontrol := v_kontrol + 1;

  raise notice 'Test plánovače prošel: všech % kontrol v pořádku.', v_kontrol;
end;
$$;

rollback;
