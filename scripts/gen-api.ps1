<#
.SYNOPSIS
    Regenerate the API contract: backend OpenAPI -> frontend/src/api/openapi.json -> schema.ts.
    Run after changing a backend request or response model; commit both generated files.
.EXAMPLE
    .\scripts\gen-api.ps1
#>
. "$PSScriptRoot\_common.ps1"

if (-not (Invoke-Step 'backend: export OpenAPI' $BackendDir { uv run python -m app.openapi_export })) { exit 1 }
if (-not (Invoke-Step 'frontend: gen:api' $FrontendDir { npm run --silent gen:api })) { exit 1 }
Write-Host 'Done. Commit frontend/src/api/openapi.json and frontend/src/api/schema.ts.' -ForegroundColor Green
