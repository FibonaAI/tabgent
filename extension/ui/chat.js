import {
  bridge,
  openAgentTab,
  newConversation,
  startBridge,
  bindThread,
  saveViewDraft,
  readViewDraft,
  scopePreference,
  saveScopePreference,
} from '../bridge.js';
import { localize } from '../i18n.js';
localize();
try {
  await startBridge();
} catch (error) {
  document.getElementById('connection').textContent = loadTimeData.getString('connectionFailed');
  document.getElementById('connection').dataset.state = 'failed';
  const reconnect = document.getElementById('reconnect');
  reconnect.hidden = false;
  reconnect.onclick = () => location.reload();
  throw error;
}
import { loadTimeData } from '../i18n.js';
const i18n = (key, ...args) =>
  args.length ? loadTimeData.getStringF(key, ...args) : loadTimeData.getString(key);
import { addWebUiListener } from '../bridge.js';
const $ = (id) => document.getElementById(id);
let nextId = 1,
  threadId = bridge.threadId;
let turnId = null,
  busy = false,
  ready = false,
  context = {},
  models = [];
const pending = new Map(),
  items = new Map();
let optimisticUser = null,
  turnStatus = null,
  turnStartedAt = 0,
  activeReply = null;
let selectedPageText = null;
let attachments = [],
  attaching = 0;
const attachmentPreviews = new Map();
let setupMode = '',
  initialized = false,
  completingSetup = false;
let installChecking = false,
  loginStarting = false,
  loginAttempt = null;
