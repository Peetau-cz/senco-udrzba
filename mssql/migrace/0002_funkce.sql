-- =============================================================================
-- 0002: funkce (docs/NASAZENI.md, kolo R2)
--
-- Pomocné funkce oprávnění a výpočet intervalu. Přepis z PostgreSQL (větev
-- `supabase`): ma_roli ... spravuje_ciselniky z 0001, spravuje_zarizeni_v_oblasti
-- z 0003, spravuje_sablony_v_oblasti z 0006, provadi_udrzbu_v_oblasti z 0011,
-- dalsi_termin z 0013, muze_menit_zapis_deniku z 0022. Stejná jména, stejná
-- pravidla; volají je procedury (0004), triggery (0003) a politiky RLS (R3).
--
-- Rozdíly proti PostgreSQL:
--   * Funkce v SQL Serveru nesmí THROW. Kde PostgreSQL hlásil chybu
--     (dalsi_termin s nekladným intervalem), vrací se NULL a chybu hlásí
--     volající procedura.
--   * SECURITY DEFINER neexistuje. Oprávnění ke čtení tabulek dává řetězení
--     vlastnictví (vše je dbo), řádková omezení se ale uplatní vždy. Funkce,
--     které v PostgreSQL byly DEFINER a čtou uzivatel_role / uzivatel_oblast,
--     proto spoléhají na to, že politika nad těmi tabulkami pustí přihlášenému
--     jeho vlastní řádky - ověří test práv v R3.
--   * WITH SCHEMABINDING, aby je mohly volat predikáty RLS (ty musí být
--     schemabound a schemabound objekt smí volat jen schemabound funkci).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Role a oblasti přihlášené osoby (dřív 0001)
-- -----------------------------------------------------------------------------

create function dbo.ma_roli(@kod nvarchar(60))
returns bit
with schemabinding
as
begin
  if exists (
    select 1
    from dbo.uzivatel_role ur
    join dbo.role r on r.id = ur.role_id
    where ur.uzivatel_id = dbo.aktualni_uzivatel()
      and r.kod = @kod
  ) return 1;
  return 0;
end;
GO

-- Vedoucí údržby, management a administrátor vidí všechny oblasti (zadání ř. 51).
-- Ostatní jen ty, které mají přiřazené (ř. 52).
create function dbo.ma_pristup_k_oblasti(@oblast uniqueidentifier)
returns bit
with schemabinding
as
begin
  if dbo.ma_roli(N'administrator') = 1
     or dbo.ma_roli(N'vedouci_udrzby') = 1
     or dbo.ma_roli(N'management') = 1
    return 1;
  if exists (
    select 1
    from dbo.uzivatel_oblast uo
    where uo.uzivatel_id = dbo.aktualni_uzivatel()
      and uo.oblast_id = @oblast
  ) return 1;
  return 0;
end;
GO

create function dbo.je_garantem_oblasti(@oblast uniqueidentifier)
returns bit
with schemabinding
as
begin
  if exists (
    select 1
    from dbo.uzivatel_oblast uo
    where uo.uzivatel_id = dbo.aktualni_uzivatel()
      and uo.oblast_id = @oblast
      and uo.vztah = N'garant'
  ) return 1;
  return 0;
end;
GO

-- Management je podle zadání (ř. 49) pouze pro čtení. Zápis smí ten, kdo drží
-- alespoň jednu jinou roli než management.
create function dbo.muze_zapisovat()
returns bit
with schemabinding
as
begin
  if exists (
    select 1
    from dbo.uzivatel_role ur
    join dbo.role r on r.id = ur.role_id
    where ur.uzivatel_id = dbo.aktualni_uzivatel()
      and r.kod <> N'management'
  ) return 1;
  return 0;
end;
GO

create function dbo.spravuje_ciselniky()
returns bit
with schemabinding
as
begin
  if dbo.ma_roli(N'administrator') = 1 or dbo.ma_roli(N'vedouci_udrzby') = 1 return 1;
  return 0;
end;
GO

-- -----------------------------------------------------------------------------
-- Kdo smí spravovat evidenci (dřív 0003)
--
-- Garantství samo o sobě nestačí: údržbář je podle seedu garantem strojní
-- oblasti, a přesto karty strojů zakládat nemá - provádí údržbu. Proto se
-- ptáme na obojí, roli i vazbu. Seznam rolí zrcadlí konstantu GARANTI
-- v src/lib/auth/opravneni.ts; nová role znamená zásah na obou místech.
-- -----------------------------------------------------------------------------

create function dbo.spravuje_zarizeni_v_oblasti(@oblast uniqueidentifier)
returns bit
with schemabinding
as
begin
  if dbo.muze_zapisovat() = 0 return 0;
  -- Administrátor a vedoucí údržby napříč oblastmi (zadání ř. 51).
  if dbo.spravuje_ciselniky() = 1 return 1;
  if dbo.je_garantem_oblasti(@oblast) = 1
     and (   dbo.ma_roli(N'specialista_cnc') = 1
          or dbo.ma_roli(N'specialista_elektro') = 1
          or dbo.ma_roli(N'vedouci_lakovny') = 1
          or dbo.ma_roli(N'pracovnik_skladu') = 1)
    return 1;
  return 0;
end;
GO

-- Šablony mají v matici oprávnění (NAVRH.md kap. 3.1) stejná práva jako
-- zařízení. Deleguje se, aby se případné rozejití pravidel měnilo tady (0006).
create function dbo.spravuje_sablony_v_oblasti(@oblast uniqueidentifier)
returns bit
with schemabinding
as
begin
  return dbo.spravuje_zarizeni_v_oblasti(@oblast);
