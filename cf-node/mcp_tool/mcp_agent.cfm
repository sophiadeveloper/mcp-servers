<cfsetting enablecfoutputonly="true" showdebugoutput="false">
<cfcontent type="application/json" reset="true">

<cfscript>
    response = {};
    EXPECTED_TOKEN = "Secret_CF_MCP_2026";

    try {
        requestBody = ToString(getHttpRequestData().content);
        if (NOT IsJSON(requestBody)) throw(type="Application", message="Payload non valido", detail="Atteso JSON.");

        data = DeserializeJSON(requestBody);

        // Security Check
        if (NOT structKeyExists(data, "token") OR data.token NEQ EXPECTED_TOKEN) {
            throw(type="Security", message="Accesso Negato", detail="Token non valido.");
        }

        switch(data.action) {

          // --- AZIONE 1: CERCA FILE DI LOG (Supporta path custom) ---
          case "list_log_files":
              // Se passiamo "customPath", cerchiamo lì, altrimenti usiamo la default
              if (structKeyExists(data, "customPath") AND Len(data.customPath)) {
                  // Controlla se la directory esiste
                  if (DirectoryExists(data.customPath)) {
                      logDir = data.customPath;
                  } else {
                      throw(type="Application", message="Path non trovato", detail="La cartella indicata non esiste: " & data.customPath);
                  }
              } else {
                  // Default ColdFusion logs
                  logDir = Server.ColdFusion.RootDir & "/logs/";
              }

              searchPattern = structKeyExists(data, "searchString") && len(data.searchString) ? "*#data.searchString#*.log" : "*.log";

              cfdirectory(action="list", directory=logDir, name="qLogs", filter=searchPattern, sort="datelastmodified DESC");

              fileList = [];
              for (row in qLogs) {
                  arrayAppend(fileList, {
                      "filename": row.name,
                      "folder": logDir, // Restituiamo anche la cartella per chiarezza
                      "fullPath": row.directory & "/" & row.name,
                      "sizeKB": Round(row.size / 1024),
                      "lastModified": DateTimeFormat(row.dateLastModified, "yyyy-mm-dd HH:nn:ss")
                  });
              }
              response["files"] = fileList;
              response["searchedIn"] = logDir;
              break;

          // --- AZIONE 2: LEGGI E PARSA LOG (Versione Regex Robusta) ---
          case "read_log":
                if (NOT structKeyExists(data, "logName")) throw("Manca 'logName'");

                targetFile = "";

                // 1. Risoluzione File
                if (FileExists(data.logName)) {
                    targetFile = data.logName;
                } else {
                    cleanName = ReReplace(data.logName, "[/\\]", "", "all");
                    if (cleanName DOES NOT CONTAIN ".log") cleanName &= ".log";
                    defaultPath = Server.ColdFusion.RootDir & "/logs/" & cleanName;
                    if (FileExists(defaultPath)) targetFile = defaultPath;
                }

                if (Len(targetFile)) {
                    numLines = structKeyExists(data, "lines") ? Val(data.lines) : 50;

                    // Leggi il file
                    logContent = FileRead(targetFile);
                    allLines = ListToArray(logContent, Chr(10));
                    totalLines = ArrayLen(allLines);

                    start = Max(1, totalLines - numLines + 1);
                    parsedLogs = [];

                    // Regex Pattern:
                    // 1. Severity (tra virgolette)
                    // 2. Thread (tra virgolette)
                    // 3. Date (tra virgolette)
                    // 4. Time (tra virgolette)
                    // 5/6. App (Quoted OR Unquoted - gestione ibrida)
                    // 7. Message (tra virgolette finali)
                    regexPat = '^"([^"]+)","([^"]+)","([^"]+)","([^"]+)",(?:"([^"]*)"|([^,"]+)),"(.*)"\s*$';

                    for (i=start; i<=totalLines; i++) {
                        rawLine = Trim(allLines[i]);
                        if (Len(rawLine)) {
                            // Tentativo di match con Regex
                            found = REFind(regexPat, rawLine, 1, true);

                            if (found.len[1] GT 0) {
                                // Estrazione Gruppi (pos[1] è l'intero match, quindi partiamo da 2)
                                entry = {
                                    "severity": Mid(rawLine, found.pos[2], found.len[2]),
                                    "thread":   Mid(rawLine, found.pos[3], found.len[3]),
                                    "timestamp": Mid(rawLine, found.pos[4], found.len[4]) & " " & Mid(rawLine, found.pos[5], found.len[5]),

                                    // Gestione App: Gruppo 6 (Quoted) o Gruppo 7 (Unquoted)
                                    "app": (found.len[6] GT 0) ? Mid(rawLine, found.pos[6], found.len[6]) : Mid(rawLine, found.pos[7], found.len[7]),

                                    // Messaggio: Unescape delle doppie virgolette ("" -> ")
                                    "message": Replace(Mid(rawLine, found.pos[8], found.len[8]), '""', '"', "all")
                                };
                                ArrayAppend(parsedLogs, entry);
                            } else {
                                // Fallback: righe che non matchano (stack traces, errori java, formati strani)
                                // Le includiamo comunque marcandole come 'raw'
                                ArrayAppend(parsedLogs, {
                                    "severity": "RAW",
                                    "timestamp": "",
                                    "app": "",
                                    "message": rawLine
                                });
                            }
                        }
                    }
                    response["entries"] = parsedLogs;
                    response["meta"] = { "file": targetFile, "totalLines": totalLines, "returned": ArrayLen(parsedLogs) };
                } else {
                    response["error"] = "File non trovato: " & data.logName;
                }
                break;

          // ... (altri case come evaluate_code e get_datasources rimangono uguali) ...
          case "evaluate_code":
                if (NOT structKeyExists(data, "expression")) throw("Manca 'expression'");
                savecontent variable="capturedOutput" {
                  evalResult = Evaluate(data.expression);
                  if (IsDefined("evalResult")) {
                      if (IsSimpleValue(evalResult)) WriteOutput(evalResult);
                      else WriteOutput(SerializeJSON(evalResult));
                  }
                }
                response["result"] = capturedOutput;
                break;

          case "get_datasources":
                factory = CreateObject("java", "coldfusion.server.ServiceFactory");
                dsService = factory.getDataSourceService();
                rawDS = dsService.getDatasources();
                dsList = {};
                for (ds in rawDS) {
                    dsList[ds] = rawDS[ds]["driver"];
                }
                response["datasources"] = dsList;
                break;

            default:
                throw("Azione non riconosciuta: " & data.action);
        }

        response["status"] = "success";

    } catch (any e) {
        response["status"] = "error";
        response["message"] = e.message;
        response["detail"] = e.detail;
    }

    WriteOutput(SerializeJSON(response));
</cfscript>