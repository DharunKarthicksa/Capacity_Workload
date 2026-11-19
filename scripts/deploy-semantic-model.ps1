<#
.SYNOPSIS
  Generate fabric/semantic-model/ci-semantic-model.SemanticModel (TMDL, DirectQuery over the KQL database)
  and create or update the semantic model `ci-semantic-model` in the Capacity Workload folder.

.DESCRIPTION
  TMDL is generated from the table spec below so tab indentation is always right; the generated files
  are committed. Deploy uses the Fabric REST API through `fab api` (flags verified with `fab api --help`):
    create : POST workspaces/<ws>/semanticModels            (body has displayName, folderId, definition)
    update : POST workspaces/<ws>/semanticModels/<id>/updateDefinition
  Both can be long-running; the script polls operations/<id>.
  After the first deploy the data source credentials must be set once in the portal (OAuth2 / SSO).
#>
[CmdletBinding()]
param(
  [string]$WorkspaceId = '415f790e-a590-4b59-b30a-c3a70a48de1e',
  [string]$FolderId = 'b556fb13-1994-4e86-9efc-8039e4b6ed11',
  [string]$ModelName = 'ci-semantic-model',
  [string]$Cluster = 'https://trd-3p56kn96phc55ysd7n.z5.kusto.fabric.microsoft.com',
  [string]$Database = 'ci-eventhouse',
  [switch]$BuildOnly
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'fabric/semantic-model/ci-semantic-model.SemanticModel'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$TAB = "`t"

# --- table spec: name, source (KQL table or materialized view), columns (name:type), measures ---
$tables = @(
  @{ name = 'CapacitySummary'; cols = @(
      'Timestamp:dateTime', 'CapacityId:string', 'CapacityName:string', 'CuPercent:double',
      'InteractivePercent:double', 'BackgroundPercent:double', 'AnomalyScore:double', 'Sku:string',
      'Region:string', 'BaseCapacityUnits:double', 'WindowSeconds:double', 'OverageCuMs:double',
      'InteractiveDelayThresholdPercent:double', 'InteractiveRejectionThresholdPercent:double',
      'BackgroundRejectionThresholdPercent:double')
     measures = @(
      @{ n = 'Latest CU %'; e = 'VAR t = MAX(CapacitySummary[Timestamp]) RETURN CALCULATE(MAX(CapacitySummary[CuPercent]), CapacitySummary[Timestamp] = t)'; f = '0.00' },
      @{ n = 'Avg CU %'; e = 'AVERAGE(CapacitySummary[CuPercent])'; f = '0.00' },
      @{ n = 'Peak CU %'; e = 'MAX(CapacitySummary[CuPercent])'; f = '0.00' },
      @{ n = 'Max Anomaly Score'; e = 'MAX(CapacitySummary[AnomalyScore])'; f = '0.00' },
      @{ n = 'Anomaly Count'; e = 'COUNTROWS(FILTER(CapacitySummary, CapacitySummary[AnomalyScore] > 3))'; f = '0' }) },
  @{ name = 'CapacityHourly'; cols = @(
      'CapacityId:string', 'Hour:dateTime', 'CuAvg:double', 'CuMax:double', 'InteractiveAvg:double', 'BackgroundAvg:double',
      'DelayWindowMax:double', 'RejectionWindowMax:double', 'BackgroundRejectionWindowMax:double', 'AnomalyMax:double',
      'Samples:int64'); measures = @() },
  @{ name = 'CapacityState'; cols = @(
      'Timestamp:dateTime', 'CapacityId:string', 'CapacityName:string', 'State:string',
      'InteractiveDelayThresholdPercent:double', 'InteractiveRejectThresholdPercent:double',
      'BackgroundRejectThresholdPercent:double'); measures = @() },
  @{ name = 'CapacityOperation'; cols = @(
      'Timestamp:dateTime', 'CapacityId:string', 'WorkspaceId:string', 'WorkspaceName:string', 'ItemId:string',
      'ItemName:string', 'ItemKind:string', 'OperationName:string', 'OperationType:string', 'CuSeconds:double',
      'DurationSeconds:double', 'Status:string', 'UserPrincipal:string')
     measures = @( @{ n = 'CU Seconds'; e = 'SUM(CapacityOperation[CuSeconds])'; f = '#,0.0' }) },
  @{ name = 'CuByWorkspaceHourly'; cols = @(
      'CapacityId:string', 'WorkspaceId:string', 'Hour:dateTime', 'CuSeconds:double', 'Operations:int64', 'PeakOpCu:double')
     measures = @( @{ n = 'Workspace CU Seconds'; e = 'SUM(CuByWorkspaceHourly[CuSeconds])'; f = '#,0.0' }) },
  @{ name = 'BpaFindings'; cols = @(
      'ScannedAt:dateTime', 'WorkspaceId:string', 'WorkspaceName:string', 'ModelId:string', 'ModelName:string',
      'Rule:string', 'Category:string', 'Severity:string', 'Description:string')
     measures = @( @{ n = 'BPA Findings'; e = 'COUNTROWS(BpaFindings)'; f = '0' }) }
)

if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Recurse -Force }
New-Item -ItemType Directory -Force (Join-Path $out 'definition/tables') | Out-Null
function Put([string]$rel, [string]$text) { [IO.File]::WriteAllText((Join-Path $out $rel), $text, $utf8) }