end;
GO

-- „Provedení údržby" je jediný řádek matice, kde zápis má i údržbář a nemá
-- management (0011). Na profesi zakázky se schválně neptá: profese říká, komu
-- se zakázka nabízí, ne kdo je jediný oprávněný.
create function dbo.provadi_udrzbu_v_oblasti(@oblast uniqueidentifier)
returns bit
with schemabinding
as
begin
  if dbo.muze_zapisovat() = 1 and dbo.ma_pristup_k_oblasti(@oblast) = 1 return 1;
  return 0;
end;
GO

-- -----------------------------------------------------------------------------
-- Okno na opravu zápisu v deníku (dřív 0022)
--
-- Jediné místo, kde je pravidlo „autor do 24 hodin, vedoucí údržby
-- a administrátor kdykoli" napsané. Dvě podoby téhož:
--
--   smi_menit_zapis_deniku(oblast, zapsal, vytvoreno) - nad hodnotami. Volá ji
--     zámek deníku (0003) se STARÝMI hodnotami z `deleted`: trigger v SQL
--     Serveru běží až po zápisu a v tabulce by už byla nová hodnota - kdo by
--     si přepsal vytvoreno_at, obešel by okno.
--   muze_menit_zapis_deniku(id) - nad uloženým zápisem, pro fotky k zápisu
--     (0003), aplikaci a route handler souborů (R6). Řádková omezení nad
--     provozni_denik se uplatní - na zápis, který uživatel nevidí, nemá co sahat.
-- -----------------------------------------------------------------------------

create function dbo.smi_menit_zapis_deniku(
  @oblast    uniqueidentifier,
  @zapsal    uniqueidentifier,
  @vytvoreno datetime2(3)
)
returns bit
with schemabinding
as
begin
  if dbo.provadi_udrzbu_v_oblasti(@oblast) = 0 return 0;
  if dbo.ma_roli(N'administrator') = 1 or dbo.ma_roli(N'vedouci_udrzby') = 1 return 1;
  if @zapsal = dbo.aktualni_uzivatel() and @vytvoreno >= dateadd(hour, -24, sysutcdatetime()) return 1;
  return 0;
end;
GO

create function dbo.muze_menit_zapis_deniku(@zaznam uniqueidentifier)
returns bit
with schemabinding
as
begin
  if exists (
    select 1
    from dbo.provozni_denik d
    where d.id = @zaznam
      and dbo.smi_menit_zapis_deniku(d.oblast_id, d.zapsal_id, d.vytvoreno_at) = 1
  ) return 1;
  return 0;
end;
GO

-- -----------------------------------------------------------------------------
-- Kdy zase (dřív 0013)
--
-- Veškerá logika intervalů žije tady a nikde jinde (NAVRH.md kap. 1.3).
--
--   od_provedeni - další termín se počítá od skutečného provedení.
--   od_planu     - kalendář se nehýbe: mřížka se posouvá po celých
--                  intervalech, dokud termín neminul provedení. Zameškané
--                  cykly se přeskočí.
--
-- Měsíce a roky kalendářně: 31. 1. + 1 měsíc je 28. 2. a další krok už stojí
-- na 28. (DATEADD se chová stejně jako interval v PostgreSQL, krok se přičítá
-- k předchozímu výsledku).
--
-- Nekladný interval, neznámý typ nebo základ a nesbíhající se výpočet vrací
-- NULL (funkce nesmí THROW); dokonci_zakazku to přeloží na chybu 50300.
-- -----------------------------------------------------------------------------

create function dbo.dalsi_termin(
  @planovany date,
  @provedeno date,
  @typ       nvarchar(30),
  @hodnota   int,
  @zaklad    nvarchar(30)
)
returns date
with schemabinding
as
begin
  if @hodnota is null or @hodnota <= 0
     or @typ is null or @typ not in (N'dny', N'tydny', N'mesice', N'roky')
     or @zaklad is null or @zaklad not in (N'od_provedeni', N'od_planu')
    return null;

  declare @datum date =
    case when @zaklad = N'od_provedeni' then coalesce(@provedeno, @planovany) else @planovany end;
  if @datum is null return null;

  -- Nejmíň jeden krok vpřed.
  set @datum = case @typ
    when N'dny'    then dateadd(day,   @hodnota,     @datum)
    when N'tydny'  then dateadd(day,   @hodnota * 7, @datum)
    when N'mesice' then dateadd(month, @hodnota,     @datum)
    when N'roky'   then dateadd(year,  @hodnota,     @datum)
  end;
  if @zaklad = N'od_provedeni' return @datum;

  -- od_planu: dokud jsme v minulosti vůči provedení. Pojistka proti zacyklení
  -- - sto let týdenních cyklů je pět tisíc kol.
  declare @kolo int = 0;
  while @provedeno is not null and @datum <= @provedeno
  begin
    set @datum = case @typ
      when N'dny'    then dateadd(day,   @hodnota,     @datum)
      when N'tydny'  then dateadd(day,   @hodnota * 7, @datum)
      when N'mesice' then dateadd(month, @hodnota,     @datum)
      when N'roky'   then dateadd(year,  @hodnota,     @datum)
    end;
    set @kolo += 1;
    if @kolo > 10000 return null;
  end;

  return @datum;
end;
GO
