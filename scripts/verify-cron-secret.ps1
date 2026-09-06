<#
.SYNOPSIS
Verifies that the CRON_SECRET in Supabase Edge Functions matches the cron_secret in Database Vault.

.PARAMETER ProjectRef
The Supabase project ref. If not provided, it is read from .env or supabase/.env.

.PARAMETER AccessToken
A Supabase personal access token with secrets:read scope.
If not provided, the script will only check the Vault secret.

.EXAMPLE
.\scripts\verify-cron-secret.ps1
.\scripts\verify-cron-secret.ps1 -ProjectRef "iqlzdmjamsvxinqbrnix"
.\scripts\verify-cron-secret.ps1 -AccessToken "sbp_..."
#>

param(
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
    Write-Warning "Supabase CLI not found. Only Vault check will be performed."
}

Write-Host ""
Write-Host "Checking Vault secret..." -ForegroundColor Green

$vaultSql = "SELECT name, decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;"
$vaultResult = $null
if ($supabaseCli) {
    $vaultResult = & $supabaseCli @("db", "remote", "sql", $vaultSql, "--project-ref", $ProjectRef) 2>&1
}

if (-not $vaultResult -or $LASTEXITCODE -ne 0) {
    Write-Warning "Supabase CLI 'db remote sql' is not supported in this version."
    Write-Warning "Please check the Vault secret manually:"
    Write-Warning ""
    Write-Warning "  1. Open Supabase dashboard -> SQL Editor"
    Write-Warning "  2. Run: SELECT name, decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret';"
    Write-Warning "  3. Copy the decrypted_secret value for comparison"
    Write-Warning ""
    $vaultStatus = "UNKNOWN"
} else {
    $vaultSecret = $null
    if ($vaultResult -match "cron_secret\s+\|(.+)") {
        $vaultSecret = $matches[1].Trim()
    }

    if (-not $vaultSecret) {
        Write-Host "Vault secret 'cron_secret' is NOT SET." -ForegroundColor Red
        $vaultStatus = "MISSING"
    } else {
        Write-Host "Vault secret 'cron_secret' is SET." -ForegroundColor Green
        $vaultStatus = "SET"
    }
}

Write-Host ""
Write-Host "Checking Edge Function secret..." -ForegroundColor Green

$edgeSecret = $null
if ($AccessToken) {
    try {
        $headers = @{
            "Authorization" = "Bearer $AccessToken"
            "Content-Type" = "application/json"
        }
        $response = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ProjectRef/secrets" -Headers $headers -Method Get
        $secretObj = $response | Where-Object { $_.name -eq "CRON_SECRET" } | Select-Object -First 1
        if ($secretObj) {
            $edgeSecret = $secretObj.value
            Write-Host "Edge Function secret 'CRON_SECRET' is SET." -ForegroundColor Green
        } else {
            Write-Host "Edge Function secret 'CRON_SECRET' is NOT SET." -ForegroundColor Red
        }
    } catch {
        Write-Warning "Failed to read Edge Function secret via Management API: $_"
    }
} else {
    Write-Warning "No AccessToken provided. Skipping Edge Function secret check."
    Write-Warning "To check the Edge Function secret, run:"
    Write-Warning "  .\scripts\verify-cron-secret.ps1 -AccessToken 'your-pat-here'"
    Write-Warning ""
    Write-Warning "Alternatively, manually compare the Edge Function CRON_SECRET with the Vault value above."
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($vaultStatus -eq "UNKNOWN") {
    Write-Host "Partial check complete. Manual Vault check required." -ForegroundColor Yellow
    if ($edgeSecret) {
        Write-Host "Edge Function secret 'CRON_SECRET' is SET." -ForegroundColor Green
        Write-Host "Compare it manually with the Vault value from the dashboard." -ForegroundColor Yellow
    }
    exit 1
}

if ($vaultSecret -and $edgeSecret) {
    if ($vaultSecret -eq $edgeSecret) {
        Write-Host "MATCH: Vault and Edge Function secrets are identical." -ForegroundColor Green
        exit 0
    } else {
        Write-Host "MISMATCH: Vault and Edge Function secrets DO NOT match!" -ForegroundColor Red
        Write-Host "  Vault:      $vaultSecret"
        Write-Host "  Edge Func:  $edgeSecret"
        Write-Host ""
        Write-Host "Fix: Run .\scripts\setup-cron-secret.ps1 -AccessToken 'your-pat' to sync them." -ForegroundColor Yellow
        exit 1
    }
} elseif ($vaultStatus -eq "MISSING") {
    Write-Host "Vault secret is missing. Run setup-cron-secret.ps1 to create it." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "Partial check complete. Provide -AccessToken for a full comparison." -ForegroundColor Yellow
    exit 1
}
