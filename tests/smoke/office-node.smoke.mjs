import { runSmoke } from './run-smoke.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const registryTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-smoke-registry-'));
const registryPath = path.join(registryTempDir, 'artifact-registry.json');

function assertArraySchemasDeclareItems(schema, breadcrumb = 'inputSchema') {
  if (!schema || typeof schema !== 'object') return;

  if (schema.type === 'array' && !Object.prototype.hasOwnProperty.call(schema, 'items')) {
    throw new Error(`Schema sanity check failed: ${breadcrumb} is array without items`);
  }

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [key, value] of Object.entries(schema.properties)) {
      assertArraySchemasDeclareItems(value, `${breadcrumb}.properties.${key}`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'items')) {
    assertArraySchemasDeclareItems(schema.items, `${breadcrumb}.items`);
  }

  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((node, idx) => assertArraySchemasDeclareItems(node, `${breadcrumb}.anyOf[${idx}]`));
  }

  if (Array.isArray(schema.oneOf)) {
    schema.oneOf.forEach((node, idx) => assertArraySchemasDeclareItems(node, `${breadcrumb}.oneOf[${idx}]`));
  }

  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((node, idx) => assertArraySchemasDeclareItems(node, `${breadcrumb}.allOf[${idx}]`));
  }
}

function extractTextContent(result) {
  if (!result || !Array.isArray(result.content)) {
    return '';
  }

  return result.content
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n');
}

function validatePromptMetadata(promptsList) {
  if (!Array.isArray(promptsList?.prompts)) {
    throw new Error(`prompts/list invalid payload: ${JSON.stringify(promptsList)}`);
  }

  const prompt = promptsList.prompts.find((entry) => entry?.name === 'ingest_pdf_into_docs');
  if (!prompt) {
    throw new Error(`prompts/list missing ingest_pdf_into_docs: ${JSON.stringify(promptsList)}`);
  }

  if (!Array.isArray(prompt.arguments)) {
    throw new Error(`prompts/list ingest_pdf_into_docs missing arguments array: ${JSON.stringify(prompt)}`);
  }

  const requiredArgs = ['pdf_path', 'save_path', 'shelf_name', 'doc_title'];
  for (const argName of requiredArgs) {
    const arg = prompt.arguments.find((entry) => entry?.name === argName);
    if (!arg || arg.required !== true) {
      throw new Error(`prompts/list ingest_pdf_into_docs invalid required arg "${argName}": ${JSON.stringify(prompt)}`);
    }
  }
}

