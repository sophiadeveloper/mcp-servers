import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium } from "playwright";

// Redirect console.log to console.error to prevent libraries from breaking the JSON-RPC stdout stream
console.log = console.error;

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
let activeFrame = null;

// --- Idle Hibernation Timer ---
let idleTimer = null;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    console.error(`[HIBERNATION] Browser idle for ${IDLE_TIMEOUT_MS / 1000}s. Closing to free RAM/CPU.`);
    if (browser) {
      try { await browser.close(); } catch (e) { /* ignore */ }
    }
    browser = null;
    context = null;
    page = null;
    pages = [];
  }, IDLE_TIMEOUT_MS);
}

// --- Ring Buffers for Monitoring ---
const MAX_LOGS = 50;
let networkErrors = [];
let consoleLogs = [];
let lastDownloadBuffer = null;
let lastDownloadFilename = null;
let allowAllHosts = false;
let allowedHosts = [];

const DEFAULT_ALLOWED_HOSTS = "localhost,127.0.0.1";
const NAVIGATION_TIMEOUT_MS = Number(process.env.NAVIGATION_TIMEOUT_MS || 30000);
const ACTION_TIMEOUT_MS = Number(process.env.ACTION_TIMEOUT_MS || 20000);
const SETTLE_DELAY_MS = Number(process.env.SETTLE_DELAY_MS || 1200);
const WAIT_FOR_LOAD_STATE = String(process.env.WAIT_FOR_LOAD_STATE || "domcontentloaded");
const BLOCK_MEDIA = process.env.BLOCK_MEDIA === "true";

function addNetworkError(error) {
  networkErrors.push(error);
  if (networkErrors.length > MAX_LOGS) networkErrors.shift();
}

function addConsoleLog(log) {
  consoleLogs.push(log);
  if (consoleLogs.length > MAX_LOGS) consoleLogs.shift();
}

function loadAllowedHosts() {
  const allowedUrlsStr = process.env.ALLOWED_URLS !== undefined
    ? process.env.ALLOWED_URLS
    : DEFAULT_ALLOWED_HOSTS;

  allowAllHosts = allowedUrlsStr === "*";
  allowedHosts = allowAllHosts
    ? []
    : allowedUrlsStr
        .split(",")
        .map(host => host.trim().toLowerCase())
        .filter(Boolean);
}

function isHostnameAllowed(hostname) {
  if (allowAllHosts) {
    return true;
  }

  const normalizedHostname = String(hostname || "").toLowerCase();
  return allowedHosts.some(allowedHost =>
    normalizedHostname === allowedHost || normalizedHostname.endsWith(`.${allowedHost}`)
  );
}

function assertUrlAllowed(url) {
  if (allowAllHosts) {
    return;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new Error(`URL invalido o non consentito: ${error.message}`);
  }

  if (!isHostnameAllowed(parsedUrl.hostname)) {
    throw new Error(
      `Navigazione non consentita: host ${parsedUrl.hostname} non in ALLOWED_URLS (${allowedHosts.join(", ")})`
    );
  }
}

async function settlePage(activePage, options = {}) {
  const {
    waitForNavigation = false,
    reason = "azione"
  } = options;

  if (!activePage) {
    return;
  }

  if (waitForNavigation) {
    try {
      await activePage.waitForNavigation({
        waitUntil: WAIT_FOR_LOAD_STATE,
        timeout: NAVIGATION_TIMEOUT_MS
      });
      console.error(`[SETTLE] Navigation completed after ${reason}.`);
    } catch (error) {
      if (!/Timeout/i.test(error.message)) {
        console.error(`[SETTLE] Navigation wait after ${reason} ended with: ${error.message}`);
      } else {
        console.error(`[SETTLE] No navigation detected after ${reason}; continuing with DOM settling.`);
      }
    }
  }

  try {
    await activePage.waitForLoadState(WAIT_FOR_LOAD_STATE, { timeout: NAVIGATION_TIMEOUT_MS });
  } catch (error) {
    console.error(`[SETTLE] waitForLoadState(${WAIT_FOR_LOAD_STATE}) after ${reason} ended with: ${error.message}`);
  }

  try {
    await activePage.waitForTimeout(SETTLE_DELAY_MS);
  } catch (error) {
    console.error(`[SETTLE] waitForTimeout after ${reason} ended with: ${error.message}`);
  }
}

