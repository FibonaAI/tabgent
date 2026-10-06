// Persistent URL-to-thread index. Conversation bodies remain in Codex storage.
export function createUrlHistory(storage) {
  let entries = {},
    writes = Promise.resolve();
  const loaded = storage.get('urlHistory').then((data) => {
    entries = data.urlHistory || {};
  });
  return {
    async record(session, url) {
      await loaded;
      if (!session.threadId || !url) return;
      const old = entries[session.threadId];
      if (
        old?.urls.includes(url) &&
        old.title === (session.title || old.title) &&
        JSON.stringify(old.settings) === JSON.stringify(session.settings) &&
        old.scope === session.scope
      )
        return;
      entries[session.threadId] = {
        threadId: session.threadId,
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
    async list(url) {
      await loaded;
      return Object.values(entries)
        .filter((entry) => entry.urls.includes(url))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
  };
}
