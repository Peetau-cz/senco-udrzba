-- =============================================================================
-- Ověření provozního deníku (migrace 0020).
--
-- Test se dívá na čtyři věci, které na obrazovce poznat nejdou:
--
--   * matici oprávnění - kdo smí zapisovat a kde (management nikde, ostatní
--     jen ve svých oblastech),
--   * okno na opravu - autor 24 hodin, vedoucí údržby kdykoli, cizí nikdy,
--   * nemazatelnost zápisu i po vypršení okna (zásada R5),
--   * rozhodnutí R4: zápis do deníku se NESMÍ dotknout plánu údržby ani
--     založit zakázku. To je jediná věc, kterou by šlo porušit tiše - plán
--     by se posunul a nikdo by si toho měsíce nevšiml.
--
-- Test si zakládá vlastní stroje a šablonu, aby nesahal na skutečná data.
-- Používá ale SKUTEČNÉ oblasti a testovací účty, protože právě o jejich
-- vzájemný vztah tu jde.
--
-- Spuštění: v SQL editoru Supabase nebo přes psql, pod rolí postgres.
-- Předpoklad: proběhly migrace 0001-0020, seed.sql a přiřazení uživatelů
-- (npm run seed:users, nebo supabase/prirazeni_uzivatelu.sql).
--
-- Skript nic nemění - celý běží v transakci, která se na konci vrací.
-- =============================================================================

begin;

do $$
declare
  v_udrzbar    uuid;
  v_vedouci    uuid;
  v_management uuid;
  v_lakovnik   uuid;

  v_ob_strojni uuid;
  v_ob_lakovna uuid;
  v_ob_cnc     uuid;

  v_typ_strojni uuid;
  v_typ_lakovna uuid;
  v_typ_cnc     uuid;

  v_stroj      uuid;   -- strojní oblast, patří údržbáři
  v_stroj_lak  uuid;   -- lakovna, vidí na něj údržbář i vedoucí lakovny
  v_stroj_cnc  uuid;   -- CNC, na tu údržbář nesmí

  v_profese    uuid;
  v_sablona    uuid;
  v_verze      uuid;

  v_druh       uuid;
  v_zapis      uuid;
  v_zapis_lak  uuid;
  v_stary      uuid;

  v_plan_pred  date[];
  v_plan_po    date[];
  v_prov_pred  timestamptz[];
  v_prov_po    timestamptz[];

  v_pocet      integer;
  v_text       text;
  v_proslo     boolean;
  v_chyba      text;
  v_kontrol    integer := 0;
