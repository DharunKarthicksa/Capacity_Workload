<#
.SYNOPSIS
  Run a KQL query (or management command) against ci-eventhouse and print the rows as JSON.

.EXAMPLE
  .\scripts\kql.ps1 'RawCapacityEvents | count'
  .\scripts\kql.ps1 '.show tables' -Mgmt

.NOTES
  Uses `az account get-access-token` (the user signs in with `az login`) and calls the database's
  REST endpoint. The token is held in memory only and never printed or written to disk.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory, Position = 0)][string]$Query,
  [string]$Cluster = 'https://trd-3p56kn96phc55ysd7n.z5.kusto.fabric.microsoft.com',
  [string]$Database = 'ci-eventhouse',
  [switch]$Mgmt
)
$ErrorActionPreference = 'Stop'
$token = az account get-access-token --resource $Cluster --query accessToken -o tsv
if (-not $token) { throw 'No token from az. Run `az login` in your own terminal.' }

$endpoint = if ($Mgmt) { "$Cluster/v1/rest/mgmt" } else { "$Cluster/v1/rest/query" }
$body = @{ db = $Database; csl = $Query } | ConvertTo-Json -Compress
try {
  $resp = Invoke-RestMethod -Method Post -Uri $endpoint -ContentType 'application/json; charset=utf-8' `
    -Headers @{ Authorization = "Bearer $token" } -Body ([Text.Encoding]::UTF8.GetBytes($body))
} catch {
  # Show the server's error text (a KQL syntax error, for example) instead of a bare 400.
  $detail = ''
  if ($_.Exception.Response) {
    $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    $detail = $sr.ReadToEnd()
  }
  throw "Kusto request failed: $($_.Exception.Message)`n$detail"
}

# v1 response: Tables[0] is the primary result.
$t = $resp.Tables[0]
$cols = $t.Columns | ForEach-Object { $_.ColumnName }
$rows = foreach ($r in $t.Rows) {
  $o = [ordered]@{}
  for ($i = 0; $i -lt $cols.Count; $i++) { $o[$cols[$i]] = $r[$i] }
  [pscustomobject]$o
}
$rows | ConvertTo-Json -Depth 8
