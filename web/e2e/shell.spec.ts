import { expect, test } from '@playwright/test';

test('a guest opens Minnal and sees Quick Match', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Quick Match').first()).toBeVisible();
});

test('the surface colour swaps with the OS dark setting, no reload', async ({ page }) => {
  const paper = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-paper').trim());
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const light = await paper();
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await paper();
  expect(light).not.toBe('');
  expect(dark).not.toBe('');
  expect(dark).not.toBe(light);
});

// Deferred from Story 1.3: reflow at 320px, and at 360px with 200% text.
for (const [name, width, fontScale] of [
  ['320px', 320, 1],
  ['360px at 200% text', 360, 2],
] as const) {
  test(`no horizontal scroll at ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 });
    await page.goto('/');
    await page.getByText('Quick Match').first().waitFor();
    if (fontScale !== 1) {
      await page.addStyleTag({ content: `html { font-size: ${fontScale * 100}% !important; }` });
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
