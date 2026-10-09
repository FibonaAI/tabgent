// Persistent URL-to-thread index. Conversation bodies remain in Codex storage.
const pageUrl = (url) => (url || '').split('#', 1)[0];
export function createUrlHistory(storage) {
  let entries = {},
    writes = Promise.resolve();
  const loaded = storage.get('urlHistory').then((data) => {
    entries = data.urlHistory || {};
    for (const entry of Object.values(entries)) entry.urls = [...new Set(entry.urls.map(pageUrl))];
  });
  return {
    async get(threadId) {
      await loaded;
      return entries[threadId];
    },
    async record(session, url) {
      await loaded;
      url = pageUrl(url);
      if (!session.threadId || !url) return;
      const old = entries[session.threadId];
      if (!session.hasUserInput && !old?.hasUserInput) return;
      if (
        old?.urls.includes(url) &&
        old.title === (session.title || old.title) &&
        JSON.stringify(old.settings) === JSON.stringify(session.settings) &&
        old.scope === session.scope
      )
        return;
      entries[session.threadId] = {
        threadId: session.threadId,
        hasUserInput: true,
        title: session.title || old?.title || '',
        urls: [...new Set([...(old?.urls || []), url])],
        updatedAt: Date.now(),
        settings: session.settings,
        scope: session.scope,
      };
      writes = writes
        .catch(() => {})
        .then(() => storage.set({ urlHistory: structuredClone(entries) }));
      await writes;
    },
    async list(url, verify) {
      await loaded;
      const urls = (Array.isArray(url) ? url : [url]).map(pageUrl);
      const matches = (entry) => entry.urls.some((page) => urls.includes(page));
      if (verify) {
        for (const entry of Object.values(entries).filter((e) => matches(e) && !e.hasUserInput)) {
          try {
            const hasInput = await verify(entry.threadId);
            if (hasInput) entry.hasUserInput = true;
            else if (!entries[entry.threadId]?.hasUserInput) delete entries[entry.threadId];
          } catch {
            /* Keep unverifiable records for retry, but do not show them. */
          }
        }
        writes = writes
          .catch(() => {})
          .then(() => storage.set({ urlHistory: structuredClone(entries) }));
        await writes;
      }
      return Object.values(entries)
        .filter((entry) => entry.hasUserInput && matches(entry))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
  };
}
