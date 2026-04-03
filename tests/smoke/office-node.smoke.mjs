import { runSmoke } from './run-smoke.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const registryTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-smoke-registry-'));
const registryPath = path.join(registryTempDir, 'artifact-registry.json');

await runSmoke({
  serverName: 'office-node',
  command: process.execPath,
  args: ['office-node/index.js'],
  env: {
    OFFICE_ARTIFACT_REGISTRY_PATH: registryPath
  },
  async afterInitialize({ request }) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-smoke-'));
    const textArtifactUri = 'artifact://office/2026/04/smoke-text-artifact';
    const textArtifactPath = path.join(tempDir, 'artifact-export.md');

    try {
      fs.writeFileSync(textArtifactPath, '# Smoke Artifact\n\nContenuto markdown.\n', 'utf8');
      fs.mkdirSync(path.dirname(registryPath), { recursive: true });
      fs.writeFileSync(
        registryPath,
        `${JSON.stringify([{
          artifact_uri: textArtifactUri,
          save_path: textArtifactPath,
          mime_type: 'text/markdown',
          producer_tool: 'smoke.seed',
          created_at: new Date().toISOString()
        }], null, 2)}\n`,
        'utf8'
      );

      const resourcesResult = await request('resources/list', {});
      if (!resourcesResult || !Array.isArray(resourcesResult.resources)) {
        throw new Error(`Invalid resources/list response: ${JSON.stringify(resourcesResult)}`);
      }

      const exportedResource = resourcesResult.resources.find((resource) => resource?.uri === textArtifactUri);
      if (!exportedResource) {
        throw new Error(`resources/list missing seeded artifact ${textArtifactUri}`);
      }

      const readResult = await request('resources/read', { uri: textArtifactUri });
      if (!readResult || !Array.isArray(readResult.contents) || readResult.contents.length === 0) {
        throw new Error(`Invalid resources/read response: ${JSON.stringify(readResult)}`);
      }

      const textContent = readResult.contents.find((content) => content?.uri === textArtifactUri);
      if (!textContent || typeof textContent.text !== 'string' || textContent.text.length === 0) {
        throw new Error(`resources/read missing textual content for ${textArtifactUri}: ${JSON.stringify(readResult)}`);
      }

      const templatesResult = await request('resources/templates/list', {});
      if (!templatesResult || !Array.isArray(templatesResult.resourceTemplates)) {
        throw new Error(`Invalid resources/templates/list response: ${JSON.stringify(templatesResult)}`);
      }

      const hasArtifactTemplate = templatesResult.resourceTemplates.some(
        (template) => template?.uriTemplate === 'artifact://office/{year}/{month}/{artifact_id}'
      );
      if (!hasArtifactTemplate) {
        throw new Error(`resources/templates/list missing artifact URI template: ${JSON.stringify(templatesResult)}`);
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(registryTempDir, { recursive: true, force: true });
    }
  }
});
