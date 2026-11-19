<#
.SYNOPSIS
  Build the KQL database definition from fabric/kql/0*.kql (in file order) and import it into
  ci-eventhouse.KQLDatabase in the Capacity Workload folder.

.DESCRIPTION
  Method: KQL database definition update (DatabaseSchema.kql) through the updateDefinition REST
  endpoint, called with `fab api -X post ... -i <body.json> --show_headers` (flags verified with
  `fab api --help`). The update replaces the database schema script, so keep every table and
  function in the numbered files. Never drops data: tables use .create-merge, functions use
  .create-or-alter. The server only allows a fixed set of commands in this script; a rejected
  command is reported with its line numbers.
#>
[CmdletBinding()]
param(
  [string]$WorkspaceId = '415f790e-a590-4b59-b30a-c3a70a48de1e',
  [string]$DatabaseId = '32dbe0c2-14e8-4199-8be2-f9e99ccdcfc1',   # ci-eventhouse.KQLDatabase
  [switch]$BuildOnly
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$kql = Join-Path $root 'fabric/kql'
$out = Join-Path $kql 'build/ci-eventhouse.KQLDatabase'

if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Recurse -Force }
New-Item -ItemType Directory -Force $out | Out-Null
Copy-Item -LiteralPath (Join-Path $kql 'definition/.platform') -Destination $out
Copy-Item -LiteralPath (Join-Path $kql 'definition/DatabaseProperties.json') -Destination $out

$sb = New-Object System.Text.StringBuilder
foreach ($f in (Get-ChildItem -LiteralPath $kql -Filter '0*.kql' | Sort-Object Name)) {
  [void]$sb.AppendLine("// ===== $($f.Name) =====")
  [void]$sb.AppendLine((Get-Content -LiteralPath $f.FullName -Raw -Encoding UTF8).TrimEnd())
  [void]$sb.AppendLine('')
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText((Join-Path $out 'DatabaseSchema.kql'), $sb.ToString(), $utf8)
Write-Host "Built $out"
if ($BuildOnly) { return }

# `fab import ... -f` answers "An item with the same name exists" for an existing KQL database
# (fab 1.8.0), so apply through the item's updateDefinition REST endpoint instead.
function B64([string]$name) { [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $out $name))) }
$parts = foreach ($n in 'DatabaseProperties.json', 'DatabaseSchema.kql', '.platform') {
  @{ path = $n; payload = (B64 $n); payloadType = 'InlineBase64' }
}
$body = @{ definition = @{ parts = @($parts) } } | ConvertTo-Json -Depth 6 -Compress
$bodyFile = Join-Path ([IO.Path]::GetTempPath()) ('kql-update-' + [guid]::NewGuid().ToString('N') + '.json')
[IO.File]::WriteAllText($bodyFile, $body, $utf8)
try {
  $resp = fab api -X post "workspaces/$WorkspaceId/kqlDatabases/$DatabaseId/updateDefinition" -i $bodyFile --show_headers | Out-String
} finally { Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue }
if ($resp -notmatch '"x-ms-operation-id":\s*"([0-9a-f-]+)"') { throw "No operation id returned:`n$resp" }
$op = $Matches[1]
Write-Host "Operation $op started"
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 8
  $status = (fab api "operations/$op" -q 'text.status' | Out-String).Trim()
  Write-Host "  status: $status"
  if ($status -eq 'Succeeded') { Write-Host 'KQL schema applied.'; return }
  if ($status -eq 'Failed') {
    fab api "operations/$op" -q 'text.error' | Out-String | Write-Host
    throw 'updateDefinition failed'
  }
}
throw "Timed out waiting for operation $op"
