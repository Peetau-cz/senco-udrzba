# Syntaktická kontrola T-SQL bez serveru (docs/NASAZENI.md).
#
# Používá parser ScriptDom, který je součástí SQL Server Management Studia.
# Pozná jen syntaxi (chybějící čárka, špatné klíčové slovo), ne to, jestli
# tabulka nebo sloupec existují - to ukáže až databáze. Hodí se, když se
# schéma píše dřív, než IT dodá server.
#
#   npm run mssql:syntaxe                       všechny soubory v mssql/
#   npm run mssql:syntaxe -- mssql/migrace/0001_schema.sql

param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Soubory)

# Výstup v UTF-8, aby čeština přežila cestu přes npm do terminálu.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$dll = Get-ChildItem 'C:\Program Files\Microsoft SQL Server Management Studio*' -Recurse `
  -Filter 'Microsoft.SqlServer.TransactSql.ScriptDom.dll' -ErrorAction SilentlyContinue |
  Select-Object -First 1
if (-not $dll) {
  Write-Output 'ScriptDom nenalezen - potřebuje nainstalované SQL Server Management Studio.'
  exit 2
}

Add-Type -Path $dll.FullName
# 160 = gramatika SQL Serveru 2022; $true = QUOTED_IDENTIFIER ON jako v aplikaci.
$parser = New-Object Microsoft.SqlServer.TransactSql.ScriptDom.TSql160Parser($true)

if (-not $Soubory) {
  $Soubory = Get-ChildItem (Join-Path $PSScriptRoot '..\mssql') -Recurse -Filter '*.sql' |
    Sort-Object FullName | Select-Object -ExpandProperty FullName
}

$celkem = 0
foreach ($soubor in $Soubory) {
  $cesta = (Resolve-Path $soubor).Path
  $chyby = $null
  $reader = New-Object System.IO.StreamReader($cesta, [System.Text.Encoding]::UTF8)
  try { $null = $parser.Parse($reader, [ref]$chyby) } finally { $reader.Close() }
  $koren = (Get-Location).Path
  $relativni = if ($cesta.StartsWith($koren)) { $cesta.Substring($koren.Length).TrimStart('\') } else { $cesta }
  if ($chyby.Count -eq 0) {
    Write-Output ('  ok   ' + $relativni)
  } else {
    Write-Output ('  CHYBA ' + $relativni)
    foreach ($ch in $chyby) {
      Write-Output ('         řádek {0}, sloupec {1}: {2}' -f $ch.Line, $ch.Column, $ch.Message)
    }
    $celkem += $chyby.Count
  }
}

if ($celkem -gt 0) { Write-Output ("`nSyntaktických chyb: $celkem"); exit 1 }
Write-Output ("`nSyntaxe v pořádku ({0} souborů)." -f $Soubory.Count)
exit 0
