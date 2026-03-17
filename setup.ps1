# Trova tutte le cartelle che contengono un package.json (escludendo node_modules esistenti)
$packageFolders = Get-ChildItem -Recurse -Filter "package.json" | 
                  Where-Object { $_.FullName -notmatch "node_modules" } | 
                  Select-Object -ExpandProperty DirectoryName

Write-Host "--- Inizio installazione dipendenze ---" -ForegroundColor Cyan

foreach ($folder in $packageFolders) {
    Write-Host "`nEntrando in: $folder" -ForegroundColor Yellow
    Push-Location $folder
    try {
        npm install --no-fund
        npm audit fix --no-fund
        if ($folder -match "linter-node") {
            Write-Host "Eseguendo build per linter-node..." -ForegroundColor Green
            npm run build
        }
    }
    catch {
        Write-Error "Errore in $folder"
    }
    Pop-Location
}

Write-Host "`n--- Operazione completata! ---" -ForegroundColor Cyan
