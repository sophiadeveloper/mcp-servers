import { spawn } from 'node:child_process';

const DEFAULT_TIMEOUT_MS = 8000;

export async function runSmoke({ serverName, command, args = [], env = {}, startupDelayMs = 250 }) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let nextId = 1;
  const pending = new Map();
  let stdoutBuffer = '';
  let stderrBuffer = '';

  const failPending = (error) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  };

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;

    while (true) {
      const newlineIndex = stdoutBuffer.indexOf('\n');
      if (newlineIndex === -1) break;

      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;

      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(message, 'id') && pending.has(message.id)) {
        const { resolve, reject, timer } = pending.get(message.id);
        clearTimeout(timer);
        pending.delete(message.id);

        if (message.error) {
          reject(new Error(`JSON-RPC error for id ${message.id}: ${JSON.stringify(message.error)}`));
        } else {
          resolve(message.result);
        }
      }
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrBuffer += chunk;
  });

  const exitPromise = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      resolve({ code, signal });
    });
  });

  const send = (payload) => {
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  };

  const request = (method, params = undefined, timeoutMs = DEFAULT_TIMEOUT_MS) => {
    const id = nextId++;
    const payload = { jsonrpc: '2.0', id, method };
    if (params !== undefined) payload.params = params;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }, timeoutMs);

      pending.set(id, { resolve, reject, timer });
      send(payload);
    });
  };

  try {
    await new Promise((resolve) => setTimeout(resolve, startupDelayMs));

    if (child.exitCode !== null) {
      throw new Error(`Server exited too early with code ${child.exitCode}. stderr: ${stderrBuffer || '<empty>'}`);
    }

    const initializeResult = await request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'smoke-tests', version: '1.0.0' }
    });

    if (!initializeResult?.serverInfo?.name) {
      throw new Error(`Invalid initialize response: ${JSON.stringify(initializeResult)}`);
    }

    send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });

    const toolsList = await request('tools/list', {});

    if (!toolsList || !Array.isArray(toolsList.tools)) {
      throw new Error(`Invalid tools/list response: ${JSON.stringify(toolsList)}`);
    }

    console.log(`[PASS] ${serverName}: boot + handshake + tools/list (${toolsList.tools.length} tools)`);
  } catch (error) {
    console.error(`[FAIL] ${serverName}: ${error.message}`);
    if (stderrBuffer.trim()) {
      console.error('--- server stderr ---');
      console.error(stderrBuffer.trim());
    }
    process.exitCode = 1;
  } finally {
    failPending(new Error('Process closed'));
    child.kill('SIGTERM');
    await Promise.race([
      exitPromise,
      new Promise((resolve) => setTimeout(resolve, 1000))
    ]);
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
  }
}
