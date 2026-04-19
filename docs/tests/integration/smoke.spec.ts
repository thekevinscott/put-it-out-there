import { expect, test } from '@playwright/test';

test('home page renders hero + feature list', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Put It Out There/i })).toBeVisible();
  await expect(page.getByText(/Polyglot release orchestrator/i)).toBeVisible();
  await expect(page.getByText(/Three registries, one flow/i)).toBeVisible();
});

test('getting started page is reachable', async ({ page }) => {
  await page.goto('/getting-started');
  await expect(page.getByRole('heading', { name: /Getting started/i })).toBeVisible();
  await expect(page.getByText(/putitoutthere init/i).first()).toBeVisible();
});

test('navigation to trailer guide works', async ({ page }) => {
  await page.goto('/guide/trailer');
  await expect(page.getByRole('heading', { name: /Release trailer/i })).toBeVisible();
});
