#!/bin/bash

# Trova tutte le cartelle con package.json, escludendo i node_modules
package_folders=$(find . -name "package.json" -not -path "*/node_modules/*" -exec dirname {} \;)

echo -e "\033[0;36m--- Aggiornamento npm all'ultima versione ---\033[0m"
npm install -g npm@latest --no-fund
npm -v

echo -e "\033[0;36m--- Verifica file .env ---\033[0m"
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo -e "\033[0;33mCreazione file .env da .env.example...\033[0m"
    cp .env.example .env
fi

echo -e "\n\033[0;36m--- Inizio installazione dipendenze ---\033[0m"

for folder in $package_folders; do
    echo -e "\n\033[0;33mEntrando in: $folder\033[0m"
    cd "$folder" || continue
    
    npm install --no-fund
    npm audit fix --no-fund
    
    # Esegui build se definito nel package.json
    if [ -f "package.json" ]; then
        if grep -q "\"build\":" "package.json"; then
            echo -e "\033[0;32mEseguendo build...\033[0m"
            npm run build
        fi
    fi
    
    cd - > /dev/null
done

echo -e "\n\033[0;36m--- Operazione completata! ---\033[0m"
