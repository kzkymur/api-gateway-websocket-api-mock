import { defineConfig } from '@playwright/test';

const integrationsPort = 3100;
const gatewayPort = 8787;

const routeIntegrations = JSON.stringify({
  $connect: `http://127.0.0.1:${integrationsPort}/integrations/connect`,
  $disconnect: `http://127.0.0.1:${integrationsPort}/integrations/disconnect`,
  $default: `http://127.0.0.1:${integrationsPort}/integrations/default`,
  sendMessage: `http://127.0.0.1:${integrationsPort}/integrations/send-message`
});

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  use: {
    channel: 'chromium'
  },
  webServer: [
    {
      command: 'node ./helpers/mock-integrations-server.mjs',
      cwd: '.',
      env: {
        HOST: '127.0.0.1',
        PORT: `${integrationsPort}`,
        STAGE: 'dev',
        GATEWAY_BASE_URL: `http://127.0.0.1:${gatewayPort}/dev`
      },
      url: `http://127.0.0.1:${integrationsPort}/healthz`,
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
