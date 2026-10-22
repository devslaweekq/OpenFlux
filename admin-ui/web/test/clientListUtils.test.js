// admin-ui/web/test/clientListUtils.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

test('maskUrl shows a fixed placeholder until a real url is supplied', async () => {
    const { maskUrl } = await import('../src/components/clientListUtils.js');
    assert.equal(maskUrl(undefined), '••••••••');
    assert.equal(maskUrl('https://cloud.mail.ru/public/AAAA/1111'), 'https://cloud.mail.ru/public/AAAA/1111');
});
