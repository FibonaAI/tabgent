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
      if (verify) {
        for (const entry of Object.values(entries).filter(
          (e) => e.urls.includes(url) && !e.hasUserInput,
        )) {
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
        .filter((entry) => entry.hasUserInput && entry.urls.includes(url))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
  };
}
