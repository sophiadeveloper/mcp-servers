#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const skillsDir = path.join(repoRoot, 'skills');

function findSkillEvalFiles(rootDir) {
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    throw new Error(`Directory non trovata: ${rootDir}`);
  }

  const files = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const evalPath = path.join(rootDir, entry.name, 'evals', 'evals.json');
    if (fs.existsSync(evalPath) && fs.statSync(evalPath).isFile()) {
      files.push(evalPath);
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function validateJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  JSON.parse(raw);
}

function toRelative(filePath) {
  return path.relative(repoRoot, filePath) || filePath;
}

function main() {
  let evalFiles;

  try {
    evalFiles = findSkillEvalFiles(skillsDir);
  } catch (error) {
    console.error(`❌ Errore scansione skills: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (evalFiles.length === 0) {
    console.log('⚠️ Nessun file skills/*/evals/evals.json trovato.');
    return;
  }

  const invalid = [];

  for (const filePath of evalFiles) {
    try {
      validateJsonFile(filePath);
      console.log(`✅ ${toRelative(filePath)}`);
    } catch (error) {
      invalid.push({ filePath, error });
      console.error(`❌ ${toRelative(filePath)} -> ${error.message}`);
    }
  }

  if (invalid.length > 0) {
    console.error(`\nTrovati ${invalid.length} file JSON non validi su ${evalFiles.length}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nValidati ${evalFiles.length} file skills/*/evals/evals.json.`);
}

main();
