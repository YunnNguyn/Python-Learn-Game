# PHASE-08 / M10 full verification on the user's Windows machine (Windows PowerShell 5.1 compatible).
# ONE command from the repo root:
#   powershell -NoProfile -ExecutionPolicy Bypass -File '.\qa\m10-acceptance\run-m10-verification.ps1'
# Runs, in order: npm run typecheck, Vitest (strict: the NumPy / pandas / Matplotlib-in-Pyodide tests may not be skipped), npm run build,
# then the real-Edge browser acceptance (run-m10-acceptance.ps1).
# QA only: does NOT stage, commit, push, merge, deploy, edit source, or open an existing Edge profile.
# (npm run build writes the ignored dist/ folder; Vitest and Vite may write caches under node_modules.)
# Internet access to cdn.jsdelivr.net/pyodide/ is needed (the Pyodide interpreter and the NumPy, pandas and Matplotlib packages).
$ErrorActionPreference = 'Stop'
$passLabel = 'M10_VERIFICATION_PASS'; $failLabel = 'M10_VERIFICATION_FAILED'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = [System.IO.Path]::GetFullPath((Join-Path $here '..\..'))
$stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
$out = Join-Path (Join-Path $here 'reports') ("verification-" + $stamp)
New-Item -ItemType Directory -Force -Path $out | Out-Null
$steps = @()

function Run-Step([string]$name, [string]$command, [string[]]$arguments, [hashtable]$environment) {
    $log = Join-Path $out ($name + '.log')
    Write-Host "[m10-verify] $name ..." -ForegroundColor Cyan
    $saved = @{}
    foreach ($key in $environment.Keys) { $saved[$key] = [Environment]::GetEnvironmentVariable($key); [Environment]::SetEnvironmentVariable($key, $environment[$key]) }
    $started = Get-Date
    Push-Location $repo
    try {
        $previous = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
        & $command @arguments *>&1 | Tee-Object -FilePath $log | Out-Host
        $code = $LASTEXITCODE
        $ErrorActionPreference = $previous
    } finally {
        Pop-Location
        foreach ($key in $environment.Keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key]) }
    }
    $seconds = [int]((Get-Date) - $started).TotalSeconds
    $ok = ($code -eq 0)
    $script:steps += [pscustomobject]@{ name = $name; ok = $ok; exitCode = $code; seconds = $seconds; log = $log }
    $color = 'Red'; if ($ok) { $color = 'Green' }
    Write-Host ("[m10-verify] {0}: {1} (exit {2}, {3}s)" -f $name, $(if ($ok) { 'PASS' } else { 'FAIL' }), $code, $seconds) -ForegroundColor $color
    return $ok
}

function Finish() {
    $allOk = ($steps.Count -gt 0) -and (@($steps | Where-Object { -not $_.ok }).Count -eq 0)
    $label = $failLabel; if ($allOk) { $label = $passLabel }
    $summary = [pscustomobject]@{ label = $label; timestamp = (Get-Date).ToString('o'); steps = $steps }
    $summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $out 'verification-summary.json') -Encoding UTF8
    Write-Host ''
    foreach ($s in $steps) { $c = 'Red'; if ($s.ok) { $c = 'Green' }; Write-Host ("{0,-6} {1}" -f $(if ($s.ok) { 'PASS' } else { 'FAIL' }), $s.name) -ForegroundColor $c }
    Write-Host "Logs and summary: $out"
    try { Compress-Archive -Path (Join-Path $out '*') -DestinationPath ($out + '.zip') -Force; Write-Host "Evidence zip: $out.zip" } catch { Write-Host '(zip not created)' }
    $final = 'Red'; if ($allOk) { $final = 'Green' }
    Write-Host "`n$label" -ForegroundColor $final
    if ($allOk) { exit 0 }
    Write-Host 'Send the evidence zip(s) back for investigation (this folder plus the browser run folder printed above).'
    exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $repo '.git'))) { Write-Host "Not a Git repo: $repo" -ForegroundColor Red; Write-Host "`n$failLabel" -ForegroundColor Red; exit 2 }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Host 'Node.js missing.' -ForegroundColor Red; Write-Host "`n$failLabel" -ForegroundColor Red; exit 2 }
if (-not (Test-Path -LiteralPath (Join-Path $repo 'node_modules\vite\bin\vite.js'))) { Write-Host 'Repo dependencies missing (run npm ci).' -ForegroundColor Red; Write-Host "`n$failLabel" -ForegroundColor Red; exit 2 }

# Same baseline guard as the browser part (it re-checks it and stops the run if it fails).
Push-Location $repo
try {
    $branch = (& git branch --show-current).Trim(); $head = (& git rev-parse --short HEAD).Trim()
    $staged = @(& git diff --cached --name-only)
    Write-Host "[m10-verify] branch=$branch head=$head staged=$($staged.Count)"
} finally { Pop-Location }

[void](Run-Step 'typecheck' 'npm.cmd' @('run', 'typecheck') @{})
# PACK_VERIFY_STRICT=1: a Pyodide / NumPy / pandas / Matplotlib test that cannot run is a FAILURE here, never a skip.
[void](Run-Step 'vitest' 'npx.cmd' @('vitest', 'run') @{ PACK_VERIFY_STRICT = '1' })
[void](Run-Step 'build' 'npm.cmd' @('run', 'build') @{})

# Real Edge acceptance (its own PASS/FAILED label, report folder and zip).
$accept = Join-Path $here 'run-m10-acceptance.ps1'
Write-Host '[m10-verify] browser acceptance (real Edge) ...' -ForegroundColor Cyan
$started = Get-Date
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $accept *>&1 | Tee-Object -FilePath (Join-Path $out 'browser-acceptance.log') | Out-Host
$code = $LASTEXITCODE
$seconds = [int]((Get-Date) - $started).TotalSeconds
$steps += [pscustomobject]@{ name = 'browser-acceptance'; ok = ($code -eq 0); exitCode = $code; seconds = $seconds; log = (Join-Path $out 'browser-acceptance.log') }
Finish
