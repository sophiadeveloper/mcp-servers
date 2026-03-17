#!/bin/bash

# Trova tutte le cartelle con package.json, escludendo i node_modules
package_folders=$(find . -name "package.json" -not -path "*/node_modules/*" -exec dirname {} \;)

echo -e "\033[0;36m--- Inizio installazione dipendenze ---\033[0m"

for folder in $package_folders; do
    echo -e "\n\033[0;33mEntrando in: $folder\033[0m"
    cd "$folder" || continue
    
    npm install --no-fund
    npm audit fix
    
    if [[ "$folder" == *"linter-node"* ]]; then
        echo -e "\033[0;32mEseguendo build per linter-node...\033[0m"
        npm run build
    fi
    
    cd - > /dev/null
done

echo -e "\n\033[0;36m--- Operazione completata! ---\033[0m"
