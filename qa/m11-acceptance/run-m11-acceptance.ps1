# PHASE-09 / M11 automated browser acceptance (Windows PowerShell 5.1 compatible).
# Browser part only:  powershell -NoProfile -ExecutionPolicy Bypass -File '.\qa\m11-acceptance\run-m11-acceptance.ps1'
# Everything (typecheck, Vitest, build, then this):  ...\run-m11-verification.ps1
# QA only: does NOT stage, commit, push, merge, deploy, edit source, or open an existing Edge profile.
$ErrorActionPreference = 'Stop'
$passLabel = 'M11_BROWSER_ACCEPTANCE_PASS'; $failLabel = 'M11_BROWSER_ACCEPTANCE_FAILED'; $ids = @('A','B','C','D','E','F','G','H','I','J','K')
$expectedHead = '08fee96'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = [System.IO.Path]::GetFullPath((Join-Path $here '..\..'))
function Fail([string]$message) {
    Write-Host "[m11-qa] $message" -ForegroundColor Red
    Write-Host "`n$failLabel" -ForegroundColor Red
    exit 2
}

# ---- 1. environment and baseline --------------------------------------------------------------
if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) { Fail "Not a Git repo: $repo" }
Push-Location $repo
try {
    $branch = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or $branch -ne 'develop') { Fail "Wrong branch: '$branch' (expected develop)" }
    $head = (& git rev-parse --short HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $head -ne $expectedHead) { Fail "Wrong baseline HEAD: $head (expected $expectedHead, the committed M10)" }
    $staged = @(& git diff --cached --name-only)
    if ($LASTEXITCODE -ne 0 -or $staged.Count -gt 0) { Fail 'Unexpected staged changes (this run never stages anything).' }
    # M11 is uncommitted on top of the baseline: its files must be in the working tree.
    $required = @(
        'src/content/python-foundations/content.ts',
        'src/content/python-foundations/content-m9.ts',
        'src/content/python-foundations/content-m10.ts',
        'src/content/python-foundations/content-m11.ts',
        'src/content/python-foundations/generators-m11.ts',
        'src/content/python-foundations/hints-m11.ts',
        'src/app/course-graduation.ts',
        'src/app/course-review.ts',
        'src/features/course/CourseCompletionSummary.tsx',
        'src/features/course/CourseReviewPanel.tsx',
        'src/core/grading/function-cases.ts',
        'src/core/runtime/pyodide/function-probe-helper.ts',
        'src/core/runtime/pyodide/workspace-preview.ts',
        'src/app/learning-path.ts',
        'qa/m11-acceptance/fixtures/solutions.json'
    )
    foreach ($file in $required) {
        if (-not (Test-Path -LiteralPath (Join-Path $repo $file))) { Fail "M11 is not applied to this working tree; missing: $file" }
    }
    $status = @(& git status --short)
    Write-Host "[m11-qa] branch=$branch head=$head; working tree entries: $($status.Count)"
} finally { Pop-Location }

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js missing.' }
if (-not (Test-Path -LiteralPath (Join-Path $repo 'node_modules\vite\bin\vite.js'))) { Fail 'Repo dependencies missing (run npm ci).' }

