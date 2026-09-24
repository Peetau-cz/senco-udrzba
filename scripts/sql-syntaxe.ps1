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
# 130 = gramatika SQL Serveru 2016, na kterém SENS-SQL běží.
# $true = QUOTED_IDENTIFIER ON jako v aplikaci.
$parser = New-Object Microsoft.SqlServer.TransactSql.ScriptDom.TSql130Parser($true)

# Gramatika 130 bere volání funkce jako obecný identifikátor, takže funkce
# z novějších verzí propustí (string_agg prošel). Hlídají se proto zvlášť,
# nad tokeny - komentáře a řetězce se nepočítají.
$novejsiFunkce = @('STRING_AGG', 'TRIM', 'CONCAT_WS', 'TRANSLATE', 'GREATEST', 'LEAST',
  'APPROX_COUNT_DISTINCT', 'GENERATE_SERIES', 'DATE_BUCKET', 'DATETRUNC', 'JSON_OBJECT',
  'JSON_ARRAY', 'JSON_PATH_EXISTS')

if (-not $Soubory) {
  $Soubory = Get-ChildItem (Join-Path $PSScriptRoot '..\mssql') -Recurse -Filter '*.sql' |
    Sort-Object FullName | Select-Object -ExpandProperty FullName
}

$celkem = 0
foreach ($soubor in $Soubory) {
  $cesta = (Resolve-Path $soubor).Path
  $chyby = $null
  $reader = New-Object System.IO.StreamReader($cesta, [System.Text.Encoding]::UTF8)
  try { $strom = $parser.Parse($reader, [ref]$chyby) } finally { $reader.Close() }
  $hlaseni = @($chyby | ForEach-Object {
      'řádek {0}, sloupec {1}: {2}' -f $_.Line, $_.Column, $_.Message
    })
  if ($strom) {
    $tokeny = $strom.ScriptTokenStream
    for ($i = 0; $i -lt $tokeny.Count; $i++) {
      $t = $tokeny[$i]
      if ($t.TokenType -ne 'Identifier' -or $novejsiFunkce -notcontains $t.Text.ToUpper()) { continue }
      # Jen volání: za jménem (přes mezery) následuje závorka.
      $j = $i + 1
      while ($j -lt $tokeny.Count -and $tokeny[$j].TokenType -eq 'WhiteSpace') { $j++ }
      if ($j -lt $tokeny.Count -and $tokeny[$j].TokenType -eq 'LeftParenthesis') {
        $hlaseni += 'řádek {0}, sloupec {1}: {2}() SQL Server 2016 nemá' -f $t.Line, $t.Column, $t.Text
      }
    }
  }
  $koren = (Get-Location).Path
  $relativni = if ($cesta.StartsWith($koren)) { $cesta.Substring($koren.Length).TrimStart('\') } else { $cesta }
  if ($hlaseni.Count -eq 0) {
    Write-Output ('  ok   ' + $relativni)
  } else {
    Write-Output ('  CHYBA ' + $relativni)
    foreach ($h in $hlaseni) { Write-Output ('         ' + $h) }
    $celkem += $hlaseni.Count
  }
}

if ($celkem -gt 0) { Write-Output ("`nSyntaktických chyb: $celkem"); exit 1 }
Write-Output ("`nSyntaxe v pořádku ({0} souborů)." -f $Soubory.Count)
exit 0
