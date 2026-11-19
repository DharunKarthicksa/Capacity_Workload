<#
.SYNOPSIS
  Create the GitHub labels and one issue per task in the 5-phase delivery plan.

.DESCRIPTION
  Parses the plan markdown in the repo root, so the plan stays the single source of truth.
    - one issue per checklist task (plus the numbered first-screen tasks in 3.3)
    - one gate issue per phase
    - one tracking issue for the Phase 3 manual UI review loop
  Labels: phase-1..phase-5, you (manual), cc (Claude Code), ui-fix, blocked.
  Safe to re-run: existing issues are matched by exact title and skipped.
  Flags verified with `gh label create --help`, `gh issue create --help`, `gh issue list --help` (gh 2.105.0).

.PARAMETER DryRun
  Parse and print what would be created. Makes no GitHub calls and needs no sign-in.
#>
[CmdletBinding()]
param(
  [string]$Repo = 'DharunKarthicksa/Capacity_Workload',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$planFile = Get-ChildItem -LiteralPath $root -Filter 'Capacity Insights*plan.md' | Select-Object -First 1
if (-not $planFile) { throw "Plan markdown not found in $root" }
$lines = Get-Content -LiteralPath $planFile.FullName -Encoding UTF8

function Clean([string]$s) {
  $s = $s -replace '&#91;', '[' -replace '\\\]', ']' -replace '\\\[', '['
  return $s.Trim()
}

function AsciiTitle([string]$s) {
  # Double quotes break native argument passing in Windows PowerShell 5.1, so use single quotes.
  return ((($s -replace '[^\x20-\x7E]', '') -replace '"', "'") -replace '\s+', ' ').Trim()
}

function Summary([string]$text) {
  $first = ($text -split '(?<=\.)\s', 2)[0].TrimEnd('.')
  if ($first.Length -gt 90) {
    $cut = $first.Substring(0, 87)
    $space = $cut.LastIndexOf(' ')
    if ($space -gt 50) { $cut = $cut.Substring(0, $space) }
    $first = $cut.TrimEnd(',', ' ', ':', ';') + '...'
  }
  return $first
}

# ---- Parse the plan ----
$tasks = New-Object System.Collections.Generic.List[object]
$gates = @{}
$phase = 0; $secId = ''; $secTitle = ''; $counter = 0; $inGate = $false

foreach ($line in $lines) {
  if ($line -match '^## Phase (\d) ') { $phase = [int]$Matches[1]; $secId = ''; $secTitle = ''; $counter = 0; $inGate = $false; continue }
  if ($line -match '^## ') { $phase = 0; $inGate = $false; continue }
  if ($phase -eq 0) { continue }

  if ($line -match '^\*\*(\d)\.(\d) ([^*]+)\*\*') {
    $secId = "$($Matches[1]).$($Matches[2])"; $secTitle = $Matches[3].Trim(); $counter = 0; $inGate = $false; continue
  }
  if ($line -match '^\*\*\\\[GATE\\\]') { $inGate = $true; $gates[$phase] = New-Object System.Collections.Generic.List[string]; continue }
  if ($inGate) {
    if ($line -match '^- (.+)$') { $gates[$phase].Add((Clean $Matches[1])) }
    continue
  }

  $raw = $null
  if ($line -match '^- \[ \] (.+)$') { $raw = $Matches[1] }
  elseif ($secId -eq "$phase.3" -and $phase -eq 3 -and $line -match '^\d\. (&#91;.+)$') { $raw = $Matches[1] }
  if (-not $raw) { continue }

  $text = Clean $raw
  $owner = 'CC'
  if ($text -match '^\[(CC|YOU)\]\s*(.*)$') { $owner = $Matches[1]; $text = $Matches[2] }
  $counter++
  $tasks.Add([pscustomobject]@{
    Phase = $phase; SecId = $secId; SecTitle = $secTitle; Index = $counter
    Owner = $owner; Text = $text
  })
}

# ---- Build the issue list ----
$issues = New-Object System.Collections.Generic.List[object]
$srcNote = 'Source: the 5-phase delivery plan in the repo root. If the plan and this issue disagree, the plan wins; flag it here (CLAUDE.md rule 10).'

foreach ($t in $tasks) {
  $ownerLabel = if ($t.Owner -eq 'YOU') { 'you' } else { 'cc' }
  $title = AsciiTitle ("{0} [{1}] {2}" -f $t.SecId, $t.Owner, (Summary $t.Text))
  $body = New-Object System.Collections.Generic.List[string]
  $body.Add("**Plan task $($t.SecId) (Phase $($t.Phase): $($t.SecTitle))** | Owner: **$($t.Owner)**")
  $body.Add('')
  $body.Add($t.Text)
  $body.Add('')
  if ($t.Owner -eq 'YOU') {
    $body.Add('> Manual task. Claude Code must not attempt it through any API, script or browser automation (CLAUDE.md rule 2). It stops, prints the step and waits.')
    $body.Add('')
  }
  if ($t.SecId -eq '1.7') {
    $body.Add('> **Deferred** (decision 2026-11-19): no CU burn for now. Revisit before the Phase 2 anomaly test and the Phase 3 rebalancer test.')
    $body.Add('')
  }
  $body.Add('---')
  $body.Add($srcNote)
  $issues.Add([pscustomobject]@{
    Title = $title; Body = ($body -join "`n"); Labels = @("phase-$($t.Phase)", $ownerLabel)
  })
}

foreach ($p in ($gates.Keys | Sort-Object)) {
  $body = New-Object System.Collections.Generic.List[string]
  $body.Add("**Phase $p gate.** The next phase does not start until every line below is true and both of us have signed off.")
  $body.Add('')
  foreach ($g in $gates[$p]) { $body.Add("- [ ] $g") }
  $body.Add('')
  $body.Add('---')
  $body.Add($srcNote)
  $issues.Add([pscustomobject]@{
    Title = "Phase $p gate: exit checks"; Body = ($body -join "`n"); Labels = @("phase-$p")
  })
}

$uiBody = @(
  '**Tracking issue for the Phase 3 manual UI review loop (plan section 3.4).** Per CLAUDE.md rule 9, Claude Code comments here after every deploy with the app URL and what changed.',
  '',
  '1. [CC] After each `rayfin up`, post the app URL and what changed as a comment here.',
  '2. [YOU] Open the app against real data. File each fix as a GitHub issue labeled `ui-fix` with a screenshot, the screen, and expected versus actual.',
  '3. [CC] Work `ui-fix` issues in priority order, deploy, and comment on each issue with the change. Never close a `ui-fix` issue; you close it after you look.',
  '4. Repeat. UI changes are only made from `ui-fix` issues, so nothing changes on screen that was not asked for.',
  '',
  '---',
  $srcNote
) -join "`n"
$issues.Add([pscustomobject]@{ Title = '3.4 UI review loop (tracking)'; Body = $uiBody; Labels = @('phase-3') })

$labels = @(
  @{ n = 'phase-1'; c = 'BFD4F2'; d = 'Phase 1: prerequisites and foundation' },
  @{ n = 'phase-2'; c = '9ECAE1'; d = 'Phase 2: data plane in Fabric' },
  @{ n = 'phase-3'; c = '6BAED6'; d = 'Phase 3: Fabric App (Rayfin) in our tenant' },
  @{ n = 'phase-4'; c = '3182BD'; d = 'Phase 4: package as a workload and test' },
  @{ n = 'phase-5'; c = '08519C'; d = 'Phase 5: publish to the Workload Hub' },
  @{ n = 'ui-fix'; c = 'D93F0B'; d = 'UI change request; only the human closes these' },
  @{ n = 'you'; c = 'FBCA04'; d = 'Manual task for the human; Claude Code does not attempt it' },
  @{ n = 'cc'; c = '0E8A16'; d = 'Claude Code task' },
  @{ n = 'blocked'; c = 'B60205'; d = 'Waiting on something else' }
)

# ---- Report ----
Write-Host ("Parsed {0} issues from {1}" -f $issues.Count, $planFile.Name)
$issues | ForEach-Object { $_.Labels -join ',' } | Group-Object | Sort-Object Name |
  ForEach-Object { Write-Host ("  {0,-14} {1}" -f $_.Name, $_.Count) }

if ($DryRun) {
  Write-Host ''
  $issues | ForEach-Object { Write-Host ("[{0}] {1}" -f ($_.Labels -join ','), $_.Title) }
  Write-Host ''
  Write-Host 'Dry run only. No GitHub calls were made.'
  return
}

# ---- Create ----
gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'gh is not signed in. Run `gh auth login` in your own terminal first.' }

foreach ($l in $labels) {
  gh label create $l.n --color $l.c --description $l.d --force -R $Repo | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to create label $($l.n)" }
}
Write-Host "Labels ready: $($labels.Count)"

$existing = @(gh issue list -R $Repo --state all --limit 500 --json title -q '.[].title')
$utf8 = New-Object System.Text.UTF8Encoding($false)
$created = 0; $skipped = 0
foreach ($i in $issues) {
  if ($existing -contains $i.Title) { $skipped++; continue }
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("issue-" + [guid]::NewGuid().ToString('N') + '.md')
  [IO.File]::WriteAllText($tmp, $i.Body, $utf8)
  try {
    $url = gh issue create -R $Repo -t $i.Title -F $tmp -l ($i.Labels -join ',')
    if ($LASTEXITCODE -ne 0) { throw "Failed to create issue: $($i.Title)" }
    Write-Host $url
    $created++
  } finally { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Milliseconds 1000
}
Write-Host "Created $created issues, skipped $skipped existing."
