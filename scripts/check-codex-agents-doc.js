#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = process.cwd();
const agentsDir = path.join(repoRoot, '.codex', 'agents');

const REQUIRED_AGENT_FILES = ['explorer.md', 'implementer.md', 'technical_analyst.md'];
const ROLE_SPECIFICITY_RULES = [
  {
    file: 'explorer.md',
    label: 'explorer',
    markers: ['read-first', 'discovery', 'audit']
  },
  {
    file: 'implementer.md',
    label: 'implementer',
    markers: ['patch', 'test', 'compatibilita']
  },
  {
    file: 'technical_analyst.md',
    label: 'technical_analyst',
    markers: ['multi-sorgente', 'timeline', 'causale']
  }
];

function readUtf8(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function normalize(text) {
  return text.toLowerCase();
}

function hasAnyMarker(content, markers) {
  const normalized = normalize(content);
  return markers.some((marker) => normalized.includes(normalize(marker)));
}

function validateRequiredAgents(errors, warnings) {
  if (!fs.existsSync(agentsDir) || !fs.statSync(agentsDir).isDirectory()) {
    errors.push(`Directory agenti non trovata: ${path.relative(repoRoot, agentsDir)}`);
    return {};
  }

  const loaded = {};

  for (const file of REQUIRED_AGENT_FILES) {
    const filePath = path.join(agentsDir, file);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      errors.push(`Agente richiesto mancante: .codex/agents/${file}`);
      continue;
    }

    try {
      loaded[file] = readUtf8(filePath);
      console.log(`✅ agente presente: .codex/agents/${file}`);
    } catch (error) {
      errors.push(`Impossibile leggere .codex/agents/${file}: ${error.message}`);
    }
  }

  const readmePath = path.join(agentsDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    warnings.push('README agenti mancante (.codex/agents/README.md).');
  } else {
    loaded['README.md'] = readUtf8(readmePath);
  }

  return loaded;
}

function validateNonGenericRoles(loaded, errors) {
  for (const rule of ROLE_SPECIFICITY_RULES) {
    const content = loaded[rule.file];
    if (!content) continue;

    const hasMissionSection = /##\s*missione/i.test(content);
    const hasBoundarySection = /##\s*confini espliciti/i.test(content);
    const hasSpecificMarkers = hasAnyMarker(content, rule.markers);

    if (!hasMissionSection || !hasBoundarySection || !hasSpecificMarkers) {
      errors.push(
        `Ruolo troppo generico per ${rule.label}: richiesti Missione, Confini espliciti e marker specifici (${rule.markers.join(', ')}).`
      );
      continue;
    }

    console.log(`✅ ruolo non generico: ${rule.label}`);
  }
}

function validateParallelismAndDepth(errors) {
  const workflowPath = path.join(
    repoRoot,
    'skills',
    'mcp-master-orchestrator',
    'references',
    'workflows.md'
  );

  if (!fs.existsSync(workflowPath)) {
    errors.push('File workflow orchestrator mancante: skills/mcp-master-orchestrator/references/workflows.md');
    return;
  }

  const content = readUtf8(workflowPath);
  const normalized = normalize(content);

  const hasParallelismRule = normalized.includes('limiti di parallelismo') && normalized.includes('max 2');
  const hasDepthRule = normalized.includes('limite profondita') && normalized.includes('2 livelli');

  if (!hasParallelismRule) {
    errors.push('Regole di parallelismo non dichiarate in modo esplicito nel workflow orchestrator.');
  } else {
    console.log('✅ regole di parallelismo dichiarate');
  }

  if (!hasDepthRule) {
    errors.push('Regole di profondita handoff/escalation non dichiarate in modo esplicito nel workflow orchestrator.');
  } else {
    console.log('✅ regole di profondita dichiarate');
  }
}

function validateCompatibilityWithConsolidatedSkills(loaded, errors) {
  const readme = loaded['README.md'] || '';
  const normalizedReadme = normalize(readme);
  const mentionsOrchestrator = normalizedReadme.includes('mcp-master-orchestrator');
  const mentionsAnalyst = normalizedReadme.includes('mcp-technical-analyst');

  if (!mentionsOrchestrator || !mentionsAnalyst) {
    errors.push(
      'Compatibilita con skill consolidate non esplicitata in .codex/agents/README.md (richiesti riferimenti a mcp-master-orchestrator e mcp-technical-analyst).'
    );
    return;
  }

  console.log('✅ compatibilita con skill consolidate dichiarata (analyst/orchestrator)');
}

function main() {
  const errors = [];
  const warnings = [];

  const loaded = validateRequiredAgents(errors, warnings);
  validateNonGenericRoles(loaded, errors);
  validateParallelismAndDepth(errors);
  validateCompatibilityWithConsolidatedSkills(loaded, errors);

  for (const warning of warnings) {
    console.warn(`⚠️ ${warning}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`❌ ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('\nVerifica minima doc-driven agenti completata con successo.');
}

main();
