import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { Pool } from 'pg';
import { ulid } from 'ulid';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const dbUrl = process.env.DATABASE_URL ?? 'postgres://chat:chat@localhost:5432/chat';
const gatewayBaseUrl = process.env.GATEWAY_BASE_URL ?? 'http://localhost:8787/dev';

const pool = new Pool({ connectionString: dbUrl });

const app = new Hono();
const roomSubscriptions = new Map<string, Set<string>>();

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

const broadcastToRoom = async (roomId: string, payload: unknown) => {
  const subscribers = roomSubscriptions.get(roomId);
  if (!subscribers || subscribers.size === 0) {
    return;
  }

  for (const connectionId of Array.from(subscribers)) {
    try {
      const result = await sendToConnection(connectionId, payload);
      if (result.stale) {
        subscribers.delete(connectionId);
      }
    } catch (error) {
      console.error('broadcast error', roomId, connectionId, error);
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

app.post('/api/rooms', async (c) => {
  const { name } = await c.req.json<{ name: string }>();
  const result = await pool.query('INSERT INTO rooms (id, name) VALUES ($1, $2) RETURNING id, name', [
    crypto.randomUUID(),
    name
  ]);
  return c.json({ id: result.rows[0].id, name: result.rows[0].name }, 201);
});

app.post('/api/rooms/:roomId/join', async (c) => {
  const roomId = c.req.param('roomId');
  const { userId } = await c.req.json<{ userId: string }>();
  await pool.query(
    'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT (room_id, user_id) DO NOTHING',
    [roomId, userId]
  );
  return c.json({ ok: true }, 200);
});

app.get('/api/rooms/:roomId/messages', async (c) => {
  const roomId = c.req.param('roomId');
  const limit = Number(c.req.query('limit') ?? '50');
  const before = c.req.query('before');

  const params: unknown[] = [roomId, limit];
  let sql =
    'SELECT id, room_id, sender_user_id, content, created_at FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT $2';

  if (before) {
    sql =
      'SELECT id, room_id, sender_user_id, content, created_at FROM messages WHERE room_id = $1 AND created_at < $3::timestamptz ORDER BY created_at DESC LIMIT $2';
    params.push(before);
  }

  const result = await pool.query(sql, params);
  return c.json({
    items: result.rows
      .reverse()
      .map((row) => ({
        id: row.id,
        roomId: row.room_id,
        senderUserId: row.sender_user_id,
        content: row.content,
        createdAt: row.created_at
      }))
  });
});

app.post('/integrations/connect', async (c) => {
  const event = await c.req.json<{ requestContext: { connectionId: string } }>();
  console.log('connect', event.requestContext.connectionId);
  return c.json({ ok: true });
});

app.post('/integrations/disconnect', async (c) => {
  const event = await c.req.json<{ requestContext: { connectionId: string } }>();
  const connectionId = event.requestContext.connectionId;
  for (const subscribers of roomSubscriptions.values()) {
    subscribers.delete(connectionId);
  }
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

app.post('/integrations/join-room', async (c) => {
  const event = await c.req.json<{ requestContext: { connectionId: string }; body: string }>();
  const connectionId = event.requestContext.connectionId;
  const body = JSON.parse(event.body) as { roomId: string; userId: string };
  const existing = roomSubscriptions.get(body.roomId) ?? new Set<string>();
  existing.add(connectionId);
  roomSubscriptions.set(body.roomId, existing);

  await broadcastToRoom(body.roomId, {
    type: 'chat.room.joined',
    roomId: body.roomId,
    userId: body.userId,
    connectionId
  });

  return c.json({ ok: true });
});

app.post('/integrations/send-message', async (c) => {
  const event = await c.req.json<{ requestContext: { connectionId: string }; body: string }>();
  const input = JSON.parse(event.body) as { roomId: string; userId: string; content: string };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const messageId = ulid();
    const createdAt = new Date().toISOString();

    await client.query(
      'INSERT INTO messages (id, room_id, sender_user_id, content, created_at) VALUES ($1, $2, $3, $4, $5)',
      [messageId, input.roomId, input.userId, input.content, createdAt]
    );

    await client.query('COMMIT');

    const payload = {
      type: 'chat.message.created',
      roomId: input.roomId,
      message: {
        id: messageId,
        senderUserId: input.userId,
        content: input.content,
        createdAt
      }
    };

    await broadcastToRoom(input.roomId, payload);
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
