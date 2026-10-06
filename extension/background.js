import { startPdfRouting, pdfSource, isCurrentPdfSender } from './pdf-routing.js';
import { tool, instructions } from './session-config.js';
import { browserTool, context } from './browser-tools.js';
startPdfRouting();
const sessions = new Map(),
  requests = new Map(),
  chunks = new Map();
// Native Chrome owns sidebar visibility and toolbar toggling.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.warn);
const agentViews = new Map();
let native,
  sequence = 1000;
const loaded = chrome.storage.session
  .get(['conversations', 'agentViews'])
  .then(({ conversations = [], agentViews: views = [] }) => {
    for (const [key, value] of conversations)
      sessions.set(key, {
        ...value,
        ports: new Set(),
        turnPending: false,
        questions: [],
        pendingQuestions: [],
      });
    for (const [tabId, key] of views) agentViews.set(tabId, key);
  });
const persist = () =>
  chrome.storage.session.set({
    agentViews: [...agentViews],
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
  const key = agentViews.has(tabId) ? `sidebar:${tabId}` : tabId;
  let s = sessions.get(key);
  if (!s) {
    await chrome.tabs.get(tabId);
    // Another view may have created this session while Chrome resolved the tab.
    if (sessions.has(key)) return sessions.get(key);
    s = {
      tabId,
      id: crypto.randomUUID(),
      scope: 'window',
      key,
      draft: '',
      ports: new Set(),
    };
    sessions.set(key, s);
    await persist();
  }
  return s;
}
// Chrome's opener metadata covers ordinary links; Agent links use an explicit source.
async function trackChild(tabId, parent) {
  if (!parent || tabId === parent.tabId || agentViews.has(tabId)) return;
  const child = await getSession(tabId);
  if (child.parent) return;
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
              source: parent.source,
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
chrome.tabs.onCreated?.addListener(async (tab) => {
  if (tab.incognito || !Number.isInteger(tab.openerTabId)) return;
  await loaded;
  const parent = agentViews.has(tab.openerTabId)
    ? sessions.get(agentViews.get(tab.openerTabId))
    : await getSession(tab.openerTabId);
  await trackChild(tab.id, parent).catch(console.warn);
});
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
  native = chrome.runtime.connectNative('com.browser_agent_connector.codex');
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
        s,
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
      if (['turn/start', 'thread/queue/start'].includes(r.method) && m.error) s.turnPending = false;
      event(r.port, 'codex-message', { ...m, id: r.id });
    }
    return;
  }
  if (m.id !== undefined && m.method) {
    s.pendingQuestions ||= [];
    if (!s.pendingQuestions.includes(m.id)) s.pendingQuestions.push(m.id);
    s.questions = [...(s.questions || []).filter((q) => q.id !== m.id), m];
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
        s.ports.add(port);
        port.postMessage({
          type: 'attached',
          state: {
            threadId: s.threadId,
            draft: s.draft,
            scope: s.scope,
            settings: s.settings,
            conversationKey: s.key,
            windowId: (await chrome.tabs.get(viewTabId)).windowId,
            selection: s.selection || null,
            attachments: s.attachments || [],
            questions: s.questions || [],
          },
        });
        chrome.scripting
          .executeScript({
            target: { tabId: s.tabId, allFrames: true },
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
        const m = { ...arg };
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
          requests.set(id, { port, id: m.id, method: m.method });
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
        };
        await persist();
        for (const p of s.ports) if (p !== port) event(p, 'codex-settings', arg);
      }
      if (msg.name === 'codexScope') {
        s.scope = arg === 'browser' ? 'browser' : 'window';
        for (const p of s.ports) if (p !== port) event(p, 'codex-scope', s.scope);
        await persist();
      }
      if (msg.name === 'codexContext') event(port, 'codex-context', await context(s));
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
        for (const p of s.ports) event(p, 'codex-title', arg);
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
async function openAgentTab(session, windowId) {
  const tab = await chrome.tabs.create({ url: 'about:blank', active: false, windowId });
  agentViews.set(tab.id, session.key);
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
      const owner = await chrome.tabs.get(source.tabId);
      const tab = await chrome.tabs.create({
        url: url.href,
        windowId: owner.windowId,
        active: msg.active !== false,
      });
      await trackChild(tab.id, source);
      return { tabId: tab.id };
    }
    if (msg.type === 'openAgent') {
      await loaded;
      const s = sessions.get(msg.conversationKey);
      if (!s) throw Error('Conversation not found');
      return openAgentTab(s, msg.windowId);
    }
    if (msg.type === 'newConversation') {
      await loaded;
      const source = sessions.get(msg.conversationKey);
      if (!source) throw Error('Conversation not found');
      const id = crypto.randomUUID();
      const session = {
        id,
        key: id,
        tabId: source.tabId,
        scope: source.scope,
        viewOnly: true,
        settings: {
          model: String(msg.settings?.model || '').slice(0, 200),
          effort: String(msg.settings?.effort || '').slice(0, 30),
          mode: msg.settings?.mode === 'plan' ? 'plan' : 'default',
        },
        draft: '',
        ports: new Set(),
      };
      sessions.set(id, session);
      return openAgentTab(session, msg.windowId);
    }
  })().then(reply, (e) => reply({ error: e.message }));
  return true;
});
chrome.tabs.onRemoved.addListener(async (id) => {
  await loaded;
  agentViews.delete(id);
  for (const [key, s] of sessions) {
    const remaining = [...agentViews].find(([, owner]) => owner === key);
    if (s.tabId !== id && !(s.viewOnly && !remaining)) continue;
    if (remaining) s.tabId = remaining[0];
    else {
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
});
chrome.webNavigation.onCommitted.addListener(async (detail) => {
  await loaded;
  for (const s of sessions.values()) {
    if (s.tabId !== detail.tabId) continue;
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
