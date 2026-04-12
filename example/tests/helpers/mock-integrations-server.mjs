import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? '127.0.0.1';
const stage = process.env.STAGE ?? 'dev';
const gatewayBaseUrl = process.env.GATEWAY_BASE_URL ?? `http://127.0.0.1:8787/${stage}`;

const subscribers = new Set();
let messageSequence = 0;

let userSequence = 0;

const makeUserId = () => {
  userSequence += 1;
  return `test-user-${userSequence}`;
};

const json = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end(JSON.stringify(body));
};

const parseBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
};

const postToConnection = async (connectionId, payload) => {
  const response = await fetch(`${gatewayBaseUrl}/@connections/${connectionId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (response.status === 410) {
    subscribers.delete(connectionId);
  }
};

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'content-type'
      });
      res.end();
      return;
    }

    if (req.method === 'GET' && req.url === '/healthz') {
      json(res, 200, { ok: true, subscribers: subscribers.size });
      return;
    }

    if (req.method !== 'POST') {
      json(res, 404, { ok: false, message: 'Not Found' });
      return;
    }

    const event = await parseBody(req);

    if (req.url === '/api/users') {
      const displayName = typeof event.displayName === 'string' ? event.displayName : `user-${Date.now()}`;
      json(res, 201, { id: makeUserId(), displayName });
      return;
    }

    const connectionId = event?.requestContext?.connectionId;

    if (req.url === '/integrations/connect') {
      if (typeof connectionId === 'string') {
        subscribers.add(connectionId);
      }
      json(res, 200, { ok: true });
      return;
    }

    if (req.url === '/integrations/disconnect') {
      if (typeof connectionId === 'string') {
        subscribers.delete(connectionId);
      }
      json(res, 200, { ok: true });
      return;
    }

    if (req.url === '/integrations/default') {
      if (typeof connectionId === 'string') {
        await postToConnection(connectionId, {
          type: 'chat.error',
          message: 'Unsupported route or invalid payload'
        });
      }
      json(res, 200, { ok: true });
      return;
    }

    if (req.url === '/integrations/send-message') {
      const input = JSON.parse(event.body ?? '{}');
      const createdAt = new Date().toISOString();
      const payload = {
        type: 'chat.message.created',
        message: {
          id: `msg-${++messageSequence}`,
          senderUserId: input.userId,
          content: input.content,
          createdAt
        }
      };

      await Promise.all(Array.from(subscribers).map((subscriberId) => postToConnection(subscriberId, payload)));
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { ok: false, message: 'Not Found' });
  } catch (error) {
    json(res, 500, {
      ok: false,
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(port, host, () => {
  console.log(`mock integrations listening on http://${host}:${port}`);
});
