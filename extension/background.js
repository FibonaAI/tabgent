import { cleanAnnotations } from './ui/annotations.js';
import { createUrlHistory } from './url-history.js';
import { startPdfRouting, pdfSource, isCurrentPdfSender } from './pdf-routing.js';
import { tool, instructions, pageContextPrefix } from './session-config.js';
import { browserTool, context } from './browser-tools.js';
startPdfRouting();
const sessions = new Map(),
  requests = new Map(),
  chunks = new Map();
// Native Chrome owns sidebar visibility and toolbar toggling.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.warn);
const urlHistory = createUrlHistory(chrome.storage.local);
const sidebarViews = new Map(),
  agentCompanions = new Map();
const agentViews = new Map(),
  closedViews = new Map(),
  openingThreads = new Map();
let native,
  sequence = 1000;
const loaded = chrome.storage.session
  .get(['conversations', 'agentViews', 'closedViews', 'sidebarViews', 'agentCompanions'])
  .then(
    ({
      conversations = [],
      agentViews: views = [],
      closedViews: closed = [],
      sidebarViews: sidebars = [],
      agentCompanions: companions = [],
    }) => {
      for (const [key, value] of conversations)
        sessions.set(key, {
          ...value,
          ports: new Set(),
          turnPending: false,
          questions: [],
          pendingQuestions: [],
        });
      for (const [tabId, key] of views) agentViews.set(tabId, key);
      for (const [tabId, id] of companions) agentCompanions.set(tabId, id);
      for (const [tabId, key] of sidebars) sidebarViews.set(tabId, key);
      for (const [id, view] of closed) closedViews.set(id, view);
    },
  );
const persist = () =>
  chrome.storage.session.set({
    agentViews: [...agentViews],
    sidebarViews: [...sidebarViews],
    agentCompanions: [...agentCompanions],
    closedViews: [...closedViews],
    conversations: [...sessions].map(
      ([key, { ports, turnPending, questions, pendingQuestions, ...s }]) => [key, s],
    ),
  });
