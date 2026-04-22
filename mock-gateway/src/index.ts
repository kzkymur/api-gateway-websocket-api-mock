import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { ulid } from 'ulid';
import { WebSocketServer, type WebSocket } from 'ws';
import { parseRouteSelectionExpression, resolveRouteKeyFromText } from './route-selection.js';

interface ConnectionInfo {
  connectionId: string;
  connectedAt: string;
  lastActiveAt: string;
  stage: string;
  ws: WebSocket;
  connectReady: boolean;
  pendingMessages: string[];
  messageChain: Promise<void>;
}

type Integrations = Record<string, string>;
type DropReason =
  | 'connect_integration_pending_buffer_full'
  | 'connect_integration_failed'
  | 'connection_closed_before_connect_ready'
  | 'connection_not_found_before_processing';
type DroppedMessageMetrics = {
  total: number;
  reasons: Partial<Record<DropReason, number>>;
};

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const stage = process.env.STAGE ?? 'dev';
const strictMode = (process.env.STRICT_COMPATIBILITY_MODE ?? 'true') === 'true';
const routeSelectionExpression = process.env.ROUTE_SELECTION_EXPRESSION ?? '$request.body.action';
const integrations: Integrations = JSON.parse(process.env.ROUTE_INTEGRATIONS_JSON ?? '{}');
const connectMessageBufferLimit = Math.max(0, Number(process.env.CONNECT_MESSAGE_BUFFER_LIMIT ?? 64));

const app = new Hono();
const connections = new Map<string, ConnectionInfo>();
const wsPathMap = new Map<string, string>();
const droppedMessageMetrics: DroppedMessageMetrics = { total: 0, reasons: {} };

const log = (kind: string, payload: Record<string, unknown>) => {
  console.log(JSON.stringify({ kind, ts: new Date().toISOString(), ...payload }));
};

const incrementDroppedMessages = (reason: DropReason, connectionId: string, count = 1) => {
  droppedMessageMetrics.total += count;
  droppedMessageMetrics.reasons[reason] = (droppedMessageMetrics.reasons[reason] ?? 0) + count;
  log('message_dropped', { connectionId, reason, count });
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
  const response = await fetch(uri, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event)
  });
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Integration request failed: routeKey=${routeKey} status=${response.status}${responseText ? ` body=${responseText}` : ''}`
    );
  }
};

const queueMessageForProcessing = (conn: ConnectionInfo, messageText: string, source: 'buffered' | 'live') => {
  conn.messageChain = conn.messageChain.then(async () => {
    let routeKey: string | null = null;
    try {
      const activeConnection = connections.get(conn.connectionId);
      if (!activeConnection) {
        incrementDroppedMessages('connection_not_found_before_processing', conn.connectionId);
        return;
      }

      routeKey = resolveRouteKeyFromText(messageText, routeSelectionExpression);
      log('route_resolved', { connectionId: conn.connectionId, routeKey, source });

      await postIntegration(routeKey, 'MESSAGE', messageText, conn.connectionId);
    } catch (error) {
      log('integration_error', { connectionId: conn.connectionId, routeKey: routeKey ?? 'unknown', error: String(error) });
      conn.ws.close(1011, 'Integration error');
    }
  });
};

const parsedRouteSelectionExpression = parseRouteSelectionExpression(routeSelectionExpression);
if (!parsedRouteSelectionExpression) {
  log('route_selection_expression_invalid', {
    routeSelectionExpression,
    fallback: '$request.body.action'
  });
}

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
  const normalizedType = contentType.toLowerCase();
  const shouldSendText = normalizedType.startsWith('text/') || normalizedType.includes('application/json');

  if (shouldSendText) {
    conn.ws.send(Buffer.from(data).toString('utf8'));
  } else {
    conn.ws.send(Buffer.from(data));
  }
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

app.get('/healthz', (c) =>
  c.json({
    ok: true,
    stage,
    connections: connections.size,
    droppedMessages: droppedMessageMetrics
  })
);

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
  let shouldInvokeDisconnectIntegration = true;
  const now = new Date().toISOString();
  connections.set(connectionId, {
    connectionId,
    connectedAt: now,
    lastActiveAt: now,
    stage,
    ws,
    connectReady: false,
    pendingMessages: [],
    messageChain: Promise.resolve()
  });

  log('connect', { connectionId, path });
  ws.on('message', (raw) => {
    const conn = connections.get(connectionId);
    if (!conn) {
      return;
    }
    conn.lastActiveAt = new Date().toISOString();
    const text = raw.toString();

    if (!conn.connectReady) {
      if (conn.pendingMessages.length >= connectMessageBufferLimit) {
        incrementDroppedMessages('connect_integration_pending_buffer_full', connectionId);
        return;
      }
      conn.pendingMessages.push(text);
      log('message_buffered', {
        connectionId,
        bufferedCount: conn.pendingMessages.length,
        bufferLimit: connectMessageBufferLimit
      });
      return;
    }

    queueMessageForProcessing(conn, text, 'live');
  });

  ws.on('close', async () => {
    const conn = connections.get(connectionId);
    if (conn && conn.pendingMessages.length > 0) {
      incrementDroppedMessages('connection_closed_before_connect_ready', connectionId, conn.pendingMessages.length);
      conn.pendingMessages = [];
    }
    connections.delete(connectionId);
    log('disconnect', { connectionId });
    if (!shouldInvokeDisconnectIntegration) {
      return;
    }
    try {
      await postIntegration('$disconnect', 'DISCONNECT', null, connectionId);
    } catch (error) {
      log('integration_error', { connectionId, routeKey: '$disconnect', error: String(error) });
    }
  });

  try {
    await postIntegration('$connect', 'CONNECT', null, connectionId);
    const conn = connections.get(connectionId);
    if (!conn) {
      return;
    }

    conn.connectReady = true;
    const bufferedMessages = conn.pendingMessages;
    conn.pendingMessages = [];
    if (bufferedMessages.length > 0) {
      log('message_buffer_flushed', { connectionId, bufferedCount: bufferedMessages.length });
      for (const bufferedMessage of bufferedMessages) {
        queueMessageForProcessing(conn, bufferedMessage, 'buffered');
      }
    }
  } catch (error) {
    const conn = connections.get(connectionId);
    if (conn && conn.pendingMessages.length > 0) {
      incrementDroppedMessages('connect_integration_failed', connectionId, conn.pendingMessages.length);
      conn.pendingMessages = [];
    }
    log('integration_error', { connectionId, routeKey: '$connect', error: String(error) });
    shouldInvokeDisconnectIntegration = false;
    ws.close(1011, 'Integration error');
    connections.delete(connectionId);
  }
});
