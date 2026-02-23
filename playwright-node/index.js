import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium } from "playwright";
import dotenv from "dotenv";

// Redirect console.log to console.error to prevent libraries from breaking the JSON-RPC stdout stream
console.log = console.error;
dotenv.config();

const server = new Server(
  {
    name: "playwright-node",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// --- Browser State ---
let browser = null;
let context = null;
let page = null;
let pages = []; // Multi-tab tracking

// --- Ring Buffers for Monitoring ---
const MAX_LOGS = 50;
let networkErrors = [];
let consoleLogs = [];
let lastDownloadBuffer = null;
let lastDownloadFilename = null;

function addNetworkError(error) {
  networkErrors.push(error);
  if (networkErrors.length > MAX_LOGS) networkErrors.shift();
}

function addConsoleLog(log) {
  consoleLogs.push(log);
  if (consoleLogs.length > MAX_LOGS) consoleLogs.shift();
}

/**
 * Attaches monitoring listeners to a given page
 */
function attachPageListeners(p) {
  p.on('console', msg => {
    if (msg.type() === 'error') {
      addConsoleLog(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });
  p.on('pageerror', exception => {
    addConsoleLog(`[PAGE EXCEPTION] ${exception}`);
  });
  p.on('requestfailed', request => {
    addNetworkError(`[NETWORK ERRROR] ${request.method()} ${request.url()} - ${request.failure()?.errorText || 'Unknown error'}`);
  });
  p.on('response', response => {
    if (response.status() >= 400) {
      addNetworkError(`[HTTP ${response.status()}] ${response.request().method()} ${response.url()}`);
    }
  });
  p.on('download', async download => {
    try {
      // Load into memory
      lastDownloadFilename = download.suggestedFilename();
      const stream = await download.createReadStream();
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      lastDownloadBuffer = Buffer.concat(chunks);
      console.error(`File ${lastDownloadFilename} scaricato in memoria. Usa browser_read_downloaded_file per vederne il contenuto testuale.`);
      // Delete from actual remote filesystem immediately
      await download.delete();
    } catch (e) {
      addConsoleLog(`[DOWNLOAD ERROR] Failed to intercept file: ${e.message}`);
    }
  });
}

/**
 * Initializes the Playwright browser and context lazily.
 */
async function ensureBrowser(storageStatePath = undefined) {
  if (!browser) {
    console.error("Launching Chromium browser...");
    const launchOptions = {
      headless: true, // Run in headless mode
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-notifications',
        '--disable-geolocation'
      ]
    };

    // If storageStatePath is provided on first launch, we might want to use launchPersistentContext
    // but the standard approach is simply creating a new context with storageState if we already have the browser.
    browser = await chromium.launch(launchOptions);
  }

  // If we don't have a context or we explicitly requested to load a new state
  if (!context || storageStatePath) {
    if (context) {
      await context.close();
    }
    networkErrors = [];
    consoleLogs = [];
    pages = [];

    const contextOptions = storageStatePath ? { storageState: storageStatePath } : {};
    context = await browser.newContext(contextOptions);

    // Listen for new pages to handle _blank links safely (Max 3 tabs)
    context.on('page', async newPage => {
      pages.push(newPage);
      attachPageListeners(newPage);
      // Enforce memory limit
      if (pages.length > 3) {
        const oldestPage = pages.shift(); // remove from beginning
        try {
          await oldestPage.close();
          console.error("Closed oldest tab to save memory (limit: 3)");
        } catch (e) { /* ignore */ }
      }
    });

    page = await context.newPage(); // This will trigger the context.on('page') event above but we will handle it explicitly here to be sure
    if (!pages.includes(page)) {
      pages.push(page);
      attachPageListeners(page);
    }

    console.error("Browser context and page initialized successfully.");
  }

  return { browser, context, page };
}

// --- Tool Handlers ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "browser_navigate",
        description: "Navigates to a specific URL and waits for DOM content loaded.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "The URL to navigate to" },
          },
          required: ["url"],
        },
      },
      {
        name: "browser_click",
        description: "Clicks on an element matching the given selector.",
        inputSchema: {
          type: "object",
          properties: {
            selector: { type: "string", description: "Playwright/CSS selector" },
          },
          required: ["selector"],
        },
      },
      {
        name: "browser_fill",
        description: "Fills a form element matching the given selector with text.",
        inputSchema: {
          type: "object",
          properties: {
            selector: { type: "string", description: "Playwright/CSS selector" },
            value: { type: "string", description: "Text to fill" },
          },
          required: ["selector", "value"],
        },
      },
      {
        name: "browser_get_dom",
        description: "Returns a minimized accessibility-focused version of the DOM (ignoring scripts, styles, etc.).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "browser_screenshot",
        description: "Captures a Base64-encoded screenshot of the current viewport.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "browser_evaluate_js",
        description: "Evaluates JavaScript in the current page context and returns the result.",
        inputSchema: {
          type: "object",
          properties: {
            code: { type: "string", description: "JavaScript code to evaluate" },
          },
          required: ["code"],
        },
      },
      {
        name: "browser_annotate",
        description: "Highlights all interactive elements on the page with a number and returns a screenshot.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "browser_click_by_id",
        description: "Clicks on an element using the ID generated by browser_annotate.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "number", description: "The ID number from the annotation screenshot" },
          },
          required: ["id"],
        },
      },
      {
        name: "browser_export_state",
        description: "Exports the current browser state (cookies, local storage) to a local JSON file so it can be restored later.",
        inputSchema: {
          type: "object",
          properties: {
            filename: { type: "string", description: "The name of the file to save the state to, e.g. state.json" },
          },
          required: ["filename"],
        },
      },
      {
        name: "browser_load_state",
        description: "Loads a previously exported browser state from a local JSON file, restoring cookies and local storage. Useful to restore login sessions.",
        inputSchema: {
          type: "object",
          properties: {
            filename: { type: "string", description: "The name of the file to load the state from" },
          },
          required: ["filename"],
        },
      },
      {
        name: "browser_read_downloaded_file",
        description: "Reads the content of the last file downloaded by the browser, converting it to text.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "browser_scroll",
        description: "Scrolls the page down by a specified amount of pixels.",
        inputSchema: {
          type: "object",
          properties: {
            pixels: { type: "number", description: "Amount of pixels to scroll. Positive goes down, negative goes up." },
          },
        },
      },
      {
        name: "browser_hover",
        description: "Hovers over an element matching the given selector. Useful for dropdown menus.",
        inputSchema: {
          type: "object",
          properties: {
            selector: { type: "string", description: "Playwright/CSS selector to hover over" },
          },
          required: ["selector"],
        },
      },
      {
        name: "browser_press_key",
        description: "Presses a specific keyboard key on an element.",
        inputSchema: {
          type: "object",
          properties: {
            selector: { type: "string", description: "Playwright/CSS selector to target" },
            key: { type: "string", description: "Name of the key to press, e.g. 'Enter', 'Escape', 'ArrowDown'" },
          },
          required: ["selector", "key"],
        },
      },
      {
        name: "browser_get_network_errors",
        description: "Returns the last 50 network errors (failed requests, 4xx, 5xx responses) encountered during the session.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "browser_get_console_logs",
        description: "Returns the last 50 console errors and JS exceptions encountered on the page.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "browser_switch_tab",
        description: "Switches the active page to another open tab. The server supports a maximum of 3 concurrent tabs.",
        inputSchema: {
          type: "object",
          properties: {
            index: { type: "number", description: "The 0-based index of the tab to switch to (e.g. 0, 1, 2)" },
          },
          required: ["index"],
        },
      },
      {
        name: "browser_read_downloaded_file",
        description: "Reads the content of the last file downloaded by the browser, converting it to text.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // We will ensure the browser runs before any tool is executed (except maybe safe ones, but it's simpler this way)
  await ensureBrowser();

  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "browser_navigate": {
        const url = String(args.url);

        // Allow URLs check
        const allowedUrlsStr = process.env.ALLOWED_URLS !== undefined ? process.env.ALLOWED_URLS : "localhost,127.0.0.1";
        if (allowedUrlsStr && allowedUrlsStr !== "*") {
          const allowedUrls = allowedUrlsStr.split(",").map(s => s.trim());
          try {
            const targetUrlObj = new URL(url);
            const isAllowed = allowedUrls.some(allowed => targetUrlObj.hostname === allowed || targetUrlObj.hostname.endsWith(`.${allowed}`));
            if (!isAllowed) {
              throw new Error(`Navigazione non consentita: host ${targetUrlObj.hostname} non in ALLOWED_URLS (${allowedUrls.join(", ")})`);
            }
          } catch (e) {
            // URL parsing failed or denied
            throw new Error(`URL invalido o non consentito: ${e.message}`);
          }
        }

        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        const title = await page.title();
        const currentUrl = page.url();
        return {
          content: [{ type: "text", text: `Navigazione completata. URL: ${currentUrl}, Titolo: ${title}` }],
        };
      }

      case "browser_click": {
        const selector = String(args.selector);
        await page.click(selector, { timeout: 10000 });
        return {
          content: [{ type: "text", text: `Click su selettore '${selector}' eseguito con successo.` }],
        };
      }

      case "browser_fill": {
        const selector = String(args.selector);
        const value = String(args.value);
        await page.fill(selector, value, { timeout: 10000 });
        return {
          content: [{ type: "text", text: `Testo inserito nel selettore '${selector}' con successo.` }],
        };
      }

      case "browser_get_dom": {
        // Extracts a compact DOM structure
        const compactDOM = await page.evaluate(() => {
          function getCleanOutline(node) {
            // Skip invisible or irrelevant elements
            if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) return null;
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent.trim();
              return text ? text : null;
            }

            const t = node.tagName.toLowerCase();
            if (['script', 'style', 'svg', 'noscript', 'meta', 'link', 'iframe'].includes(t)) return null;

            const children = [];
            for (let child of node.childNodes) {
              const c = getCleanOutline(child);
              if (c) children.push(c);
            }

            // Important UI elements to keep
            const isInteractive = ['a', 'button', 'input', 'select', 'textarea', 'label'].includes(t);
            const role = node.getAttribute('role');
            const hasInteractiveRole = role && ['button', 'link', 'checkbox', 'menuitem'].includes(role);

            // If it's just a structural element with no children, ignore it
            if (!isInteractive && !hasInteractiveRole && children.length === 0) return null;

            // Create compact representation
            let str = `<${t}`;
            if (node.id) str += ` id="${node.id}"`;
            if (isInteractive || hasInteractiveRole) {
              // Basic identifiable attributes for targeting
              Array.from(node.attributes).forEach(attr => {
                if (['name', 'type', 'placeholder', 'aria-label', 'role'].includes(attr.name)) {
                  str += ` ${attr.name}="${attr.value}"`;
                }
              });
            }
            str += '>';

            if (children.length === 1 && typeof children[0] === 'string') {
              str += children[0];
            } else if (children.length > 0) {
              str += '\n  ' + children.map(c => typeof c === 'string' ? c : c).join('\n').replace(/\n/g, '\n  ') + '\n';
            }
            return str + `</${t}>`;
          }
          return getCleanOutline(document.body);
        });
        return {
          content: [{ type: "text", text: compactDOM || "Il DOM è vuoto o non estraibile." }],
        };
      }

      case "browser_screenshot": {
        const buffer = await page.screenshot({ encoding: "base64", fullPage: false });
        return {
          content: [{
            type: "image",
            data: buffer,
            mimeType: "image/png"
          }],
        };
      }

      case "browser_evaluate_js": {
        const code = String(args.code);
        const result = await page.evaluate(code);
        const resultStr = typeof result === "object" ? JSON.stringify(result, null, 2) : String(result);
        return {
          content: [{ type: "text", text: `Execution result:\n${resultStr}` }],
        };
      }

      case "browser_annotate": {
        await page.evaluate(() => {
          let elements = document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"]');
          window.__elementMap = {};
          let counter = 1;

          // Remove old annotations if any
          document.querySelectorAll('.playwright-annotation').forEach(e => e.remove());

          elements.forEach(el => {
            const rect = el.getBoundingClientRect();
            // Check if visible
            const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
            if (isVisible) {
              window.__elementMap[counter] = el;
              let label = document.createElement('div');
              label.textContent = counter;
              label.className = 'playwright-annotation';
              label.style.position = 'absolute';
              label.style.top = `${rect.top + window.scrollY}px`;
              label.style.left = `${rect.left + window.scrollX}px`;
              label.style.background = 'red';
              label.style.color = 'white';
              label.style.padding = '2px 4px';
              label.style.fontSize = '12px';
              label.style.fontWeight = 'bold';
              label.style.zIndex = '999999';
              label.style.pointerEvents = 'none';
              label.style.borderRadius = '3px';
              label.style.boxShadow = '0 0 2px black';
              document.body.appendChild(label);
              counter++;
            }
          });
        });

        // Wait a tiny bit for rendering
        await new Promise(resolve => setTimeout(resolve, 100));
        const buffer = await page.screenshot({ encoding: "base64", fullPage: true });

        return {
          content: [{
            type: "image",
            data: buffer,
            mimeType: "image/png"
          }, {
            type: "text",
            text: "Etichette iniettate. Usa l'ID visibile nell'immagine con browser_click_by_id."
          }],
        };
      }

      case "browser_click_by_id": {
        const id = Number(args.id);
        const result = await page.evaluate((selectorId) => {
          if (window.__elementMap && window.__elementMap[selectorId]) {
            // Rimuoviamo prima le annotazioni che potrebbero bloccare il click se pointerEvents:none non funziona altrove o per pulizia
            document.querySelectorAll('.playwright-annotation').forEach(e => e.remove());
            window.__elementMap[selectorId].click();
            return true;
          }
          return false;
        }, id);

        if (result) {
          return {
            content: [{ type: "text", text: `Elemento ${id} cliccato con successo.` }],
          };
        } else {
          throw new Error(`Elemento con ID ${id} non trovato. Esegui prima browser_annotate.`);
        }
      }

      case "browser_export_state": {
        const filename = String(args.filename);
        await context.storageState({ path: filename });
        return {
          content: [{ type: "text", text: `Browser state exported successfully to ${filename}` }],
        };
      }

      case "browser_load_state": {
        const filename = String(args.filename);
        // Force re-initialization of context with the state file
        await ensureBrowser(filename);
        return {
          content: [{ type: "text", text: `Browser state loaded successfully from ${filename}. A new browser context is now active.` }],
        };
      }

      case "browser_scroll": {
        let pixels = args.pixels !== undefined ? Number(args.pixels) : 500;
        await page.evaluate((px) => window.scrollBy(0, px), pixels);
        return {
          content: [{ type: "text", text: `Scrolled by ${pixels} pixels.` }],
        };
      }

      case "browser_hover": {
        const selector = String(args.selector);
        await page.hover(selector, { timeout: 5000 });
        return {
          content: [{ type: "text", text: `Hovered over element matching '${selector}'.` }],
        };
      }

      case "browser_press_key": {
        const selector = String(args.selector);
        const key = String(args.key);
        await page.press(selector, key, { timeout: 5000 });
        return {
          content: [{ type: "text", text: `Pressed key '${key}' on element matching '${selector}'.` }],
        };
      }

      case "browser_get_network_errors": {
        return {
          content: [{ type: "text", text: networkErrors.length > 0 ? networkErrors.join('\n') : "No network errors detected." }],
        };
      }

      case "browser_get_console_logs": {
        return {
          content: [{ type: "text", text: consoleLogs.length > 0 ? consoleLogs.join('\n') : "No console errors detected." }],
        };
      }

      case "browser_switch_tab": {
        const index = Number(args.index);
        if (index >= 0 && index < pages.length) {
          page = pages[index];
          await page.bringToFront();
          const title = await page.title();
          return {
            content: [{ type: "text", text: `Switched to tab ${index}. Active URL: ${page.url()}, Title: ${title}` }],
          };
        } else {
          return {
            content: [{ type: "text", text: `Invalid tab index ${index}. There are currently ${pages.length} tabs open (indexes 0 to ${pages.length - 1}).` }],
            isError: true,
          };
        }
      }

      case "browser_read_downloaded_file": {
        if (!lastDownloadBuffer) {
          return {
            content: [{ type: "text", text: "Nessun file scaricato in questa sessione." }],
            isError: true,
          };
        }
        const textContent = lastDownloadBuffer.toString('utf-8');
        return {
          content: [{ type: "text", text: `[FILE NAME]: ${lastDownloadFilename}\n--- CONTENT ---\n${textContent}\n---------------` }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `Tool ${name} non implementato ancora.` }],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Errore durante l'esecuzione di ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

// --- Transport & Shutdown ---
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Playwright MCP Server running on stdio");

const cleanup = async () => {
  console.error("Shutting down server, closing browser...");
  if (browser) {
    await browser.close().catch(console.error);
    browser = null;
  }
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);

// Also handle stdio close
transport.onclose = cleanup;
