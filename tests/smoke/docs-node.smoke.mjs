import { runSmoke } from './run-smoke.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function getTextBlocks(result) {
  const content = result?.content;
  if (!Array.isArray(content)) {
    throw new Error(`Tool response missing content array: ${JSON.stringify(result)}`);
  }

  const textBlocks = content.filter((block) => block?.type === 'text' && typeof block?.text === 'string');
  if (textBlocks.length === 0) {
    throw new Error(`Tool response missing text blocks: ${JSON.stringify(result)}`);
  }

  return textBlocks;
}

function extractJsonFromToolResult(result) {
  const textBlocks = getTextBlocks(result);

  for (const block of textBlocks) {
    const text = block.text.trim();
    if (!text || text.startsWith('[OK]') || text.startsWith('[WARN]') || text.startsWith('[ERROR]')) {
      continue;
    }

    try {
      return JSON.parse(text);
    } catch {
      // Ignore non-JSON informational blocks and continue.
    }
  }

  throw new Error(`Tool response did not include JSON payload: ${JSON.stringify(result)}`);
}

await runSmoke({
  serverName: 'docs-node',
  command: process.execPath,
  args: ['docs-node/index.js'],
  afterInitialize: async ({ request }) => {
    const tempDir = mkdtempSync(join(tmpdir(), 'docs-node-smoke-'));
    const docPath = join(tempDir, 'smoke-doc.md');
    const expectedBody = '# MCP Smoke Doc\n\nresource-read-check\n';
    const testShelfName = `smoke-shelf-${Date.now()}`;

    writeFileSync(docPath, expectedBody, 'utf8');

    const scanFileResult = await request('tools/call', {
      name: 'docs_management',
      arguments: {
        action: 'scan_file',
        shelf: testShelfName,
        file_path: docPath
      }
    });

    if (scanFileResult?.isError) {
      throw new Error(`docs_management scan_file returned isError: ${JSON.stringify(scanFileResult)}`);
    }

    const listDocumentsResult = await request('tools/call', {
      name: 'docs_navigation',
      arguments: {
        action: 'list_documents',
        shelf: testShelfName
      }
    });

    if (listDocumentsResult?.isError) {
      throw new Error(`docs_navigation list_documents returned isError: ${JSON.stringify(listDocumentsResult)}`);
    }

    const listedDocuments = extractJsonFromToolResult(listDocumentsResult);
    if (!Array.isArray(listedDocuments) || listedDocuments.length === 0) {
      throw new Error(`docs_navigation list_documents returned no documents: ${JSON.stringify(listDocumentsResult)}`);
    }

    const docWithUri = listedDocuments.find((doc) => typeof doc?.resource_uri === 'string' && doc.resource_uri.startsWith('docs://document/'));
    if (!docWithUri) {
      throw new Error(`Expected at least one list_documents result containing resource_uri: ${JSON.stringify(listedDocuments)}`);
    }

    const resourcesListResult = await request('resources/list', {});
    if (!resourcesListResult || !Array.isArray(resourcesListResult.resources)) {
      throw new Error(`Invalid resources/list response: ${JSON.stringify(resourcesListResult)}`);
    }
    if (resourcesListResult.resources.length === 0) {
      throw new Error(`resources/list returned an empty resources array: ${JSON.stringify(resourcesListResult)}`);
    }

    for (const resource of resourcesListResult.resources) {
      if (!resource || typeof resource !== 'object') {
        throw new Error(`resources/list entry must be an object: ${JSON.stringify(resource)}`);
      }
      if (typeof resource.uri !== 'string' || resource.uri.length === 0) {
        throw new Error(`resources/list entry missing string uri: ${JSON.stringify(resource)}`);
      }
      if (typeof resource.name !== 'string' || resource.name.length === 0) {
        throw new Error(`resources/list entry missing string name: ${JSON.stringify(resource)}`);
      }
      if (resource.description !== undefined && typeof resource.description !== 'string') {
        throw new Error(`resources/list entry description must be a string when present: ${JSON.stringify(resource)}`);
      }
      if (resource.mimeType !== undefined && typeof resource.mimeType !== 'string') {
        throw new Error(`resources/list entry mimeType must be a string when present: ${JSON.stringify(resource)}`);
      }
    }

    const shelfResource = resourcesListResult.resources.find((resource) =>
      typeof resource?.uri === 'string' && resource.uri.startsWith('docs://shelf/')
    );
    if (!shelfResource) {
      throw new Error(`resources/list did not return any shelf resource: ${JSON.stringify(resourcesListResult)}`);
    }

    const shelfReadResult = await request('resources/read', { uri: shelfResource.uri });
    if (!shelfReadResult || !Array.isArray(shelfReadResult.contents)) {
      throw new Error(`Invalid shelf resources/read response: ${JSON.stringify(shelfReadResult)}`);
    }
    if (shelfReadResult.contents.length === 0) {
      throw new Error(`shelf resources/read returned an empty contents array: ${JSON.stringify(shelfReadResult)}`);
    }
    if (shelfReadResult.contents[0]?.mimeType !== 'application/json') {
      throw new Error(`shelf resources/read first content must have mimeType application/json: ${JSON.stringify(shelfReadResult.contents[0])}`);
    }
    if (typeof shelfReadResult.contents[0]?.text !== 'string' || shelfReadResult.contents[0].text.length === 0) {
      throw new Error(`shelf resources/read first content missing JSON text payload: ${JSON.stringify(shelfReadResult.contents[0])}`);
    }

    let shelfJson;
    try {
      shelfJson = JSON.parse(shelfReadResult.contents[0].text);
    } catch (error) {
      throw new Error(`shelf resources/read first content is not valid JSON: ${error.message}`);
    }

    if (!Array.isArray(shelfJson.documents)) {
      throw new Error(`shelf JSON payload missing documents array: ${JSON.stringify(shelfJson)}`);
    }
    if (shelfJson.documents.length === 0) {
      throw new Error(`shelf JSON payload documents array is empty: ${JSON.stringify(shelfJson)}`);
    }

    for (const document of shelfJson.documents) {
      if (typeof document?.uri !== 'string' || !document.uri.startsWith('docs://document/')) {
        throw new Error(`shelf JSON document missing readable URI: ${JSON.stringify(document)}`);
      }
    }

    const resourceUri = docWithUri.resource_uri;

    const resourceReadResult = await request('resources/read', { uri: resourceUri });
    if (!resourceReadResult || !Array.isArray(resourceReadResult.contents)) {
      throw new Error(`Invalid resources/read response: ${JSON.stringify(resourceReadResult)}`);
    }
    if (resourceReadResult.contents.length === 0) {
      throw new Error(`resources/read returned an empty contents array: ${JSON.stringify(resourceReadResult)}`);
    }

    const markdownContent = resourceReadResult.contents.find((item) => item?.uri === resourceUri);
    if (!markdownContent) {
      throw new Error(`resources/read does not contain requested uri ${resourceUri}: ${JSON.stringify(resourceReadResult)}`);
    }
    if (typeof markdownContent.mimeType !== 'string' || markdownContent.mimeType.length === 0) {
      throw new Error(`resources/read content missing mimeType string: ${JSON.stringify(markdownContent)}`);
    }
    if (typeof markdownContent.text !== 'string' || markdownContent.text.length === 0) {
      throw new Error(`resources/read content missing text string: ${JSON.stringify(markdownContent)}`);
    }
    if (markdownContent.text.trim() !== expectedBody.trim()) {
      throw new Error(`resources/read content mismatch for ${resourceUri}`);
    }

    const templatesResult = await request('resources/templates/list', {});
    if (!templatesResult || !Array.isArray(templatesResult.resourceTemplates)) {
      throw new Error(`Invalid resources/templates/list response: ${JSON.stringify(templatesResult)}`);
    }
    if (templatesResult.resourceTemplates.length === 0) {
      throw new Error(`resources/templates/list returned an empty resourceTemplates array: ${JSON.stringify(templatesResult)}`);
    }

    for (const template of templatesResult.resourceTemplates) {
      if (!template || typeof template !== 'object') {
        throw new Error(`resources/templates/list entry must be an object: ${JSON.stringify(template)}`);
      }
      if (typeof template.uriTemplate !== 'string' || template.uriTemplate.length === 0) {
        throw new Error(`resource template missing string uriTemplate: ${JSON.stringify(template)}`);
      }
      if (typeof template.name !== 'string' || template.name.length === 0) {
        throw new Error(`resource template missing string name: ${JSON.stringify(template)}`);
      }
      if (template.description !== undefined && typeof template.description !== 'string') {
        throw new Error(`resource template description must be a string when present: ${JSON.stringify(template)}`);
      }
      if (template.mimeType !== undefined && typeof template.mimeType !== 'string') {
        throw new Error(`resource template mimeType must be a string when present: ${JSON.stringify(template)}`);
      }
    }
  }
});
