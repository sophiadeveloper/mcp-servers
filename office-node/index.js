#!/usr/bin/env node
import { createRequire } from "module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import mammoth from "mammoth";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import PizZip from "pizzip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import WordExtractor from "word-extractor";
import fs from "fs";
import path from "path";

const XLSX = createRequire(import.meta.url)("xlsx");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const XML_NS = "http://www.w3.org/XML/1998/namespace";

// ---------------------------------------------------------------------------
// .docx helpers
// ---------------------------------------------------------------------------
function openDocx(filePath) {
  const content = fs.readFileSync(filePath);
  const zip = new PizZip(content);
  const xmlStr = zip.file("word/document.xml").asText();
  const parser = new DOMParser();
  const dom = parser.parseFromString(xmlStr, "text/xml");
  return { zip, dom };
}

function saveDocx(zip, dom, filePath) {
  const serializer = new XMLSerializer();
  const newXml = serializer.serializeToString(dom);
  zip.file("word/document.xml", newXml);
  const buffer = zip.generate({ type: "nodebuffer" });
  fs.writeFileSync(filePath, buffer);
}

function getParagraphs(dom) {
  return Array.from(dom.getElementsByTagNameNS(W_NS, "p"));
}

function setParagraphText(dom, para, text) {
  const runs = Array.from(para.getElementsByTagNameNS(W_NS, "r"));
  for (const run of runs) {
    run.parentNode.removeChild(run);
  }
  const newRun = dom.createElementNS(W_NS, "w:r");
  const newText = dom.createElementNS(W_NS, "w:t");
  newText.appendChild(dom.createTextNode(text));
  newText.setAttributeNS(XML_NS, "xml:space", "preserve");
  newRun.appendChild(newText);
  para.appendChild(newRun);
}

function extractParagraphText(para) {
  const texts = Array.from(para.getElementsByTagNameNS(W_NS, "t"));
  return texts.map((t) => t.textContent).join("");
}

function resolveHeadingLevel(level) {
  const map = {
    "1": HeadingLevel.HEADING_1,
    "2": HeadingLevel.HEADING_2,
    "3": HeadingLevel.HEADING_3,
    "4": HeadingLevel.HEADING_4,
    "5": HeadingLevel.HEADING_5,
    "6": HeadingLevel.HEADING_6,
  };
  return map[String(level)] ?? null;
}

// ---------------------------------------------------------------------------
// Excel helpers (SheetJS)
// ---------------------------------------------------------------------------
function readWorkbook(filePath) {
  return XLSX.readFile(filePath, { cellDates: true });
}

