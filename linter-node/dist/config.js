import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
function loadEnv(envPath) {
    try {
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            content.split('\n').forEach(line => {
                const trimmed = line.trim();
                // Skip comments and empty lines
                if (trimmed && !trimmed.startsWith('#')) {
                    const eqIndex = trimmed.indexOf('=');
                    if (eqIndex > 0) {
                        const key = trimmed.substring(0, eqIndex).trim();
                        let value = trimmed.substring(eqIndex + 1).trim();
                        // Handle basic quoting
                        if ((value.startsWith('"') && value.endsWith('"')) ||
                            (value.startsWith("'") && value.endsWith("'"))) {
                            value = value.substring(1, value.length - 1);
                        }
                        // Only set if not already set (preserve system env or previously loaded)
                        if (!process.env[key]) {
                            process.env[key] = value;
                        }
                    }
                }
            });
        }
    }
    catch (e) {
        // Silently fail or console.error to stderr
        console.error(`Failed to load .env from ${envPath}`, e);
    }
}
// Load environment variables from .env file manually
loadEnv(path.resolve(__dirname, '../.env'));
loadEnv(path.resolve(__dirname, '../../.env'));
export const config = {
    cflint: {
        jarPath: process.env.CFLINT_JAR || 'C:\\tesisquare\\cflint\\CFLint-1.5.0-all.jar',
        javaPath: process.env.JAVA_BIN
            ? process.env.JAVA_BIN
            : (process.env.JAVA_HOME
                ? path.join(process.env.JAVA_HOME, 'bin', 'java.exe')
                : 'D:\\programmi\\ColdFusion2023\\jre\\bin\\java.exe')
    }
};
