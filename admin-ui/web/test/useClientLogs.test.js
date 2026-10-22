import test from 'node:test';
import assert from 'node:assert/strict';

test('reduceLogEvent appends line events, sets error on error events', async () => {
    const { reduceLogEvent } = await import('../src/hooks/useClientLogs.js');
    let state = { lines: [], error: null };
    state = reduceLogEvent(state, { type: 'line', line: 'first' });
    state = reduceLogEvent(state, { type: 'line', line: 'second' });
    assert.deepEqual(state.lines, ['first', 'second']);
    assert.equal(state.error, null);

    state = reduceLogEvent(state, { type: 'error', message: 'boom' });
    assert.equal(state.error, 'boom');
    assert.deepEqual(state.lines, ['first', 'second']);
});

test('reduceLogEvent caps buffered lines at 2000 to bound memory on long sessions', async () => {
    const { reduceLogEvent } = await import('../src/hooks/useClientLogs.js');
    let state = { lines: [], error: null };
    for (let i = 0; i < 2100; i++) {
        state = reduceLogEvent(state, { type: 'line', line: `line ${i}` });
    }
    assert.equal(state.lines.length, 2000);
    assert.equal(state.lines[0], 'line 100');
    assert.equal(state.lines[1999], 'line 2099');
});