function getActiveTarget() {
  return activeFrame || page;
}

function getFrameSummaries() {
  if (!page) {
    return [];
  }

  return page.frames().map((frame, index) => ({
    index,
    name: frame.name() || "",
    url: frame.url(),
    isMainFrame: frame === page.mainFrame(),
    isActive: frame === getActiveTarget()
  }));
}

async function waitForVisibleElement(selector, target = getActiveTarget()) {
  await target.locator(selector).waitFor({
    state: "visible",
    timeout: ACTION_TIMEOUT_MS
  });
}

async function removeAnnotations(target = getActiveTarget()) {
  if (!target) {
    return;
  }

  try {
    await target.evaluate(() => {
      document.querySelectorAll(".playwright-annotation").forEach(element => element.remove());
    });
  } catch (error) {
    console.error(`[ANNOTATE] Failed to remove old annotations: ${error.message}`);
  }
}

async function installContextRequestPolicy(browserContext) {
  await browserContext.route("**/*", route => {
    const request = route.request();
    const requestUrl = request.url();
    const resourceType = request.resourceType();

    try {
      const parsedUrl = new URL(requestUrl);
      if (!isHostnameAllowed(parsedUrl.hostname)) {
        addNetworkError(`[BLOCKED HOST] ${request.method()} ${requestUrl}`);
        return route.abort("blockedbyclient");
      }
    } catch (error) {
      addNetworkError(`[BLOCKED URL] ${request.method()} ${requestUrl} - ${error.message}`);
      return route.abort("blockedbyclient");
    }

    if (BLOCK_MEDIA && ["image", "media", "font"].includes(resourceType)) {
      return route.abort();
    }

    return route.continue();
  });
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
        '--disable-geolocation',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--no-sandbox'
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
    activeFrame = null;

    const contextOptions = storageStatePath ? { storageState: storageStatePath } : {};
    context = await browser.newContext(contextOptions);
    await installContextRequestPolicy(context);
    if (BLOCK_MEDIA) {
      console.error("Media blocking is ENABLED via .env");
    }

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
    activeFrame = null;

    console.error("Browser context and page initialized successfully.");
  }

  return { browser, context, page };
}

// --- Tool Handlers ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "browser_session",
        description: "Condensed browser/session operations via action enum (phase 1 adapter).",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: [
                "navigate",
                "get_dom",
                "screenshot",
                "evaluate_js",
                "annotate",
                "click_by_id",
                "export_state",
                "load_state",
                "get_network_errors",
                "get_console_logs",
                "switch_tab",
                "list_frames",
                "select_frame",
                "read_downloaded_file"
              ],
              description: "Session-level action to execute."
            },
            url: { type: "string", description: "Used by action=navigate" },
            path: { type: "string", description: "Used by action=screenshot" },
            code: { type: "string", description: "Used by action=evaluate_js" },
            id: { type: "number", description: "Used by action=click_by_id" },
            filename: { type: "string", description: "Used by actions export_state/load_state" },
            index: { type: "number", description: "Used by actions switch_tab/select_frame" }
          },
          required: ["action"],
        },
      },
      {
        name: "browser_interact",
        description: "Condensed page interaction operations via action enum (phase 1 adapter).",
        inputSchema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: ["click", "fill", "scroll", "hover", "press_key"],
              description: "Interaction action to execute."
            },
            selector: { type: "string", description: "Used by click/fill/hover/press_key" },
            value: { type: "string", description: "Used by action=fill" },
            pixels: { type: "number", description: "Used by action=scroll" },
            key: { type: "string", description: "Used by action=press_key" }
          },
          required: ["action"],
        },
      },
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
        description: "Captures a Base64-encoded screenshot of the current viewport. Optionally saves to disk.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Optional absolute path where to save the PNG file on disk" },
          },
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
        name: "browser_list_frames",
        description: "Lists the frames available in the active page so a specific iframe can be selected.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "browser_select_frame",
        description: "Selects a frame by index from browser_list_frames. Use index 0 for the main frame.",
        inputSchema: {
          type: "object",
          properties: {
            index: { type: "number", description: "The frame index returned by browser_list_frames." },
          },
          required: ["index"],
        },
      }
    ]
  };
});

