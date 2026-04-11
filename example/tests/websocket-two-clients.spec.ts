import { expect, test } from '@playwright/test';

test('2 clients can connect to the WebSocket gateway at the same time', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await Promise.all([pageA.goto('http://127.0.0.1:5173'), pageB.goto('http://127.0.0.1:5173')]);

  const connectClient = async (page: typeof pageA) => {
    return page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const socket = new WebSocket('ws://127.0.0.1:8787/dev');
        socket.addEventListener('open', () => {
          const state = window as Window & { testSocket?: WebSocket; socketClosed?: boolean };
          state.testSocket = socket;
          state.socketClosed = false;
          resolve();
        });
        socket.addEventListener('close', () => ((window as Window & { socketClosed?: boolean }).socketClosed = true));
        socket.addEventListener('error', () => reject(new Error('WebSocket connection failed')));
      });
    });
  };

  await Promise.all([connectClient(pageA), connectClient(pageB)]);

  await Promise.all([
    pageA.evaluate(() => (window as Window & { testSocket?: WebSocket }).testSocket?.send('ping from A')),
    pageB.evaluate(() => (window as Window & { testSocket?: WebSocket }).testSocket?.send('ping from B'))
  ]);

  await expect
    .poll(async () => {
      return pageA.evaluate(() => {
        return (window as Window & { testSocket?: WebSocket }).testSocket?.readyState === WebSocket.OPEN;
      });
    })
    .toBe(true);

  await expect
    .poll(async () => {
      return pageB.evaluate(() => {
        return (window as Window & { testSocket?: WebSocket }).testSocket?.readyState === WebSocket.OPEN;
      });
    })
    .toBe(true);

  await Promise.all([
    pageA.evaluate(() => (window as Window & { testSocket?: WebSocket }).testSocket?.close()),
    pageB.evaluate(() => (window as Window & { testSocket?: WebSocket }).testSocket?.close())
  ]);
  await Promise.all([contextA.close(), contextB.close()]);
});
