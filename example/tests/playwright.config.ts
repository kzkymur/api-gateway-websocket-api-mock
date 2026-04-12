import { defineConfig } from "@playwright/test";

const startManagedServers = process.env.PW_START_MANAGED_SERVERS === "true";
const integrationsPort = 3110;
const gatewayPort = 8878;
const frontendPort = 5174;
const dockerFrontendPort = 5173;
const dockerFrontendHost = "localhost";

const routeIntegrations = JSON.stringify({
  $connect: `http://127.0.0.1:${integrationsPort}/integrations/connect`,
  $disconnect: `http://127.0.0.1:${integrationsPort}/integrations/disconnect`,
  $default: `http://127.0.0.1:${integrationsPort}/integrations/default`,
  sendMessage: `http://127.0.0.1:${integrationsPort}/integrations/send-message`,
});

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  use: {
    channel: "chromium",
    baseURL: startManagedServers
      ? `http://127.0.0.1:${frontendPort}`
      : `http://${dockerFrontendHost}:${dockerFrontendPort}`,
  },
  webServer: startManagedServers
    ? [
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
          reuseExistingServer: false
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
          url: `http://127.0.0.1:${gatewayPort}/healthz`,
          reuseExistingServer: false
        },
        {
          command: `npm run dev -- --host 127.0.0.1 --port ${frontendPort}`,
          cwd: '../frontend',
          env: {
            VITE_API_BASE_URL: `http://127.0.0.1:${integrationsPort}`,
            VITE_WS_URL: `ws://127.0.0.1:${gatewayPort}/dev`
          },
          url: `http://127.0.0.1:${frontendPort}`,
          reuseExistingServer: false
        }
      ]
    : undefined,
});
