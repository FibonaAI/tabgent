const listeners = new Map();
let port,
  state = {},
  initialized,
  pending = [];
export const bridge = {
  threadId: null,
  send(name, args = []) {
    port.postMessage({ type: 'ui', name, args });
  },
};
export function addWebUiListener(name, fn) {
  listeners.set(name, fn);
  for (const event of pending.filter((e) => e.name === name)) fn(event.value);
  pending = pending.filter((e) => e.name !== name);
}
export async function startBridge() {
  const ownTab = await chrome.tabs.getCurrent();
  bridge.isTab = !!ownTab;
  const tabId =
    ownTab?.id || (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
  if (!tabId) throw Error('No owner tab');
  port = chrome.runtime.connect({ name: 'chat' });
  let rejectAttach;
  const ready = new Promise((resolve, reject) => {
    initialized = resolve;
    rejectAttach = reject;
  });
  const timeout = setTimeout(() => rejectAttach(Error('Agent connection timed out')), 15000);
  port.onMessage.addListener((message) => {
    if (message.type === 'attachError') {
      rejectAttach(Error(message.message));
      return;
    }
    if (message.type === 'attached') {
      state = message.state;
      bridge.threadId = state.threadId || null;
      bridge.settings = state.settings || {};
      const selection = { name: 'codex-selection', value: state.selection || null };
      const listener = listeners.get(selection.name);
      if (listener) listener(selection.value);
      else pending.push(selection);
      const attachments = { name: 'codex-attachments', value: state.attachments || [] };
      const attachmentListener = listeners.get(attachments.name);
      if (attachmentListener) attachmentListener(attachments.value);
      else pending.push(attachments);
      for (const value of state.questions || []) pending.push({ name: 'codex-message', value });
      initialized();
      return;
    }
    if (message.name === 'codex-thread') bridge.threadId = message.value;
    if (message.name === 'codex-draft') state.draft = message.value;
    const event = { name: message.name, value: message.value };
    const fn = listeners.get(event.name);
    if (fn) fn(event.value);
    else pending.push(event);
  });
  port.onDisconnect.addListener(() => {
    rejectAttach(Error('Agent disconnected'));
    const fn = listeners.get('codex-message');
    fn?.({ method: 'bridge/closed', params: { messageKey: 'disconnectedDraft' } });
  });
  port.postMessage({ type: 'attach', tabId });
  try {
    await ready;
  } finally {
    clearTimeout(timeout);
  }
  // The global panel persists across new tabs; each active tab still owns its thread.
  if (!ownTab) {
    const { id: windowId } = await chrome.windows.getCurrent();
    chrome.tabs.onActivated.addListener((info) => {
      if (info.windowId === windowId && info.tabId !== tabId) location.reload();
    });
    const [active] = await chrome.tabs.query({ active: true, windowId });
    if (active?.id !== tabId) location.reload();
  }
}
export function bindThread(threadId) {
  state.threadId = threadId;
  bridge.threadId = threadId;
  port.postMessage({ type: 'bind', threadId });
}
export function saveViewDraft(text) {
  state.draft = text;
  port.postMessage({ type: 'draft', text });
}
export function readViewDraft() {
  return state.draft || '';
}
export function scopePreference() {
  return state.scope || 'window';
}
export function saveScopePreference(scope) {
  state.scope = scope;
}

export async function openRelatedThread(threadId) {
  const result = await chrome.runtime.sendMessage({
    type: 'openRelatedThread',
    conversationKey: state.conversationKey,
    companionTabId: state.companionTabId,
    threadId,
  });
  if (result?.error) throw Error(result.error);
}

export async function openConversationLink(url, active) {
  const result = await chrome.runtime.sendMessage({
    type: 'openConversationLink',
    conversationKey: state.conversationKey,
    companionTabId: state.companionTabId,
    url,
    active,
  });
  if (result?.error) throw Error(result.error);
  return result;
}

export async function newConversation(settings) {
  const result = await chrome.runtime.sendMessage({
    type: 'newConversation',
    conversationKey: state.conversationKey,
    companionTabId: state.companionTabId,
    settings,
    windowId: state.windowId,
  });
  if (result.error) throw Error(result.error);
}

export async function openAgentTab() {
  const result = await chrome.runtime.sendMessage({
    type: 'openAgent',
    conversationKey: state.conversationKey,
    companionTabId: state.companionTabId,
    windowId: state.windowId,
  });
  if (result.error) throw Error(result.error);
}

export async function pageHistory(threadId) {
  const result = await chrome.runtime.sendMessage({
    type: threadId ? 'switchHistory' : 'urlHistory',
    conversationKey: state.conversationKey,
    companionTabId: state.companionTabId,
    threadId,
  });
  if (result?.error) throw Error(result.error);
  return result;
}
