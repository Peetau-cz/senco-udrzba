-- =============================================================================
-- Ověření práv nad zakázkami a plánem (migrace 0021).
--
-- Sesterský skript k tests/zakazky.sql. Ten běží pod rolí postgres a ověřuje,
-- co drží databáze i vůči vlastníkovi - omezení a triggery. Tenhle dělá opak:
-- přepne se na roli authenticated a ptá se, co drží vůči PŘIHLÁŠENÉMU člověku,
-- tedy RLS a hlavně sloupcová práva.
--
-- Vznikl proto, že sloupcová práva z migrace 0011 dlouho nedržela vůbec.
-- Supabase dává nové tabulce plošný GRANT ALL pro anon i authenticated a
-- migrace odebíraly jen anon; sloupcové granty se s tabulkovým právem sčítají,
-- nepřebíjejí ho. Technik tak směl u otevřené zakázky přepsat termín i zadání
-- kroku, který zrovna odklikával. Srovnala to migrace 0021.
--
-- Kontroly 3, 4 a 9 jsou ty, které před migrací 0021 padaly.
--
-- Skript ověřuje obojí: že zavřené je zavřené, ale i že otevřené zůstalo
-- otevřené - technik musí pořád zvládnout odklikat checklist a nahrát fotku.
--
-- Spuštění: v SQL editoru Supabase nebo přes psql, pod rolí postgres.
-- Předpoklad: proběhly migrace 0001-0021, seed.sql a přiřazení uživatelů
-- (npm run seed:users, nebo supabase/prirazeni_uzivatelu.sql).
--
-- Skript nic nemění - celý běží v transakci, která se na konci vrací.
-- =============================================================================

begin;

do $$
declare
  v_udrzbar  uuid;
  v_vedouci  uuid;

  v_oblast   uuid;
  v_profese  uuid;
  v_typ      uuid;
  v_stroj    uuid;
  v_sablona  uuid;
  v_verze    uuid;
  v_plan     uuid;
  v_zakazka  uuid;
  v_ukon     uuid;
  v_foto     uuid;

  v_termin   date;
  v_nazev    text;
  v_pocet    integer;
  v_proslo   boolean;
  v_chyba    text;
  v_kontrol  integer := 0;