const dirtyMessages = new Set();
let renderFrame = 0;
function saveDraft() {
  saveViewDraft($('prompt').value);
}
function resizePrompt() {
  const prompt = $('prompt');
  prompt.style.height = '0px';
  prompt.style.height = (prompt.value ? Math.min(prompt.scrollHeight, 220) : 56) + 'px';
  $('attach').disabled = !ready;
  $('send').disabled =
    !ready || attaching > 0 || (!$('prompt').value.trim() && !attachments.length);
}
function nearBottom() {
  return $('scroll').scrollHeight - $('scroll').scrollTop - $('scroll').clientHeight < 100;
}
async function copyText(button, text) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = i18n('copied');
    setTimeout(() => (button.textContent = i18n('copy')), 1400);
  } catch {
    showError(i18n('copyFailed'));
  }
}
function scheduleMessage(record) {
  dirtyMessages.add(record);
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0;
    const follow = nearBottom();
    for (const item of dirtyMessages) {
      item.el.hidden = !item.text.trim();
      markdown(item.body, item.text);
    }
    dirtyMessages.clear();
    if (follow) scrollEnd();
  });
}
import { tool, instructions } from '../session-config.js';
function showError(text) {
  if (!text) return;
  const last = $('messages').lastElementChild;
  if (last?.classList.contains('error') && last.textContent === text) return;
  const follow = nearBottom();
  const message = node('div', text, $('messages'));
  message.className = 'message error';
  message.setAttribute('role', 'alert');
  if (follow) scrollEnd();
}
function rpc(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error(i18n('requestTimeout')));
    }, 90000);
    pending.set(id, { resolve, reject, timer });
    bridge.send('codexRpc', [{ id, method, params }]);
  });
}
function respond(id, result) {
  bridge.send('codexRpc', [{ id, result }]);
}
function updateTurnStatus(text) {
  if (!busy || !turnStatus) return;
  if (turnStatus.textContent !== text) turnStatus.textContent = text;
  if ($('messages').lastElementChild !== turnStatus) $('messages').append(turnStatus);
}
function setBusy(value, outcome = 'completed') {
  if (value && !busy) {
    activeReply = null;
    turnStartedAt = performance.now();
    turnStatus = node('div', i18n('working'), $('messages'));
    turnStatus.className = 'message turn-status';
    turnStatus.setAttribute('role', 'status');
    turnStatus.dataset.status = 'running';
  } else if (!value && busy && turnStatus) {
    const follow = nearBottom();
    turnStatus.replaceChildren();
    node(
      'span',
      i18n(
        'statusDuration',
        i18n(outcome),
        new Intl.NumberFormat(document.documentElement.lang).format(
          Math.max(1, Math.round((performance.now() - turnStartedAt) / 1000)),
        ),
      ),
      turnStatus,
    );
    turnStatus.dataset.status =
      outcome === 'failed' || outcome === 'disconnected' ? 'failed' : 'completed';
    if (activeReply?.text.trim() && activeReply.phase !== 'commentary') {
      activeReply.actions.hidden = false;
      turnStatus.append(activeReply.actions);
    }
    if (follow) requestAnimationFrame(scrollEnd);
  }
  busy = value;
  $('send').hidden = value;
  $('stop').hidden = !value;
  $('attach').disabled = !ready;
  $('send').disabled =
    !ready || attaching > 0 || (!$('prompt').value.trim() && !attachments.length);
  document.body.classList.toggle('busy', value);
  $('model').disabled = value;
  $('effort').disabled = value;
}
function scrollEnd() {
  const e = $('scroll');
  e.scrollTop = e.scrollHeight;
  $('jump').hidden = true;
}
function node(tag, text, parent) {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  parent?.append(e);
  return e;
}
// Build Markdown with DOM nodes only. Neither model output nor page text
// becomes HTML.
function inline(parent, text) {
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let p = 0;
  for (const m of text.matchAll(re)) {
    parent.append(document.createTextNode(text.slice(p, m.index)));
    const t = m[0];
    if (t[0] === '`') node('code', t.slice(1, -1), parent);
    else if (t.startsWith('**')) node('strong', t.slice(2, -2), parent);
    else {
      const cut = t.indexOf('](');
      const a = node('a', t.slice(1, cut), parent);
      a.href = t.slice(cut + 2, -1);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    p = m.index + t.length;
  }
  parent.append(document.createTextNode(text.slice(p)));
}
function markdown(target, text) {
  const fragment = document.createDocumentFragment();
  const lines = text.split('\n');
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      inline(node('p', null, fragment), paragraph.join('\n'));
      paragraph = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const language = line.slice(3).trim();
      const codeLines = [];
      while (++i < lines.length && !/^```/.test(lines[i])) codeLines.push(lines[i]);
      const block = node('div', null, fragment);
      block.className = 'code-block';
      const heading = node('div', null, block);
      heading.className = 'code-heading';
      node('span', language || i18n('code'), heading);
      const copy = node('button', i18n('copy'), heading);
      copy.onclick = () => copyText(copy, codeLines.join('\n'));
      node('code', codeLines.join('\n'), node('pre', null, block));
    } else if (/^#{1,6} /.test(line)) {
      flush();
      inline(node('h3', null, fragment), line.replace(/^#+ /, ''));
    } else if (/^\s*(?:[-*+] |\d+[.)] )/.test(line)) {
      flush();
      const ordered = /^\s*\d/.test(line);
      const list = node(ordered ? 'ol' : 'ul', null, fragment);
      if (ordered) list.start = parseInt(line, 10);
      do {
        inline(node('li', null, list), lines[i].replace(/^\s*(?:[-*+] |\d+[.)] )/, ''));
        i++;
      } while (i < lines.length && (ordered ? /^\s*\d+[.)] / : /^\s*[-*+] /).test(lines[i]));
      i--;
    } else if (/^> ?/.test(line)) {
      flush();
      inline(node('blockquote', null, fragment), line.replace(/^> ?/, ''));
    } else if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
      flush();
      const wrap = node('div', null, fragment);
      wrap.className = 'table-wrap';
      const table = node('table', null, wrap);
      const cells = (value) =>
        value
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((v) => v.trim());
      const row = node('tr', null, node('thead', null, table));
      for (const cell of cells(line)) inline(node('th', null, row), cell);
      const body = node('tbody', null, table);
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        const row = node('tr', null, body);
        for (const cell of cells(lines[i++])) inline(node('td', null, row), cell);
      }
      i--;
    } else if (!line.trim()) flush();
    else paragraph.push(line);
  }
  flush();
  target.replaceChildren(fragment);
}
function toolDetails(record, item, completed) {
  const names = {
    context: i18n('actionContext'),
    tabs: i18n('actionTabs'),
    read: i18n('actionRead'),
    navigate: i18n('actionNavigate'),
    open: i18n('actionOpen'),
    click: i18n('actionClick'),
    type: i18n('actionType'),
    scroll: i18n('actionScroll'),
    back: i18n('actionBack'),
    screenshot: i18n('actionScreenshot'),
    frames: i18n('actionFrames'),
    forward: i18n('actionForward'),
    reload: i18n('actionReload'),
    hover: i18n('actionHover'),
    press: i18n('actionPress'),
    drag: i18n('actionDrag'),
    select: i18n('actionSelect'),
    check: i18n('actionCheck'),
    focus: i18n('actionFocus'),
    close: i18n('actionClose'),
  };
  const failed = item.success === false || item.status === 'failed' || !!item.error;
  const label =
    item.type === 'dynamicToolCall'
      ? item.tool === 'read_attachment'
        ? i18n('readAttachment')
        : item.tool || 'browser'
      : item.type === 'mcpToolCall'
        ? [item.server, item.tool].filter(Boolean).join('.')
        : item.type === 'commandExecution'
          ? i18n('command')
          : item.type === 'webSearch'
            ? i18n('webSearch')
            : item.type;
  const action = names[item.arguments?.action];
  record.label.textContent = action ? label + ' · ' + action : label;
  record.preview.textContent = item.arguments?.url || item.action?.query || item.query || '';
  record.state.textContent = failed
    ? i18n('failed')
    : completed
      ? i18n('completed')
      : i18n('running');
  if (completed && item.durationMs != null)
    record.state.textContent = i18n(
      'statusDuration',
      record.state.textContent,
      new Intl.NumberFormat(document.documentElement.lang, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(item.durationMs / 1000),
    );
  record.el.dataset.status = failed ? 'failed' : completed ? 'completed' : 'running';
  record.detail.replaceChildren();
  const pretty = (value) => {
    if (typeof value !== 'string') return JSON.stringify(value, null, 2);
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  };
  const section = (heading, value) => {
    if (value == null || value === '') return;
    node('h4', heading, record.detail);
    node('pre', pretty(value), record.detail);
  };
  section(i18n('input'), item.arguments ?? item.command ?? item.action ?? item.query);
  const outputs = item.contentItems || item.result?.content || [];
  if (outputs.length) node('h4', i18n('result'), record.detail);
  for (const output of outputs) {
    if (output.text != null) node('pre', pretty(output.text), record.detail);
    const imageUrl =
      output.imageUrl ||
      (output.type === 'image' && output.data
        ? 'data:' + output.mimeType + ';base64,' + output.data
        : '');
    if (/^data:image\/(png|jpeg|webp|gif);base64,/.test(imageUrl)) {
      const image = node('img', null, record.detail);
      image.alt = i18n('screenshotAlt');
      image.src = imageUrl;
      image.loading = 'lazy';
    }
  }
  if (!outputs.length) section(i18n('result'), item.aggregatedOutput ?? item.result);
  section(i18n('error'), item.error?.message || item.error);
  if (failed && !item.error && !outputs.length) section(i18n('result'), i18n('toolFailed'));
  if (!completed && !outputs.length) section(i18n('status'), i18n('waitingTool'));
}
function renderItem(item, completed = true) {
  if (!item?.id) return;
  let record = items.get(item.id);
  if (!record && item.type === 'userMessage' && optimisticUser) {
    record = optimisticUser;
    optimisticUser = null;
    items.set(item.id, record);
  }
  if (!record) {
    const follow = nearBottom();
    const activity = !['userMessage', 'agentMessage', 'plan'].includes(item.type);
    const el = node(activity ? 'details' : 'article', null, $('messages'));
    record = { el, text: '', type: item.type };
    items.set(item.id, record);
    if (activity) {
      el.className = 'message activity';
      record.summary = node('summary', '', el);
      record.label = node('span', '', record.summary);
      record.label.className = 'activity-label';
      record.preview = node('span', '', record.summary);
      record.preview.className = 'activity-preview';
      record.state = node('span', '', record.summary);
      record.state.className = 'activity-status';
      record.detail = node('div', '', el);
      record.detail.className = 'activity-detail';
    } else if (item.type !== 'userMessage') {
      el.className = 'message agent';
      record.body = node('div', null, el);
      record.body.className = 'message-body';
      record.actions = node('div', null, el);
      record.actions.className = 'message-actions';
      const copy = node('button', i18n('copy'), record.actions);
      copy.setAttribute('aria-label', i18n('copyReply'));
      copy.onclick = () => copyText(copy, record.text);
    }
    document.body.classList.remove('empty');
    if (follow) requestAnimationFrame(scrollEnd);
  }
  if (busy) {
    const label =
      item.type === 'reasoning'
        ? i18n('thinking')
        : item.type === 'agentMessage'
          ? i18n('replying')
          : item.type === 'userMessage'
            ? i18n('working')
            : i18n('usingTool');
    updateTurnStatus(completed ? i18n('working') : label);
  }
  const { el } = record;
  if (item.type === 'userMessage') {
    el.className = 'message user';
    renderUserInput(el, item.content || []);
  } else if (item.type === 'agentMessage' || item.type === 'plan') {
    record.text = item.text || '';
    record.phase = item.phase ?? record.phase;
    record.actions.hidden = !completed || busy || record.phase === 'commentary';
    record.el.hidden = !record.text.trim();
    if (item.type === 'agentMessage' && busy) activeReply = record;
    scheduleMessage(record);
  } else if (item.type === 'reasoning') {
    record.label.textContent = completed ? i18n('reasoning') : i18n('thinkingLabel');
    record.state.textContent = completed ? '' : i18n('inProgress');
    record.el.dataset.status = completed ? 'completed' : 'running';
    record.text = (item.summary || []).join('\n');
    record.detail.replaceChildren();
    node('pre', record.text || i18n('analyzing'), record.detail);
  } else {
    toolDetails(record, item, completed);
  }
}
function title(name) {
  if (!name) return;
  $('title').value = name;
  document.title = name;
  bridge.send('title', [name]);
}
function efforts() {
  const model = models.find((m) => m.model === $('model').value);
  const select = $('effort');
  select.replaceChildren();
  for (const e of model?.supportedReasoningEfforts || [{ reasoningEffort: 'medium' }]) {
    const v = e.reasoningEffort;
    const o = node(
      'option',
      {
        none: i18n('effortNone'),
        minimal: i18n('effortMinimal'),
        low: i18n('effortLow'),
        medium: i18n('effortMedium'),
        high: i18n('effortHigh'),
        xhigh: i18n('effortXhigh'),
        max: i18n('effortMax'),
        ultra: i18n('effortUltra'),
      }[v] || v,
      select,
    );
    o.value = v;
  }
  const preferred =
    (bridge.settings?.model === $('model').value && bridge.settings.effort) ||
    localStorage.getItem('codex:effort:' + $('model').value) ||
    'medium';
  select.value = [...select.options].some((o) => o.value === preferred)
    ? preferred
    : model?.defaultReasoningEffort || 'medium';
}
function setupError(text = '') {
  $('setupError').textContent = text;
  $('setupError').hidden = !text;
}
function showSetup(mode) {
  setupMode = mode;
  ready = false;
  $('setup').hidden = false;
  $('setup').dataset.mode = mode;
  $('model').disabled = true;
  $('effort').disabled = true;
  $('setupTitle').textContent = i18n(mode === 'install' ? 'setupInstallTitle' : 'setupSignInTitle');
  $('setupHint').textContent = i18n(
    mode === 'install'
      ? 'setupInstallHint'
      : mode === 'waiting'
        ? 'setupWaiting'
        : 'setupSignInHint',
  );
  $('setupPrimary').textContent = i18n(
    mode === 'install'
      ? 'setupInstallAction'
      : mode === 'waiting'
        ? 'setupReopen'
        : 'setupSignInAction',
  );
  $('setupPrimary').disabled = loginStarting;
  $('setupCancel').hidden = !loginAttempt;
  $('setupCheck').hidden = mode === 'waiting';
  $('setupStatus').hidden = true;
  $('connection').textContent = i18n(mode === 'install' ? 'setupInstallTitle' : 'setupSignInTitle');
  $('connection').dataset.state = mode;
  $('reconnect').hidden = true;
  resizePrompt();
}
function setupStatus(key) {
  $('setupStatus').textContent = i18n(key);
  $('setupStatus').hidden = false;
}
async function startLogin() {
  if (loginStarting) return;
  setupError();
  if (loginAttempt) {
    bridge.send('codexOpenSetupUrl', [loginAttempt.authUrl]);
    return;
  }
  loginStarting = true;
  $('setupPrimary').disabled = true;
  setupStatus('setupOpening');
  try {
    const result = await rpc('account/login/start', { type: 'chatgpt' });
    const url = new URL(result.authUrl);
    if (url.protocol !== 'https:' || !['auth.openai.com', 'chatgpt.com'].includes(url.hostname))
      throw Error(i18n('setupLoginFailed'));
    loginAttempt = result;
    showSetup('waiting');
    bridge.send('codexOpenSetupUrl', [result.authUrl]);
  } catch {
    showSetup('signin');
    setupError(i18n('setupLoginFailed'));
  } finally {
    loginStarting = false;
    $('setupPrimary').disabled = false;
  }
}
function checkInstallation() {
  if (installChecking) return;
  installChecking = true;
  setupStatus('setupChecking');
  bridge.send('codexConnect');
}
let initializing = false;
async function initialize() {
  if (initialized || initializing) return;
  initializing = true;
  try {
    await rpc('initialize', {
      clientInfo: {
        name: 'browser-agent-connector_browser',
        title: 'Browser Agent Connector',
        version: '0.1.0',
      },
      capabilities: { experimentalApi: true },
    });
    bridge.send('codexRpc', [{ method: 'initialized' }]);
    initialized = true;
    installChecking = false;
    if (setupMode) setupStatus('setupInstalled');
    await completeSetup();
  } catch (e) {
    showError(e.message);
    $('connection').textContent = i18n('connectionFailed');
    $('connection').dataset.state = 'failed';
    $('reconnect').hidden = false;
  } finally {
    initializing = false;
  }
}
async function completeSetup() {
  if (!initialized || ready || completingSetup) return;
  completingSetup = true;
  try {
    const account = await rpc('account/read');
    if (!account.account && account.requiresOpenaiAuth !== false) {
      showSetup(loginAttempt ? 'waiting' : 'signin');
      return;
    }
    if (setupMode) setupStatus('setupConnecting');
    const catalog = await rpc('model/list', {});
    models = catalog.data.filter((m) => !m.hidden);
    $('model').replaceChildren();
    for (const m of models) {
      const o = node('option', m.displayName, $('model'));
      o.value = m.model;
    }
    const preferredModel = bridge.settings?.model || localStorage.getItem('codex:model');
    const defaultModel =
      models.find((m) => m.model === preferredModel) ||
      models.find((m) => m.isDefault) ||
      models[0];
    if (defaultModel) $('model').value = defaultModel.model;
    efforts();
    let response;
    if (threadId) {
      try {
        response = await rpc('thread/resume', { threadId, excludeTurns: false });
      } catch (e) {
        // App-server persists a new thread only after its first turn.
        if (!e.message.includes('no rollout found for thread id')) throw e;
      }
    }
    if (!response) {
      response = await rpc('thread/start', {
        model: $('model').value || undefined,
        developerInstructions: instructions,
        dynamicTools: [tool],
        historyMode: 'legacy',
        ephemeral: false,
      });
      threadId = response.thread.id;
      bindThread(threadId);
    }
    const thread = response.thread;
    title(thread.name || thread.preview?.slice(0, 48) || i18n('newChat'));
    if (!bridge.settings?.model && thread.model && models.some((m) => m.model === thread.model)) {
      $('model').value = thread.model;
      efforts();
    }
    for (const turn of thread.turns || []) {
      for (const item of turn.items || []) renderItem(item);
      if (turn.status !== 'inProgress' && turn.items?.length) {
        const outcome =
          turn.status === 'failed'
            ? 'failed'
            : turn.status === 'interrupted'
              ? 'stopped'
              : 'completed';
        const footer = node('div', null, $('messages'));
        footer.className = 'message turn-status';
        footer.dataset.status = outcome;
        node('span', i18n(outcome), footer);
        const final = [...turn.items]
          .reverse()
          .find((item) => item.type === 'agentMessage' && item.phase !== 'commentary');
        if (final) footer.append(items.get(final.id).actions);
      }
    }
    const active = (thread.turns || []).find((t) => t.status === 'inProgress');
    if (active && thread.status?.type === 'active') {
      turnId = active.id;
      setBusy(true);
    }
    ready = true;
    renderAttachments();
    setupMode = '';
    loginAttempt = null;
    $('setup').hidden = true;
    $('model').disabled = busy;
    $('effort').disabled = busy;
    setupError();
    $('prompt').disabled = false;
    if (!$('prompt').value) $('prompt').value = readViewDraft() || '';
    resizePrompt();
    saveDraft();
    $('reconnect').hidden = true;
    $('connection').textContent = i18n('connected');
    $('connection').dataset.state = 'ready';
    bridge.send('codexContext');
    $('prompt').focus();
    scrollEnd();
  } catch (e) {
    showError(e.message);
    $('connection').textContent = i18n('connectionFailed');
    $('connection').dataset.state = 'failed';
    $('reconnect').hidden = false;
  } finally {
    completingSetup = false;
  }
}
async function send() {
  const text = $('prompt').value.trim();
  if ((!text && !attachments.length) || attaching || busy || !ready) return;
  const selection = selectedPageText;
  const submittedAttachments = [...attachments];
  const input = text ? [{ type: 'text', text, text_elements: [] }] : [];
  input.push(
    ...submittedAttachments.map((a) =>
      a.image
        ? { type: 'localImage', path: a.path }
        : { type: 'mention', name: a.name, path: a.path },
    ),
  );
  if (selection)
    input.push({
      type: 'text',
      text:
        i18n('selectionQuote') +
        '\n' +
        selection.title +
        '\n' +
        selection.url +
        '\n\n' +
        selection.text +
        (selection.truncated ? '\n' + i18n('selectionLimit') : ''),
      text_elements: [],
    });
  const el = node('article', '', $('messages'));
  el.className = 'message user';
  renderUserInput(el, input);
  const submitted = { el, text, type: 'userMessage' };
  optimisticUser = submitted;
  document.body.classList.remove('empty');
  $('prompt').value = '';
  saveDraft();
  resizePrompt();
  setBusy(true);
  requestAnimationFrame(scrollEnd);
  try {
    if ($('title').value === i18n('newChat')) {
      const name = (text || submittedAttachments[0]?.name || '').replace(/\s+/g, ' ').slice(0, 48);
      title(name);
      rpc('thread/name/set', { threadId, name }).catch(() => {});
    }
    const result = await rpc('turn/start', {
      threadId,
      model: $('model').value || undefined,
      effort: $('effort').value || undefined,
      input,
      additionalContext: selection
        ? { pageSelection: { kind: 'untrusted', value: JSON.stringify(selection) } }
        : undefined,
    });
    turnId = result.turn.id;
    attachments = attachments.filter((a) => !submittedAttachments.includes(a));
    renderAttachments();
    if (selection && selectedPageText?.id === selection.id) {
      selectedPageText = null;
      renderSelection();
      bridge.send('codexClearSelection', [selection.id]);
    }
  } catch (e) {
    if (optimisticUser === submitted) {
      submitted.el.remove();
      optimisticUser = null;
      if (!$('prompt').value) $('prompt').value = text;
      saveDraft();
      resizePrompt();
    }
    setBusy(false, 'failed');
    showError(e.message);
  }
}
function question(message) {
  const p = message.params;
  updateTurnStatus(
    message.method === 'item/tool/requestUserInput'
      ? i18n('waitingAnswer')
      : i18n('waitingApproval'),
  );
  const card = node('div', null, $('questions'));
  card.className = 'question';
  card.dataset.requestId = String(message.id);
  if (message.method === 'item/tool/requestUserInput') {
    const fields = [];
    for (const q of p.questions) {
      node('p', q.question, card);
      const input = node('input', null, card);
      input.placeholder = i18n('answerPlaceholder');
      for (const o of q.options || []) {
        const b = node('button', o.label, card);
        b.onclick = () => {
          input.value = o.label;
          for (const option of card.querySelectorAll('button')) option.classList.remove('selected');
          b.classList.add('selected');
        };
      }
      fields.push([q.id, input]);
    }
    const submit = node('button', i18n('submitAnswer'), card);
    submit.onclick = () => {
      respond(message.id, {
        answers: Object.fromEntries(fields.map(([id, e]) => [id, { answers: [e.value] }])),
      });
      card.remove();
      updateTurnStatus(i18n('working'));
    };
  } else {
    node('p', i18n('permissionRequest'), card);
    const deny = node('button', i18n('decline'), card);
    deny.onclick = () => {
      respond(
        message.id,
        message.method === 'item/permissions/requestApproval'
          ? { permissions: {}, scope: 'turn' }
          : { decision: 'decline' },
      );
      card.remove();
      updateTurnStatus(i18n('working'));
    };
  }
}
addWebUiListener('codex-message', (message) => {
  const p = message.params || {};
  if (p.messageKey && loadTimeData.valueExists(p.messageKey)) p.message = i18n(p.messageKey);
  if (message.id !== undefined && !message.method) {
    const task = pending.get(message.id);
    if (task) {
      clearTimeout(task.timer);
      pending.delete(message.id);
      if (message.error) task.reject(Error(message.error.message));
      else task.resolve(message.result);
    }
    return;
  }
  if (message.id !== undefined && message.method) {
    if (
      message.method === 'item/tool/requestUserInput' ||
      message.method.endsWith('/requestApproval')
    )
      question(message);
    else
      bridge.send('codexRpc', [
        {
          id: message.id,
          error: { code: -32601, message: 'Unsupported request in browser client' },
        },
      ]);
    return;
  }
  switch (message.method) {
    case 'bridge/helperMissing':
      installChecking = false;
      initialized = false;
      showSetup('install');
      $('setup').dataset.helper = 'missing';
      $('setupTitle').textContent = i18n('helperTitle');
      $('connection').textContent = i18n('helperTitle');
      $('setupHint').textContent = i18n('helperHint');
      $('setupPrimary').textContent = i18n('helperAction');
      break;
    case 'bridge/authChanged':
      if (!ready && !loginStarting) {
        saveDraft();
        location.reload();
      }
      break;
    case 'bridge/ready':
      delete $('setup').dataset.helper;
      initialize();
      break;
    case 'bridge/error':
    case 'bridge/closed':
      if (p.messageKey === 'bridgeInstall') {
        installChecking = false;
        initialized = false;
        showSetup('install');
        break;
      }
      initialized = false;
      installChecking = false;
      loginAttempt = null;
      loginStarting = false;
      setupMode = '';
      $('setup').hidden = true;
      ready = false;
      for (const task of pending.values()) {
        clearTimeout(task.timer);
        task.reject(Error(p.message || i18n('disconnected')));
      }
      pending.clear();
      setBusy(false, 'disconnected');
      $('connection').textContent = i18n('disconnected');
      $('connection').dataset.state = 'disconnected';
      $('reconnect').hidden = false;
      showError(p.message || i18n(p.messageKey || 'disconnectedDraft'));
      break;
    case 'account/login/completed':
      if (p.success) {
        loginAttempt = null;
        completeSetup();
      } else if (loginAttempt && p.loginId === loginAttempt.loginId) {
        loginAttempt = null;
        showSetup('signin');
        setupError(i18n('setupLoginFailed'));
      }
      break;
    case 'account/updated':
      if (p.authMode) completeSetup();
      else if (ready) {
        saveDraft();
        setBusy(false, 'stopped');
        showSetup('signin');
      }
      break;
    case 'item/started':
      renderItem(p.item, false);
      break;
    case 'item/completed':
      renderItem(p.item, true);
      break;
    case 'item/agentMessage/delta': {
      let item = items.get(p.itemId);
      if (!item) {
        renderItem({ id: p.itemId, type: 'agentMessage', text: '' });
        item = items.get(p.itemId);
      }
      updateTurnStatus(i18n('replying'));
      item.text += p.delta;
      item.actions.hidden = true;
      scheduleMessage(item);
      break;
    }
    case 'item/reasoning/summaryTextDelta': {
      let record = items.get(p.itemId);
      if (!record) {
        renderItem({ id: p.itemId, type: 'reasoning', summary: [] }, false);
        record = items.get(p.itemId);
      }
      updateTurnStatus(i18n('thinking'));
      record.text += p.delta;
      const pre = record.detail.querySelector('pre');
      if (pre) pre.textContent = record.text;
      break;
    }
    case 'item/commandExecution/outputDelta': {
      const record = items.get(p.itemId);
      if (record) {
        if (!record.output) {
          node('h4', i18n('output'), record.detail);
          record.output = node('pre', '', record.detail);
        }
        record.output.append(document.createTextNode(p.delta));
      }
      break;
    }
    case 'thread/name/updated':
      title(p.threadName);
      break;
    case 'turn/started':
      turnId = p.turn.id;
      setBusy(true);
      break;
    case 'turn/completed':
      turnId = null;
      setBusy(
        false,
        p.turn.error || p.turn.status === 'failed'
          ? 'failed'
          : p.turn.status === 'interrupted'
            ? 'stopped'
            : 'completed',
      );
      showError(p.turn.error?.message);
      break;
    case 'error':
      showError(p.error?.message || p.message || i18n('requestFailed'));
      if (!p.willRetry) setBusy(false, 'failed');
      else updateTurnStatus(i18n('retrying'));
      break;
  }
});
function renderSelection() {
  $('selection').hidden = !selectedPageText;
  $('selectionText').setAttribute('aria-expanded', 'false');
  $('selectionText').textContent = selectedPageText?.text || '';
  $('selectionText').title = selectedPageText?.truncated ? i18n('selectionLimit') : '';
}
addWebUiListener('codex-selection', (value) => {
  selectedPageText = value;
  renderSelection();
});
$('selectionText').onclick = () => {
  const quote = $('selectionText');
  quote.setAttribute('aria-expanded', String(quote.getAttribute('aria-expanded') !== 'true'));
};
$('selectionRemove').onclick = () => {
  if (selectedPageText) bridge.send('codexClearSelection', [selectedPageText.id]);
  selectedPageText = null;
  renderSelection();
};
addWebUiListener('codex-context', (value) => {
  context = value;
  $('context').hidden = !value.page;
  $('contextText').textContent = value.page ? value.page.title || value.page.url : '';
  $('contextFullTitle').textContent = value.page?.title || '';
  $('contextFullUrl').textContent = value.page?.url || '';
  if (!value.page) $('contextDetails').hidePopover();
});
$('setupPrimary').onclick = () => {
  if ($('setup').dataset.helper === 'missing') bridge.send('helperHelp');
  else if (setupMode === 'install')
    bridge.send('codexOpenSetupUrl', ['https://learn.chatgpt.com/docs/app']);
  else startLogin();
};
$('setupCheck').onclick = () => {
  setupError();
  if (setupMode === 'install') checkInstallation();
  else {
    saveDraft();
    location.reload();
  }
};
$('setupCancel').onclick = async () => {
  if (!loginAttempt) return;
  const { loginId } = loginAttempt;
  loginAttempt = null;
  showSetup('signin');
  try {
    await rpc('account/login/cancel', { loginId });
  } catch {
    setupError(i18n('setupLoginFailed'));
  }
};
function refreshSetup() {
  if (document.visibilityState !== 'visible') return;
  if (setupMode === 'install') checkInstallation();
  else if (setupMode === 'signin' || setupMode === 'waiting') {
    if (!loginStarting) bridge.send('codexCheckAuth');
    completeSetup();
  }
}
document.addEventListener('visibilitychange', refreshSetup);
window.addEventListener('focus', refreshSetup);
setInterval(refreshSetup, 2000);
$('send').onclick = send;
$('prompt').onkeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    send();
  }
};
$('prompt').oninput = () => {
  resizePrompt();
  saveDraft();
};
$('scroll').addEventListener(
  'scroll',
  () => {
    $('jump').hidden = nearBottom();
  },
  { passive: true },
);
$('jump').onclick = scrollEnd;
$('reconnect').onclick = () => {
  saveDraft();
  location.reload();
};
$('stop').onclick = async () => {
  if (turnId)
    try {
      await rpc('turn/interrupt', { threadId, turnId });
    } catch (e) {
      showError(e.message);
    }
};
$('model').onchange = () => {
  bridge.settings = { model: $('model').value };
  localStorage.setItem('codex:model', $('model').value);
  efforts();
  shareSettings();
};
$('effort').onchange = () => {
  bridge.settings = { model: $('model').value, effort: $('effort').value };
  localStorage.setItem('codex:effort:' + $('model').value, $('effort').value);
  shareSettings();
};
function shareSettings() {
  bridge.send('codexSettings', [{ model: $('model').value, effort: $('effort').value }]);
}
addWebUiListener('codex-settings', (value) => {
  bridge.settings = value;
  if (models.some((m) => m.model === value.model)) {
    $('model').value = value.model;
    efforts();
    $('effort').value = value.effort;
  }
});
$('scope').onchange = () => {
  saveScopePreference($('scope').value);
  bridge.send('codexScope', [$('scope').value]);
};
$('title').onchange = async () => {
  const name = $('title').value.trim();
  if (threadId && name) {
    try {
      await rpc('thread/name/set', { threadId, name });
      title(name);
    } catch (e) {
      showError(e.message);
    }
  }
};
$('scope').value = scopePreference() || 'window';
bridge.send('codexScope', [$('scope').value]);
$('prompt').value = readViewDraft() || '';
addWebUiListener('codex-draft', (text) => {
  $('prompt').value = text;
  resizePrompt();
});
resizePrompt();
bridge.send('codexConnect');
function refreshVisibleContext() {
  if (document.visibilityState !== 'visible') return;
  bridge.send('codexContext');
}
document.addEventListener('visibilitychange', () => {
  // A prewarmed empty conversation may predate a preference change.
  if (document.visibilityState === 'visible' && ready && !busy && items.size === 0) {
    const preferred = bridge.settings?.model || localStorage.getItem('codex:model');
    if (models.some((m) => m.model === preferred)) $('model').value = preferred;
    efforts();
  }
});
document.addEventListener('visibilitychange', () => {
  refreshVisibleContext();
  if (document.visibilityState === 'visible') resizePrompt();
});
let composerWidth = 0;
new ResizeObserver((entries) => {
  const width = entries[0].contentRect.width;
  if (width > 0 && width !== composerWidth) {
    composerWidth = width;
    resizePrompt();
  }
}).observe(document.querySelector('.composer'));
setInterval(refreshVisibleContext, 2000);

function renderUserInput(el, input) {
  el.replaceChildren();
  for (const c of input) {
    if (c.type === 'text') node('div', c.text, el);
    else if (
      c.type === 'image' &&
      /^data:image\/(png|jpeg|webp|gif);base64,/.test(c.url || c.imageUrl || '')
    ) {
      const img = node('img', '', el);
      enableImagePreview(img);
      img.src = c.url || c.imageUrl;
      img.alt = i18n('attachFiles');
    } else if (c.type === 'localImage') {
      const img = node('img', '', el);
      enableImagePreview(img);
      img.alt = c.path?.split('/').pop() || i18n('attachFiles');
      if (!attachmentPreviews.has(c.path))
        attachmentPreviews.set(
          c.path,
          rpc('bridge/attachment/preview', { path: c.path })
            .then((r) => r.url)
            .catch(() => null),
        );
      Promise.resolve(attachmentPreviews.get(c.path)).then((url) => {
        if (url) img.src = url;
      });
    } else if (c.type === 'mention')
      node('div', c.name || c.path?.split('/').pop() || i18n('attachFiles'), el);
  }
}
addWebUiListener('codex-attachments', (value) => {
  attachments = value;
  renderAttachments();
});
function renderAttachments() {
  bridge.send('codexAttachments', [
    attachments.map(({ name, path, image }) => ({ name, path, image })),
  ]);
  const list = $('attachments');
  list.replaceChildren();
  list.hidden = !attachments.length;
  for (const a of attachments) {
    const chip = node('div', '', list);
    chip.className = a.image ? 'attachment image-attachment' : 'attachment';
    if (a.image) {
      const img = node('img', '', chip);
      enableImagePreview(img);
      img.alt = a.name;
      if (a.data) img.src = a.data;
      else if (ready) {
        if (!attachmentPreviews.has(a.path))
          attachmentPreviews.set(
            a.path,
            rpc('bridge/attachment/preview', { path: a.path })
              .then((r) => r.url)
              .catch(() => null),
          );
        Promise.resolve(attachmentPreviews.get(a.path)).then((url) => {
          if (url) img.src = url;
        });
      }
    }
    if (!a.image) {
      const label = node('span', a.name, chip);
      label.title = a.name;
    }
    const remove = node('button', '×', chip);
    remove.type = 'button';
    remove.title = i18n('removeAttachment');
    remove.setAttribute('aria-label', i18n('removeAttachment') + ' ' + a.name);
    remove.onclick = () => {
      attachments = attachments.filter((x) => x !== a);
      renderAttachments();
    };
  }
  resizePrompt();
}
async function addAttachments(files) {
  attaching++;
  resizePrompt();
  try {
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024 || attachments.length >= 10) {
        showError(i18n('attachmentLimit'));
        continue;
      }
      try {
        const data = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        const image = /^image\/(png|jpeg|webp|gif)$/.test(file.type);
        // Stage every file through the native host; turns only carry small local paths.
        const result = await rpc('bridge/attachment/save', {
          name: file.name,
          data: data.slice(data.indexOf(',') + 1),
        });
        if (attachments.length >= 10) {
          showError(i18n('attachmentLimit'));
          continue;
        }
        if (image) attachmentPreviews.set(result.path, data);
        attachments.push({ name: file.name, path: result.path, image, data: image ? data : null });
        renderAttachments();
      } catch {
        showError(i18n('attachmentFailed'));
      }
    }
  } finally {
    attaching--;
    resizePrompt();
  }
}
$('attach').onclick = () => $('attachmentFiles').click();
$('attachmentFiles').onchange = (event) => {
  void addAttachments([...event.target.files]);
  event.target.value = '';
};
const composer = document.querySelector('.composer');
composer.addEventListener('paste', (event) => {
  const files = [...event.clipboardData.files];
  if (files.length) {
    event.preventDefault();
    void addAttachments(files);
  }
});
composer.addEventListener('dragover', (event) => {
  if ([...event.dataTransfer.types].includes('Files')) {
    event.preventDefault();
    composer.classList.add('dragging');
  }
});
composer.addEventListener('dragleave', () => composer.classList.remove('dragging'));
composer.addEventListener('drop', (event) => {
  if (event.dataTransfer.files.length) {
    event.preventDefault();
    composer.classList.remove('dragging');
    void addAttachments([...event.dataTransfer.files]);
  }
});

function enableImagePreview(img) {
  img.tabIndex = 0;
  img.setAttribute('role', 'button');
  img.setAttribute('aria-label', i18n('imagePreview'));
  img.title = i18n('imagePreview');
  const open = () => {
    if (!img.getAttribute('src')) return;
    const original = $('imagePreviewOriginal');
    original.src = img.src;
    original.alt = img.alt;
    original.setAttribute('aria-pressed', 'false');
    $('imagePreview').showModal();
    $('imagePreviewClose').focus();
  };
  img.addEventListener('click', open);
  img.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });
}
$('imagePreviewClose').onclick = () => $('imagePreview').close();
$('imagePreview').addEventListener('click', (event) => {
  if (event.target === $('imagePreview') || event.target === $('imagePreviewViewport'))
    $('imagePreview').close();
});
$('imagePreview').addEventListener('close', () => $('imagePreviewOriginal').removeAttribute('src'));
const zoomImage = () => {
  const img = $('imagePreviewOriginal');
  img.setAttribute('aria-pressed', String(img.getAttribute('aria-pressed') !== 'true'));
};
$('imagePreviewOriginal').onclick = zoomImage;
$('imagePreviewOriginal').onkeydown = (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    zoomImage();
  }
};

function positionContextDetails() {
  const rect = $('context').getBoundingClientRect(),
    popup = $('contextDetails');
  const width = Math.min(340, innerWidth - 24);
  popup.style.width = width + 'px';
  popup.style.left = Math.max(12, Math.min(rect.right - width, innerWidth - width - 12)) + 'px';
  popup.style.bottom = innerHeight - rect.top + 8 + 'px';
  popup.style.maxHeight = Math.max(60, rect.top - 20) + 'px';
}
$('contextDetails').addEventListener('beforetoggle', (event) => {
  if (event.newState === 'open') positionContextDetails();
});
window.addEventListener('resize', () => {
  if ($('contextDetails').matches(':popover-open')) positionContextDetails();
});
document.querySelector('.settings').addEventListener('scroll', () => {
  if ($('contextDetails').matches(':popover-open')) positionContextDetails();
});

$('openAgent').hidden = bridge.isTab;
$('openAgent').onclick = () => openAgentTab().catch((e) => showError(e.message));
$('newConversation').onclick = () =>
  newConversation({ model: $('model').value, effort: $('effort').value }).catch((e) =>
    showError(e.message),
  );
addWebUiListener('codex-title', (name) => {
  $('title').value = name;
  document.title = name;
});
addWebUiListener('codex-thread', (id) => {
  threadId = id;
});
addWebUiListener('codex-scope', (scope) => {
  $('scope').value = scope;
  saveScopePreference(scope);
});
addWebUiListener('codex-question-answered', (id) => {
  for (const card of $('questions').querySelectorAll('.question'))
    if (card.dataset.requestId === String(id)) card.remove();
});
