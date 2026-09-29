import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { toggleId, toggleAll, allSelected, pruneSelection } from './selection';

describe('selection', () => {
  it('toggles one id without mutating the input', () => {
    const a = new Set(['1']);
    const b = toggleId(a, '2');
    assert.deepEqual([...b].sort(), ['1', '2']);
    assert.deepEqual([...a], ['1']);
    assert.deepEqual([...toggleId(b, '1')], ['2']);
  });
  it('select all then none', () => {
    const ids = ['1', '2', '3'];
    const all = toggleAll(new Set(['1']), ids);
    assert.equal(allSelected(all, ids), true);
    assert.equal(toggleAll(all, ids).size, 0);
  });
  it('allSelected is false for an empty list', () => {
    assert.equal(allSelected(new Set(), []), false);
  });
  it('prunes ids no longer listed', () => {
    assert.deepEqual([...pruneSelection(new Set(['1', '9']), ['1', '2'])], ['1']);
  });
});
