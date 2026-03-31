# Trova tutte le cartelle che contengono un package.json (escludendo node_modules esistenti)
$packageFolders = Get-ChildItem -Recurse -Filter "package.json" | 
                  Where-Object { $_.FullName -notmatch "node_modules" } | 
                  Select-Object -ExpandProperty DirectoryName

Write-Host "--- Aggiornamento npm all'ultima versione ---" -ForegroundColor Cyan
npm install -g npm@latest --no-fund
npm -v

Write-Host "`n--- Inizio installazione dipendenze ---" -ForegroundColor Cyan

foreach ($folder in $packageFolders) {
    Write-Host "`nEntrando in: $folder" -ForegroundColor Yellow
    Push-Location $folder
    try {
        npm install --no-fund
        npm audit fix --no-fund
        
        # Esegui build se definito nel package.json
        $packageJson = Get-Content "package.json" | ConvertFrom-Json
        if ($packageJson.scripts.build) {
            Write-Host "Eseguendo build per $($packageJson.name)..." -ForegroundColor Green
            npm run build
        }
    }
    catch {
        Write-Error "Errore in $folder"
    }
    Pop-Location
}

Write-Host "`n--- Operazione completata! ---" -ForegroundColor Cyan
