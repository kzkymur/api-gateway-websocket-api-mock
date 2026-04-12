import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Pool } from 'pg';
import { ulid } from 'ulid';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const dbUrl = process.env.DATABASE_URL ?? 'postgres://chat:chat@localhost:5432/chat';
const gatewayBaseUrl = process.env.GATEWAY_BASE_URL ?? 'http://localhost:8787/dev';
const corsOrigin = process.env.CORS_ALLOW_ORIGIN ?? 'http://localhost:5173';

const pool = new Pool({ connectionString: dbUrl });

const app = new Hono();
const globalSubscribers = new Set<string>();

app.use(
  '/api/*',
  cors({
    origin: corsOrigin,
    allowHeaders: ['Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS']
  })
);

const sendToConnection = async (connectionId: string, payload: unknown) => {
  const response = await fetch(`${gatewayBaseUrl}/@connections/${connectionId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (response.status === 410) {
    return { stale: true };
  }

  if (!response.ok) {
    throw new Error(`postToConnection failed: ${response.status}`);
  }

  return { stale: false };
};

const broadcastGlobal = async (payload: unknown) => {
  if (globalSubscribers.size === 0) {
    return;
  }

  for (const connectionId of Array.from(globalSubscribers)) {
    try {
      const result = await sendToConnection(connectionId, payload);
      if (result.stale) {
        globalSubscribers.delete(connectionId);
      }
    } catch (error) {
      console.error('broadcast error', connectionId, error);
    }
  }
};

app.get('/healthz', (c) => c.json({ ok: true }));

app.post('/api/users', async (c) => {
  const { displayName } = await c.req.json<{ displayName: string }>();
  const result = await pool.query(
    'INSERT INTO users (id, display_name) VALUES ($1, $2) RETURNING id, display_name',
    [crypto.randomUUID(), displayName]
  );
  return c.json({ id: result.rows[0].id, displayName: result.rows[0].display_name }, 201);
});

app.get('/api/messages', async (c) => {
  const limit = Number(c.req.query('limit') ?? '50');
  const before = c.req.query('before');

  const params: unknown[] = [limit];
  let sql = 'SELECT id, sender_user_id, content, created_at FROM messages ORDER BY created_at DESC LIMIT $1';

  if (before) {
    sql = 'SELECT id, sender_user_id, content, created_at FROM messages WHERE created_at < $2::timestamptz ORDER BY created_at DESC LIMIT $1';
    params.push(before);
  }

  const result = await pool.query(sql, params);
  return c.json({
    items: result.rows
      .reverse()
      .map((row) => ({
        id: row.id,
        senderUserId: row.sender_user_id,
        content: row.content,
        createdAt: row.created_at
      }))
  });
});

app.post('/integrations/connect', async (c) => {
  const event = await c.req.json<{ requestContext: { connectionId: string } }>();
  const connectionId = event.requestContext.connectionId;
  globalSubscribers.add(connectionId);
  console.log('connect', connectionId);
  return c.json({ ok: true });
});

app.post('/integrations/disconnect', async (c) => {
  const event = await c.req.json<{ requestContext: { connectionId: string } }>();
  const connectionId = event.requestContext.connectionId;
  globalSubscribers.delete(connectionId);
  return c.json({ ok: true });
});

app.post('/integrations/default', async (c) => {
  const event = await c.req.json<{ requestContext: { connectionId: string } }>();
  await sendToConnection(event.requestContext.connectionId, {
    type: 'chat.error',
    message: 'Unsupported route or invalid payload'
  });
  return c.json({ ok: true });
});

app.post('/integrations/send-message', async (c) => {
  const event = await c.req.json<{ requestContext: { connectionId: string }; body: string }>();
  const input = JSON.parse(event.body) as { userId: string; content: string };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const messageId = ulid();
    const createdAt = new Date().toISOString();

    await client.query('INSERT INTO messages (id, sender_user_id, content, created_at) VALUES ($1, $2, $3, $4)', [
      messageId,
      input.userId,
      input.content,
      createdAt
    ]);

    await client.query('COMMIT');

    const payload = {
      type: 'chat.message.created',
      message: {
        id: messageId,
        senderUserId: input.userId,
        content: input.content,
        createdAt
      }
    };

    await broadcastGlobal(payload);
    return c.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    await sendToConnection(event.requestContext.connectionId, {
      type: 'chat.error',
      message: 'Message persistence failed'
    });
    throw error;
  } finally {
    client.release();
  }
});

serve({ fetch: app.fetch, port, hostname: host }, (info) => {
  console.log(`backend listening on http://${host}:${info.port}`);
});
