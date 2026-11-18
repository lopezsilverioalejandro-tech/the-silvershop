$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ''
Write-Host '  THE SILVERSHOP' -ForegroundColor White
Write-Host '  -----------------------------' -ForegroundColor DarkGray
Write-Host ''

$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
    $candidates = @(
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'nodejs-portable\node.exe')
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { $nodePath = $candidate; break }
    }
}

if (-not $nodePath) {
    Write-Host '  Node.js no esta instalado.' -ForegroundColor Yellow
    Write-Host '  Instalalo con:  winget install OpenJS.NodeJS.LTS' -ForegroundColor Yellow
    Write-Host '  Luego vuelve a abrir este archivo.' -ForegroundColor Yellow
    Write-Host ''
    Read-Host '  Pulsa Enter para salir'
    exit 1
}

if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules'))) {
    Write-Host '  Instalando dependencias (solo la primera vez)...' -ForegroundColor Cyan
    $npmPath = Join-Path (Split-Path $nodePath) 'npm.cmd'
    & $npmPath install --no-fund --no-audit
    Write-Host ''
}

$env:NODE_ENV = 'development'

Start-Job -ScriptBlock {
    Start-Sleep -Seconds 2
    Start-Process 'http://localhost:3000'
} | Out-Null

Write-Host '  Abriendo la tienda en el navegador...' -ForegroundColor DarkGray
Write-Host '  Deja esta ventana abierta. Ctrl+C para detener.' -ForegroundColor DarkGray
Write-Host ''

& $nodePath server.js