begin
  -- ---------------------------------------------------------------------------
  -- Příprava
  -- ---------------------------------------------------------------------------

  select id into v_udrzbar    from auth.users where email = 'udrzbar@senco.test';
  select id into v_vedouci    from auth.users where email = 'vedouci@senco.test';
  select id into v_management from auth.users where email = 'management@senco.test';
  select id into v_lakovnik   from auth.users where email = 'lakovna@senco.test';

  if v_udrzbar is null or v_vedouci is null or v_management is null or v_lakovnik is null then
    raise exception 'Chybí testovací uživatelé. Spusťte nejdřív: npm run seed:users';
  end if;

  select id into v_ob_strojni from public.oblast where kod = 'strojni';
  select id into v_ob_lakovna from public.oblast where kod = 'lakovna';
  select id into v_ob_cnc     from public.oblast where kod = 'cnc';
  select id into v_profese    from public.role   where kod = 'udrzbar';

  if v_ob_strojni is null or v_ob_lakovna is null or v_ob_cnc is null then
    raise exception 'Chybí číselníky. Spusťte nejdřív supabase/seed.sql';
  end if;

  insert into public.typ_zarizeni (oblast_id, kod, nazev) values
    (v_ob_strojni, 'test_denik_strojni', 'Testovací typ pro deník'),
    (v_ob_lakovna, 'test_denik_lakovna', 'Testovací typ pro deník'),
    (v_ob_cnc,     'test_denik_cnc',     'Testovací typ pro deník');

  select id into v_typ_strojni from public.typ_zarizeni where kod = 'test_denik_strojni';
  select id into v_typ_lakovna from public.typ_zarizeni where kod = 'test_denik_lakovna';
  select id into v_typ_cnc     from public.typ_zarizeni where kod = 'test_denik_cnc';

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_ob_strojni, v_typ_strojni, 'Testovací lis', 'TEST-DENIK-1')
  returning id into v_stroj;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_ob_lakovna, v_typ_lakovna, 'Testovací kabina', 'TEST-DENIK-2')
  returning id into v_stroj_lak;

  insert into public.zarizeni (oblast_id, typ_zarizeni_id, nazev, inventarni_cislo)
  values (v_ob_cnc, v_typ_cnc, 'Testovací frézka', 'TEST-DENIK-3')
  returning id into v_stroj_cnc;

  -- Plán na testovacím lisu. Slouží jen jako svědek: po celém testu musí mít
  -- pořád stejné termíny.
  insert into public.sablona (oblast_id, kod, nazev)
  values (v_ob_strojni, 'test_denik', 'Testovací šablona pro deník')
  returning id into v_sablona;

  v_verze := public.zaloz_navrh_verze(v_sablona);

  insert into public.sablona_ukon (
    sablona_verze_id, poradi, nazev, interval_typ, interval_hodnota,
    interval_zaklad, profese_role_id
  ) values
    (v_verze, 1, 'Kontrola hydrauliky', 'mesice', 1, 'od_planu', v_profese),
    (v_verze, 2, 'Mazání vedení',       'tydny',  2, 'od_planu', v_profese);

  perform public.aktivuj_verzi(v_verze);

  insert into public.zarizeni_sablona (zarizeni_id, sablona_id, oblast_id)
  values (v_stroj, v_sablona, v_ob_strojni);

  update public.plan_udrzby set dalsi_termin = current_date + 30
  where zarizeni_id = v_stroj;

  select array_agg(dalsi_termin order by ukon_klic),
         array_agg(posledni_provedeno_at order by ukon_klic)
  into v_plan_pred, v_prov_pred
  from public.plan_udrzby
  where zarizeni_id = v_stroj;

  -- ---------------------------------------------------------------------------
  -- 1. Číselník druhů obsahuje šest druhů ze zadání
  -- ---------------------------------------------------------------------------
  select count(*) into v_pocet
  from public.druh_zasahu
  where kod in ('vymena_zarovky', 'dotazeni_krytu', 'vymena_hadice',
                'oprava_snimace', 'serizeni', 'cisteni');

  if v_pocet <> 6 then
    raise exception 'V číselníku je % z šesti druhů ze zadání ř. 138-143.', v_pocet;
  end if;

  select id into v_druh from public.druh_zasahu where kod = 'vymena_zarovky';
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 2. Údržbář zapíše zásah ve své oblasti, obě jména se doplní sama
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_udrzbar, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    insert into public.provozni_denik (zarizeni_id, oblast_id, druh_zasahu_id, popis, doba_trvani_min)
    values (v_stroj, v_ob_strojni, v_druh, 'Vyměněna žárovka v panelu', 15)
    returning id into v_zapis;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
      v_chyba := sqlerrm;
  end;

  if not v_proslo then
    raise exception 'Údržbář nezapsal zásah ve vlastní oblasti: %', v_chyba;
  end if;

  select count(*) into v_pocet
  from public.provozni_denik
  where id = v_zapis and zapsal_id = v_udrzbar and provedl_id = v_udrzbar;

  if v_pocet <> 1 then
    raise exception 'Zápis se nepodepsal sám sebou - zapsal_id nebo provedl_id nesedí.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 3. Zásah jde zapsat za kolegu (rozhodnutí z 26. 8. 2026)
  --
  -- V hale je jeden tablet a píše se po směně. Kdyby databáze trvala na tom,
  -- že provedl = zapsal, historie by tvrdila, že u stroje byl někdo jiný.
  -- ---------------------------------------------------------------------------
  begin
    insert into public.provozni_denik (zarizeni_id, oblast_id, druh_zasahu_id, popis, provedl_id)
    values (v_stroj, v_ob_strojni, v_druh, 'Zásah zapsaný za kolegu', v_vedouci);
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
      v_chyba := sqlerrm;
  end;

  if not v_proslo then
    raise exception 'Zápis za kolegu neprošel: %', v_chyba;
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 4. ...ale ne v cizí oblasti (zadání ř. 52)
  -- ---------------------------------------------------------------------------
  v_proslo := false;
  begin
    insert into public.provozni_denik (zarizeni_id, oblast_id, druh_zasahu_id, popis)
    values (v_stroj_cnc, v_ob_cnc, v_druh, 'Zásah v cizí oblasti');
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Údržbář zapsal zásah v oblasti CNC. Politika provozni_denik_insert nedrží.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 5. Zápis pod cizím jménem neprojde
  --
  -- zapsal_id rozhoduje o právu opravit. Kdyby se dalo podstrčit, dal by se
  -- obejít i zámek na cizí zápisy.
  -- ---------------------------------------------------------------------------
  v_proslo := false;
  begin
    insert into public.provozni_denik (zarizeni_id, oblast_id, druh_zasahu_id, popis, zapsal_id)
    values (v_stroj, v_ob_strojni, v_druh, 'Zápis podepsaný vedoucím', v_vedouci);
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Prošel zápis podepsaný cizím jménem. Politika provozni_denik_insert nedrží.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 6. Čas vzniku zápisu si nikdo nenastaví sám
  --
  -- Od vytvoreno_at se počítá okno na opravu. Kdyby ho směl poslat klient,
  -- stačilo by při zápisu uvést datum v budoucnosti a zápis by šel opravovat
  -- napořád. Drží to sloupcová práva na INSERT, ne politika.
  -- ---------------------------------------------------------------------------
  v_proslo := false;
  begin
    insert into public.provozni_denik (zarizeni_id, oblast_id, druh_zasahu_id, popis, vytvoreno_at)
    values (v_stroj, v_ob_strojni, v_druh, 'Zápis s vlastním časem vzniku', now() + interval '10 years');
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Prošel zápis s vlastním vytvoreno_at. Okno na opravu jde obejít.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 7. Zásah se nezapisuje dopředu
  -- ---------------------------------------------------------------------------
  v_proslo := false;
  begin
    insert into public.provozni_denik (zarizeni_id, oblast_id, druh_zasahu_id, popis, provedeno_at)
    values (v_stroj, v_ob_strojni, v_druh, 'Zásah z příštího roku', now() + interval '30 days');
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Prošel zásah s datem v budoucnosti. Trigger provozni_denik_cas nedrží.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 8. Autor opraví svůj čerstvý zápis
  -- ---------------------------------------------------------------------------
  begin
    update public.provozni_denik
    set popis = 'Vyměněna žárovka v panelu u dveří'
    where id = v_zapis;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
      v_chyba := sqlerrm;
  end;

  if not v_proslo then
    raise exception 'Autor neopravil vlastní zápis do 24 hodin: %', v_chyba;
  end if;

  select popis into v_text from public.provozni_denik where id = v_zapis;
  if v_text <> 'Vyměněna žárovka v panelu u dveří' then
    raise exception 'Oprava se neuložila, v popisu je „%".', v_text;
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 9. ...ale nepřepíše, kdo zápis pořídil (sloupcová práva)
  -- ---------------------------------------------------------------------------
  v_proslo := false;
  begin
    update public.provozni_denik set zapsal_id = v_vedouci where id = v_zapis;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Podařilo se přepsat zapsal_id. Sloupcová práva na provozni_denik nedrží.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 10. Zápis nejde smazat ani vlastní (zadání ř. 155, zásada R5)
  -- ---------------------------------------------------------------------------
  v_proslo := false;
  begin
    delete from public.provozni_denik where id = v_zapis;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Autor smazal vlastní zápis. Odebrané právo DELETE nedrží.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- Zápis v lakovně pro kontrolu č. 12. Údržbář je tam spolupracující osoba,
  -- takže zapisovat smí.
  insert into public.provozni_denik (zarizeni_id, oblast_id, druh_zasahu_id, popis)
  values (v_stroj_lak, v_ob_lakovna, v_druh, 'Zásah údržbáře v lakovně')
  returning id into v_zapis_lak;

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- 11. Management nezapíše nikde (zadání ř. 49)
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_management, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_proslo := false;
  begin
    insert into public.provozni_denik (zarizeni_id, oblast_id, druh_zasahu_id, popis)
    values (v_stroj, v_ob_strojni, v_druh, 'Zápis od managementu');
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Management zapsal do deníku. Matice oprávnění nedrží.';
  end if;

  -- Číst ale musí - historie zařízení je i pro něj (zadání ř. 147).
  select count(*) into v_pocet from public.provozni_denik where id = v_zapis;
  if v_pocet <> 1 then
    raise exception 'Management nevidí zápis v deníku, historie by pro něj byla prázdná.';
  end if;
  v_kontrol := v_kontrol + 1;

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- 12. Cizí zápis neopraví ani kolega ze stejné oblasti
  --
  -- Vedoucí lakovny na ten stroj vidí a zapisovat v lakovně smí. Opravovat
  -- cizí zápisy ale ne - na to je vedoucí ÚDRŽBY.
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_lakovnik, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_proslo := false;
  begin
    update public.provozni_denik set popis = 'Přepsáno kolegou' where id = v_zapis_lak;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Kolega přepsal cizí zápis. Trigger zamkni_zapis_deniku nedrží.';
  end if;
  v_kontrol := v_kontrol + 1;

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- Zápis starý pětadvacet hodin. Vzniká pod rolí postgres, protože okno se
  -- počítá od vytvoreno_at a ten se přes aplikaci nastavit nedá.
  -- ---------------------------------------------------------------------------
  insert into public.provozni_denik (
    zarizeni_id, oblast_id, druh_zasahu_id, popis,
    provedeno_at, provedl_id, zapsal_id, vytvoreno_at
  ) values (
    v_stroj, v_ob_strojni, v_druh, 'Zásah zapsaný předevčírem',
    now() - interval '2 days', v_udrzbar, v_udrzbar, now() - interval '25 hours'
  )
  returning id into v_stary;

  -- ---------------------------------------------------------------------------
  -- 13. Po 24 hodinách autor neopraví
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_udrzbar, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_proslo := false;
  begin
    update public.provozni_denik set popis = 'Oprava po týdnu' where id = v_stary;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Autor opravil zápis starší 24 hodin. Okno na opravu nedrží.';
  end if;
  v_kontrol := v_kontrol + 1;

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- 14. Vedoucí údržby opraví i starý zápis, ale smazat ho nemůže
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_vedouci, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    update public.provozni_denik
    set popis = 'Opraveno vedoucím údržby'
    where id = v_stary;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
      v_chyba := sqlerrm;
  end;

  if not v_proslo then
    raise exception 'Vedoucí údržby neopravil starý zápis: %', v_chyba;
  end if;
  v_kontrol := v_kontrol + 1;

  v_proslo := false;
  begin
    delete from public.provozni_denik where id = v_stary;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Vedoucí údržby smazal zápis. Historie deníku je mazatelná.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 15. Druh, který se používá, nejde z číselníku odstranit
  -- ---------------------------------------------------------------------------
  v_proslo := false;
  begin
    delete from public.druh_zasahu where id = v_druh;
    v_proslo := true;
  exception
    when others then
      v_proslo := false;
  end;

  if v_proslo then
    raise exception 'Použitý druh zásahu šel smazat. Zápisy by přišly o svůj druh.';
  end if;
  v_kontrol := v_kontrol + 1;

  execute 'reset role';

  -- ---------------------------------------------------------------------------
  -- 16. ROZHODNUTÍ R4: deník se nedotkl plánu údržby
  --
  -- Nejdůležitější kontrola celého modulu. Zadání ř. 144 říká, že neplánované
  -- zásahy neovlivňují plán preventivní údržby ani plnění matice. Kdyby to
  -- někdo v budoucnu „vylepšil" tím, že zásah posune termín, plán se rozejde
  -- s maticí a na obrazovce to nebude poznat.
  -- ---------------------------------------------------------------------------
  select array_agg(dalsi_termin order by ukon_klic),
         array_agg(posledni_provedeno_at order by ukon_klic)
  into v_plan_po, v_prov_po
  from public.plan_udrzby
  where zarizeni_id = v_stroj;

  if v_plan_po is distinct from v_plan_pred then
    raise exception 'Deník posunul termíny plánu: % → %. Porušené rozhodnutí R4.',
      v_plan_pred, v_plan_po;
  end if;

  if v_prov_po is distinct from v_prov_pred then
    raise exception 'Deník přepsal poslední provedení v plánu. Porušené rozhodnutí R4.';
  end if;
  v_kontrol := v_kontrol + 1;

  -- ---------------------------------------------------------------------------
  -- 17. ...a nezaložil zakázku
  -- ---------------------------------------------------------------------------
  select count(*) into v_pocet from public.zakazka where zarizeni_id = v_stroj;
  if v_pocet <> 0 then
    raise exception 'Ze zápisů v deníku vzniklo % zakázek. Deník má stát vedle plánu, ne v něm.',
      v_pocet;
  end if;
  v_kontrol := v_kontrol + 1;

  raise notice 'Test provozního deníku prošel: všech % kontrol v pořádku.', v_kontrol;
end;
$$;

rollback;