function resolveSheet(workbook, sheetName) {
  const name = sheetName || workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  if (!sheet) {
    throw new Error(
      `Sheet "${name}" non trovato. Sheet disponibili: ${workbook.SheetNames.join(", ")}`
    );
  }
  return { sheet, name };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------
const server = new Server(
  { name: "office-mcp-server", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "word_document",
      description:
        "Legge, crea o modifica file Microsoft Word (.docx). " +
        "Supporto lettura per .doc (sola lettura). " +
        "Azioni: " +
        "'read' estrae il testo grezzo del documento; " +
        "'list_paragraphs' elenca tutti i paragrafi con il loro indice; " +
        "'create' crea un nuovo .docx dato un array di blocchi di testo/intestazione; " +
        "'edit_paragraph' sostituisce il testo di un paragrafo esistente; " +
        "'insert_paragraph' inserisce un nuovo paragrafo in una posizione specifica; " +
        "'delete_paragraph' rimuove un paragrafo per indice.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "read",
              "list_paragraphs",
              "create",
              "edit_paragraph",
              "insert_paragraph",
              "delete_paragraph",
            ],
            description:
              "L'operazione da eseguire sul file Word. " +
              "Per file .doc e' supportata solo 'read'.",
          },
          file_path: {
            type: "string",
            description: "Percorso assoluto al file Word (.docx o .doc).",
          },
          paragraphs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                text: { type: "string", description: "Testo del blocco." },
                heading: {
                  type: "string",
                  enum: ["1", "2", "3", "4", "5", "6"],
                  description: "Livello di intestazione (opzionale).",
                },
              },
              required: ["text"],
            },
            description: "Array di blocchi di contenuto (necessario per 'create').",
          },
          paragraph_index: {
            type: "number",
            description:
              "Indice 0-based del paragrafo (necessario per 'edit_paragraph', 'insert_paragraph', 'delete_paragraph').",
          },
          text: {
            type: "string",
            description:
              "Nuovo testo del paragrafo (necessario per 'edit_paragraph' e 'insert_paragraph').",
          },
        },
        required: ["action", "file_path"],
      },
    },
    {
      name: "excel_document",
      description:
        "Legge, crea e modifica file Microsoft Excel (.xlsx, .xls). " +
        "Azioni: " +
        "'list_sheets' elenca tutti i fogli del workbook; " +
        "'read_sheet' legge i valori di un foglio (opzionalmente filtrato per range); " +
        "'write_cells' scrive un array 2D di valori in un foglio a partire da una cella; " +
        "'create' crea un nuovo file Excel con uno o piu' fogli.",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list_sheets", "read_sheet", "write_cells", "create"],
            description: "L'operazione da eseguire sul file Excel.",
          },
          file_path: {
            type: "string",
            description: "Percorso assoluto al file Excel (.xlsx o .xls).",
          },
          sheet_name: {
            type: "string",
            description:
              "Nome del foglio (opzionale per 'read_sheet' e 'write_cells': usa il primo foglio se omesso).",
          },
          range: {
            type: "string",
            description:
              "Range di celle in formato A1 (es. 'A1:D10'). Opzionale per 'read_sheet': se omesso legge tutto il foglio.",
          },
          start_cell: {
            type: "string",
            description:
              "Cella di partenza per la scrittura in formato A1 (es. 'A1'). Opzionale per 'write_cells', default 'A1'.",
          },
          values: {
            type: "array",
            items: { type: "array" },
            description:
              "Array 2D di valori da scrivere (necessario per 'write_cells'). Ogni elemento dell'array esterno e' una riga.",
          },
          sheets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Nome del foglio." },
                values: {
                  type: "array",
                  items: { type: "array" },
                  description: "Dati del foglio come array 2D.",
                },
              },
              required: ["name"],
            },
            description:
              "Array di fogli da creare (necessario per 'create'). Se omesso, crea un foglio vuoto 'Sheet1'.",
          },
        },
        required: ["action", "file_path"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const resolvedPath = path.resolve(args.file_path);

  try {
    if (name === "word_document") {
      const ext = path.extname(resolvedPath).toLowerCase();
      const { action } = args;

      if (ext === ".doc" && action !== "read") {
        return {
          content: [
            {
              type: "text",
              text: "Il formato .doc supporta solo l'azione 'read'. Per modificare file Word usa il formato .docx.",
            },
          ],
          isError: true,
        };
      }

      switch (action) {
        case "read": {
          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File non trovato: ${resolvedPath}`);
          }
          if (ext === ".doc") {
            const extractor = new WordExtractor();
            const extracted = await extractor.extract(resolvedPath);
            return {
              content: [{ type: "text", text: extracted.getBody() || "(documento vuoto)" }],
            };
          }
          const result = await mammoth.extractRawText({ path: resolvedPath });
          return { content: [{ type: "text", text: result.value || "(documento vuoto)" }] };
        }

        case "list_paragraphs": {
          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File non trovato: ${resolvedPath}`);
          }
          const { dom } = openDocx(resolvedPath);
          const paragraphs = getParagraphs(dom);
          const lines = paragraphs.map((p, i) => {
            const text = extractParagraphText(p);
            return `[${i}] ${text || "(vuoto)"}`;
          });
          return {
            content: [
              {
                type: "text",
                text: `Totale paragrafi: ${paragraphs.length}\n\n${lines.join("\n")}`,
              },
            ],
          };
        }

        case "create": {
          const blocks = args.paragraphs;
          if (!Array.isArray(blocks) || blocks.length === 0) {
            throw new Error("Il parametro 'paragraphs' e' obbligatorio e non puo' essere vuoto.");
          }
          const children = blocks.map((block) => {
            const headingLevel = block.heading ? resolveHeadingLevel(block.heading) : null;
            if (headingLevel !== null) {
              return new Paragraph({ text: block.text, heading: headingLevel });
            }
            return new Paragraph({ children: [new TextRun(block.text)] });
          });
          const doc = new Document({ sections: [{ children }] });
          const buffer = await Packer.toBuffer(doc);
          fs.writeFileSync(resolvedPath, buffer);
          return {
            content: [
              { type: "text", text: `OK Documento creato: ${resolvedPath} (${blocks.length} paragrafi)` },
            ],
          };
        }

        case "edit_paragraph": {
          const { paragraph_index, text } = args;
          if (paragraph_index === undefined || text === undefined) {
            throw new Error("'paragraph_index' e 'text' sono obbligatori per edit_paragraph.");
          }
          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File non trovato: ${resolvedPath}`);
          }
          const { zip, dom } = openDocx(resolvedPath);
          const paragraphs = getParagraphs(dom);
          if (paragraph_index < 0 || paragraph_index >= paragraphs.length) {
            throw new Error(
              `Indice ${paragraph_index} fuori dai limiti (il documento ha ${paragraphs.length} paragrafi).`
            );
          }
          setParagraphText(dom, paragraphs[paragraph_index], text);
          saveDocx(zip, dom, resolvedPath);
          return {
            content: [{ type: "text", text: `OK Paragrafo ${paragraph_index} aggiornato.` }],
          };
        }

        case "insert_paragraph": {
          const { paragraph_index, text } = args;
          if (paragraph_index === undefined || text === undefined) {
            throw new Error("'paragraph_index' e 'text' sono obbligatori per insert_paragraph.");
          }
          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File non trovato: ${resolvedPath}`);
          }
          const { zip, dom } = openDocx(resolvedPath);
          const paragraphs = getParagraphs(dom);
          const body = dom.getElementsByTagNameNS(W_NS, "body")[0];
          const newPara = dom.createElementNS(W_NS, "w:p");
          setParagraphText(dom, newPara, text);
          if (paragraph_index >= paragraphs.length) {
            const sectPr = body.getElementsByTagNameNS(W_NS, "sectPr")[0];
            if (sectPr) {
              body.insertBefore(newPara, sectPr);
            } else {
              body.appendChild(newPara);
            }
          } else {
            body.insertBefore(newPara, paragraphs[paragraph_index]);
          }
          saveDocx(zip, dom, resolvedPath);
          return {
            content: [{ type: "text", text: `OK Paragrafo inserito alla posizione ${paragraph_index}.` }],
          };
        }

        case "delete_paragraph": {
          const { paragraph_index } = args;
          if (paragraph_index === undefined) {
            throw new Error("'paragraph_index' e' obbligatorio per delete_paragraph.");
          }
          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File non trovato: ${resolvedPath}`);
          }
          const { zip, dom } = openDocx(resolvedPath);
          const paragraphs = getParagraphs(dom);
          if (paragraph_index < 0 || paragraph_index >= paragraphs.length) {
            throw new Error(
              `Indice ${paragraph_index} fuori dai limiti (il documento ha ${paragraphs.length} paragrafi).`
            );
          }
          const para = paragraphs[paragraph_index];
          para.parentNode.removeChild(para);
          saveDocx(zip, dom, resolvedPath);
          return {
            content: [{ type: "text", text: `OK Paragrafo ${paragraph_index} eliminato.` }],
          };
        }

        default:
          throw new Error(`Azione non valida per word_document: ${action}`);
      }
    }

    if (name === "excel_document") {
      const { action } = args;

      switch (action) {
        case "list_sheets": {
          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File non trovato: ${resolvedPath}`);
          }
          const workbook = readWorkbook(resolvedPath);
          return {
            content: [
              {
                type: "text",
                text:
                  `Fogli nel workbook (${workbook.SheetNames.length}):\n` +
                  workbook.SheetNames.map((n, i) => `[${i}] ${n}`).join("\n"),
              },
            ],
          };
        }

        case "read_sheet": {
          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`File non trovato: ${resolvedPath}`);
          }
          const workbook = readWorkbook(resolvedPath);
          const { sheet, name: sheetName } = resolveSheet(workbook, args.sheet_name);

          let data;
          if (args.range) {
            const rangeParsed = XLSX.utils.decode_range(args.range);
            data = XLSX.utils.sheet_to_json(sheet, {
              header: 1,
              defval: "",
              range: rangeParsed,
            });
          } else {
            data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
          }

          return {
            content: [
              {
                type: "text",
                text:
                  `Foglio: "${sheetName}"${args.range ? ` | Range: ${args.range}` : ""}\n` +
                  `Righe: ${data.length}\n\n` +
                  JSON.stringify(data, null, 2),
              },
            ],
          };
        }

        case "write_cells": {
          const { values, sheet_name, start_cell = "A1" } = args;
          if (!Array.isArray(values) || values.length === 0) {
            throw new Error("Il parametro 'values' e' obbligatorio per write_cells.");
          }

          let workbook;
          if (fs.existsSync(resolvedPath)) {
            workbook = readWorkbook(resolvedPath);
          } else {
            workbook = XLSX.utils.book_new();
          }

          const targetName = sheet_name || workbook.SheetNames[0] || "Sheet1";
          let sheet = workbook.Sheets[targetName];

          if (!sheet) {
            sheet = XLSX.utils.aoa_to_sheet([]);
            XLSX.utils.book_append_sheet(workbook, sheet, targetName);
          }

          XLSX.utils.sheet_add_aoa(sheet, values, { origin: start_cell });
          XLSX.writeFile(workbook, resolvedPath);

          return {
            content: [
              {
                type: "text",
                text: `OK ${values.length} righe scritte nel foglio "${targetName}" a partire da ${start_cell}.`,
              },
            ],
          };
        }

        case "create": {
          const sheets = args.sheets || [{ name: "Sheet1", values: [] }];
          const workbook = XLSX.utils.book_new();

          for (const s of sheets) {
            const sheet = XLSX.utils.aoa_to_sheet(s.values || []);
            XLSX.utils.book_append_sheet(workbook, sheet, s.name || "Sheet1");
          }

          XLSX.writeFile(workbook, resolvedPath);
          return {
            content: [
              {
                type: "text",
                text: `OK Workbook creato: ${resolvedPath} (${sheets.length} fogli)`,
              },
            ],
          };
        }

        default:
          throw new Error(`Azione non valida per excel_document: ${action}`);
      }
    }

    throw new Error(`Tool sconosciuto: ${name}`);
  } catch (error) {
    return {
      content: [{ type: "text", text: `Errore: ${error.message}` }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