async function executeLegacyTool(name, args) {
  switch (name) {
    case "browser_navigate": {
      const url = String(args.url);
      assertUrlAllowed(url);

      activeFrame = null;
      await removeAnnotations(page);
      await page.goto(url, { waitUntil: WAIT_FOR_LOAD_STATE, timeout: NAVIGATION_TIMEOUT_MS });
      await settlePage(page, { reason: "browser_navigate" });
      const title = await page.title();
      const currentUrl = page.url();
      return {
        content: [{ type: "text", text: `Navigazione completata. URL: ${currentUrl}, Titolo: ${title}` }],
      };
    }

    case "browser_click": {
      const selector = String(args.selector);
      const target = getActiveTarget();
      await removeAnnotations(target);
      await waitForVisibleElement(selector, target);
      await target.click(selector, { timeout: ACTION_TIMEOUT_MS });
      await settlePage(target, { waitForNavigation: true, reason: `browser_click(${selector})` });
      return {
        content: [{ type: "text", text: `Click su selettore '${selector}' eseguito con successo.` }],
      };
    }

    case "browser_fill": {
      const selector = String(args.selector);
      const value = String(args.value);
      const target = getActiveTarget();
      await removeAnnotations(target);
      await waitForVisibleElement(selector, target);
      await target.fill(selector, value, { timeout: ACTION_TIMEOUT_MS });
      await settlePage(target, { reason: `browser_fill(${selector})` });
      return {
        content: [{ type: "text", text: `Testo inserito nel selettore '${selector}' con successo.` }],
      };
    }

    case "browser_get_dom": {
      const target = getActiveTarget();
      const compactDOM = await target.evaluate(() => {
        function getCleanOutline(node) {
          if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) return null;
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent.trim();
            return text ? text : null;
          }

          const t = node.tagName.toLowerCase();
          if (["script", "style", "svg", "noscript", "meta", "link", "iframe"].includes(t)) return null;

          const children = [];
          for (let child of node.childNodes) {
            const c = getCleanOutline(child);
            if (c) children.push(c);
          }

          const isInteractive = ["a", "button", "input", "select", "textarea", "label"].includes(t);
          const role = node.getAttribute("role");
          const hasInteractiveRole = role && ["button", "link", "checkbox", "menuitem"].includes(role);

          if (!isInteractive && !hasInteractiveRole && children.length === 0) return null;

          let str = `<${t}`;
          if (node.id) str += ` id="${node.id}"`;
          if (isInteractive || hasInteractiveRole) {
            Array.from(node.attributes).forEach(attr => {
              if (["name", "type", "placeholder", "aria-label", "role"].includes(attr.name)) {
                str += ` ${attr.name}="${attr.value}"`;
              }
            });
          }
          str += ">";

          if (children.length === 1 && typeof children[0] === "string") {
            str += children[0];
          } else if (children.length > 0) {
            str += "\n  " + children.map(c => typeof c === "string" ? c : c).join("\n").replace(/\n/g, "\n  ") + "\n";
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
      const savePath = args && args.path ? String(args.path) : null;
      const buffer = await page.screenshot({ fullPage: false });
      const currentUrl = page.url();
      const title = await page.title();
      if (savePath) {
        const { writeFileSync, mkdirSync } = await import("fs");
        const { dirname } = await import("path");
        mkdirSync(dirname(savePath), { recursive: true });
        writeFileSync(savePath, buffer);
      }
      return {
        content: [{
          type: "image",
          data: buffer.toString("base64"),
          mimeType: "image/png"
        }, {
          type: "text",
          text: `Screenshot catturato. URL: ${currentUrl}, Titolo: ${title}${savePath ? ` | Salvato: ${savePath}` : ""}`
        }],
      };
    }

    case "browser_evaluate_js": {
      const code = String(args.code);
      const target = getActiveTarget();
      const result = await target.evaluate(code);
      const resultStr = typeof result === "object" ? JSON.stringify(result, null, 2) : String(result);
      return {
        content: [{ type: "text", text: `Execution result:
${resultStr}` }],
      };
    }

    case "browser_annotate": {
      const target = getActiveTarget();
      await removeAnnotations(target);
      await target.evaluate(() => {
        let elements = document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"], [role="checkbox"], [role="menuitem"]');
        window.__elementMap = {};
        let counter = 1;

        elements.forEach(el => {
          const rect = el.getBoundingClientRect();
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
            label.style.padding = '1px 4px';
            label.style.fontSize = '11px';
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

      await new Promise(resolve => setTimeout(resolve, 100));
      const buffer = await page.screenshot({ fullPage: false });

      return {
        content: [{
          type: "image",
          data: buffer.toString("base64"),
          mimeType: "image/png"
        }, {
          type: "text",
          text: "Etichette iniettate. Usa l'ID visibile nell'immagine con browser_click_by_id."
        }],
      };
    }

    case "browser_click_by_id": {
      const id = Number(args.id);
      const target = getActiveTarget();
      const result = await target.evaluate((selectorId) => {
        if (window.__elementMap && window.__elementMap[selectorId]) {
          document.querySelectorAll('.playwright-annotation').forEach(e => e.remove());
          window.__elementMap[selectorId].click();
          return true;
        }
        return false;
      }, id);

      if (result) {
        await settlePage(target, { waitForNavigation: true, reason: `browser_click_by_id(${id})` });
        return {
          content: [{ type: "text", text: `Elemento ${id} cliccato con successo.` }],
        };
      }

      throw new Error(`Elemento con ID ${id} non trovato. Esegui prima browser_annotate.`);
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
      await ensureBrowser(filename);
      return {
        content: [{ type: "text", text: `Browser state loaded successfully from ${filename}. A new browser context is now active.` }],
      };
    }

    case "browser_scroll": {
      let pixels = args.pixels !== undefined ? Number(args.pixels) : 500;
      const target = getActiveTarget();
      await target.evaluate((px) => window.scrollBy(0, px), pixels);
      return {
        content: [{ type: "text", text: `Scrolled by ${pixels} pixels.` }],
      };
    }

    case "browser_hover": {
      const selector = String(args.selector);
      const target = getActiveTarget();
      await waitForVisibleElement(selector, target);
      await target.hover(selector, { timeout: ACTION_TIMEOUT_MS });
      return {
        content: [{ type: "text", text: `Hovered over element matching '${selector}'.` }],
      };
    }

    case "browser_press_key": {
      const selector = String(args.selector);
      const key = String(args.key);
      const target = getActiveTarget();
      await removeAnnotations(target);
      await waitForVisibleElement(selector, target);
      await target.press(selector, key, { timeout: ACTION_TIMEOUT_MS });
      await settlePage(target, { waitForNavigation: true, reason: `browser_press_key(${selector}, ${key})` });
      return {
        content: [{ type: "text", text: `Pressed key '${key}' on element matching '${selector}'.` }],
      };
    }

    case "browser_get_network_errors": {
      return {
        content: [{ type: "text", text: networkErrors.length > 0 ? networkErrors.join("\n") : "No network errors detected." }],
      };
    }

    case "browser_get_console_logs": {
      return {
        content: [{ type: "text", text: consoleLogs.length > 0 ? consoleLogs.join("\n") : "No console errors detected." }],
      };
    }

    case "browser_switch_tab": {
      const index = Number(args.index);
      if (index >= 0 && index < pages.length) {
        page = pages[index];
        activeFrame = null;
        await page.bringToFront();
        const title = await page.title();
        return {
          content: [{ type: "text", text: `Switched to tab ${index}. Active URL: ${page.url()}, Title: ${title}` }],
        };
      }

      return {
        content: [{ type: "text", text: `Invalid tab index ${index}. There are currently ${pages.length} tabs open (indexes 0 to ${pages.length - 1}).` }],
        isError: true,
      };
    }

    case "browser_list_frames": {
      const frames = getFrameSummaries();
      return {
        content: [{
          type: "text",
          text: frames.length > 0
            ? JSON.stringify(frames, null, 2)
            : "No frames found in the active page."
        }],
      };
    }

    case "browser_select_frame": {
      const index = Number(args.index);
      const frames = page.frames();
      if (index >= 0 && index < frames.length) {
        activeFrame = frames[index];
        await settlePage(activeFrame, { reason: `browser_select_frame(${index})` });
        return {
          content: [{
            type: "text",
            text: `Frame ${index} selected. URL: ${activeFrame.url()}${activeFrame === page.mainFrame() ? " | Main frame" : ""}`
          }],
        };
      }

      return {
        content: [{
          type: "text",
          text: `Invalid frame index ${index}. Use browser_list_frames to inspect available frames.`
        }],
        isError: true,
      };
    }

    case "browser_read_downloaded_file": {
      if (!lastDownloadBuffer) {
        return {
          content: [{ type: "text", text: "Nessun file scaricato in questa sessione." }],
          isError: true,
        };
      }
      const textContent = lastDownloadBuffer.toString("utf-8");
      return {
        content: [{ type: "text", text: `[FILE NAME]: ${lastDownloadFilename}
--- CONTENT ---
${textContent}
---------------` }],
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Tool ${name} non implementato ancora.` }],
        isError: true,
      };
  }
}

const SESSION_ACTION_TO_LEGACY = {
  navigate: { legacyTool: "browser_navigate", pickArgs: args => ({ url: args.url }) },
  get_dom: { legacyTool: "browser_get_dom", pickArgs: () => ({}) },
  screenshot: { legacyTool: "browser_screenshot", pickArgs: args => ({ path: args.path }) },
  evaluate_js: { legacyTool: "browser_evaluate_js", pickArgs: args => ({ code: args.code }) },
  annotate: { legacyTool: "browser_annotate", pickArgs: () => ({}) },
  click_by_id: { legacyTool: "browser_click_by_id", pickArgs: args => ({ id: args.id }) },
  export_state: { legacyTool: "browser_export_state", pickArgs: args => ({ filename: args.filename }) },
  load_state: { legacyTool: "browser_load_state", pickArgs: args => ({ filename: args.filename }) },
  get_network_errors: { legacyTool: "browser_get_network_errors", pickArgs: () => ({}) },
  get_console_logs: { legacyTool: "browser_get_console_logs", pickArgs: () => ({}) },
  switch_tab: { legacyTool: "browser_switch_tab", pickArgs: args => ({ index: args.index }) },
  list_frames: { legacyTool: "browser_list_frames", pickArgs: () => ({}) },
  select_frame: { legacyTool: "browser_select_frame", pickArgs: args => ({ index: args.index }) },
  read_downloaded_file: { legacyTool: "browser_read_downloaded_file", pickArgs: () => ({}) }
};

const INTERACT_ACTION_TO_LEGACY = {
  click: { legacyTool: "browser_click", pickArgs: args => ({ selector: args.selector }) },
  fill: { legacyTool: "browser_fill", pickArgs: args => ({ selector: args.selector, value: args.value }) },
  scroll: { legacyTool: "browser_scroll", pickArgs: args => ({ pixels: args.pixels }) },
  hover: { legacyTool: "browser_hover", pickArgs: args => ({ selector: args.selector }) },
  press_key: { legacyTool: "browser_press_key", pickArgs: args => ({ selector: args.selector, key: args.key }) }
};

const LEGACY_TO_CONDENSED = {
  browser_navigate: { tool: "browser_session", action: "navigate" },
  browser_get_dom: { tool: "browser_session", action: "get_dom" },
  browser_screenshot: { tool: "browser_session", action: "screenshot" },
  browser_evaluate_js: { tool: "browser_session", action: "evaluate_js" },
  browser_annotate: { tool: "browser_session", action: "annotate" },
  browser_click_by_id: { tool: "browser_session", action: "click_by_id" },
  browser_export_state: { tool: "browser_session", action: "export_state" },
  browser_load_state: { tool: "browser_session", action: "load_state" },
  browser_get_network_errors: { tool: "browser_session", action: "get_network_errors" },
  browser_get_console_logs: { tool: "browser_session", action: "get_console_logs" },
  browser_switch_tab: { tool: "browser_session", action: "switch_tab" },
  browser_list_frames: { tool: "browser_session", action: "list_frames" },
  browser_select_frame: { tool: "browser_session", action: "select_frame" },
  browser_read_downloaded_file: { tool: "browser_session", action: "read_downloaded_file" },
  browser_click: { tool: "browser_interact", action: "click" },
  browser_fill: { tool: "browser_interact", action: "fill" },
  browser_scroll: { tool: "browser_interact", action: "scroll" },
  browser_hover: { tool: "browser_interact", action: "hover" },
  browser_press_key: { tool: "browser_interact", action: "press_key" }
};

function resolveToolInvocation(name, args = {}) {
  if (name === "browser_session") {
    const action = String(args.action || "");
    const mapping = SESSION_ACTION_TO_LEGACY[action];
    if (!mapping) {
      throw new Error(`Azione browser_session non supportata: ${action}`);
    }

    return {
      resolvedName: mapping.legacyTool,
      resolvedArgs: mapping.pickArgs(args),
      adapter: { source: "condensed", entryTool: name, action, legacyTool: mapping.legacyTool }
    };
  }

  if (name === "browser_interact") {
    const action = String(args.action || "");
    const mapping = INTERACT_ACTION_TO_LEGACY[action];
    if (!mapping) {
      throw new Error(`Azione browser_interact non supportata: ${action}`);
    }

    return {
      resolvedName: mapping.legacyTool,
      resolvedArgs: mapping.pickArgs(args),
      adapter: { source: "condensed", entryTool: name, action, legacyTool: mapping.legacyTool }
    };
  }

  const legacyMapping = LEGACY_TO_CONDENSED[name];
  if (legacyMapping) {
    return {
      resolvedName: name,
      resolvedArgs: args,
      adapter: {
        source: "legacy",
        entryTool: name,
        action: legacyMapping.action,
        legacyTool: name,
        condensedTool: legacyMapping.tool
      }
    };
  }

  return { resolvedName: name, resolvedArgs: args, adapter: null };
}

function attachStructuredOutput(response, adapter) {
  if (!adapter || adapter.source !== "condensed") {
    return response;
  }

  const textEntry = response.content?.find(item => item.type === "text");
  return {
    ...response,
    structuredContent: {
      schemaVersion: "2026-03-30",
      status: response.isError ? "error" : "ok",
      adapter: {
        entryTool: adapter.entryTool,
        action: adapter.action,
        legacyTool: adapter.legacyTool
      },
      message: textEntry?.text || ""
    }
  };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  resetIdleTimer();

  await ensureBrowser();

  const { name, arguments: args = {} } = request.params;

  try {
    const { resolvedName, resolvedArgs, adapter } = resolveToolInvocation(name, args);
    const executionResult = await executeLegacyTool(resolvedName, resolvedArgs || {});
    return attachStructuredOutput(executionResult, adapter);
  } catch (error) {
    return {
      content: [{ type: "text", text: `Errore durante l'esecuzione di ${name}: ${error.message}` }],
      isError: true,
    };
  }
});

// --- Transport & Shutdown ---
loadAllowedHosts();
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