await runSmoke({
  serverName: 'office-node',
  command: process.execPath,
  args: ['office-node/index.js'],
  env: {
    OFFICE_ARTIFACT_REGISTRY_PATH: registryPath
  },
  async afterInitialize({ request, toolsList }) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-smoke-'));

    const sourcePdfPath = path.join(tempDir, 'source.pdf');
    const exportTxtPath = path.join(tempDir, 'exported.txt');
    const excelPath = path.join(tempDir, 'report.xlsx');

    const minimalPdf = `%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT\n/F1 18 Tf\n50 100 Td\n(Smoke PDF) Tj\nET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \n0000000243 00000 n \n0000000337 00000 n \ntrailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n407\n%%EOF\n`;

    try {
      const promptsList = await request('prompts/list', {});
      validatePromptMetadata(promptsList);

      const promptResult = await request('prompts/get', {
        name: 'ingest_pdf_into_docs',
        arguments: {
          pdf_path: sourcePdfPath,
          save_path: exportTxtPath,
          shelf_name: 'smoke-shelf',
          doc_title: 'Smoke PDF'
        }
      });
      const promptText = promptResult?.messages?.[0]?.content?.text || '';
      if (!promptText.includes(sourcePdfPath) || !promptText.includes(exportTxtPath) || !promptText.includes('docs_management(action="scan_file"')) {
        throw new Error(`prompts/get ingest_pdf_into_docs missing expected fragments: ${JSON.stringify(promptResult)}`);
      }

      // 1) tools/list schema sanity check
      if (!Array.isArray(toolsList.tools) || toolsList.tools.length === 0) {
        throw new Error(`tools/list empty or invalid: ${JSON.stringify(toolsList)}`);
      }
      for (const tool of toolsList.tools) {
        if (!tool || typeof tool.name !== 'string') {
          throw new Error(`Invalid tool entry: ${JSON.stringify(tool)}`);
        }
        if (!tool.inputSchema || tool.inputSchema.type !== 'object') {
          throw new Error(`Invalid inputSchema for tool ${tool.name}: ${JSON.stringify(tool.inputSchema)}`);
        }
        assertArraySchemasDeclareItems(tool.inputSchema, `${tool.name}.inputSchema`);
      }

      // 2) Word/Excel write case with resource_link emission (Excel)
      const excelWriteResult = await request('tools/call', {
        name: 'excel_document',
        arguments: {
          action: 'write_cells',
          file_path: excelPath,
          sheet_name: 'Smoke',
          start_cell: 'A1',
          values: [['k', 'v'], ['status', 'ok']]
        }
      });

      const excelStructured = excelWriteResult?.structuredContent;
      if (!excelStructured || excelStructured.save_path !== path.resolve(excelPath)) {
        throw new Error(`excel write missing/invalid save_path: ${JSON.stringify(excelWriteResult)}`);
      }
      if (!excelStructured.resource_link || !String(excelStructured.resource_link).startsWith('artifact://office/')) {
        throw new Error(`excel write missing/invalid resource_link: ${JSON.stringify(excelWriteResult)}`);
      }

      // 3) pdf_document export_text -> verify save_path + resource_link
      fs.writeFileSync(sourcePdfPath, minimalPdf, 'utf8');
      const pdfExportResult = await request('tools/call', {
        name: 'pdf_document',
        arguments: {
          action: 'export_text',
          file_path: sourcePdfPath,
          save_path: exportTxtPath,
          format: 'txt'
        }
      });

      const pdfStructured = pdfExportResult?.structuredContent;
      if (!pdfStructured || pdfStructured.save_path !== path.resolve(exportTxtPath)) {
        throw new Error(`pdf export missing/invalid save_path: ${JSON.stringify(pdfExportResult)}`);
      }
      if (!pdfStructured.resource_link || !String(pdfStructured.resource_link).startsWith('artifact://office/')) {
        throw new Error(`pdf export missing/invalid resource_link: ${JSON.stringify(pdfExportResult)}`);
      }
      if (!fs.existsSync(path.resolve(exportTxtPath))) {
        throw new Error(`pdf export save_path not created: ${path.resolve(exportTxtPath)}`);
      }

      const exportedText = fs.readFileSync(path.resolve(exportTxtPath), 'utf8');
      if (!exportedText.includes('Smoke PDF')) {
        throw new Error(`Unexpected exported PDF text content: ${exportedText}`);
      }

      // 4) resources/list includes artifact://... returned by export
      const resourcesResult = await request('resources/list', {});
      if (!resourcesResult || !Array.isArray(resourcesResult.resources)) {
        throw new Error(`Invalid resources/list response: ${JSON.stringify(resourcesResult)}`);
      }

      const pdfResource = resourcesResult.resources.find((resource) => resource?.uri === pdfStructured.resource_link);
      if (!pdfResource) {
        throw new Error(`resources/list missing exported artifact ${pdfStructured.resource_link}`);
      }

      // 5) resources/read on artifact returns coherent content
      const readResult = await request('resources/read', { uri: pdfStructured.resource_link });
      if (!readResult || !Array.isArray(readResult.contents) || readResult.contents.length === 0) {
        throw new Error(`Invalid resources/read response: ${JSON.stringify(readResult)}`);
      }

      const textContent = readResult.contents.find((content) => content?.uri === pdfStructured.resource_link);
      if (!textContent || typeof textContent.text !== 'string' || textContent.text.length === 0) {
        throw new Error(`resources/read missing textual content for ${pdfStructured.resource_link}: ${JSON.stringify(readResult)}`);
      }

      if (textContent.text !== exportedText) {
        throw new Error('resources/read content mismatch vs file content exported by pdf_document export_text');
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

      const excelLogText = extractTextContent(excelWriteResult);
      const pdfLogText = extractTextContent(pdfExportResult);
      if (!excelLogText.includes('Artifact URI:') || !pdfLogText.includes('Artifact URI:')) {
        throw new Error('write responses are missing artifact URI in human-readable content');
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
      fs.rmSync(registryTempDir, { recursive: true, force: true });
    }
  }
});
