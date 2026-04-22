import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

type IntegrationEvent = {
  routeKey: string | null;
  connectionId: string | null;
  body: string | null;
};

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const getFreePort = async () =>
  await new Promise<number>((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to allocate free port'));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });

const waitFor = async (predicate: () => boolean | Promise<boolean>, timeoutMs: number, stepMs = 20) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await wait(stepMs);
  }
  throw new Error(`Condition not satisfied within ${timeoutMs}ms`);
};

const closeServer = async (server: Server) => {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

const stopProcess = async (proc: ChildProcess) => {
  if (proc.exitCode !== null) {
    return;
  }
  proc.kill('SIGTERM');
  await Promise.race([
    once(proc, 'exit').then(() => undefined),
    wait(3000).then(() => {
      if (proc.exitCode === null) {
        proc.kill('SIGKILL');
      }
    })
  ]);
};

test('buffers the first action message sent right after websocket open', { timeout: 20000 }, async () => {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const integrationPort = await getFreePort();
  const gatewayPort = await getFreePort();
  const integrationEvents: IntegrationEvent[] = [];

  const integrationServer = createServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(404).end();
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    const event = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    const routeKey =
      typeof event.requestContext === 'object' &&
      event.requestContext !== null &&
      typeof (event.requestContext as Record<string, unknown>).routeKey === 'string'
        ? ((event.requestContext as Record<string, unknown>).routeKey as string)
        : null;
    const connectionId =
      typeof event.requestContext === 'object' &&
      event.requestContext !== null &&
      typeof (event.requestContext as Record<string, unknown>).connectionId === 'string'
        ? ((event.requestContext as Record<string, unknown>).connectionId as string)
        : null;
    const body = typeof event.body === 'string' ? event.body : null;

    integrationEvents.push({ routeKey, connectionId, body });

    if (req.url === '/integrations/connect') {
      await wait(250);
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.url === '/integrations/disconnect' || req.url === '/integrations/default' || req.url === '/integrations/register') {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: false }));
  });

  let gatewayLogs = '';
  let ws: WebSocket | null = null;
  let gatewayProc: ChildProcess | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      integrationServer.once('error', reject);
      integrationServer.listen(integrationPort, '127.0.0.1', () => {
        integrationServer.off('error', reject);
        resolve();
      });
    });

    gatewayProc = spawn('tsx', ['src/index.ts'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(gatewayPort),
        STAGE: 'dev',
        STRICT_COMPATIBILITY_MODE: 'true',
        ROUTE_INTEGRATIONS_JSON: JSON.stringify({
          '$connect': `http://127.0.0.1:${integrationPort}/integrations/connect`,
          '$disconnect': `http://127.0.0.1:${integrationPort}/integrations/disconnect`,
          '$default': `http://127.0.0.1:${integrationPort}/integrations/default`,
          register: `http://127.0.0.1:${integrationPort}/integrations/register`
        })
      }
    });

    gatewayProc.stdout?.on('data', (chunk) => {
      gatewayLogs += chunk.toString();
    });
    gatewayProc.stderr?.on('data', (chunk) => {
      gatewayLogs += chunk.toString();
    });

    await waitFor(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${gatewayPort}/healthz`);
        return response.ok;
      } catch {
        return false;
      }
    }, 5000);

    ws = new WebSocket(`ws://127.0.0.1:${gatewayPort}/dev`);
    await once(ws, 'open');
    ws.send(JSON.stringify({ action: 'register', userId: 'first-message' }));

    await waitFor(() => integrationEvents.some((event) => event.routeKey === 'register'), 5000);
    const registerEvents = integrationEvents.filter((event) => event.routeKey === 'register');
    assert.equal(registerEvents.length, 1);

    const registerBody = registerEvents[0]?.body ? (JSON.parse(registerEvents[0].body) as Record<string, unknown>) : null;
    assert.equal(registerBody?.action, 'register');

    const healthResponse = await fetch(`http://127.0.0.1:${gatewayPort}/healthz`);
    assert.equal(healthResponse.status, 200);
    const health = (await healthResponse.json()) as { droppedMessages?: { total?: number } };
    assert.equal(health.droppedMessages?.total ?? 0, 0);
  } catch (error) {
    throw new Error(`${String(error)}\nGateway logs:\n${gatewayLogs}`);
  } finally {
    if (ws) {
      ws.close();
      await Promise.race([once(ws, 'close').then(() => undefined), wait(2000)]);
    }
    if (gatewayProc) {
      await stopProcess(gatewayProc);
    }
    await closeServer(integrationServer);
  }
});
