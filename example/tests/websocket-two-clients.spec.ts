import { expect, test } from '@playwright/test';

const startManagedServers = process.env.PW_START_MANAGED_SERVERS === 'true';
const gatewayBaseUrl = startManagedServers ? 'http://127.0.0.1:8878/dev' : 'http://localhost:8787/dev';
const gatewayWsUrl = startManagedServers ? 'ws://127.0.0.1:8878/dev' : 'ws://localhost:8787/dev';

const openWebSocket = async (url: string): Promise<WebSocket> =>
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => {
      reject(new Error(`WebSocket open timed out: ${url}`));
    }, 5000);

    ws.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve(ws);
    });

    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket open failed: ${url}`));
    });
  });

const waitForMessage = async (ws: WebSocket): Promise<string> =>
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('WebSocket message timed out'));
    }, 5000);

    ws.addEventListener('message', (event) => {
      clearTimeout(timeout);
      resolve(typeof event.data === 'string' ? event.data : String(event.data));
    });

    ws.addEventListener('close', () => {
      clearTimeout(timeout);
      reject(new Error('WebSocket closed before a message was received'));
    });
  });

const waitForClose = async (ws: WebSocket): Promise<number> =>
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('WebSocket close timed out'));
    }, 5000);

    ws.addEventListener('close', (event) => {
      clearTimeout(timeout);
      resolve(event.code);
    });
  });

test('frontend clients receive realtime broadcasts through the websocket gateway', async ({ browser, baseURL }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  if (!baseURL) {
    throw new Error('baseURL is required');
  }

  await Promise.all([pageA.goto(baseURL), pageB.goto(baseURL)]);

  const waitForLog = async (page: typeof pageA, text: string) => {
    await expect
      .poll(async () => {
        const log = await page.locator('#log').textContent();
        return log?.includes(text) ?? false;
      })
      .toBe(true);
  };

  await Promise.all([waitForLog(pageA, 'ws connected'), waitForLog(pageB, 'ws connected')]);

  await Promise.all([pageA.click('#setup'), pageB.click('#setup')]);
  await Promise.all([waitForLog(pageA, '"setup":"done"'), waitForLog(pageB, '"setup":"done"')]);

  await pageA.click('#send');

  await expect
    .poll(async () => {
      const log = await pageB.locator('#log').textContent();
      return (log?.match(/"type":"chat\.message\.created"/g) ?? []).length >= 1;
    })
    .toBe(true);

  await pageB.click('#send');

  await expect
    .poll(async () => {
      const log = await pageA.locator('#log').textContent();
      return (log?.match(/"type":"chat\.message\.created"/g) ?? []).length >= 1;
    })
    .toBe(true);

  await Promise.all([contextA.close(), contextB.close()]);
});

test('postToConnection to unknown connection returns 410', async () => {
  const response = await fetch(`${gatewayBaseUrl}/@connections/not-existing-connection`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({ type: 'test' })
  });

  expect(response.status).toBe(410);
});

test('invalid JSON is routed to $default integration', async () => {
  const ws = await openWebSocket(gatewayWsUrl);
  ws.send('this-is-not-json');

  const message = await waitForMessage(ws);
  const parsed = JSON.parse(message) as { type?: string };
  expect(parsed.type).toBe('chat.error');

  ws.close();
  await waitForClose(ws);
});

test('integration non-2xx closes websocket with 1011', async () => {
  test.skip(!startManagedServers, 'This scenario uses the managed mock integration server only');

  const ws = await openWebSocket(gatewayWsUrl);
  ws.send(
    JSON.stringify({
      action: 'sendMessage',
      userId: 'test-user',
      content: '__force_fail__'
    })
  );

  const closeCode = await waitForClose(ws);
  expect(closeCode).toBe(1011);
});