const event = (port, name, value) => {
  try {
    port.postMessage({ type: 'event', name, value });
  } catch {}
};
const broadcast = (s, message) => {
  for (const port of s.ports) event(port, 'codex-message', message);
};
async function getSession(tabId) {
  await loaded;
  const key = sidebarViews.get(tabId) ?? (agentViews.has(tabId) ? `sidebar:${tabId}` : tabId);
  let s = sessions.get(key);
  if (!s) {
    const [, { composerDefaults }] = await Promise.all([
      chrome.tabs.get(tabId),
      chrome.storage.local.get('composerDefaults'),
    ]);
    // Another view may have created this session while Chrome resolved the tab.
    if (sessions.has(key)) return sessions.get(key);
    s = {
      tabId,
      id: crypto.randomUUID(),
      scope: 'window',
      key,
      draft: '',
      settings: composerDefaults ? { ...composerDefaults } : undefined,
      ports: new Set(),
    };
    sessions.set(key, s);
    await persist();
  }
  return s;
}
async function historyUrl(s) {
  const tab = await chrome.tabs.get(s.tabId).catch(() => null);
  if (tab?.incognito) return '';
  const url = pdfSource(tab?.url) || tab?.url || tab?.pendingUrl;
  if (url && !url.startsWith(chrome.runtime.getURL('ui/chat.html'))) return url;
  return '';
}
function hasUserInput(thread) {
  return thread?.turns?.some((turn) =>
    turn.items?.some(
      (item) =>
        item.type === 'userMessage' &&
        !(item.content || []).some((part) =>
          part.text?.startsWith('Browser conversation lineage (context only; no reply required).'),
        ),
    ),
  );
}
async function verifyHistory(session, threadId) {
  try {
    const result = await new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        requests.delete(id);
        reject(Error('History unavailable'));
      }, 10000);
      requests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      connect().postMessage({
        op: 'rpc',
        session: session.id,
        message: { id, method: 'thread/read', params: { threadId, includeTurns: true } },
      });
    });
    return !!hasUserInput(result.thread);
  } catch (e) {
    if (
      /no rollout found|thread not found|not materialized yet|includeTurns is unavailable before first user message/i.test(
        e.message,
      )
    )
      return false;
    throw e;
  }
}
async function recordHistory(s, url) {
  const urls = url ? [url] : (await urlHistory.get(s.threadId))?.urls || [];
  for (const page of urls) await urlHistory.record(s, page);
}
// Navigation targets identify webpage links; new-tab and clone actions stay roots.
async function trackChild(tabId, parent) {
  if (!parent || tabId === parent.tabId || agentViews.has(tabId)) return;
  return linkSession(await getSession(tabId), parent);
}
async function linkSession(child, parent) {
  if (child === parent || child.parent) return;
  const source = await chrome.tabs.get(parent.tabId).catch(() => ({}));
  child.parent = {
    key: parent.key,
    threadId: parent.threadId,
    source: {
      tabId: parent.tabId,
      url: source.url || '',
      title: source.title || '',
    },
  };
  await persist();
  connect().postMessage({ op: 'claim', session: parent.id, threadId: parent.threadId });
  connect().postMessage({ op: 'claim', session: child.id, threadId: child.threadId });
  void linkChildren().catch(console.warn);
}
let linking;
async function linkChildren() {
  if (linking) return linking;
  linking = (async () => {
    for (const child of sessions.values()) {
      const parent = child.parent;
      if (!parent || child.linkRecorded || !child.threadId) continue;
      parent.threadId ||= sessions.get(parent.key)?.threadId;
      if (!parent.threadId || parent.threadId === child.threadId) continue;
      const destination = await chrome.tabs.get(child.tabId).catch(() => ({}));
      await new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          requests.delete(id);
          reject(Error('Conversation lineage could not be recorded; retry the message'));
        }, 30000);
        requests.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        connect().postMessage({
          op: 'rpc',
          session: child.id,
          message: {
            id,
            method: 'bridge/thread/link',
            params: {
              parentThreadId: parent.threadId,
              childThreadId: child.threadId,
              source: {
                ...parent.source,
                destination: { title: destination.title || '', url: destination.url || '' },
              },
            },
          },
        });
      });
      child.linkRecorded = true;
      for (const [key, session] of sessions) {
        if (
          session.closedTab &&
          (!session.parent || session.linkRecorded) &&
          ![...sessions.values()].some((value) => value.parent?.key === key && !value.linkRecorded)
        ) {
          native?.postMessage({ op: 'close', session: session.id });
          sessions.delete(key);
        }
      }
      await persist();
    }
  })();
  try {
    await linking;
  } finally {
    linking = null;
  }
}
chrome.webNavigation.onCreatedNavigationTarget?.addListener(async ({ sourceTabId, tabId }) => {
  await loaded;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || tab.incognito) return;
  const parent = agentViews.has(sourceTabId)
    ? sessions.get(agentViews.get(sourceTabId))
    : await getSession(sourceTabId);
  await trackChild(tabId, parent).catch(console.warn);
});
function connect() {
  if (native) return native;
  native = chrome.runtime.connectNative('com.tabgent.codex');
  native.onMessage.addListener((message) => void receive(message));
  native.onDisconnect.addListener(() => {
    const message = chrome.runtime.lastError?.message || '';
    native = null;
    for (const r of requests.values()) r.reject?.(Error('Codex disconnected'));
    requests.clear();
    const missing = /native messaging host not found/i.test(message);
    for (const s of sessions.values()) {
      s.turnPending = false;
      broadcast(
        s,
        missing
          ? { method: 'bridge/helperMissing' }
          : { method: 'bridge/error', params: { messageKey: 'helperLaunchFailed' } },
      );
    }
  });
  native.postMessage({
    op: 'warm',
    config: { developerInstructions: instructions, dynamicTools: [tool] },
  });
  return native;
}
async function receive(message) {
  if (message.op === 'chunk') {
    if (message.count > 256) return;
    let c = chunks.get(message.id);
    if (!c) {
      c = [];
      chunks.set(message.id, c);
      setTimeout(() => chunks.delete(message.id), 30000);
    }
    c[message.index] = message.data;
    if (c.filter((x) => x !== undefined).length !== message.count) return;
    chunks.delete(message.id);
    message = JSON.parse(c.join(''));
  }
  const s = [...sessions.values()].find((s) => s.id === message.session);
  if (!s) return;
  const m = message.message;
  if (m.method === 'bridge/ready' && m.params?.threadId) {
    s.threadId = m.params.threadId;
    void recordHistory(s).catch(console.warn);
    await persist();
    void linkChildren().catch(console.warn);
  }
  if (m.method === 'bridge/authChanged') s.restart = true;
  if (m.method === 'item/tool/call') {
    let result;
    try {
      if (m.params.tool !== 'browser') throw Error('Unsupported tool');
      const args =
        typeof m.params.arguments === 'string'
          ? JSON.parse(m.params.arguments)
          : m.params.arguments;
      const value = await browserTool(
        { ...s, tabId: s.toolTabId ?? s.tabId },
        args,
        (params) =>
          new Promise((resolve, reject) => {
            const id = ++sequence;
            const timer = setTimeout(() => {
              requests.delete(id);
              reject(Error('PDF read timed out'));
            }, 30000);
            requests.set(id, {
              resolve: (value) => {
                clearTimeout(timer);
                resolve(value);
              },
              reject: (error) => {
                clearTimeout(timer);
                reject(error);
              },
            });
            connect().postMessage({
              op: 'rpc',
              session: s.id,
              message: { id, method: 'bridge/pdf/read', params },
            });
          }),
      );
      if (args.action === 'open' && value?.id) await trackChild(value.id, s);
      result = {
        success: true,
        contentItems: value?.data
          ? [
              {
                type: 'inputText',
                text: JSON.stringify({
                  ...value,
                  data: undefined,
                  coordinateSelector: '@point(x,y)',
                }),
              },
              { type: 'inputImage', imageUrl: 'data:image/png;base64,' + value.data },
            ]
          : [{ type: 'inputText', text: JSON.stringify(value) }],
      };
    } catch (e) {
      result = { success: false, contentItems: [{ type: 'inputText', text: e.message }] };
    }
    native?.postMessage({ op: 'rpc', session: s.id, message: { id: m.id, result } });
    return;
  }
  if (m.id !== undefined && !m.method) {
    const r = requests.get(m.id);
    if (r) {
      requests.delete(m.id);
      if (r.resolve) {
        if (m.error) r.reject(Error(m.error.message));
        else r.resolve(m.result);
        return;
      }
      if (!m.error && r.toolTabId != null) s.toolTabId = r.toolTabId;
      if (['turn/start', 'thread/queue/start'].includes(r.method) && m.error) s.turnPending = false;
      if (
        !m.error &&
        (['turn/start', 'thread/queue/start', 'turn/steer', 'thread/queue/add'].includes(
          r.method,
        ) ||
          hasUserInput(m.result?.thread))
      ) {
        s.hasUserInput = true;
        await recordHistory(s, r.pageUrl);
        for (const turn of m.result?.thread?.turns || [])
          for (const item of turn.items || [])
            if (item.type === 'userMessage')
              for (const part of item.content || [])
                if (part.text?.startsWith(pageContextPrefix)) {
                  try {
                    const page = JSON.parse(part.text.slice(pageContextPrefix.length));
                    if (typeof page.url === 'string') await recordHistory(s, page.url);
                  } catch {}
                }
        await persist();
        for (const port of s.ports) event(port, 'codex-history-changed');
      }
      if (r.method === 'bridge/thread/relations' && m.result) {
        const entries = [...(m.result.parents || []), ...(m.result.children || [])];
        s.relatedThreads = entries.map((entry) => entry.threadId);
        await persist();
        await Promise.all(
          entries.map(async (entry) => {
            const owner = [...sessions.values()].find((value) => value.threadId === entry.threadId);
            const page = owner && (await chrome.tabs.get(owner.tabId).catch(() => null));
            entry.title = owner?.title || entry.title;
            entry.pageTitle = page?.title || entry.pageTitle;
            entry.url = page?.url || entry.url;
          }),
        );
      }
      event(r.port, 'codex-message', { ...m, id: r.id });
    }
    return;
  }
  if (m.id !== undefined && m.method) {
    s.pendingQuestions ||= [];
    if (!s.pendingQuestions.includes(m.id)) s.pendingQuestions.push(m.id);
    s.questions = [...(s.questions || []).filter((q) => q.id !== m.id), m];
  }
  if (m.method === 'item/started' && m.params?.item?.type === 'userMessage') {
    const page = m.params.item.content?.find(
      (p) => p.type === 'text' && p.text?.startsWith(pageContextPrefix),
    );
    if (page) {
      try {
        const id = JSON.parse(page.text.slice(pageContextPrefix.length)).tabId;
        if (Number.isInteger(id)) s.toolTabId = id;
      } catch {}
    }
  }
  if (m.method === 'turn/started') s.turnPending = true;
  if (m.method === 'turn/completed' || m.method === 'bridge/closed') s.turnPending = false;
  broadcast(s, m);
}
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'pdf') {
    void (async () => {
      await loaded;
      if (!(await isCurrentPdfSender(port.sender))) return;
      for (const s of sessions.values()) {
        if (
          s.tabId !== port.sender.tab.id ||
          !s.selection ||
          s.selection.documentId === port.sender.documentId
        )
          continue;
        s.selection = null;
        for (const p of s.ports) event(p, 'codex-selection', null);
      }
      await persist();
    })();
    return;
  }
  if (port.name !== 'chat') return;
  let session;
  port.onMessage.addListener(async (msg) => {
    try {
      if (msg.type === 'attach') {
        if (
          port.sender.id !== chrome.runtime.id ||
          !port.sender.url?.startsWith(chrome.runtime.getURL(''))
        )
          throw Error('Invalid sender');
        if (port.sender.frameId > 0) throw Error('Invalid frame');
        await loaded;
        const s =
          port.sender.tab && agentViews.has(port.sender.tab.id)
            ? sessions.get(agentViews.get(port.sender.tab.id))
            : await getSession(msg.tabId);
        if (!s) throw Error('Conversation not found');
        if (
          port.sender.tab &&
          port.sender.tab.id !== s.key &&
          agentViews.get(port.sender.tab.id) !== s.key
        )
          throw Error('Invalid owner');
        await chrome.tabs.get(s.tabId);
        const viewTabId = port.sender.tab?.id ?? msg.tabId;
        await chrome.tabs.get(viewTabId);
        session = s;
        port.companionTabId = port.sender.tab
          ? (agentCompanions.get(port.sender.tab.id) ?? s.tabId)
          : msg.tabId;
        s.ports.add(port);
        port.postMessage({
          type: 'attached',
          state: {
            threadId: s.threadId,
            companionTabId: port.companionTabId,
            draft: s.draft,
            scope: s.scope,
            settings: s.settings,
            conversationKey: s.key,
            windowId: (await chrome.tabs.get(viewTabId)).windowId,
            selection: s.selection?.tabId === port.companionTabId ? s.selection : null,
            annotations: s.annotations || [],
            attachments: s.attachments || [],
            questions: s.questions || [],
          },
        });
        chrome.scripting
          .executeScript({
            target: { tabId: port.companionTabId, allFrames: true },
            files: ['selection-content.js'],
          })
          .catch(() => {});
        return;
      }
      const s = session;
      if (!s) return;
      if (msg.type === 'draft') {
        s.draft = msg.text;
        for (const p of s.ports) if (p !== port) event(p, 'codex-draft', s.draft);
        await persist();
        return;
      }
      if (msg.type === 'bind') {
        s.threadId = msg.threadId;
        await recordHistory(s);
        for (const p of s.ports) if (p !== port) event(p, 'codex-thread', s.threadId);
        await persist();
        void linkChildren().catch(console.warn);
        return;
      }
      if (msg.type !== 'ui') return;
      const [arg] = msg.args || [];
      if (msg.name === 'codexConnect') {
        connect().postMessage({
          op: s.restart ? 'restart' : 'claim',
          session: s.id,
          threadId: s.threadId,
        });
        s.restart = false;
      }
      if (msg.name === 'codexRpc') {
        const m = { ...arg, params: { ...arg.params } };
        let messageTabId, messagePageUrl;
        if (['turn/start', 'turn/steer', 'thread/queue/add'].includes(m.method)) {
          const input = [...(m.params.input || [])];
          let page = input.find((p) => p.type === 'text' && p.text?.startsWith(pageContextPrefix));
          if (!page) {
            const tab = await chrome.tabs.get(port.companionTabId);
            page = {
              type: 'text',
              text:
                pageContextPrefix +
                JSON.stringify({
                  tabId: tab.id,
                  windowId: tab.windowId,
                  url: pdfSource(tab.url) || tab.url,
                  title: tab.title || '',
                }),
            };
            input.unshift(page);
          }
          const messagePage = JSON.parse(page.text.slice(pageContextPrefix.length));
          messagePageUrl = messagePage.url;
          s.pageUrls ||= {};
          if (messagePageUrl) s.pageUrls[messagePage.tabId] = messagePageUrl;
          m.params.input = input;
          if (m.method !== 'thread/queue/add')
            messageTabId = JSON.parse(page.text.slice(pageContextPrefix.length)).tabId;
        }
        if (m.method === 'thread/queue/start')
          messageTabId = m.params.browserTabId ?? port.companionTabId;
        delete m.params.browserTabId;
        if (['turn/start', 'thread/queue/start', 'turn/steer'].includes(m.method))
          await linkChildren();
        if (m.id !== undefined && !m.method) {
          if (!s.pendingQuestions?.includes(m.id)) return;
          s.pendingQuestions = s.pendingQuestions.filter((id) => id !== m.id);
          s.questions = (s.questions || []).filter((q) => q.id !== m.id);
          for (const p of s.ports) event(p, 'codex-question-answered', m.id);
        }
        if (['turn/start', 'thread/queue/start'].includes(m.method)) {
          if (s.turnPending) {
            event(port, 'codex-message', {
              id: m.id,
              error: { message: chrome.i18n.getMessage('conversationBusy') },
            });
            return;
          }
          s.turnPending = true;
        }
        if (m.id !== undefined && m.method) {
          const id = ++sequence;
          requests.set(id, {
            port,
            id: m.id,
            method: m.method,
            tabId: port.companionTabId,
            toolTabId: messageTabId,
            pageUrl: messagePageUrl,
          });
          m.id = id;
        }
        connect().postMessage({ op: 'rpc', session: s.id, message: m });
      }
      if (msg.name === 'codexAttachments' && Array.isArray(arg) && arg.length <= 10) {
        const attachments = arg.map((a) => ({
          name: String(a.name).slice(0, 300),
          path: String(a.path).slice(0, 2000),
          image: !!a.image,
        }));
        if (JSON.stringify(attachments) !== JSON.stringify(s.attachments || [])) {
          s.attachments = attachments;
          for (const p of s.ports) if (p !== port) event(p, 'codex-attachments', attachments);
          await persist();
        }
      }
      if (msg.name === 'codexSetAnnotations') {
        s.annotations = cleanAnnotations(arg);
        for (const p of s.ports) if (p !== port) event(p, 'codex-annotations', s.annotations);
        await persist();
      }
      if (msg.name === 'codexClearSelection' && s.selection?.id === arg) {
        s.selection = null;
        await persist();
        for (const p of s.ports) event(p, 'codex-selection', null);
      }
      if (msg.name === 'codexSettings') {
        s.settings = {
          model: String(arg.model || '').slice(0, 200),
          effort: String(arg.effort || '').slice(0, 30),
          mode: arg.mode === 'plan' ? 'plan' : 'default',
          permissionMode: ['ask', 'auto', 'full'].includes(arg.permissionMode)
            ? arg.permissionMode
            : 'ask',
        };
        const { model, effort, permissionMode } = s.settings;
        await chrome.storage.local.set({ composerDefaults: { model, effort, permissionMode } });
        await persist();
        for (const p of s.ports) if (p !== port) event(p, 'codex-settings', arg);
      }
      if (msg.name === 'codexScope') {
        s.scope = arg === 'browser' ? 'browser' : 'window';
        for (const p of s.ports) if (p !== port) event(p, 'codex-scope', s.scope);
        await persist();
      }
      if (msg.name === 'codexContext')
        event(port, 'codex-context', await context({ ...s, tabId: port.companionTabId }));
      if (msg.name === 'codexCheckAuth') {
        connect().postMessage({ op: 'checkAuth', session: s.id });
      }
      if (msg.name === 'helperHelp')
        await chrome.tabs.create({ url: chrome.runtime.getURL('setup.html') });
      if (msg.name === 'codexOpenSetupUrl') {
        const u = new URL(arg);
        if (
          u.protocol === 'https:' &&
          ['auth.openai.com', 'chatgpt.com', 'learn.chatgpt.com', 'openai.com'].includes(u.hostname)
        )
          await chrome.tabs.create({ url: u.href });
      }
      if (msg.name === 'title') {
        const changed = s.title !== arg;
        s.title = arg;
        if (changed) await recordHistory(s);
        for (const p of s.ports) event(p, 'codex-title', arg);
        if (changed) {
          await persist();
          for (const owner of sessions.values())
            broadcast(owner, { method: 'bridge/lineageChanged' });
        }
      }
    } catch (e) {
      if (!session) port.postMessage({ type: 'attachError', message: e.message });
      if (session)
        event(port, 'codex-message', { method: 'bridge/error', params: { message: e.message } });
    }
  });
  port.onDisconnect.addListener(() => {
    session?.ports.delete(port);
    for (const [id, request] of requests) if (request.port === port) requests.delete(id);
  });
});
async function openAgentTab(session, windowId, companionTabId = session.tabId) {
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false, windowId });
  if (session.tabId == null) {
    session.tabId = tab.id;
    session.noCompanion = true;
  }
  agentViews.set(tab.id, session.key);
  agentCompanions.set(tab.id, companionTabId ?? session.tabId);
  await persist();
  await chrome.tabs.update(tab.id, { url: chrome.runtime.getURL('ui/chat.html'), active: true });
  return { tabId: tab.id };
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (sender.id !== chrome.runtime.id || msg.type === 'pdfFallback') return;
  (async () => {
    if (msg.type === 'pageSelection' || msg.type === 'pageSelectionCleared') {
      if (
        !sender.tab ||
        sender.tab.incognito ||
        (!/^https?:/.test(sender.url || '') && !pdfSource(sender.url)) ||
        (msg.type === 'pageSelection' && (typeof msg.text !== 'string' || !msg.text.trim()))
      )
        throw Error('Invalid selection');
      if (pdfSource(sender.url)) {
        // Chrome hides extension documents from webNavigation.getFrame.
        if (!(await isCurrentPdfSender(sender))) throw Error('Stale PDF selection');
      } else {
        const frame = await chrome.webNavigation.getFrame({
          tabId: sender.tab.id,
          frameId: sender.frameId,
        });
        if (!frame || (sender.documentId && frame.documentId !== sender.documentId))
          throw Error('Stale selection');
      }
      await getSession(sender.tab.id);
      for (const s of sessions.values()) {
        if (s.tabId !== sender.tab.id) continue;
        if (msg.type === 'pageSelectionCleared') {
          if (
            !msg.selectionId ||
            s.selection?.selectionId !== msg.selectionId ||
            s.selection.frameId !== sender.frameId ||
            s.selection.documentId !== sender.documentId
          )
            continue;
          s.selection = null;
          await persist();
          for (const p of s.ports) event(p, 'codex-selection', null);
          continue;
        }
        s.selection = {
          selectionId: msg.selectionId,
          id: crypto.randomUUID(),
          text: msg.text.slice(0, 20000),
          truncated: !!msg.truncated || msg.text.length > 20000,
          url: pdfSource(sender.url) || sender.url,
          title: typeof msg.title === 'string' ? msg.title.slice(0, 500) : '',
          frameId: sender.frameId,
          documentId: sender.documentId,
          tabId: sender.tab.id,
          locator: msg.locator && JSON.stringify(msg.locator).length < 24000 ? msg.locator : null,
        };
        await persist();
        for (const p of s.ports) event(p, 'codex-selection', s.selection);
      }
      return {};
    }
    if (!sender.url?.startsWith(chrome.runtime.getURL(''))) throw Error('Invalid sender');
    if (msg.type === 'openConversationLink') {
      await loaded;
      const source = sessions.get(msg.conversationKey);
      if (!source) throw Error('Conversation not found');
      const url = new URL(msg.url);
      if (!['http:', 'https:'].includes(url.protocol)) throw Error('Invalid link');
      const owner = await chrome.tabs.get(msg.companionTabId ?? source.tabId);
      if (msg.newTab === false && !owner.url?.startsWith(chrome.runtime.getURL('ui/chat.html'))) {
        await chrome.tabs.update(owner.id, { url: url.href });
        return { tabId: owner.id };
      }
      const tab = await chrome.tabs.create({
        url: url.href,
        windowId: owner.windowId,
        active: msg.active !== false,
      });
      await trackChild(tab.id, { ...source, tabId: owner.id });
      return { tabId: tab.id };
    }
    if (msg.type === 'urlHistory' || msg.type === 'switchHistory') {
      await loaded;
      const source = sessions.get(msg.conversationKey);
      if (!source) throw Error('Conversation not found');
      await Promise.all(
        [...sessions.values()].filter((s) => !s.closedTab).map((session) => recordHistory(session)),
      );
      const viewTabId = sender.tab
        ? (agentCompanions.get(sender.tab.id) ?? source.tabId)
        : (msg.companionTabId ?? source.tabId);
      if (source.threadId && !source.hasUserInput) {
        source.hasUserInput = await verifyHistory(source, source.threadId);
        await persist();
      }
      const viewSource = { ...source, tabId: viewTabId };
      await recordHistory(viewSource);
      const liveUrl = await historyUrl(viewSource);
      source.pageUrls ||= {};
      if (liveUrl) source.pageUrls[viewTabId] = liveUrl;
      const url = liveUrl || source.pageUrls[viewTabId] || '';
      await persist();
      const entries = url
        ? await urlHistory.list(url, (threadId) => verifyHistory(source, threadId))
        : [];
      if (
        source.threadId &&
        source.hasUserInput &&
        !entries.some((entry) => entry.threadId === source.threadId)
      ) {
        const current = await urlHistory.get(source.threadId);
        entries.unshift({
          ...current,
          threadId: source.threadId,
          title: source.title || current?.title || '',
          updatedAt: current?.updatedAt || Date.now(),
          settings: source.settings,
          scope: source.scope,
        });
      }
      if (msg.type === 'urlHistory') return { url, entries, current: source.threadId };
      const entry = entries.find((item) => item.threadId === msg.threadId);
      if (!entry) throw Error('Conversation does not belong to this URL');
      let target = [...sessions.values()].find(
        (s) => s.threadId === entry.threadId && !s.closedTab,
      );
      if (!target) {
        const id = crypto.randomUUID();
        target = {
          id,
          key: id,
          tabId: viewTabId,
          threadId: entry.threadId,
          title: entry.title,
          hasUserInput: true,
          scope: entry.scope || source.scope,
          settings: entry.settings,
          draft: '',
          ports: new Set(),
        };
        sessions.set(id, target);
      }

      if (sender.tab && agentViews.has(sender.tab.id)) {
        agentViews.set(sender.tab.id, target.key);
      } else {
        sidebarViews.set(viewTabId, target.key);
      }
      await persist();
      return {};
    }
    if (msg.type === 'openRelatedThread') {
      await loaded;
      const source = sessions.get(msg.conversationKey);
      if (!source?.relatedThreads?.includes(msg.threadId))
        throw Error('Conversation is not related');
      if (openingThreads.has(msg.threadId)) return openingThreads.get(msg.threadId);
      const operation = (async () => {
        let target = [...sessions.values()].find(
          (s) => s.threadId === msg.threadId && !s.closedTab,
        );
        if (target) {
          const view = [...agentViews].find(([, key]) => key === target.key);
          const tabId = target.viewOnly ? view?.[0] : target.tabId;
          if (tabId != null) {
            if (!target.viewOnly && !agentViews.has(tabId))
              chrome.sidePanel.open({ tabId }).catch(() => {});
            const tab = await chrome.tabs.update(tabId, { active: true });
            await chrome.windows.update(tab.windowId, { focused: true });
            return { tabId: tab.id };
          }
        }
        const saved = closedViews.get(msg.threadId);
        const companion =
          saved?.tabId != null ? await chrome.tabs.get(saved.tabId).catch(() => null) : null;
        const id = crypto.randomUUID();
        target = {
          id,
          key: id,
          threadId: msg.threadId,
          tabId: companion?.id ?? null,
          scope: saved?.scope || 'window',
          settings: saved?.settings,
          viewOnly: true,
          draft: '',
          ports: new Set(),
        };
        sessions.set(id, target);
        const owner = await chrome.tabs.get(source.tabId);
        const result = await openAgentTab(target, owner.windowId);
        await chrome.windows.update(owner.windowId, { focused: true });
        return result;
      })();
      openingThreads.set(msg.threadId, operation);
      try {
        return await operation;
      } finally {
        openingThreads.delete(msg.threadId);
      }
    }
    if (msg.type === 'openAgent') {
      await loaded;
      const s = sessions.get(msg.conversationKey);
      if (!s) throw Error('Conversation not found');
      return openAgentTab(s, msg.windowId, msg.companionTabId ?? s.tabId);
    }
    if (msg.type === 'newConversation') {
      await loaded;
      const source = sessions.get(msg.conversationKey);
      if (!source) throw Error('Conversation not found');
      const id = crypto.randomUUID();
      const session = {
        id,
        key: id,
        tabId: msg.companionTabId ?? source.tabId,
        scope: source.scope,
        viewOnly: Boolean(sender.tab && agentViews.has(sender.tab.id)),
        settings: {
          model: String(msg.settings?.model || '').slice(0, 200),
          effort: String(msg.settings?.effort || '').slice(0, 30),
          mode: msg.settings?.mode === 'plan' ? 'plan' : 'default',
          permissionMode: ['ask', 'auto', 'full'].includes(msg.settings?.permissionMode)
            ? msg.settings.permissionMode
            : 'ask',
        },
        draft: '',
        annotations: cleanAnnotations(msg.annotations),
        ports: new Set(),
      };
      await recordHistory(source);
      sessions.set(id, session);
      if (sender.tab && agentViews.has(sender.tab.id)) {
        agentViews.set(sender.tab.id, id);
      } else {
        sidebarViews.set(session.tabId, id);
      }
      await persist();
      return { conversationKey: id };
    }
  })().then(reply, (e) => reply({ error: e.message }));
  return true;
});
chrome.tabs.onRemoved.addListener(async (id) => {
  await loaded;
  agentViews.delete(id);
  agentCompanions.delete(id);
  sidebarViews.delete(id);
  for (const [key, s] of sessions) {
    const remaining = [...agentViews, ...sidebarViews].find(([, owner]) => owner === key);
    if (s.tabId !== id && !(s.viewOnly && !remaining)) continue;
    if (remaining) s.tabId = remaining[0];
    else {
      if (!s.hasUserInput && !s.turnPending) {
        connect().postMessage({
          op: 'close',
          session: s.id,
          discardEmpty: true,
          threadId: s.threadId,
        });
        closedViews.delete(s.threadId);
        for (const child of sessions.values()) if (child.parent?.key === key) delete child.parent;
        sessions.delete(key);
        continue;
      }
      if (s.threadId)
        closedViews.set(s.threadId, {
          tabId: s.noCompanion ? null : s.tabId,
          scope: s.scope,
          settings: s.settings,
        });
      for (const child of sessions.values())
        if (child.parent?.key === key) child.parent.threadId ||= s.threadId;
      if (
        (s.parent && !s.linkRecorded) ||
        [...sessions.values()].some((child) => child.parent?.key === key && !child.linkRecorded)
      ) {
        s.closedTab = true;
      } else {
        native?.postMessage({ op: 'close', session: s.id });
        sessions.delete(key);
      }
    }
  }
  await persist();
  for (const session of sessions.values()) broadcast(session, { method: 'bridge/lineageChanged' });
});
chrome.webNavigation.onCommitted.addListener(async (detail) => {
  await loaded;
  for (const s of sessions.values()) {
    if (
      s.tabId !== detail.tabId &&
      ![...s.ports].some((port) => port.companionTabId === detail.tabId)
    )
      continue;
    if (detail.frameId === 0 && detail.url) {
      s.pageUrls ||= {};
      s.pageUrls[detail.tabId] = pdfSource(detail.url) || detail.url;
      await persist();
    }

    if (s.selection && (detail.frameId === 0 || s.selection.frameId === detail.frameId)) {
      s.selection = null;
      await persist();
      for (const p of s.ports) event(p, 'codex-selection', null);
    }
  }
});
loaded.then(() => {
  connect();
  for (const session of sessions.values()) {
    if (
      (session.parent && !session.linkRecorded) ||
      [...sessions.values()].some(
        (child) => child.parent?.key === session.key && !child.linkRecorded,
      )
    )
      connect().postMessage({ op: 'claim', session: session.id, threadId: session.threadId });
  }
});

