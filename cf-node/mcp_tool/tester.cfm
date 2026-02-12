<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <title>MCP Bridge Tester v2</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; background: #f0f2f5; color: #333; }
        .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        h2 { margin-top: 0; color: #007bff; border-bottom: 2px solid #eee; padding-bottom: 1rem; }

        .form-group { margin-bottom: 1rem; }
        label { display: block; margin-bottom: 0.5rem; font-weight: 600; color: #555; }
        input, select, textarea { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 1rem; transition: border-color 0.2s; }
        input:focus, select:focus, textarea:focus { border-color: #007bff; outline: none; }

        .row { display: flex; gap: 1rem; }
        .col { flex: 1; }

        button { background: #007bff; color: white; border: none; padding: 0.75rem 1.5rem; margin-top: 1rem; border-radius: 6px; cursor: pointer; font-size: 1rem; font-weight: bold; transition: background 0.2s; }
        button:hover { background: #0056b3; }

        #responseArea { background: #282a36; color: #f8f8f2; padding: 1.5rem; border-radius: 8px; overflow-x: auto; min-height: 150px; font-family: 'Consolas', 'Monaco', monospace; font-size: 0.9rem; line-height: 1.4; border: 1px solid #444; margin-top: 2rem; }

        .hidden { display: none; }
        .hint { font-size: 0.85rem; color: #888; margin-top: 0.25rem; display: block; }

        .badge { display: inline-block; padding: 0.25em 0.5em; font-size: 75%; font-weight: 700; line-height: 1; text-align: center; white-space: nowrap; vertical-align: baseline; border-radius: 0.25rem; background-color: #e9ecef; color: #495057; margin-bottom: 1rem; }
    </style>
</head>
<body>

<div class="card">
    <h2>🛠️ ColdFusion MCP Console</h2>
    <span class="badge">Backend: mcp_agent.cfm</span>

    <div class="row">
        <div class="col">
            <div class="form-group">
                <label>🔐 Security Token</label>
                <input type="password" id="token" value="Secret_CF_MCP_2026">
            </div>
        </div>
        <div class="col">
            <div class="form-group">
                <label>⚡ Azione</label>
                <select id="actionSelect" onchange="updateUI()">
                    <option value="evaluate_code">Evaluate Code (Esegui CFML)</option>
                    <option value="list_log_files">List Log Files (Cerca File)</option>
                    <option value="read_log">Read Log (Leggi & Parsa)</option>
                    <option value="get_datasources">Get Datasources (Lista DB)</option>
                </select>
            </div>
        </div>
    </div>

    <hr>

    <div id="field-evaluate" class="form-group">
        <label>Expression / Codice CFML</label>
        <textarea id="expression" rows="5" placeholder="es. server.coldfusion.productversion"></textarea>
        <small class="hint">Puoi eseguire qualsiasi codice CFML. Il risultato dell'ultima espressione verrà restituito.</small>
    </div>

    <div id="field-list-logs" class="hidden">
        <div class="row">
            <div class="col">
                <div class="form-group">
                    <label>Filtro Nome (Opzionale)</label>
                    <input type="text" id="searchString" placeholder="es. exception">
                    <small class="hint">Lascia vuoto per vedere tutti i .log</small>
                </div>
            </div>
            <div class="col">
                <div class="form-group">
                    <label>Cartella Custom (Opzionale)</label>
                    <input type="text" id="customPath" placeholder="es. C:\Inetpub\logs\LogFiles\">
                    <small class="hint">Se vuoto, cerca in {CF_ROOT}/logs/</small>
                </div>
            </div>
        </div>
    </div>

    <div id="field-read-log" class="hidden">
        <div class="form-group">
            <label>Target File</label>
            <input type="text" id="logName" placeholder="es. 'exception' OPPURE 'D:\MieiLogs\debug.log'">
            <small class="hint">Inserisci il nome semplice (cerca in default) oppure il percorso assoluto completo.</small>
        </div>
        <div class="form-group">
            <label>Numero Righe</label>
            <input type="number" id="lines" value="50" min="1" max="1000">
            <small class="hint">Legge le ultime N righe del file.</small>
        </div>
    </div>

    <button onclick="sendRequest()">🚀 Invia Richiesta</button>

    <h3>Risposta JSON:</h3>
    <pre id="responseArea">// Il risultato apparirà qui...</pre>
</div>

<script>
    // Inizializza UI
    document.addEventListener('DOMContentLoaded', updateUI);

    function updateUI() {
        const action = document.getElementById('actionSelect').value;

        // Nascondi tutto
        document.getElementById('field-evaluate').classList.add('hidden');
        document.getElementById('field-list-logs').classList.add('hidden');
        document.getElementById('field-read-log').classList.add('hidden');

        // Mostra in base alla selezione
        if (action === 'evaluate_code') {
            document.getElementById('field-evaluate').classList.remove('hidden');
        } else if (action === 'list_log_files') {
            document.getElementById('field-list-logs').classList.remove('hidden');
        } else if (action === 'read_log') {
            document.getElementById('field-read-log').classList.remove('hidden');
        }
    }

    async function sendRequest() {
        const token = document.getElementById('token').value;
        const action = document.getElementById('actionSelect').value;
        const responseArea = document.getElementById('responseArea');

        let payload = {
            token: token,
            action: action
        };

        // Costruisci payload dinamico
        if (action === 'evaluate_code') {
            payload.expression = document.getElementById('expression').value;
        }
        else if (action === 'list_log_files') {
            const search = document.getElementById('searchString').value;
            const path = document.getElementById('customPath').value;
            if (search) payload.searchString = search;
            if (path) payload.customPath = path;
        }
        else if (action === 'read_log') {
            payload.logName = document.getElementById('logName').value;
            payload.lines = document.getElementById('lines').value;
        }

        // Feedback visuale
        responseArea.textContent = "⏳ Elaborazione in corso...";
        responseArea.style.color = "#f8f8f2"; // Reset colore errore

        try {
            const res = await fetch('http://127.0.0.1:8501/tesiscm/mediolanum/_ai_bridge.cfm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const text = await res.text();

            try {
                // Tenta parsing JSON
                const json = JSON.parse(text);

                // Formatta JSON
                responseArea.textContent = JSON.stringify(json, null, 2);

                // Evidenzia errori logici (status: error)
                if (json.status === 'error') {
                    responseArea.style.color = "#ff5555";
                } else {
                    responseArea.style.color = "#50fa7b";
                }

            } catch (e) {
                // Errore severo (es. CFML Error Dump HTML)
                responseArea.style.color = "#ffb86c";
                responseArea.textContent = "⚠️ ERRORE PARSING JSON (Risposta RAW):\n\n" + text;
            }

        } catch (error) {
            responseArea.style.color = "#ff5555";
            responseArea.textContent = "❌ ERRORE DI RETE:\n" + error.message;
        }
    }
</script>

</body>
</html>