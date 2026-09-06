<#
.SYNOPSIS
Sets the CRON_SECRET for Supabase Edge Functions and the cron_secret in Database Vault to the same value.

.PARAMETER Secret
The secret value to use. If not provided, a cryptographically random 32-byte base64 secret is generated.

.PARAMETER ProjectRef
The Supabase project ref. If not provided, it is read from .env or supabase/.env.

.EXAMPLE
.\scripts\setup-cron-secret.ps1
.\scripts\setup-cron-secret.ps1 -Secret "my-custom-secret-here"
.\scripts\setup-cron-secret.ps1 -ProjectRef "iqlzdmjamsvxinqbrnix" -Secret "my-secret"
.\scripts\setup-cron-secret.ps1 -ProjectRef "iqlzdmjamsvxinqbrnix" -AccessToken "sbp_..."
#>

param(
    [Parameter(Mandatory = $false)]
    [string]$Secret,

    [Parameter(Mandatory = $false)]
    [string]$ProjectRef,

    [Parameter(Mandatory = $false)]
    [string]$AccessToken
)

$ErrorActionPreference = 'Stop'

function Find-ProjectRef {
    param([string[]]$Paths)
    foreach ($path in $Paths) {
        if (-not (Test-Path $path)) {
            continue
        }
        $content = Get-Content $path -Raw
        if ($content -match "SUPABASE_PROJECT_REF=(.+)") {
            return $matches[1].Trim('"').Trim("'")
        }
        if ($content -match "https://([^.]+)\.supabase\.co") {
            return $matches[1]
        }
    }
    return $null
}

function Find-SupabaseCli {
    $commands = @("supabase", "npx supabase", "pnpm supabase", "yarn supabase", "bunx supabase")
    foreach ($cmd in $commands) {
        try {
            $null = & $cmd --version 2>$null
            return $cmd
        } catch {
            continue
        }
    }
    return $null
}

if (-not $ProjectRef) {
    $envPaths = @(".env", "supabase/.env", "../.env", "../supabase/.env")
    $ProjectRef = Find-ProjectRef -Paths $envPaths
}

if (-not $ProjectRef) {
    Write-Error "Could not determine Supabase project ref. Pass it explicitly with -ProjectRef."
    exit 1
}

Write-Host "Supabase project ref: $ProjectRef" -ForegroundColor Cyan

$supabaseCli = Find-SupabaseCli
if (-not $supabaseCli) {
    Write-Error "Supabase CLI not found. Install it from https://supabase.com/docs/guides/cli or run 'npm install -g supabase'."
    exit 1
}

Write-Host "Using Supabase CLI: $supabaseCli" -ForegroundColor Cyan

if (-not $Secret) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $Secret = [Convert]::ToBase64String($bytes)
    Write-Host "Generated random secret" -ForegroundColor Yellow
} else {
    Write-Host "Using provided secret" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Setting CRON_SECRET for Edge Functions..." -ForegroundColor Green
$cliArgs = @("secrets", "set", "CRON_SECRET=$Secret", "--project-ref", $ProjectRef)
$setResult = & $supabaseCli @cliArgs 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to set Edge Function secret. Output: $setResult"
    exit 1
}
Write-Host "Edge Function secret set successfully" -ForegroundColor Green

Write-Host ""
Write-Host "Setting cron_secret in Database Vault..." -ForegroundColor Green

$escapedSecret = $Secret -replace "'", "''"
$sql = "SELECT vault.create_secret('cron_secret', '$escapedSecret');"

$vaultSet = $false

if ($AccessToken) {
    try {
        $headers = @{
            "Authorization" = "Bearer $AccessToken"
            "Content-Type" = "application/json"
            "Prefer" = "return=representation"
        }
        $body = @{
            query = $sql
        } | ConvertTo-Json -Compress
        $response = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ProjectRef/database/query" -Method Post -Headers $headers -Body $body
        if ($response -match "success" -or $response -match "cron_secret") {
            Write-Host "Vault secret set successfully via Management API" -ForegroundColor Green
            $vaultSet = $true
        }
    } catch {
        Write-Warning "Management API approach failed: $_"
    }
}

if (-not $vaultSet) {
    $psqlSource = $null
    $psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
    if ($psqlCmd) {
        $psqlSource = $psqlCmd.Source
    }
    $psqlPaths = @("psql")
    if ($psqlSource) {
        $psqlPaths += $psqlSource
    }
    $psqlFound = $false
    foreach ($psqlCmd in $psqlPaths) {
        if ($psqlCmd -and (Get-Command $psqlCmd -ErrorAction SilentlyContinue)) {
            $psqlFound = $true
            break
        }
    }

    if ($psqlFound) {
        $dbUrl = "postgresql://postgres:[YOUR_DB_PASSWORD]@db.$ProjectRef.supabase.co:5432/postgres"
        Write-Warning "To set the Vault secret via psql, run:"
        Write-Warning "  psql `"$dbUrl`" -c `"$sql`""
        Write-Warning ""
        Write-Warning "Alternatively, paste this SQL into the Supabase dashboard SQL editor:"
        Write-Warning "  $sql"
    } else {
        Write-Warning "Neither Management API (no token) nor psql is available."
        Write-Warning "Please set the Vault secret manually by running this SQL in the Supabase dashboard:"
        Write-Warning ""
        Write-Warning "  $sql"
        Write-Warning ""
        Write-Warning "Or use the Supabase Management API with an access token that has database permissions."
    }
}

if (-not $vaultSet) {
    Write-Host ""
    Write-Host "Vault secret was NOT set automatically. Please set it manually using one of the methods above." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Cron secret setup complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Project:        $ProjectRef"
    Write-Host "Edge Function:  CRON_SECRET"
    Write-Host "Vault:          cron_secret"
    Write-Host ""
    Write-Host "Both secrets are now set to the same value." -ForegroundColor Green
    Write-Host ""
}