// Native PDF selections are exposed by Chrome's selection context menu.
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() =>
    chrome.contextMenus.create({
      id: 'quote-selection',
      title: chrome.i18n.getMessage('selectionMenu'),
      contexts: ['selection'],
    }),
  );
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'quote-selection' || !info.selectionText || !tab?.id || tab.incognito)
    return;
  // Invoke synchronously while Chrome's context-menu user gesture is active.
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  void (async () => {
    await getSession(tab.id);
    for (const s of sessions.values()) {
      if (s.tabId !== tab.id) continue;
      const text = info.selectionText;
      const pdf = pdfSource(tab.url);
      const quoteUrl = pdf || info.frameUrl || info.pageUrl;
      const existing =
        s.selection?.text === text &&
        s.selection?.url === quoteUrl &&
        (pdf || s.selection?.frameId === (info.frameId || 0)) &&
        Date.now() - Date.parse(s.selection?.locator?.capturedAt) < 2000
          ? s.selection
          : null;
      s.selection = {
        ...existing,
        id: crypto.randomUUID(),
        text: text.slice(0, 20000),
        truncated: text.length > 20000,
        url: quoteUrl,
        title: tab.title || '',
        tabId: tab.id,
        frameId: info.frameId || 0,
        locator: existing?.locator || {
          kind: 'native-selection',
          pageUrl: info.pageUrl,
          frameUrl: info.frameUrl,
          positionAvailable: false,
        },
      };
      await persist();
      for (const p of s.ports) event(p, 'codex-selection', s.selection);
    }
  })();
});