Push-Location $here
try {
    & node --check '.\runner.mjs'
    if ($LASTEXITCODE -ne 0) { Fail 'runner.mjs syntax check failed.' }
    & node --check '.\scenarios.mjs'
    if ($LASTEXITCODE -ne 0) { Fail 'scenarios.mjs syntax check failed.' }

    # playwright-core is reused from an earlier QA folder when present; otherwise installed here (no browser download).
    $haveLocal = Test-Path -LiteralPath (Join-Path $here 'node_modules\playwright-core')
    $haveM10 = Test-Path -LiteralPath (Join-Path $here '..\m10-acceptance\node_modules\playwright-core')
    $haveM9 = Test-Path -LiteralPath (Join-Path $here '..\m9-acceptance\node_modules\playwright-core')
    $haveM8 = Test-Path -LiteralPath (Join-Path $here '..\m8-acceptance\node_modules\playwright-core')
    $haveM7 = Test-Path -LiteralPath (Join-Path $here '..\m7-acceptance\node_modules\playwright-core')
    $haveM70 = Test-Path -LiteralPath (Join-Path $here '..\m70-smoke\node_modules\playwright-core')
    $haveM3 = Test-Path -LiteralPath (Join-Path $here '..\m3-acceptance\node_modules\playwright-core')
    if (-not ($haveLocal -or $haveM10 -or $haveM9 -or $haveM8 -or $haveM7 -or $haveM70 -or $haveM3)) {
        Write-Host '[m11-qa] Installing playwright-core into the QA-only folder (no browser download)...'
        $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
        & npm.cmd install --no-audit --no-fund --no-package-lock
        if ($LASTEXITCODE -ne 0) { Fail 'QA playwright-core install failed.' }
    }

    # ---- 2-7. server, browser, scenarios, evidence, shutdown, report (all inside the runner) --------
    $env:QA_REPO_ROOT = $repo
    # A stale LATEST.txt from an earlier run must never be mistaken for this run's report.
    $staleLatest = Join-Path (Join-Path $here 'reports') 'LATEST.txt'
    if (Test-Path -LiteralPath $staleLatest) { Remove-Item -LiteralPath $staleLatest -Force }
    $global:LASTEXITCODE = $null
    & node '.\runner.mjs'
    $exitCode = $global:LASTEXITCODE

    $reportDir = Join-Path $here 'reports'
    $latestFile = Join-Path $reportDir 'LATEST.txt'
    if (-not (Test-Path -LiteralPath $latestFile)) { Fail "No report was produced (runner exit: $exitCode)." }
    $latest = (Get-Content -LiteralPath $latestFile -Raw).Trim()
    $reportJson = Join-Path $latest 'report.json'
    $reportMd = Join-Path $latest 'report.md'
    if (-not (Test-Path -LiteralPath $reportJson)) { Fail "No report.json in $latest" }
    $report = Get-Content -LiteralPath $reportJson -Raw | ConvertFrom-Json

    # A zip is the easiest thing to hand back when something failed.
    $zip = "$latest.zip"
    try { Compress-Archive -Path (Join-Path $latest '*') -DestinationPath $zip -Force } catch { $zip = '(zip not created)' }

    $okScenarios = $true
    foreach ($id in $ids) {
        $scenario = @($report.results | Where-Object { $_.id -eq $id })
        if ($scenario.Count -ne 1 -or $scenario[0].status -ne 'PASS') { $okScenarios = $false }
    }
    $pass = ($exitCode -eq 0) -and ($report.label -eq $passLabel) -and $okScenarios -and ($report.browserInfo.name -eq 'Microsoft Edge')

    Write-Host ''
    foreach ($r in $report.results) {
        $color = 'Red'; if ($r.status -eq 'PASS') { $color = 'Green' }
        Write-Host ("{0,-6} {1}. {2}" -f $r.status, $r.id, $r.title) -ForegroundColor $color
        foreach ($c in @($r.checks | Where-Object { -not $_.ok })) { Write-Host ("       FAILED CHECK: {0} {1}" -f $c.name, $c.detail) -ForegroundColor Red }
        if ($r.error) { Write-Host ("       ERROR: {0}" -f (($r.error -split "`n")[0])) -ForegroundColor Red }
    }
    Write-Host ''
    Write-Host "Report:      $reportMd"
    Write-Host "Evidence zip: $zip"
    if ($pass) {
        Write-Host "`n$passLabel" -ForegroundColor Green
        exit 0
    }
    Write-Host "`n$failLabel" -ForegroundColor Red
    Write-Host 'Send the evidence zip (or report.md and report.json) back for investigation.'
    exit 1
} finally { Pop-Location }
