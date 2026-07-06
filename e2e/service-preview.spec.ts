import { test, expect } from '@playwright/test';

test.describe('Dashboard – Service Preview Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000); // Let React fully render
  });

  const expandServices = async (page: any) => {
    // Click the services-bar-top div which has the onClick to toggle showServices
    await page.locator('div.services-bar-top').first().click({ timeout: 5000 });
    await page.waitForTimeout(500);
  };

  test('dashboard loads with Services section', async ({ page }) => {
    await expect(page.locator('div.services-bar-title').first()).toBeVisible({ timeout: 10000 });
  });

  test('clicking Services heading expands the pills', async ({ page }) => {
    await expandServices(page);

    await expect(page.locator('text=My Static Website').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=File Share').first()).toBeVisible({ timeout: 3000 });
  });

  test('clicking a service pill opens preview modal with tabs', async ({ page }) => {
    await expandServices(page);

    const servicePill = page.locator('text=My Static Website').first();
    await servicePill.click({ timeout: 5000 });

    // Verify modal opened with tabs
    await expect(page.locator('text=Preview').first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Source').first()).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Customize').first()).toBeVisible({ timeout: 3000 });
  });

  test('modal has Host on .dweb button', async ({ page }) => {
    await expandServices(page);

    const servicePill = page.locator('text=My Static Website').first();
    await servicePill.click({ timeout: 5000 });

    await expect(page.locator('text=Host on .dweb').first()).toBeVisible({ timeout: 5000 });
  });

  test('Preview tab shows an iframe', async ({ page }) => {
    await expandServices(page);

    const servicePill = page.locator('text=My Static Website').first();
    await servicePill.click({ timeout: 5000 });

    // Explicitly click Preview tab
    await page.locator('text=Preview').first().click({ timeout: 3000 });

    await expect(page.locator('iframe').first()).toBeVisible({ timeout: 5000 });
  });

  test('Source tab shows HTML content', async ({ page }) => {
    await expandServices(page);

    const servicePill = page.locator('text=My Static Website').first();
    await servicePill.click({ timeout: 5000 });

    await page.locator('text=Source').first().click({ timeout: 3000 });

    await expect(page.locator('pre, code').first()).toBeVisible({ timeout: 5000 });
  });

  test('Customize tab has textarea and Save button', async ({ page }) => {
    await expandServices(page);

    const servicePill = page.locator('text=My Static Website').first();
    await servicePill.click({ timeout: 5000 });

    await page.locator('text=Customize').first().click({ timeout: 3000 });

    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Save Changes').first()).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Backend API endpoints', () => {
  test('GET /api/services returns 200 with services array', async ({ request }) => {
    const resp = await request.get('http://localhost:49737/api/services');
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(Array.isArray(body.services)).toBe(true);
  });

  test('GET /welcome returns 200', async ({ request }) => {
    const resp = await request.get('http://localhost:49737/welcome');
    expect(resp.status()).toBe(200);
  });

  test('GET /fileshare returns 200', async ({ request }) => {
    const resp = await request.get('http://localhost:49737/fileshare');
    expect(resp.status()).toBe(200);
  });
});