Put 'definition.pbism' ('{' + "`n" + '  "version": "4.2",' + "`n" + '  "settings": {}' + "`n" + '}' + "`n")
Put 'definition/database.tmdl' ("database`n${TAB}compatibilityLevel: 1604`n")

$model = New-Object System.Text.StringBuilder
[void]$model.AppendLine('model Model')
[void]$model.AppendLine("${TAB}culture: en-US")
[void]$model.AppendLine("${TAB}defaultPowerBIDataSourceVersion: powerBI_V3")
[void]$model.AppendLine("${TAB}discourageImplicitMeasures")
[void]$model.AppendLine('')
foreach ($t in $tables) { [void]$model.AppendLine("ref table $($t.name)") }
Put 'definition/model.tmdl' $model.ToString()

foreach ($t in $tables) {
  $s = New-Object System.Text.StringBuilder
  [void]$s.AppendLine("table $($t.name)")
  foreach ($m in $t.measures) {
    [void]$s.AppendLine("${TAB}measure '$($m.n)' = $($m.e)")
    [void]$s.AppendLine("${TAB}${TAB}formatString: $($m.f)")
  }
  [void]$s.AppendLine('')
  foreach ($c in $t.cols) {
    $n, $ty = $c.Split(':')
    $sum = if ($ty -eq 'double' -or $ty -eq 'int64') { 'sum' } else { 'none' }
    [void]$s.AppendLine("${TAB}column $n")
    [void]$s.AppendLine("${TAB}${TAB}dataType: $ty")
    [void]$s.AppendLine("${TAB}${TAB}sourceColumn: $n")
    [void]$s.AppendLine("${TAB}${TAB}summarizeBy: $sum")
    [void]$s.AppendLine('')
  }
  [void]$s.AppendLine("${TAB}partition $($t.name) = m")
  [void]$s.AppendLine("${TAB}${TAB}mode: directQuery")
  [void]$s.AppendLine("${TAB}${TAB}source =")
  [void]$s.AppendLine("${TAB}${TAB}${TAB}let")
  [void]$s.AppendLine("${TAB}${TAB}${TAB}${TAB}Source = AzureDataExplorer.Contents(`"$Cluster`", `"$Database`", `"$($t.name)`", [MaxRows=null, MaxSize=null, NoTruncate=null, AdditionalSetStatements=null])")
  [void]$s.AppendLine("${TAB}${TAB}${TAB}in")
  [void]$s.AppendLine("${TAB}${TAB}${TAB}${TAB}Source")
  Put "definition/tables/$($t.name).tmdl" $s.ToString()
}
Write-Host "Generated $out"
if ($BuildOnly) { return }

# --- deploy ---
$parts = foreach ($f in (Get-ChildItem -LiteralPath $out -Recurse -File)) {
  $rel = $f.FullName.Substring($out.Length + 1).Replace('\', '/')
  @{ path = $rel; payload = [Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName)); payloadType = 'InlineBase64' }
}
$def = @{ parts = @($parts) }

function Invoke-Lro([string]$resp) {
  if ($resp -match '"x-ms-operation-id":\s*"([0-9a-f-]+)"') {
    $op = $Matches[1]
    for ($i = 0; $i -lt 40; $i++) {
      Start-Sleep -Seconds 5
      $st = (fab api "operations/$op" -q 'text.status' | Out-String).Trim()
      Write-Host "  status: $st"
      if ($st -eq 'Succeeded') { return }
      if ($st -eq 'Failed') { fab api "operations/$op" -q 'text.error' | Out-String | Write-Host; throw 'operation failed' }
    }
    throw "Timed out on operation $op"
  }
  if ($resp -notmatch '"status_code":\s*(200|201)') { throw "Unexpected response:`n$resp" }
}

$existing = fab api "workspaces/$WorkspaceId/semanticModels" -q 'text.value[].{n:displayName,i:id}' | Out-String | ConvertFrom-Json
$id = ($existing | Where-Object { $_.n -eq $ModelName } | Select-Object -First 1).i
$bodyFile = Join-Path ([IO.Path]::GetTempPath()) ('sm-' + [guid]::NewGuid().ToString('N') + '.json')
try {
  if ($id) {
    Write-Host "Updating $ModelName ($id)"
    [IO.File]::WriteAllText($bodyFile, (@{ definition = $def } | ConvertTo-Json -Depth 8 -Compress), $utf8)
    Invoke-Lro (fab api -X post "workspaces/$WorkspaceId/semanticModels/$id/updateDefinition" -i $bodyFile --show_headers | Out-String)
  } else {
    Write-Host "Creating $ModelName in folder $FolderId"
    [IO.File]::WriteAllText($bodyFile, (@{ displayName = $ModelName; folderId = $FolderId; definition = $def } | ConvertTo-Json -Depth 8 -Compress), $utf8)
    Invoke-Lro (fab api -X post "workspaces/$WorkspaceId/semanticModels" -i $bodyFile --show_headers | Out-String)
  }
} finally { Remove-Item -LiteralPath $bodyFile -Force -ErrorAction SilentlyContinue }
Write-Host 'Semantic model deployed.'
