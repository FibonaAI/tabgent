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
    { hasUserInput: true, threadId: 'one', title: 'First', scope: 'window' },
    'https://example.test/a?q=1',
  ),
  history.record(
    { hasUserInput: true, threadId: 'two', title: 'Second' },
    'https://example.test/a?q=1',
  ),
]);
await history.record(
  { hasUserInput: true, threadId: 'one', title: 'Renamed' },
  'https://example.test/b.pdf',
);
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

await history.record({ threadId: 'empty', title: 'New chat' }, 'https://example.test/b.pdf');
assert.equal((await history.list('https://example.test/b.pdf')).length, 1);
data.urlHistory.legacyEmpty = { threadId: 'legacyEmpty', urls: ['https://old.test'] };
data.urlHistory.legacyReal = { threadId: 'legacyReal', urls: ['https://old.test'] };
history = createUrlHistory(storage);
assert.equal((await history.list('https://old.test', async (id) => id === 'legacyReal')).length, 1);
assert(!data.urlHistory.legacyEmpty);
console.log('PASS empty threads excluded / old empty entries removed / real history retained');

// Different document anchors and PDF page numbers share a page's history.
await history.record(
  { hasUserInput: true, threadId: 'pdf' },
  'https://example.test/doc.pdf#page=3',
);
await history.record(
  { hasUserInput: true, threadId: 'pdf' },
  'https://example.test/doc.pdf#page=10',
);
assert.deepEqual((await history.get('pdf')).urls, ['https://example.test/doc.pdf']);
assert.equal((await history.list('https://example.test/doc.pdf#page=20'))[0].threadId, 'pdf');
assert.equal(
  (await history.list(['https://other.test', 'https://example.test/doc.pdf#section']))[0].threadId,
  'pdf',
);
// Old records also match without needing to send another message.
data.urlHistory.anchored = {
  hasUserInput: true,
  threadId: 'anchored',
  urls: ['https://example.test/old#one', 'https://example.test/old#two'],
};
history = createUrlHistory(storage);
assert.equal((await history.list('https://example.test/old'))[0].threadId, 'anchored');
assert.deepEqual((await history.get('anchored')).urls, ['https://example.test/old']);
await history.record(
  { hasUserInput: true, threadId: 'encoded' },
  'https://example.test/a%23b?q=%23value#section',
);
assert.equal((await history.list('https://example.test/a%23b?q=%23value'))[0].threadId, 'encoded');
assert.equal((await history.list('https://example.test/a%23b?q=other')).length, 0);
assert.equal((await history.list('https://example.test/a#b?q=%23value')).length, 0);
console.log(
  'PASS fragment-free grouping / deduplication / legacy records / encoded hashes and query parameters',
);
