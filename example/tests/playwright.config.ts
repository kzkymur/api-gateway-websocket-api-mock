import { defineConfig } from '@playwright/test';

const backendPort = 3000;
const gatewayPort = 8787;

const routeIntegrations = JSON.stringify({
  $connect: `http://127.0.0.1:${backendPort}/integrations/connect`,
  $disconnect: `http://127.0.0.1:${backendPort}/integrations/disconnect`,
  $default: `http://127.0.0.1:${backendPort}/integrations/default`,
  sendMessage: `http://127.0.0.1:${backendPort}/integrations/send-message`
});

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: {
    channel: 'chromium'
  },
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 3000',
      cwd: '../backend',
      url: 'http://127.0.0.1:3000/healthz',
      reuseExistingServer: true
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 8787',
      cwd: '../../mock-gateway',
      env: {
        HOST: '127.0.0.1',
        PORT: `${gatewayPort}`,
        STAGE: 'dev',
        STRICT_COMPATIBILITY_MODE: 'true',
        ROUTE_INTEGRATIONS_JSON: routeIntegrations
      },
      url: 'http://127.0.0.1:8787/healthz',
      reuseExistingServer: true
    }
  ]
});
