# One-time install for Windows (PowerShell):
# creates .env with generated secrets and starts the stack in Docker Desktop.
# Run from the project root:  .\scripts\install.ps1

$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker is missing. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
    exit 1
}

function New-HexSecret([int]$bytes) {
    $buffer = New-Object byte[] $bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($buffer); $rng.Dispose()
    ($buffer | ForEach-Object { $_.ToString("x2") }) -join ""
}

if (-not (Test-Path ".env")) {
    Write-Host "Creating .env with generated secrets..."
    $content = Get-Content ".env.example" -Raw
    Write-Host ""
    Write-Host "Choose where app data is stored (Postgres + media)."
    Write-Host "Warning: databases wear out SD cards - prefer a USB SSD path on a Pi."
    $dataDir = Read-Host "DATA_DIR [./data]"
    if ([string]::IsNullOrWhiteSpace($dataDir)) { $dataDir = "./data" }
    $content = $content -replace "(?m)^SECRET_KEY=$", ("SECRET_KEY=" + (New-HexSecret 32))
    $content = $content -replace "(?m)^POSTGRES_PASSWORD=$", ("POSTGRES_PASSWORD=" + (New-HexSecret 16))
    $content = $content -replace "(?m)^DATA_DIR=.*$", ("DATA_DIR=" + $dataDir)
    # LF + UTF-8 without BOM so docker compose reads the file correctly
    [System.IO.File]::WriteAllText((Join-Path (Get-Location) ".env"), $content)
    Write-Host "Done: .env created."
} else {
    Write-Host ".env already exists - keeping it."
}

Write-Host "Building and starting Smooth Family (the first build takes a few minutes)..."
docker compose up -d --build

$port = (Select-String -Path ".env" -Pattern "^PORT=(\d+)").Matches[0].Groups[1].Value
if (-not $port) { $port = "3000" }
Write-Host ""
Write-Host "Smooth Family is now running. Open http://localhost:$port and create your family."
