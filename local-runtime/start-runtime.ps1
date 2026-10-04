$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (Get-Command py -ErrorAction SilentlyContinue) {
    py -3 -m python_learn_runtime @args
} else {
    python -m python_learn_runtime @args
}
