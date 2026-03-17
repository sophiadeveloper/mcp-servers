import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Loads environment variables from multiple possible .env locations.
 * Priority (highest to lowest):
 * 1. Project path passed at runtime (if any)
 * 2. Current Working Directory (CWD)
 * 3. Subproject root (linter-node/.env)
 * 4. Repository root (mcp-servers/.env)
 * 5. Pre-existing process.env (system/mcp_config.json)
 */
function loadAllEnvs(projectPath?: string) {
  const envPaths = [
    path.resolve(__dirname, '../../.env'), // Root
    path.resolve(__dirname, '../.env'),    // Project
    path.resolve(process.cwd(), '.env'),   // CWD
  ];

  if (projectPath) {
    envPaths.push(path.resolve(projectPath, '.env'));
  }

  // Use a temporary object to avoid polluting process.env immediately if we want to manage priorities
  // But standard way is to load them into process.env.
  // We load them in order of priority (lowest to highest) so higher priority overrides.
  
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const result = dotenv.config({ path: envPath, override: true, quiet: true });
      if (result.error) {
        console.error(`Failed to load .env from ${envPath}:`, result.error);
      }
    }
  }
}

// Initial load at startup
loadAllEnvs();

export function getConfig(projectPath?: string) {
  if (projectPath) {
    loadAllEnvs(projectPath);
  }

  return {
    cflint: {
      jarPath: process.env.CFLINT_JAR || 'C:\\tesisquare\\cflint\\CFLint-1.5.0-all.jar',
      javaPath: process.env.JAVA_BIN
        ? process.env.JAVA_BIN
        : (process.env.JAVA_HOME
          ? path.join(process.env.JAVA_HOME as string, 'bin', 'java.exe')
          : 'D:\\programmi\\ColdFusion2023\\jre\\bin\\java.exe'),
      defaultConfigPath: process.env.CFLINT_CONFIG || null
    }
  };
}

// Maintain backward compatibility with the static config object if needed,
// but it will only have startup values.
export const config = getConfig();
