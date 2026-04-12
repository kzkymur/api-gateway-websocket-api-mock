import { expect, test } from '@playwright/test';

test('one client message is broadcast to other connected clients in real time', async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await Promise.all([pageA.goto('about:blank'), pageB.goto('about:blank')]);

  const connectClient = async (page: typeof pageA) => {
    return page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const decodeMessage = async (payload: string | Blob | ArrayBuffer | ArrayBufferView) => {
          if (typeof payload === 'string') {
            return payload;
          }

          if (payload instanceof Blob) {
            return payload.text();
          }

          if (payload instanceof ArrayBuffer) {
            return new TextDecoder().decode(new Uint8Array(payload));
          }

          if (ArrayBuffer.isView(payload)) {
            return new TextDecoder().decode(payload);
          }

          return String(payload);
        };

        const socket = new WebSocket('ws://127.0.0.1:8787/dev');
        const state = window as Window & {
          testSocket?: WebSocket;
          socketClosed?: boolean;
          receivedEvents?: Array<{ type?: string; message?: { senderUserId?: string; content?: string } }>;
        };

        state.receivedEvents = [];

        socket.addEventListener('open', () => {
          state.testSocket = socket;
          state.socketClosed = false;
          resolve();
        });

        socket.addEventListener('message', async (event) => {
          const text = await decodeMessage(event.data as string | Blob | ArrayBuffer | ArrayBufferView);
          try {
            const parsed = JSON.parse(text) as { type?: string; message?: { senderUserId?: string; content?: string } };
            state.receivedEvents?.push(parsed);
          } catch {
            // ignore non-json payloads
          }
        });

        socket.addEventListener('close', () => ((window as Window & { socketClosed?: boolean }).socketClosed = true));
        socket.addEventListener('error', () => reject(new Error('WebSocket connection failed')));
      });
    });
  };

  await Promise.all([connectClient(pageA), connectClient(pageB)]);

  const senderA = `user-a-${Date.now()}`;
  const senderB = `user-b-${Date.now()}`;
  const contentA = `hello-from-a-${Date.now()}`;
  const contentB = `hello-from-b-${Date.now()}`;

  await pageA.evaluate(
    ({ userId, content }) => {
      (window as Window & { testSocket?: WebSocket }).testSocket?.send(
        JSON.stringify({ action: 'sendMessage', userId, content })
      );
    },
    { userId: senderA, content: contentA }
  );

  await expect
    .poll(async () => {
      return pageB.evaluate(
        ({ userId, content }) => {
          const events = (window as Window & {
            receivedEvents?: Array<{ type?: string; message?: { senderUserId?: string; content?: string } }>;
          }).receivedEvents;

          return (
            events?.some(
              (event) =>
                event.type === 'chat.message.created' &&
                event.message?.senderUserId === userId &&
                event.message?.content === content
            ) ?? false
          );
        },
        { userId: senderA, content: contentA }
      );
    })
    .toBe(true);

  await pageB.evaluate(
    ({ userId, content }) => {
      (window as Window & { testSocket?: WebSocket }).testSocket?.send(
        JSON.stringify({ action: 'sendMessage', userId, content })
      );
    },
    { userId: senderB, content: contentB }
  );

  await expect
    .poll(async () => {
      return pageA.evaluate(
        ({ userId, content }) => {
          const events = (window as Window & {
            receivedEvents?: Array<{ type?: string; message?: { senderUserId?: string; content?: string } }>;
          }).receivedEvents;

          return (
            events?.some(
              (event) =>
                event.type === 'chat.message.created' &&
                event.message?.senderUserId === userId &&
                event.message?.content === content
            ) ?? false
          );
        },
        { userId: senderB, content: contentB }
      );
    })
    .toBe(true);

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
