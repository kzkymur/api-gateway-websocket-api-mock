import { expect, test } from '@playwright/test';

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