begin
  -- ---------------------------------------------------------------------------
  -- Příprava pod rolí postgres
  -- ---------------------------------------------------------------------------

  select id into v_udrzbar from auth.users where email = 'udrzbar@senco.test';
  select id into v_vedouci from auth.users where email = 'vedouci@senco.test';

  if v_udrzbar is null or v_vedouci is null then
    raise exception 'Chybí testovací uživatelé. Spusťte nejdřív: npm run seed:users';
  end if;

  -- Strojní oblast: údržbář je tam garant, takže na stroj vidí a údržbu na něm
  -- provádí. Zakládat zakázky ani šablony ale nesmí - to je jádro těchhle kontrol.
  select id into v_oblast  from public.oblast where kod = 'strojni';
  select id into v_profese from public.role   where kod = 'udrzbar';

  if v_oblast is null or v_profese is null then
    raise exception 'Chybí číselníky. Spusťte nejdřív supabase/seed.sql';
  end if;

  insert into public.typ_zarizeni (oblast_id, kod, nazev)
  values (v_oblast, 'test_typ_prava', 'Testovací typ pro práva')
  returning id into v_typ;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_oblast, v_typ, 'Testovací stroj pro práva', 'TEST-PRAVA-1')
  returning id into v_stroj;

  insert into public.sablona (oblast_id, kod, nazev)
  values (v_oblast, 'test_prava', 'Testovací šablona pro práva')
  returning id into v_sablona;

  v_verze := public.zaloz_navrh_verze(v_sablona);

  insert into public.sablona_ukon (
    sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
    interval_zaklad, profese_role_id
  ) values (v_verze, 1, 'Kontrola hydrauliky', 'tydny', 1, 'od_planu', v_profese);

  perform public.aktivuj_verzi(v_verze);

  insert into public.zarizeni_sablona (zarizeni_id, sablona_id, oblast_id)
  values (v_stroj, v_sablona, v_oblast);

  select id into v_plan from public.plan_udrzby where zarizeni_id = v_stroj;

  update public.plan_udrzby set dalsi_termin = current_date + 7 where id = v_plan;

  -- Zakázku zakládá plánovač; tady ji zastupuje přímý zápis pod postgresem.
  insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
  values (v_stroj, v_verze, v_profese, current_date + 7)
  returning id into v_zakazka;

  insert into public.zakazka_ukon (
    zakazka_id, plan_udrzby_id, poradi, nazev_snapshot, kontrolni_body
  ) values (
    v_zakazka, v_plan, 1, 'Kontrola hydrauliky',
    '[{"nazev": "Tlak v normě", "typ": "ano_ne"}]'::jsonb
  ) returning id into v_ukon;

  -- ---------------------------------------------------------------------------
  -- Údržbář = technik, který zakázku dělá
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_udrzbar, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 1. Technik odklikne krok checklistu ---------------------------------------
  --    Kdyby po srovnání práv nešlo tohle, byl by systém k ničemu.
  begin
    update public.zakazka_ukon
    set stav = 'splneno',
        kontrolni_body = '[{"nazev": "Tlak v normě", "typ": "ano_ne", "ano": true}]'::jsonb,
        poznamka = 'Bez závad',
        potvrzeno_at = now(),
        potvrdil_id = v_udrzbar
    where id = v_ukon;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
      v_chyba := sqlerrm;
  end;

  if not v_proslo then
    raise exception 'Technik neodklikl krok checklistu: %', v_chyba;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 2. Technik smí zakázku rozpracovat a přiřadit si ji -----------------------
  begin
    update public.zakazka
    set stav = 'probiha',
        prirazeno_uzivateli_id = v_udrzbar,
        zahajeno_at = now()
    where id = v_zakazka;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
      v_chyba := sqlerrm;
  end;

  if not v_proslo then
    raise exception 'Technik nedokázal zakázku rozpracovat: %', v_chyba;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 3. ...ale nepřepíše zadání kroku ------------------------------------------
  --    Text úkonu je kopie z matice pořízená při založení zakázky (R3). Kdyby
  --    šel přepsat, dala by se zamrazená matice obejít i bez sáhnutí na šablonu.
  v_proslo := false;
  begin
    update public.zakazka_ukon set nazev_snapshot = 'Něco úplně jiného' where id = v_ukon;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Technik přepsal nazev_snapshot. Sloupcová práva na zakazka_ukon nedrží.';
  end if;

  select nazev_snapshot into v_nazev from public.zakazka_ukon where id = v_ukon;
  if v_nazev <> 'Kontrola hydrauliky' then
    raise exception 'Zadání kroku se přesto změnilo na „%".', v_nazev;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 4. ...ani termín zakázky ---------------------------------------------------
  --    Podle plánovaného termínu se počítá zpoždění i plnění matice. Kdyby si
  --    ho technik mohl posunout, po termínu by nebyla nikdy žádná zakázka.
  v_proslo := false;
  begin
    update public.zakazka set planovany_termin = current_date + 365 where id = v_zakazka;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Technik posunul planovany_termin. Sloupcová práva na zakazka nedrží.';
  end if;

  select planovany_termin into v_termin from public.zakazka where id = v_zakazka;
  if v_termin <> current_date + 7 then
    raise exception 'Termín zakázky se přesto změnil na %.', v_termin;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 5. Technik nezaloží zakázku ručně ------------------------------------------
  --    Neplánovaný zásah není zakázka bez matice - patří do provozního deníku.
  v_proslo := false;
  begin
    insert into public.zakazka (zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin)
    values (v_stroj, v_verze, v_profese, current_date + 14);
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Technik založil zakázku mimo plánovač.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 6. Technik nesmaže zakázku ani její krok -----------------------------------
  v_proslo := false;
  begin
    delete from public.zakazka_ukon where id = v_ukon;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Technik smazal krok checklistu. Historie zakázky je děravá.';
  end if;
  v_kontrol := v_kontrol + 1;

  v_proslo := false;
  begin
    delete from public.zakazka where id = v_zakazka;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Technik smazal zakázku. Historie údržby je mazatelná.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 7. Fotku ke kroku přidat i odebrat smí --------------------------------------
  --    Omylem nahranou fotku musí jít během práce smazat. Kdyby revoke sebral
  --    i tohle, technik by se zasekl uprostřed zakázky.
  begin
    insert into public.zakazka_foto (zakazka_ukon_id, storage_path, nahral_id)
    values (v_ukon, 'test/prava/foto-1.jpg', v_udrzbar)
    returning id into v_foto;

    delete from public.zakazka_foto where id = v_foto;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
      v_chyba := sqlerrm;
  end;

  if not v_proslo then
    raise exception 'Technik nezvládl přidat a odebrat fotku ke kroku: %', v_chyba;
  end if;
  v_kontrol := v_kontrol + 1;

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- Vedoucí údržby = ten, kdo spravuje plán
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_vedouci, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  -- 8. Vedoucí zadá termín v plánu ---------------------------------------------
  begin
    update public.plan_udrzby set dalsi_termin = current_date + 30 where id = v_plan;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
      v_chyba := sqlerrm;
  end;

  if not v_proslo then
    raise exception 'Vedoucí údržby nezadal termín v plánu: %', v_chyba;
  end if;
  v_kontrol := v_kontrol + 1;

  -- 9. ...ale řádek plánu nesmaže ----------------------------------------------
  --    Řádek nese posledni_provedeno_at, tedy jediný záznam o tom, kdy se úkon
  --    naposled dělal. Ruší ho kaskáda od přiřazení šablony, ne člověk.
  v_proslo := false;
  begin
    delete from public.plan_udrzby where id = v_plan;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Vedoucí smazal řádek plánu i s posledním provedením.';
  end if;

  select count(*) into v_pocet from public.plan_udrzby where id = v_plan;
  if v_pocet <> 1 then
    raise exception 'Řádek plánu z tabulky přesto zmizel.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- 10. Profil se nemaže, vyřazuje se sloupcem aktivni --------------------------
  v_proslo := false;
  begin
    delete from public.profil where id = v_udrzbar;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Podařilo se smazat profil. Ztratilo by se, kdo úkony provedl.';
  end if;
  v_kontrol := v_kontrol + 1;

  execute 'reset role';

  raise notice 'Test práv nad zakázkami prošel: všech % kontrol v pořádku.', v_kontrol;
end;
$$;

rollback;
