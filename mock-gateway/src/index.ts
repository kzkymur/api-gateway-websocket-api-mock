import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { ulid } from 'ulid';
import { WebSocketServer, type WebSocket } from 'ws';

interface ConnectionInfo {
  connectionId: string;
  connectedAt: string;
  lastActiveAt: string;
  stage: string;
  ws: WebSocket;
}

type Integrations = Record<string, string>;

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const stage = process.env.STAGE ?? 'dev';
const strictMode = (process.env.STRICT_COMPATIBILITY_MODE ?? 'true') === 'true';
const integrations: Integrations = JSON.parse(process.env.ROUTE_INTEGRATIONS_JSON ?? '{}');

const app = new Hono();
const connections = new Map<string, ConnectionInfo>();
const wsPathMap = new Map<string, string>();

const log = (kind: string, payload: Record<string, unknown>) => {
  console.log(JSON.stringify({ kind, ts: new Date().toISOString(), ...payload }));
};

const resolveConnectionId = (req: Request): string | undefined => {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);
  const stagePart = parts[0];
  const marker = parts[1];
  const connectionId = parts[2];
  if (stagePart !== stage || marker !== '@connections') {
    return undefined;
  }
  return connectionId;
};

const postIntegration = async (routeKey: string, eventType: 'CONNECT' | 'DISCONNECT' | 'MESSAGE', body: string | null, connectionId: string) => {
  const uri = integrations[routeKey];
  if (!uri) {
    log('route_unresolved', { routeKey, connectionId });
    return;
  }

  const event = {
    version: '2.0',
    type: 'REQUEST',
    routeKey,
    requestContext: {
      apiId: 'local-mock',
      domainName: 'localhost',
      routeKey,
      eventType,
      connectionId,
      stage,
      requestTimeEpoch: Date.now()
    },
    body,
    isBase64Encoded: false
  };

  log('integration_call', { routeKey, uri, connectionId });
  await fetch(uri, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event)
  });
};

app.get(`/${stage}/@connections/:connectionId`, (c) => {
  const connectionId = c.req.param('connectionId');
  const conn = connections.get(connectionId);
  if (!conn) {
    return c.json({ message: 'Gone' }, 410);
  }
  return c.json({
    connectionId: conn.connectionId,
    connectedAt: conn.connectedAt,
    lastActiveAt: conn.lastActiveAt,
    stage: conn.stage
  });
});

app.post(`/${stage}/@connections/:connectionId`, async (c) => {
  const connectionId = c.req.param('connectionId');
  const conn = connections.get(connectionId);
  if (!conn) {
    return c.json({ message: 'Gone' }, 410);
  }

  const contentType = c.req.header('content-type') ?? 'application/octet-stream';
  const data = await c.req.arrayBuffer();
  conn.ws.send(Buffer.from(data));
  conn.lastActiveAt = new Date().toISOString();
  log('send_to_connection', { connectionId, bytes: data.byteLength, contentType });
  return c.json({ ok: true });
});

app.delete(`/${stage}/@connections/:connectionId`, async (c) => {
  const connectionId = c.req.param('connectionId');
  const conn = connections.get(connectionId);
  if (!conn) {
    return c.json({ message: 'Gone' }, 410);
  }
  conn.ws.close(1000, 'Closed by management API');
  connections.delete(connectionId);
  return c.json({ ok: true });
});

app.post('/_mock/broadcast', async (c) => {
  if (strictMode) {
    return c.json({ message: 'Disabled in strict compatibility mode' }, 404);
  }
  const body = await c.req.json<{ connectionIds: string[]; data: unknown }>();
  const payload = typeof body.data === 'string' ? body.data : JSON.stringify(body.data);
  let success = 0;
  let failed = 0;
  for (const connectionId of body.connectionIds ?? []) {
    const conn = connections.get(connectionId);
    if (!conn) {
      failed += 1;
      continue;
    }
    conn.ws.send(payload);
    success += 1;
  }
  return c.json({ success, failed });
});

app.get('/healthz', (c) => c.json({ ok: true, stage, connections: connections.size }));

const server = serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`mock-gateway listening on http://${host}:${info.port}`);
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url ?? '/', `http://${req.headers.host}`).pathname;
  if (strictMode && pathname !== `/${stage}`) {
    socket.destroy();
    return;
  }
  wsPathMap.set(req.headers['sec-websocket-key']?.toString() ?? '', pathname);
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', async (ws, req) => {
  const wsKey = req.headers['sec-websocket-key']?.toString() ?? '';
  const path = wsPathMap.get(wsKey) ?? '/';
  if (strictMode && path !== `/${stage}`) {
    ws.close(1008, 'Stage path required');
    return;
  }

  const connectionId = ulid();
  const now = new Date().toISOString();
  connections.set(connectionId, {
    connectionId,
    connectedAt: now,
    lastActiveAt: now,
    stage,
    ws
  });

  log('connect', { connectionId, path });
  await postIntegration('$connect', 'CONNECT', null, connectionId);

  ws.on('message', async (raw) => {
    const conn = connections.get(connectionId);
    if (!conn) {
      return;
    }
    conn.lastActiveAt = new Date().toISOString();
    const text = raw.toString();
    let routeKey = '$default';

    try {
      const parsed = JSON.parse(text) as { action?: unknown };
      if (typeof parsed.action === 'string') {
        routeKey = parsed.action;
      }
    } catch {
      routeKey = '$default';
    }

    log('route_resolved', { connectionId, routeKey });

    try {
      await postIntegration(routeKey, 'MESSAGE', text, connectionId);
    } catch (error) {
      log('integration_error', { connectionId, routeKey, error: String(error) });
      ws.close(1011, 'Integration error');
    }
  });

  ws.on('close', async () => {
    connections.delete(connectionId);
    log('disconnect', { connectionId });
    await postIntegration('$disconnect', 'DISCONNECT', null, connectionId);
  });
});
