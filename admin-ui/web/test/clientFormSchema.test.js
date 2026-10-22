// admin-ui/web/test/clientFormSchema.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

test('validateClientForm requires name/transport/url on create', async () => {
    const { validateClientForm } = await import('../src/components/clientFormSchema.js');
    const result = validateClientForm({ name: '', transport: '', url: '' }, { isEdit: false });
    assert.equal(result.valid, false);
    assert.ok(result.errors.name);
    assert.ok(result.errors.transport);
    assert.ok(result.errors.url);
});

test('validateClientForm rejects a name with invalid characters', async () => {
    const { validateClientForm } = await import('../src/components/clientFormSchema.js');
    const result = validateClientForm({ name: 'bad name!', transport: 'mailru', url: 'https://x' }, { isEdit: false });
    assert.equal(result.valid, false);
    assert.match(result.errors.name, /letters, digits/);
});

test('validateClientForm rejects an unknown transport', async () => {
    const { validateClientForm } = await import('../src/components/clientFormSchema.js');
    const result = validateClientForm({ name: 'ok', transport: 'oneme', url: 'https://x' }, { isEdit: false });
    assert.equal(result.valid, false);
    assert.ok(result.errors.transport);
});

test('validateClientForm passes on edit even though name is not editable', async () => {
    const { validateClientForm } = await import('../src/components/clientFormSchema.js');
    const result = validateClientForm({ name: 'locked', transport: 'mailru', url: 'https://x' }, { isEdit: true });
    assert.equal(result.valid, true);
});
