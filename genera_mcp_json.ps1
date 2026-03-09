# Script di generazione file locale MCP per Gemini CLI
# Compatibile PS 5.1+ (Gestione UTF-8 no BOM inclusa)

function Resolve-PathOrPrompt {
    param (
        [string]$PathName,
        [string]$AutoPath,
        [string]$PromptText
    )
    
    $resolvedPath = $AutoPath
    
    # Cicla finché il percorso è vuoto o non esiste
    while ([string]::IsNullOrWhiteSpace($resolvedPath) -or -not (Test-Path $resolvedPath)) {
        Write-Warning "Impossibile trovare in automatico: $PathName"
        $inputPath = Read-Host "> $PromptText"
        
        if (Test-Path $inputPath) {
            $resolvedPath = $inputPath
        } else {
            Write-Warning "Percorso non valido o inesistente. Riprova."
            $resolvedPath = "" # Resetta per forzare il ciclo
        }
    }
    
    Write-Host "Trovato ${PathName}: $resolvedPath" -ForegroundColor Cyan
    return $resolvedPath
}

Write-Host "--- Ricerca dei percorsi di base ---"
$nodePath = Resolve-PathOrPrompt -PathName "Node.js" -AutoPath (Get-Command node -ErrorAction SilentlyContinue).Source -PromptText "Inserisci il percorso assoluto di node.exe (es. C:\Program Files\nodejs\node.exe)"
$rootDir = Resolve-PathOrPrompt -PathName "Directory Server MCP" -AutoPath (Get-Location).Path -PromptText "Inserisci il percorso della cartella che contiene i tuoi server (es. D:\mcp-servers)"

Write-Host "`n--- Ricerca delle dipendenze per i server specifici ---"

# 1. Ricerca Dinamica Git
$gitExe = Get-Command git -ErrorAction SilentlyContinue
$gitAuto = if ($gitExe) { Split-Path $gitExe.Source } else { "C:\Program Files\Git\cmd" }
$gitCmdPath = Resolve-PathOrPrompt -PathName "Git CMD" -AutoPath $gitAuto -PromptText "Inserisci il percorso della cartella 'cmd' di Git"

# 2. Ricerca CFLint (Percorso custom, manteniamo il default statico)
$cfLintPath = Resolve-PathOrPrompt -PathName "CFLint JAR" -AutoPath "C:\tesisquare\cflint\CFLint-1.5.0-all.jar" -PromptText "Inserisci il file .jar di CFLint"

# 3. Ricerca Dinamica Java
$javaExe = Get-Command java -ErrorAction SilentlyContinue
$javaAuto = if ($javaExe) { $javaExe.Source } else { "D:\programmi\ColdFusion2023\jre\bin\java.exe" }
$javaPath = Resolve-PathOrPrompt -PathName "Java BIN" -AutoPath $javaAuto -PromptText "Inserisci il file java.exe"

# Imposta il salvataggio nella cartella locale
$settingsPath = Join-Path $rootDir "settings.json"

Write-Host "`nGenerazione del file di configurazione locale: $settingsPath"
Write-Host "-------------------------------------------"

# Inizializza o carica il file locale se esiste già
$settings = $null
if (Test-Path $settingsPath) {
    $rawContent = Get-Content $settingsPath -Raw
    if (-not [string]::IsNullOrWhiteSpace($rawContent)) {
        try {
            $settings = ConvertFrom-Json -InputObject $rawContent
        } catch {
            Write-Warning "Il file locale settings.json non contiene un JSON valido. Verrà ricreato."
        }
    }
}

if ($null -eq $settings) {
    $settings = New-Object PSObject
}

if (-not (Get-Member -InputObject $settings -Name "mcpServers" -ErrorAction SilentlyContinue)) {
    $settings | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value (New-Object PSObject)
}

# Definizione dei server
$servers = @(
    @{ name = "cf-mcp-server"; dir = "cf-node"; args = @("index.js") },
    @{ name = "docs-mcp-server"; dir = "docs-node"; args = @("index.js") },
    @{ name = "git-mcp-server"; dir = "git-node"; args = @("index.js"); env = @("PATH=$gitCmdPath;${env:PATH}") },
    @{ name = "linter-mcp-server"; dir = "linter-node"; command = "$nodePath"; args = @("$rootDir\linter-node\node_modules\tsx\dist\cli.mjs", "$rootDir\linter-node\src\index.ts"); env = @("CFLINT_JAR=$cfLintPath", "JAVA_BIN=$javaPath") },
    @{ name = "mantis-mcp-server"; dir = "mantis-node"; args = @("index.js") },
    @{ name = "playwright-mcp-server"; dir = "playwright-node"; args = @("index.js"); env = @("ALLOWED_URLS=*", "BLOCK_MEDIA=false") },
    @{ name = "sql-mcp-server"; dir = "sql-node"; args = @("index.js") }
)

# Popola l'oggetto mcpServers
foreach ($server in $servers) {
    $serverName = $server.name
    $serverDir = Join-Path $rootDir $server.dir
    
    $serverConfig = New-Object PSObject

    $cmd = if ($server.command) { $server.command } else { $nodePath }
    $serverConfig | Add-Member -MemberType NoteProperty -Name "command" -Value $cmd

    $fullArgs = @()
    if ($server.args) {
        foreach ($arg in $server.args) {
            if ($arg -match "index\.js$") {
                $fullArgs += Join-Path $serverDir $arg
            } else {
                $fullArgs += $arg
            }
        }
    }
    $serverConfig | Add-Member -MemberType NoteProperty -Name "args" -Value $fullArgs

    if ($server.env) {
        $envObj = New-Object PSObject
        foreach ($e in $server.env) {
            $split = $e.Split('=', 2)
            if ($split.Length -eq 2) {
                $envObj | Add-Member -MemberType NoteProperty -Name $split[0] -Value $split[1]
            }
        }
        $serverConfig | Add-Member -MemberType NoteProperty -Name "env" -Value $envObj
    }

    if (Get-Member -InputObject $settings.mcpServers -Name $serverName -ErrorAction SilentlyContinue) {
        $settings.mcpServers.$serverName = $serverConfig
    } else {
        $settings.mcpServers | Add-Member -MemberType NoteProperty -Name $serverName -Value $serverConfig
    }
    
    Write-Host "Generato nodo: $serverName" -ForegroundColor Cyan
}

# Salva il file JSON in modo esplicito (UTF-8 SENZA BOM)
$jsonOutput = ConvertTo-Json -InputObject $settings -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($settingsPath, $jsonOutput, $utf8NoBom)

Write-Host "-------------------------------------------"
Write-Host "File generato con successo in: $settingsPath" -ForegroundColor Green