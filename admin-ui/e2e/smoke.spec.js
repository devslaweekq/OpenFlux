const { test, expect } = require('@playwright/test');

test('login, create two clients, edit one, verify no stale state on selection switch, view logs, remove both', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('User').fill('admin');
    await page.getByLabel('Password').fill('testpass');
    await page.getByRole('button', { name: 'Log in' }).click();

    await expect(page.getByRole('button', { name: '+ New client' })).toBeVisible();

    // Create alice (mailru)
    await page.getByRole('button', { name: '+ New client' }).click();
    await page.getByLabel('Name').fill('alice');
    await page.getByLabel('Transport').selectOption('mailru');
    await page.getByLabel('Document URL').fill('https://cloud.mail.ru/public/AAAA/1111');
    await page.getByRole('button', { name: 'Create client' }).click();

    await expect(page.getByText('Encryption key')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('alice')).toBeVisible();

    // Create bob (yandex)
    await page.getByRole('button', { name: '+ New client' }).click();
    await page.getByLabel('Name').fill('bob');
    await page.getByLabel('Transport').selectOption('yandex');
    await page.getByLabel('Document URL').fill('https://docs.yandex.ru/edit/d/xyz');
    await page.getByRole('button', { name: 'Create client' }).click();

    await expect(page.getByText('Encryption key')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('bob')).toBeVisible();

    // Select alice, view her live logs
    await page.getByText('alice').first().click();
    await expect(page.locator('.log-viewer pre')).toContainText('heartbeat for openflux-alice', { timeout: 2000 });

    // Edit alice: change transport to cupsonline (edit always requires a url too, since
    // Dashboard always passes an empty url as initialValues for edit)
    await page.getByLabel('Transport').selectOption('cupsonline');
    await page.getByLabel('Document URL').fill('https://cups.online/room/edited-alice');
    await page.getByRole('button', { name: 'Save changes' }).click();

    // Editing returns the existing key again (edit preserves the stored key) -> modal
    // reappears, close it
    await expect(page.getByText('Encryption key')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    // List reflects the edit
    await expect(page.locator('.client-row', { hasText: 'alice' })).toContainText('cupsonline');

    // Regression check for the Task 11 fix: select bob right after editing alice,
    // without an intervening close — the edit form must show bob's data (yandex),
    // not alice's just-edited value (cupsonline), proving the form actually remounts.
    await page.getByText('bob').first().click();
    await expect(page.getByLabel('Transport')).toHaveValue('yandex');

    // Remove bob (already selected)
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('bob')).not.toBeVisible();

    // Remove alice too
    await page.getByText('alice').first().click();
    await page.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('alice')).not.toBeVisible();
});
