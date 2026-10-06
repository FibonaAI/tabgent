import assert from 'node:assert/strict';
import { createUrlHistory } from '../url-history.js';
let data = {};
const storage = {
  get: async () => structuredClone(data),
  set: async (value) => {
    data = structuredClone(value);
  },
};
let history = createUrlHistory(storage);
await Promise.all([
  history.record(
    { threadId: 'one', title: 'First', scope: 'window' },
    'https://example.test/a?q=1',
  ),
  history.record({ threadId: 'two', title: 'Second' }, 'https://example.test/a?q=1'),
]);
await history.record({ threadId: 'one', title: 'Renamed' }, 'https://example.test/b.pdf');
history = createUrlHistory(storage);
assert.equal((await history.list('https://example.test/a?q=1')).length, 2);
assert.equal((await history.list('https://example.test/a?q=2')).length, 0);
assert.equal((await history.list('https://example.test/b.pdf'))[0].title, 'Renamed');
assert.equal(
  (await history.list('https://example.test/a?q=1')).find((x) => x.threadId === 'one').title,
  'Renamed',
);
console.log(
  'PASS persistent URL history / multiple conversations / navigation / title updates / exact URL matching',
);
