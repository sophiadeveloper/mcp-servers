import { runSmoke } from './run-smoke.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-docs-bridge-'));
const registryPath = path.join(workspaceDir, 'artifact-registry.json');
const sourcePdfPath = path.join(workspaceDir, 'bridge-source.pdf');
const exportedMarkdownPath = path.join(workspaceDir, 'bridge-export.md');
const shelfName = `bridge-smoke-${Date.now()}`;

const minimalPdf = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 45 >>\nstream\nBT\n/F1 18 Tf\n50 100 Td\n(Bridge Smoke) Tj\nET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000243 00000 n \n0000000338 00000 n \ntrailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n408\n%%EOF\n`;

function getTextContent(result) {
  if (!result || !Array.isArray(result.content)) return '';
  return result.content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

function extractJsonFromContent(result) {
  if (!result || !Array.isArray(result.content)) {
    throw new Error(`Tool response missing content: ${JSON.stringify(result)}`);
  }

  for (const block of result.content) {
    if (block?.type !== 'text' || typeof block.text !== 'string') continue;
    const text = block.text.trim();
    if (!text || text.startsWith('[OK]') || text.startsWith('[WARN]') || text.startsWith('[ERROR]')) {
      continue;
    }

    try {
      return JSON.parse(text);
    } catch {
      // Keep scanning; not every block is JSON.
    }
  }

  throw new Error(`No JSON payload found in tool response: ${JSON.stringify(result)}`);
}

let officeArtifactUri = null;

try {
  fs.writeFileSync(sourcePdfPath, minimalPdf, 'utf8');

  await runSmoke({
    serverName: 'office-node bridge export',
    command: process.execPath,
    args: ['office-node/index.js'],
    env: {
      OFFICE_ARTIFACT_REGISTRY_PATH: registryPath
    },
    async afterInitialize({ request }) {
      const exportResult = await request('tools/call', {
        name: 'pdf_document',
        arguments: {
          action: 'export_text',
          file_path: sourcePdfPath,
          save_path: exportedMarkdownPath,
          format: 'md'
        }
      });

      const structured = exportResult?.structuredContent;
      if (!structured || structured.save_path !== path.resolve(exportedMarkdownPath)) {
        throw new Error(`pdf export missing/invalid save_path: ${JSON.stringify(exportResult)}`);
      }
      if (!structured.resource_link || !String(structured.resource_link).startsWith('artifact://office/')) {
        throw new Error(`pdf export missing/invalid resource_link: ${JSON.stringify(exportResult)}`);
      }

      officeArtifactUri = structured.resource_link;

      const exportText = fs.readFileSync(path.resolve(exportedMarkdownPath), 'utf8');
      if (!exportText.includes('Bridge Smoke')) {
        throw new Error(`Unexpected exported markdown content: ${exportText}`);
      }

      const logs = getTextContent(exportResult);
      if (!logs.includes('Artifact URI:')) {
        throw new Error(`Human-readable output missing artifact URI: ${logs}`);
      }

      const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
      const registryEntry = registry.find((entry) => entry?.artifact_uri === officeArtifactUri);
      if (!registryEntry) {
        throw new Error(`Artifact URI not found in registry: ${officeArtifactUri}`);
      }
      if (registryEntry.save_path !== path.resolve(exportedMarkdownPath)) {
        throw new Error(`Registry save_path mismatch: ${JSON.stringify(registryEntry)}`);
      }

      const resourceRead = await request('resources/read', { uri: officeArtifactUri });
      const resourceContent = resourceRead?.contents?.find((item) => item?.uri === officeArtifactUri);
      if (!resourceContent || typeof resourceContent.text !== 'string') {
        throw new Error(`resources/read missing text for ${officeArtifactUri}: ${JSON.stringify(resourceRead)}`);
      }
      if (resourceContent.text !== exportText) {
        throw new Error('resources/read content mismatch vs exported markdown file');
      }
    }
  });

  await runSmoke({
    serverName: 'docs-node bridge ingest',
    command: process.execPath,
    args: ['docs-node/index.js'],
    async afterInitialize({ request }) {
      if (!officeArtifactUri) {
        throw new Error('office artifact URI unavailable from previous smoke phase');
      }

      const scanResult = await request('tools/call', {
        name: 'docs_management',
        arguments: {
          action: 'scan_file',
          shelf: shelfName,
          file_path: exportedMarkdownPath
        }
      });

      if (scanResult?.isError) {
        throw new Error(`docs_management scan_file returned error: ${JSON.stringify(scanResult)}`);
      }

      const listResult = await request('tools/call', {
        name: 'docs_navigation',
        arguments: {
          action: 'list_documents',
          shelf: shelfName
        }
      });

      const docs = extractJsonFromContent(listResult);
      if (!Array.isArray(docs) || docs.length === 0) {
        throw new Error(`No documents indexed from Office export save_path: ${JSON.stringify(listResult)}`);
      }

      const bridgeDoc = docs.find((document) => document?.file_path === path.resolve(exportedMarkdownPath));
      if (!bridgeDoc) {
        throw new Error(`Indexed documents do not include exported markdown path: ${JSON.stringify(docs)}`);
      }

      const searchResult = await request('tools/call', {
        name: 'docs_navigation',
        arguments: {
          action: 'search',
          query: 'Bridge Smoke',
          shelf: shelfName,
          limit: 5
        }
      });

      const searchPayload = extractJsonFromContent(searchResult);
      if (!Array.isArray(searchPayload) || searchPayload.length === 0) {
        throw new Error(`Search did not return indexed Office export content: ${JSON.stringify(searchResult)}`);
      }
    }
  });
} finally {
  fs.rmSync(workspaceDir, { recursive: true, force: true });
}
