import { createComposerSettings } from './composer-settings.js';
import { createRelations, isLineageNote } from './relations.js';
import { createFollowups, selectionContextPrefix } from './followups.js';
import { createCommands } from './commands.js';
import { markdownFragment } from './markdown.js';
import {
  bridge,
  pageHistory,
  openAgentTab,
  openRelatedThread,
  openConversationLink,
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
  models = [],
  threadCwd = null;
const pending = new Map(),
  items = new Map();
const optimisticUsers = [];
let sending = false,
  stopping = false;
let turnStatus = null,
  turnStartedAt = 0,
  activeReply = null,
  worklog = null;
let selectedPageText = null;
let restoredInput = [];
let queueing = localStorage.getItem('codex:followupMode') !== 'steer';
let stopConfirmation = null;
function clearStopConfirmation() {
  clearTimeout(stopConfirmation);
  stopConfirmation = null;
  $('stopConfirmation').hidden = true;
}
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
  const hasDraft = !!prompt.value.trim() || !!attachments.length;
  $('send').hidden = busy && !hasDraft;
  $('send').disabled =
    !ready || sending || stopping || attaching > 0 || !hasDraft || (busy && !turnId);
  $('send').title = i18n(busy && queueing ? 'queueHint' : busy ? 'steerHint' : 'sendHint');
  $('send').setAttribute(
    'aria-label',
    i18n(busy && queueing ? 'queueLabel' : busy ? 'steerLabel' : 'sendLabel'),
  );
  $('stop').hidden = !busy || hasDraft;
  $('stop').disabled = stopping || !turnId;
  $('stop').title = i18n(stopping ? 'stopping' : 'stopHint');
  $('prompt').placeholder = i18n(busy ? 'followupPlaceholder' : 'promptPlaceholder');
  $('keyboardHint').textContent = busy ? '' : i18n('keyboardHint');
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
import { tool, instructions, pageContextPrefix } from '../session-config.js';
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
function activityLog() {
  if (!worklog) {
    worklog = node('details', null, $('messages'));
    worklog.className = 'worklog';
    worklog.open = true;
    const summary = node('summary', i18n('working'), worklog);
    const log = worklog;
    summary.onclick = () => {
      log.dataset.touched = 'true';
    };
    const body = node('div', null, worklog);
    body.className = 'worklog-items';
  }
  return worklog.querySelector('.worklog-items');
}
function finishWorklog(seconds) {
  if (!worklog) return;
  worklog.querySelector('summary').textContent = seconds
    ? i18n('workedFor', String(seconds))
    : i18n('activity');
  if (!worklog.dataset.touched) worklog.open = false;
}
function updateTurnStatus(text) {
  if (!busy || !turnStatus) return;
  if (stopping) text = i18n('stopping');
  if (turnStatus.textContent !== text) turnStatus.textContent = text;
  if ($('messages').lastElementChild !== turnStatus) $('messages').append(turnStatus);
}
function setBusy(value, outcome = 'completed') {
  if (value && !busy) {
    activeReply = null;
    worklog = null;
    turnStartedAt = performance.now();
    turnStatus = node('div', i18n('working'), $('messages'));
    turnStatus.className = 'message turn-status';
    turnStatus.setAttribute('role', 'status');
    turnStatus.dataset.status = 'running';
  } else if (!value && busy && turnStatus) {
    const follow = nearBottom();
    turnStatus.replaceChildren();
    finishWorklog(Math.max(1, Math.round((performance.now() - turnStartedAt) / 1000)));
    if (!worklog || outcome !== 'completed')
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
  clearStopConfirmation();
  if (!value) stopping = false;
  resizePrompt();
  followups.render();
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
// Preserve conversation ownership even though links intentionally use noopener.
for (const type of ['click', 'auxclick'])
  document.addEventListener(type, (event) => {
    if (event.button > 1 || event.defaultPrevented) return;
    const anchor = event.target.closest?.('a[href]');
    if (!anchor?.closest('#messages') || !/^https?:/.test(anchor.href)) return;
    event.preventDefault();
    openConversationLink(
      anchor.href,
      !(event.button === 1 || event.metaKey || event.ctrlKey) || event.shiftKey,
      event.button === 1 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        anchor.dataset.browserIntent !== 'current',
    ).catch((error) => showError(error.message));
  });
// CommonMark/GFM parsing with sanitized DOM; never execute model-supplied HTML.
function markdown(target, text) {
  const fragment = markdownFragment(text);
  for (const a of fragment.querySelectorAll('a')) {
    if (!/^https?:|^mailto:/.test(a.getAttribute('href') || '')) a.removeAttribute('href');
    const intent = a.title === 'browser:current' ? 'current' : 'new';
    a.dataset.browserIntent = intent;
    const hint = i18n(intent === 'current' ? 'linkOpenCurrent' : 'linkOpenNew');
    a.title =
      a.title && !['browser:current', 'browser:new'].includes(a.title)
        ? `${a.title} · ${hint}`
        : hint;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  for (const pre of [...fragment.querySelectorAll('pre')]) {
    const code = pre.querySelector('code');
    const block = document.createElement('div');
    block.className = 'code-block';
    pre.before(block);
    const heading = node('div', null, block);
    heading.className = 'code-heading';
    node('span', code?.className.replace('language-', '') || i18n('code'), heading);
    const copy = node('button', i18n('copy'), heading);
    copy.onclick = () => copyText(copy, code?.textContent || pre.textContent);
    block.append(pre);
  }
  for (const table of [...fragment.querySelectorAll('table')]) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.before(wrap);
    wrap.append(table);
  }
  target.replaceChildren(fragment);
}
const composerSettings = createComposerSettings({
  i18n,
  rpc,
  bridge,
  error: showError,
  save: shareSettings,
  thread: () => threadId,
  ready: () => ready,
});
let historyRevision = 0;
async function refreshHistory() {
  if ($('historyPanel').hidden) return;
  const revision = ++historyRevision;
  try {
    const result = await pageHistory();
    if (revision !== historyRevision) return;
    $('historyUrl').textContent = result.url
      ? new URL(result.url).hostname || i18n('historyThisPage')
      : i18n('historyThisPage');
    $('historyUrl').title = result.url;
    $('historyList').replaceChildren();
    let lastGroup;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    for (const entry of result.entries) {
      const group =
        entry.updatedAt >= today.getTime()
          ? 'historyToday'
          : entry.updatedAt >= yesterday.getTime()
            ? 'historyYesterday'
            : 'historyEarlier';
      if (group !== lastGroup) {
        const heading = document.createElement('h3');
        heading.className = 'history-date';
        heading.textContent = i18n(group);
        $('historyList').append(heading);
        lastGroup = group;
      }
      const button = document.createElement('button');
      button.className = 'history-entry';
      button.setAttribute('aria-current', String(entry.threadId === result.current));
      const name = document.createElement('span');
      name.textContent = entry.title || i18n('newChat');
      button.title = name.textContent + '\n' + new Date(entry.updatedAt).toLocaleString();
      const time = document.createElement('small');
      const age = Math.max(0, Date.now() - entry.updatedAt);
      const relative = new Intl.RelativeTimeFormat('en', { style: 'short', numeric: 'auto' });
      time.textContent =
        age < 60000
          ? i18n('historyJustNow')
          : age < 3600000
            ? relative.format(-Math.floor(age / 60000), 'minute')
            : age < 86400000
              ? relative.format(-Math.floor(age / 3600000), 'hour')
              : new Date(entry.updatedAt).toLocaleDateString('en', {
                  month: 'short',
                  day: 'numeric',
                  ...(new Date(entry.updatedAt).getFullYear() !== today.getFullYear()
                    ? { year: 'numeric' }
                    : {}),
                });
      button.append(name, time);
      button.onclick = async () => {
        if (entry.threadId === threadId) return;
        saveDraft();
        button.disabled = true;
        try {
          await pageHistory(entry.threadId);
          location.reload();
        } catch (e) {
          button.disabled = false;
          showError(e.message);
        }
      };
      $('historyList').append(button);
    }
    if (!result.entries.length) $('historyList').textContent = i18n('historyEmpty');
  } catch (e) {
    $('historyList').textContent = e.message;
  }
}
function toggleHistory(open) {
  $('historyPanel').hidden = !open;
  $('historyToggle').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('history-open', open);
  sessionStorage.setItem('historyOpen', String(open));
  if (open) void refreshHistory();
}
setInterval(() => {
  if (!document.hidden) void refreshHistory();
}, 60000);
addWebUiListener('codex-history-changed', refreshHistory);
$('historyToggle').onclick = () => toggleHistory($('historyPanel').hidden);
$('historyClose').onclick = () => toggleHistory(false);
if (sessionStorage.getItem('historyOpen') === 'true') toggleHistory(true);
const relations = createRelations({
  rpc,
  i18n,
  open: openRelatedThread,
  error: showError,
  ready: () => ready,
});
const commands = createCommands({
  rpc,
  error: showError,
  draftChanged: () => {
    saveDraft();
    resizePrompt();
  },
  state: () => ({
    ready,
    busy,
    threadId,
    cwd: threadCwd,
    title: $('title').value,
    model: $('model').value,
    effort: $('effort').value,
    scope: $('scope').selectedOptions[0]?.textContent,
  }),
  modeChanged: (mode) => {
    bridge.settings = { ...bridge.settings, mode };
    shareSettings();
  },
  newChat: () =>
    newConversation({ ...bridge.settings, model: $('model').value, effort: $('effort').value }),
  copyReply: () =>
    navigator.clipboard.writeText(
      [...items.values()].reverse().find((r) => r.type === 'agentMessage')?.text || '',
    ),
  exportChat: () => {
    const text = [...items.values()]
      .map((r) =>
        r.type === 'agentMessage'
          ? r.text
          : r.type === 'userMessage'
            ? '## User\n\n' + r.el.textContent
            : '',
      )
      .filter(Boolean)
      .join('\n\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    const a = node('a', null);
    a.href = url;
    a.download = ($('title').value || 'conversation') + '.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
});
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
    selectText: i18n('actionSelectText'),
    highlight: i18n('actionHighlight'),
    savePdf: i18n('actionSavePdf'),
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
            : {
                fileChange: i18n('fileChanges'),
                contextCompaction: i18n('compacting'),
                collabAgentToolCall: i18n('agents'),
                imageGeneration: i18n('imageGeneration'),
                sleep: i18n('waiting'),
                imageView: i18n('imagePreview'),
              }[item.type] || item.type;
  let argumentsValue = item.arguments;
  if (typeof argumentsValue === 'string') {
    try {
      argumentsValue = JSON.parse(argumentsValue);
    } catch {}
  }
  const action = names[argumentsValue?.action];
  record.label.textContent = action ? label + ' · ' + action : label;
  record.preview.textContent =
    argumentsValue?.url || item.action?.query || item.query || item.command || '';
  record.state.textContent = failed ? i18n('failed') : completed ? '' : i18n('running');
  if (completed && item.durationMs != null)
    record.summary.title = i18n(
      'statusDuration',
      record.state.textContent,
      new Intl.NumberFormat(document.documentElement.lang, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(item.durationMs / 1000),
    );
  record.el.dataset.status = failed ? 'failed' : completed ? 'completed' : 'running';
  const streamedOutput = record.output?.textContent;
  record.detail.replaceChildren();
  record.output = null;
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
      enableImagePreview(image);
    }
  }
  if (!outputs.length)
    section(i18n('result'), item.aggregatedOutput ?? item.result ?? streamedOutput);
  if (item.exitCode != null) section(i18n('exitCode'), item.exitCode);
  if (item.durationMs != null) section(i18n('duration'), (item.durationMs / 1000).toFixed(1) + 's');
  for (const change of item.changes || []) section(change.path, change.diff || change.kind);
  if (item.agentsStates) section(i18n('agents'), item.agentsStates);
  if (item.results) section(i18n('result'), item.results);
  if (
    !['dynamicToolCall', 'mcpToolCall', 'commandExecution', 'webSearch', 'fileChange'].includes(
      item.type,
    )
  )
    section(i18n('details'), item);
  if (record.progress?.length) section(i18n('status'), record.progress.join('\n'));
  section(i18n('error'), item.error?.message || item.error);
  if (failed && !item.error && !outputs.length) section(i18n('result'), i18n('toolFailed'));
  if (!completed && !outputs.length) section(i18n('status'), i18n('waitingTool'));
}
function renderItem(item, completed = true, timestamp = Date.now()) {
  if (!item?.id || isLineageNote(item)) return;
  let record = items.get(item.id);
  const optimisticIndex =
    item.type === 'userMessage'
      ? optimisticUsers.findIndex((entry) => entry.clientId === item.clientId)
      : -1;
  if (!record && optimisticIndex !== -1) {
    [record] = optimisticUsers.splice(optimisticIndex, 1);
    items.set(item.id, record);
  }
  if (!record) {
    const follow = nearBottom();
    const activity = !['userMessage', 'agentMessage', 'plan'].includes(item.type);
    const el = node(
      activity ? 'details' : 'article',
      null,
      activity || item.phase === 'commentary' ? activityLog() : $('messages'),
    );
    el.dataset.timestamp = String(timestamp);
    if (el.parentElement !== $('messages'))
      el.parentElement.dataset.timestamp ||= String(timestamp);
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
    record.text = item.text ?? record.text;
    record.phase = item.phase ?? record.phase;
    record.actions.hidden = !completed || busy || record.phase === 'commentary';
    record.el.hidden = !record.text.trim();
    if (item.type === 'agentMessage' && busy) activeReply = record;
    scheduleMessage(record);
  } else if (item.type === 'reasoning') {
    record.label.textContent = completed ? i18n('reasoning') : i18n('thinkingLabel');
    record.state.textContent = completed ? '' : i18n('inProgress');
    record.el.dataset.status = completed ? 'completed' : 'running';
    record.text =
      (item.summary || []).map((x) => (typeof x === 'string' ? x : x.text || '')).join('\n') ||
      record.text;
    record.el.hidden = completed && !record.text.trim();
    record.detail.replaceChildren();
    markdown(record.detail, record.text);
    const heading = /^\*\*(.+?)\*\*/.exec(record.text);
    if (heading) record.label.textContent = heading[1];
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
  composerSettings.refresh();
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
    threadCwd = thread.cwd;
    title(
      thread.name ||
        (!thread.preview?.startsWith('Browser conversation lineage (') &&
          thread.preview?.slice(0, 48)) ||
        i18n('newChat'),
    );
    if (!bridge.settings?.model && thread.model && models.some((m) => m.model === thread.model)) {
      $('model').value = thread.model;
      efforts();
    }
    for (const turn of thread.turns || []) {
      worklog = null;
      for (const item of turn.items || [])
        renderItem(item, true, turn.startedAt ? turn.startedAt * 1000 : Date.now());
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
        finishWorklog(
          turn.completedAt && turn.startedAt
            ? Math.max(1, turn.completedAt - turn.startedAt)
            : null,
        );
        if (!worklog || outcome !== 'completed') node('span', i18n(outcome), footer);
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
    } else {
      followups.pause(thread.turns?.at(-1)?.status === 'interrupted');
    }
    await composerSettings.applySaved();
    ready = true;
    composerSettings.refresh();
    void refreshHistory();
    void relations.refresh();
    commands.setMode(bridge.settings?.mode);
    void commands.initialize();
    void followups.refresh();
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
async function send(queue = busy && queueing) {
  if (sending || stopping) return;
  const text = $('prompt').value.trim();
  if (ready && text.startsWith('/')) {
    try {
      if (await commands.submit(text)) return;
    } catch (e) {
      showError(e.message);
      return;
    }
  }
  if ((!text && !attachments.length) || attaching || !ready) return;
  const steering = busy && !queue;
  const expectedTurnId = turnId;
  if (steering && !turnId) return;
  const selection = selectedPageText;
  const submittedAttachments = [...attachments];
  const input = text ? [{ type: 'text', text, text_elements: [] }] : [];
  const retained = [...restoredInput];
  input.push(...commands.input());
  for (const part of retained)
    if (!input.some((existing) => JSON.stringify(existing) === JSON.stringify(part)))
      input.push(part);
  input.push(
    ...submittedAttachments.map((a) =>
      a.image
        ? { type: 'localImage', path: a.path }
        : { type: 'mention', name: a.name, path: a.path },
    ),
  );
  if (selection)
    input.unshift({
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
  sending = true;
  const el = queue ? document.createElement('article') : node('article', '', $('messages'));
  el.className = 'message user';
  renderUserInput(el, input);
  const submitted = {
    el,
    text,
    input,
    selection,
    expectedTurnId: steering ? expectedTurnId : null,
    clientId: crypto.randomUUID(),
    type: 'userMessage',
  };
  if (!queue) node('span', i18n('sendingMessage'), el).className = 'delivery-status';
  if (!queue) optimisticUsers.push(submitted);
  document.body.classList.remove('empty');
  $('prompt').value = '';
  saveDraft();
  resizePrompt();
  if (!steering && !queue) setBusy(true);
  requestAnimationFrame(scrollEnd);
  try {
    if ($('title').value === i18n('newChat')) {
      const name = (text || submittedAttachments[0]?.name || '').replace(/\s+/g, ' ').slice(0, 48);
      title(name);
      rpc('thread/name/set', { threadId, name }).catch(() => {});
    }
    await (queue ? followups.add(input, selection) : deliverInput(submitted, steering));
    const delivery = submitted.el.querySelector('.delivery-status');
    if (delivery && !submitted.undelivered) delivery.textContent = i18n('pendingMessage');
    commands.sent();
    restoredInput = restoredInput.filter((part) => !retained.includes(part));
    attachments = attachments.filter((a) => !submittedAttachments.includes(a));
    renderAttachments();
    if (selection && selectedPageText?.id === selection.id) {
      selectedPageText = null;
      renderSelection();
      bridge.send('codexClearSelection', [selection.id]);
    }
  } catch (e) {
    const index = optimisticUsers.indexOf(submitted);
    if (queue || index !== -1) {
      submitted.el.remove();
      if (index !== -1) optimisticUsers.splice(index, 1);
      $('prompt').value = [text, $('prompt').value].filter(Boolean).join('\n\n');
      saveDraft();
      resizePrompt();
    }
    if (!steering && !queue) setBusy(false, 'failed');
    showError(e.message);
  } finally {
    sending = false;
    resizePrompt();
  }
}
function deliverInput(submitted, steering) {
  return rpc(steering ? 'turn/steer' : 'turn/start', {
    threadId,
    clientUserMessageId: submitted.clientId,
    input: submitted.input,
    ...(steering
      ? { expectedTurnId: submitted.expectedTurnId }
      : {
          model: $('model').value || undefined,
          effort: $('effort').value || undefined,
          collaborationMode: commands.collaborationMode(),
        }),
    additionalContext: submitted.selection
      ? {
          pageSelection: { kind: 'untrusted', value: JSON.stringify(submitted.selection) },
        }
      : undefined,
  });
}
// A steer can be accepted before the model consumes it. Keep the exact payload
// recoverable if the turn is interrupted before its userMessage acknowledgement.
function recoverSteer(submitted) {
  submitted.undelivered = true;
  const delivery = submitted.el.querySelector('.delivery-status');
  if (!delivery) return;
  delivery.replaceChildren(document.createTextNode(i18n('messageNotDelivered') + ' '));
  const retry = node('button', i18n('resendMessage'), delivery);
  retry.type = 'button';
  retry.onclick = async () => {
    if (!ready || sending || stopping || (busy && !turnId)) return;
    const steering = busy;
    submitted.undelivered = false;
    submitted.clientId = crypto.randomUUID();
    submitted.expectedTurnId = steering ? turnId : null;
    sending = true;
    delivery.textContent = i18n('sendingMessage');
    if (!steering) setBusy(true);
    resizePrompt();
    try {
      await deliverInput(submitted, steering);
      if (!submitted.undelivered) delivery.textContent = i18n('pendingMessage');
    } catch (error) {
      if (!steering) setBusy(false, 'failed');
      recoverSteer(submitted);
      showError(error.message);
    } finally {
      sending = false;
      resizePrompt();
    }
  };
}
const followups = createFollowups({
  rpc,
  i18n,
  thread: () => threadId,
  busy: () => busy,
  turn: () => turnId,
  queueing: () => queueing,
  setQueueing(value) {
    queueing = value;
    localStorage.setItem('codex:followupMode', value ? 'queue' : 'steer');
    resizePrompt();
  },
  async prepareEdit(entry) {
    const extras = [],
      files = [];
    let selection = null;
    const text = [];
    for (const part of entry.input) {
      if (part.type === 'text' && part.text.startsWith(pageContextPrefix)) continue;
      if (part.type === 'text' && part.text.startsWith(selectionContextPrefix)) {
        selection = JSON.parse(part.text.slice(selectionContextPrefix.length));
      } else if (part.type === 'localImage' || part.type === 'mention') {
        files.push({
          name: part.name || part.path.split('/').pop(),
          path: part.path,
          image: part.type === 'localImage',
        });
      } else if (part.type === 'image') {
        const data = part.url || part.imageUrl;
        const saved = await rpc('bridge/attachment/save', {
          name: 'image.png',
          data: data.split(',')[1],
        });
        attachmentPreviews.set(saved.path, data);
        files.push({ name: 'image.png', path: saved.path, image: true, data });
      } else if (part.type === 'text' && !part.text.startsWith(i18n('selectionQuote') + '\n'))
        text.push(part.text);
      else extras.push(part);
    }
    return () => {
      $('prompt').value = [...text, $('prompt').value].filter(Boolean).join('\n\n');
      attachments.push(...files);
      if (selection) selectedPageText = selection;
      restoredInput.push(...extras.filter((part) => part.type !== 'text' || !selection));
      renderSelection();
      renderAttachments();
      saveDraft();
      $('prompt').focus();
    };
  },
  showError,
});
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
        const b = node('button', null, card);
        node('strong', o.label, b);
        if (o.description) node('small', o.description, b);
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
      if (fields.some(([, input]) => !input.value.trim())) {
        showError(i18n('requestInputRequired'));
        return;
      }
      respond(message.id, {
        answers: Object.fromEntries(fields.map(([id, e]) => [id, { answers: [e.value] }])),
      });
      card.remove();
      updateTurnStatus(i18n('working'));
    };
  } else {
    node('p', i18n('permissionRequest'), card);
    if (p.reason) node('p', p.reason, card);
    const detail = p.command || p.permissions || p.changes || p.description;
    if (detail)
      node('pre', typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2), card);
    const decisions = p.availableDecisions || ['accept', 'decline'];
    for (const decision of decisions) {
      if (!['accept', 'acceptForSession'].includes(decision)) continue;
      const accept = node(
        'button',
        i18n(decision === 'accept' ? 'allowOnce' : 'allowSession'),
        card,
      );
      accept.onclick = () => {
        respond(
          message.id,
          message.method === 'item/permissions/requestApproval'
            ? { permissions: p.permissions || {}, scope: 'turn' }
            : { decision },
        );
        card.remove();
        updateTurnStatus(i18n('working'));
      };
    }

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
  commands.notification(message.method, p);
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
      record.summaries ||= [];
      const index = p.summaryIndex || 0;
      record.summaries[index] = (record.summaries[index] || '') + p.delta;
      record.text = record.summaries.join('\n\n');
      record.el.hidden = false;
      markdown(record.detail, record.text);
      const heading = /^\*\*(.+?)\*\*/.exec(record.text);
      if (heading) record.label.textContent = heading[1];
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
    case 'turn/plan/updated': {
      const id = 'plan-' + p.turnId;
      let record = items.get(id);
      if (!record) {
        renderItem({ id, type: 'planUpdate' }, false);
        record = items.get(id);
      }
      record.label.textContent = i18n('updatedPlan');
      record.state.textContent =
        (p.plan || []).filter((s) => s.status === 'completed').length + '/' + (p.plan || []).length;
      record.detail.replaceChildren();
      if (p.explanation) markdown(node('div', null, record.detail), p.explanation);
      const list = node('ul', null, record.detail);
      list.className = 'plan-steps';
      for (const step of p.plan || []) {
        const li = node('li', null, list);
        li.dataset.status = step.status;
        node(
          'span',
          step.status === 'completed' ? '✓' : step.status === 'inProgress' ? '◉' : '○',
          li,
        );
        node('span', step.step, li);
      }
      record.el.open = true;
      break;
    }
    case 'item/plan/delta': {
      if (!items.has(p.itemId)) renderItem({ id: p.itemId, type: 'plan', text: '' }, false);
      const record = items.get(p.itemId);
      record.text += p.delta;
      scheduleMessage(record);
      break;
    }
    case 'item/mcpToolCall/progress': {
      const record = items.get(p.itemId);
      if (record) {
        (record.progress ||= []).push(p.message);
        record.preview.textContent = p.message;
        node('p', p.message, record.detail);
      }
      break;
    }
    case 'item/fileChange/outputDelta': {
      const record = items.get(p.itemId);
      if (record) node('pre', p.delta, record.detail);
      break;
    }
    case 'thread/status/changed': {
      const flags = p.status?.activeFlags || [];
      if (flags.includes('waitingOnApproval')) updateTurnStatus(i18n('waitingApproval'));
      else if (flags.includes('waitingOnUserInput')) updateTurnStatus(i18n('waitingAnswer'));
      break;
    }
    case 'thread/queue/changed':
      void followups.refresh();
      break;
    case 'thread/compacted':
      renderItem({ id: 'compaction-' + Date.now(), type: 'contextCompaction' }, true);
      break;
    case 'model/rerouted':
    case 'warning':
    case 'guardianWarning':
    case 'configWarning':
    case 'deprecationNotice':
      showError(p.message || p.summary || p.reason);
      break;
    case 'serverRequest/resolved':
      for (const card of $('questions').querySelectorAll('.question'))
        if (card.dataset.requestId === String(p.requestId)) card.remove();
      break;
    case 'bridge/lineageChanged':
      void relations.refresh();
      break;
    case 'thread/name/updated':
      title(p.threadName);
      break;
    case 'turn/started':
      followups.pause(false);
      turnId = p.turn.id;
      setBusy(true);
      break;
    case 'turn/completed':
      if (turnId && p.turn.id !== turnId) break;
      turnId = null;
      setBusy(
        false,
        p.turn.error || p.turn.status === 'failed'
          ? 'failed'
          : p.turn.status === 'interrupted'
            ? 'stopped'
            : 'completed',
      );
      if (p.turn.status === 'interrupted' || p.turn.status === 'failed') {
        for (const submitted of optimisticUsers)
          if (submitted.expectedTurnId === p.turn.id) recoverSteer(submitted);
      }
      followups.pause(p.turn.status === 'interrupted');
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
  void refreshHistory();
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
window.addEventListener('storage', (event) => {
  if (event.key !== 'codex:followupMode') return;
  queueing = event.newValue !== 'steer';
  resizePrompt();
  followups.render();
});
$('send').onclick = () => send();
$('prompt').onkeydown = (e) => {
  if (e.isComposing || e.keyCode === 229) return;
  if (commands.keydown(e)) {
    e.preventDefault();
    return;
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    if (e.repeat) return;
    clearStopConfirmation();
    send(busy && (e.metaKey || e.ctrlKey ? !queueing : queueing));
  }
};
document.addEventListener('keydown', (event) => {
  if (
    event.key !== 'Escape' ||
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    !busy
  )
    return;
  if (document.querySelector('dialog[open], :popover-open') || $('questions').childElementCount)
    return;
  event.preventDefault();
  if (event.repeat) return;
  if (stopConfirmation) $('stop').click();
  else {
    $('stopConfirmation').hidden = false;
    stopConfirmation = setTimeout(clearStopConfirmation, 2000);
  }
});
$('prompt').oninput = () => {
  commands.update();
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
  if (stopping || !turnId) return;
  clearStopConfirmation();
  const interruptedTurn = turnId;
  stopping = true;
  resizePrompt();
  updateTurnStatus(i18n('stopping'));
  try {
    try {
      await commands.interruptGoal();
    } catch (error) {
      showError(error.message);
    }
    // The turn may finish while goal pausing is in flight. Never stop its successor.
    if (turnId === interruptedTurn)
      await rpc('turn/interrupt', { threadId, turnId: interruptedTurn });
  } catch (e) {
    stopping = false;
    resizePrompt();
    updateTurnStatus(i18n('working'));
    showError(e.message);
  }
};
$('model').onchange = () => {
  bridge.settings = { ...bridge.settings, model: $('model').value, effort: undefined };
  localStorage.setItem('codex:model', $('model').value);
  efforts();
  shareSettings();
};
$('effort').onchange = () => {
  bridge.settings = { ...bridge.settings, model: $('model').value, effort: $('effort').value };
  localStorage.setItem('codex:effort:' + $('model').value, $('effort').value);
  shareSettings();
};
function shareSettings() {
  composerSettings.refresh();
  bridge.send('codexSettings', [
    { ...bridge.settings, model: $('model').value, effort: $('effort').value },
  ]);
}
addWebUiListener('codex-settings', (value) => {
  bridge.settings = value;
  commands.setMode(value.mode);
  composerSettings.refresh();
  if (models.some((m) => m.model === value.model)) {
    $('model').value = value.model;
    efforts();
    $('effort').value = value.effort;
  }
});
$('scope').onchange = () => {
  composerSettings.refresh();
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
composerSettings.refresh();
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
  const quotes = input.filter(
    (c) => c.type === 'text' && c.text.startsWith(i18n('selectionQuote') + '\n'),
  );
  for (const c of quotes) {
    const [, sourceTitle, sourceUrl, ...lines] = c.text.split('\n');
    const quote = node('blockquote', null, el);
    quote.className = 'page-quote';
    const source = node('a', sourceTitle || sourceUrl, quote);
    if (/^https?:\/\//i.test(sourceUrl || '')) source.href = sourceUrl;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.title = sourceUrl || '';
    node('div', lines.join('\n').replace(/^\n/, ''), quote);
  }
  for (const c of input) {
    if (
      quotes.includes(c) ||
      (c.type === 'text' &&
        (c.text.startsWith(selectionContextPrefix) || c.text.startsWith(pageContextPrefix)))
    )
      continue;
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
    } else if (c.type === 'skill') {
      if (!input.some((x) => x.type === 'text' && x.text.split(/\s+/).includes('$' + c.name)))
        node('div', '$' + c.name, el);
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
  newConversation({ ...bridge.settings, model: $('model').value, effort: $('effort').value }).catch(
    (e) => showError(e.message),
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
  composerSettings.refresh();
  saveScopePreference(scope);
});
addWebUiListener('codex-question-answered', (id) => {
  for (const card of $('questions').querySelectorAll('.question'))
    if (card.dataset.requestId === String(id)) card.remove();
});
