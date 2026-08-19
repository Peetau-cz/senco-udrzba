-- =============================================================================
-- M3 - naplánování na požádání
--
-- Migrace 0013 nechala plánovač bez práva EXECUTE pro aplikaci, protože jede
-- napříč všemi oblastmi a nemá koho se ptát na oprávnění. Při prvním
-- proklikávání se ukázalo, co to znamená v praxi: garant zadá termíny, uloží
-- a nic se nestane. Zakázky vzniknou až ve tři ráno.
--
-- Tak to fungovat nemá. Termín zadaný na dnešek znamená „dneska se to má
-- udělat", ne „zítra o tom začneme uvažovat".
--
-- Řešení není povolit plánovač všem, ale dát mu rozsah, ke kterému oprávnění
-- existuje: jedno zařízení. Na to se dá zeptat stejné funkce jako politika
-- nad plan_udrzby, takže se pravidla nerozcházejí.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Plánovač umí zúžit záběr na jeden stroj
--
-- Nový parametr nejde přidat přes `create or replace`: výchozí hodnota by
-- vytvořila druhý přetížený tvar a volání `zaloz_zakazky()` bez parametrů by
-- pak bylo nejednoznačné. Původní se proto zahazuje.
--
-- Noční úloha z migrace 0014 volá `select public.zaloz_zakazky();` jako text
-- a jméno se nemění, takže ji to nezasáhne.
-- -----------------------------------------------------------------------------

drop function if exists public.zaloz_zakazky(integer);

create or replace function public.zaloz_zakazky(
  p_okno_dnu integer default 14,
  p_zarizeni uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_radek   record;
  v_zakazka uuid;
  v_pocet   integer := 0;
begin
  if p_okno_dnu is null or p_okno_dnu < 0 then
    raise exception 'Plánovací okno nemůže být záporné, je %.', p_okno_dnu using errcode = '22023';
  end if;

  for v_radek in
    select
      p.id             as plan_id,
      p.zarizeni_id,
      p.dalsi_termin,
      v.id             as verze_id,
      u.id             as ukon_id,
      u.profese_role_id,
      u.poradi,
      u.nazev,
      u.popis,
      u.kontrolni_body,
      u.vyzaduje_foto,
      u.vyzaduje_hodnotu,
      u.nabizi_poznamku,
      u.jednotka,
      u.mez_min,
      u.mez_max
    from public.plan_udrzby p
    join public.sablona_verze v
      on v.sablona_id = p.sablona_id and v.stav = 'aktivni'
    join public.sablona_ukon u
      on u.sablona_verze_id = v.id and u.klic = p.ukon_klic
    where p.aktivni
      -- Null = celá databáze, tedy noční úloha.
      and (p_zarizeni is null or p.zarizeni_id = p_zarizeni)
      -- Řádek bez termínu čeká na garanta, plánovat se podle něj nedá.
      and p.dalsi_termin is not null
      and p.dalsi_termin <= current_date + p_okno_dnu
      and not exists (
        select 1
        from public.zakazka_ukon zu
        join public.zakazka z on z.id = zu.zakazka_id
        where zu.plan_udrzby_id = p.id
          and z.stav in ('naplanovano', 'probiha')
      )
    order by p.zarizeni_id, p.dalsi_termin, u.profese_role_id, u.poradi
  loop
    -- Zakázka skupiny: stroj, den, profese, verze matice. Otevřenou najdi,
    -- jinak založ. Pořadí v cyklu zaručuje, že se do téže zakázky sejdou
    -- všechny úkony skupiny.
    select id into v_zakazka
    from public.zakazka
    where zarizeni_id      = v_radek.zarizeni_id
      and planovany_termin = v_radek.dalsi_termin
      and profese_role_id  = v_radek.profese_role_id
      and sablona_verze_id = v_radek.verze_id
      and stav in ('naplanovano', 'probiha');

    if v_zakazka is null then
      insert into public.zakazka (
        zarizeni_id, sablona_verze_id, profese_role_id, planovany_termin
      ) values (
        v_radek.zarizeni_id, v_radek.verze_id, v_radek.profese_role_id, v_radek.dalsi_termin
      )
      returning id into v_zakazka;
    end if;

    -- Text úkonu se kopíruje, ne odkazuje: verze se archivuje, šablonu jde
    -- stroji odebrat, a checklist musí zůstat čitelný i pak (R3).
    insert into public.zakazka_ukon (
      zakazka_id, plan_udrzby_id, sablona_ukon_id, poradi,
      nazev_snapshot, popis_snapshot, kontrolni_body,
      vyzaduje_foto, vyzaduje_hodnotu, nabizi_poznamku,
      jednotka_snapshot, mez_min_snapshot, mez_max_snapshot
    ) values (
      v_zakazka, v_radek.plan_id, v_radek.ukon_id, v_radek.poradi,
      v_radek.nazev, v_radek.popis, v_radek.kontrolni_body,
      v_radek.vyzaduje_foto, v_radek.vyzaduje_hodnotu, v_radek.nabizi_poznamku,
      v_radek.jednotka, v_radek.mez_min, v_radek.mez_max
    );

    v_pocet := v_pocet + 1;
  end loop;

  return v_pocet;
end;
$$;

comment on function public.zaloz_zakazky is
  'Založí zakázky pro úkony splatné v plánovacím okně, volitelně jen pro jeden stroj. Idempotentní.';

-- -----------------------------------------------------------------------------
-- Naplánování jednoho stroje
--
-- Tohle je to, co smí zavolat aplikace. Ptá se stejné funkce jako politika
-- plan_udrzby_zapis z migrace 0010 - kdo smí zadat termín, smí ho i uvést
-- v život. Kdyby se ta dvě pravidla rozešla, garant by mohl uložit termín,
-- podle kterého mu systém odmítne naplánovat.
--
-- Vrací počet nových kroků, ne zakázek: to je číslo, které se dá říct
-- uživateli („naplánováno 6 úkonů") a zároveň sedí s tím, co počítá test.
-- -----------------------------------------------------------------------------

create or replace function public.naplanuj_zarizeni(p_zarizeni uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_oblast uuid;
begin
  select oblast_id into v_oblast from public.zarizeni where id = p_zarizeni;

  if v_oblast is null then
    raise exception 'Zařízení neexistuje.' using errcode = '23503';
  end if;

  -- SECURITY DEFINER obchází RLS, oprávnění se proto musí ověřit ručně.
  if not public.spravuje_sablony_v_oblasti(v_oblast) then
    raise exception 'Nemáte oprávnění plánovat údržbu v této oblasti.' using errcode = '42501';
  end if;

  return public.zaloz_zakazky(14, p_zarizeni);
end;
$$;

comment on function public.naplanuj_zarizeni is
  'Naplánuje splatné úkony jednoho stroje. Volá ji aplikace hned po uložení termínů.';

-- -----------------------------------------------------------------------------
-- Práva
--
-- zaloz_zakazky zůstává nedostupná: jede napříč všemi oblastmi a nemá koho se
-- ptát na oprávnění. Ven vede jen cesta přes jedno zařízení.
-- -----------------------------------------------------------------------------

revoke execute on function public.zaloz_zakazky(integer, uuid) from public;
revoke execute on function public.naplanuj_zarizeni(uuid)      from public;

grant execute on function public.naplanuj_zarizeni(uuid) to authenticated;
