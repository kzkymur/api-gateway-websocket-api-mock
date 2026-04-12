const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const wsUrl = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8787/dev';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('app not found');

app.innerHTML = `
  <h1>Global Board Example</h1>
  <div>
    <button id="setup">Create User</button>
    <button id="send">Send Message</button>
  </div>
  <pre id="log" style="height:320px; overflow:auto; border:1px solid #ccc; padding:8px;"></pre>
`;

const logEl = document.querySelector<HTMLPreElement>('#log')!;
const log = (data: unknown) => {
  logEl.textContent += `${typeof data === 'string' ? data : JSON.stringify(data)}\n`;
  logEl.scrollTop = logEl.scrollHeight;
};

let userId = '';
let ws: WebSocket | null = null;

const connectWs = () => {
  ws = new WebSocket(wsUrl);
  ws.onopen = () => log('ws connected');
  ws.onmessage = (event) => log(`ws recv: ${event.data}`);
  ws.onclose = () => log('ws closed');
};

connectWs();

document.querySelector<HTMLButtonElement>('#setup')!.onclick = async () => {
  const user = await fetch(`${apiBase}/api/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ displayName: `user-${Date.now()}` })
  }).then((r) => r.json());

  userId = user.id;
  log({ userId, setup: 'done' });
};

document.querySelector<HTMLButtonElement>('#send')!.onclick = () => {
  if (!userId) {
    log('create user first');
    return;
  }
  ws?.send(JSON.stringify({ action: 'sendMessage', userId, content: `hello ${Date.now()}` }));
};
