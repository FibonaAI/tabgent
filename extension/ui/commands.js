import { t } from '../i18n.js';
// Command behavior follows Codex TUI; all skill/goal data comes from app-server.
export function createCommands({
  rpc,
  state,
  error,
  draftChanged,
  newChat,
  copyReply,
  exportChat,
  modeChanged,
}) {
  const prompt = document.getElementById('prompt');
  const popup = document.getElementById('commandMenu');
  const dialog = document.getElementById('commandDialog');
  const goalRow = document.getElementById('goal');
  const chips = document.getElementById('skillChips');
  let skills = [],
    skillsError = '',
    loading = false,
    goal = null,
    usage = null;
  let rows = [],
    selected = 0,
    category = '',
    selectedSkills = [],
    mode = 'default';
  const el = (tag, text, parent) => {
    const e = document.createElement(tag);
    if (text != null) e.textContent = text;
    parent?.append(e);
    return e;
  };
  const guarded = (fn) => async () => {
    try {
      await fn();
    } catch (e) {
      error(e.message);
    }
  };
  const button = (label, fn, parent) => {
    const b = el('button', label, parent);
    b.type = 'button';
    b.onclick = guarded(fn);
    return b;
  };
  function close() {
    popup.hidden = true;
    prompt.setAttribute('aria-expanded', 'false');
    prompt.removeAttribute('aria-activedescendant');
  }
  document.addEventListener('pointerdown', (event) => {
    if (event.target !== prompt && !popup.contains(event.target)) close();
  });
  function consume() {
    prompt.value = '';
    draftChanged();
    close();
  }
  function showDialog(title) {
    dialog.replaceChildren();
    const heading = el('div', null, dialog);
    heading.className = 'dialog-heading';
    el('h2', title, heading);
    button('×', () => dialog.close(), heading).ariaLabel = t('closePreview');
    if (!dialog.open) dialog.showModal();
    return el('div', null, dialog);
  }
  async function refreshSkills(forceReload = false) {
    loading = true;
    skillsError = '';
    try {
      const result = await rpc('skills/list', {
        cwds: state().cwd ? [state().cwd] : [],
        forceReload,
      });
      skills = [
        ...new Map(
          (result.data || []).flatMap((entry) => entry.skills || []).map((s) => [s.path, s]),
        ).values(),
      ];
      skillsError = (result.data || [])
        .flatMap((e) => e.errors || [])
        .map((e) => e.message)
        .join('\n');
    } catch (e) {
      skillsError = e.message;
    } finally {
      loading = false;
      if (!popup.hidden) update();
    }
  }
  async function refreshGoal() {
    try {
      goal = (await rpc('thread/goal/get', { threadId: state().threadId })).goal;
      renderGoal();
    } catch (e) {
      goalRow.hidden = true; /* Explicit /goal surfaces unavailable-server errors. */
    }
  }
  function skillLabel(s) {
    return s.interface?.displayName || s.name;
  }
  function renderChips() {
    selectedSkills = selectedSkills.filter((s) => prompt.value.includes('$' + s.name));
    chips.replaceChildren();
    chips.hidden = !selectedSkills.length;
    for (const s of selectedSkills)
      button(
        skillLabel(s) + ' ×',
        () => {
          prompt.value = prompt.value.replace('$' + s.name, '').trimStart();
          renderChips();
          draftChanged();
          prompt.focus();
        },
        chips,
      ).title = s.description;
  }
  function pickSkill(s) {
    if (!selectedSkills.some((x) => x.path === s.path)) selectedSkills.push(s);
    const start = prompt.value.lastIndexOf('$', prompt.selectionStart);
    prompt.value =
      category === 'skills' || prompt.value.startsWith('/')
        ? '$' + s.name + ' '
        : prompt.value.slice(0, Math.max(0, start)) +
          '$' +
          s.name +
          ' ' +
          prompt.value.slice(prompt.selectionEnd);
    close();
    category = '';
    renderChips();
    draftChanged();
    prompt.focus();
  }
  const catalog = [
    [
      'skills',
      () => {
        category = 'skills';
        prompt.value = '/skills ';
        update();
      },
    ],
    [
      'goal',
      async () => {
        consume();
        await goalDialog();
      },
    ],
    [
      'model',
      () => {
        category = 'models';
        prompt.value = '/model ';
        update();
      },
    ],
    [
      'plan',
      () => {
        mode = mode === 'plan' ? 'default' : 'plan';
        consume();
        document.getElementById('planMode').hidden = mode !== 'plan';
        modeChanged(mode);
      },
    ],
    [
      'new',
      () => {
        consume();
        return newChat();
      },
    ],
    [
      'rename',
      () => {
        consume();
        const body = showDialog(t('cmdRename'));
        const input = el('input', null, body);
        input.value = state().title;
        input.ariaLabel = t('titleLabel');
        button(
          t('save'),
          async () => {
            const name = input.value.trim();
            if (!name) return;
            await rpc('thread/name/set', { threadId: state().threadId, name });
            dialog.close();
          },
          body,
        );
      },
    ],
    [
      'compact',
      async () => {
        consume();
        await rpc('thread/compact/start', { threadId: state().threadId });
      },
    ],
    [
      'status',
      () => {
        consume();
        statusDialog();
      },
    ],
    [
      'permissions',
      () => {
        consume();
        const body = showDialog(t('cmdPermissions'));
        el('p', t('browserPermissions'), body);
        el('p', state().scope, body);
      },
    ],
    [
      'copy',
      () => {
        consume();
        return copyReply();
      },
    ],
    [
      'export',
      () => {
        consume();
        exportChat();
      },
    ],
  ];
  function update() {
    renderChips();
    if (!state().ready) {
      close();
      return;
    }
    const text = prompt.value.slice(0, prompt.selectionStart);
    const match = text.match(/(?:^|\s)\$([^\s]*)$/);
    if (!text.startsWith('/') && !match) {
      category = '';
      close();
      return;
    }
    let filter;
    if (match || /^\/skills\s/.test(text)) {
      category = 'skills';
      filter = match ? match[1] : text.slice(8).trim();
      rows = skills
        .filter(
          (s) =>
            s.enabled &&
            (s.name + ' ' + skillLabel(s) + ' ' + s.description)
              .toLowerCase()
              .includes(filter.toLowerCase()),
        )
        .map((s) => ({
          label: skillLabel(s),
          description: s.interface?.shortDescription || s.shortDescription || s.description,
          run: () => pickSkill(s),
        }));
      if (!match)
        rows.unshift({
          label: t('manageSkills'),
          description: t('manageSkillsHint'),
          run: manageSkills,
        });
    } else if (/^\/model\s/.test(text)) {
      category = 'models';
      filter = text.slice(7).trim();
      rows = [...document.getElementById('model').options]
        .filter((o) => o.text.toLowerCase().includes(filter.toLowerCase()))
        .map((o) => ({
          label: o.text,
          description: o.selected ? t('selected') : '',
          run: () => {
            const model = document.getElementById('model');
            model.value = o.value;
            model.dispatchEvent(new Event('change'));
            const body = showDialog(t('effortLabel'));
            for (const effort of document.getElementById('effort').options)
              button(
                effort.text,
                () => {
                  const select = document.getElementById('effort');
                  select.value = effort.value;
                  select.dispatchEvent(new Event('change'));
                  dialog.close();
                },
                body,
              );
            consume();
          },
        }));
    } else {
      category = '';
      filter = text.slice(1).trim().toLowerCase();
      if (/\s/.test(filter)) {
        close();
        return;
      }
      rows = catalog
        .filter(([name]) => name.includes(filter))
        .map(([name, run]) => ({
          label: '/' + name,
          description: t('cmd' + name[0].toUpperCase() + name.slice(1)),
          run,
          disabled: state().busy && ['new', 'compact', 'model'].includes(name),
        }));
      rows.push(
        ...skills
          .filter((s) => s.enabled && s.name.toLowerCase().includes(filter))
          .map((s) => ({
            label: '/' + s.name,
            description: s.interface?.shortDescription || s.shortDescription || s.description,
            run: () => pickSkill(s),
          })),
      );
    }
    selected = Math.min(selected, Math.max(0, rows.length - 1));
    popup.replaceChildren();
    el(
      'div',
      category === 'skills' ? t('skills') : category === 'models' ? t('modelLabel') : t('commands'),
      popup,
    ).className = 'menu-title';
    const list = el('div', null, popup);
    list.setAttribute('role', 'listbox');
    list.id = 'commandOptions';
    if (!rows.length) el('p', loading ? t('loading') : skillsError || t('noCommands'), list);
    rows.forEach((row, index) => {
      const b = button(
        '',
        async () => {
          if (!row.disabled) await row.run();
          if (!dialog.open) prompt.focus();
        },
        list,
      );
      b.id = 'command-' + index;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(index === selected));
      b.disabled = !!row.disabled;
      el('span', row.label, b);
      el('small', row.disabled ? t('unavailableRunning') : row.description, b);
    });
    if (skillsError) el('p', skillsError, popup).className = 'menu-error';
    el('div', t('commandKeys'), popup).className = 'menu-help';
    popup.hidden = false;
    prompt.setAttribute('aria-expanded', 'true');
    prompt.setAttribute('aria-activedescendant', 'command-' + selected);
  }
  function keydown(e) {
    if (e.isComposing) return false;
    if (popup.hidden) return false;
    if (e.key === 'Escape') {
      close();
      return true;
    }
    if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
      selected =
        (selected + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % Math.max(1, rows.length);
      update();
      document.getElementById('command-' + selected)?.scrollIntoView({ block: 'nearest' });
      return true;
    }
    if (['Enter', 'Tab'].includes(e.key)) {
      const row = rows[selected];
      if (row && !row.disabled) guarded(row.run)();
      return true;
    }
    return false;
  }
  async function manageSkills() {
    consume();
    const body = showDialog(t('manageSkills'));
    for (const s of skills) {
      const label = el('label', null, body);
      label.className = 'skill-toggle';
      const check = el('input', null, label);
      check.type = 'checkbox';
      check.checked = s.enabled;
      el('span', skillLabel(s), label);
      el('small', s.interface?.shortDescription || s.description, label);
      check.onchange = async () => {
        check.disabled = true;
        try {
          await rpc('skills/config/write', { path: s.path, enabled: check.checked });
          s.enabled = check.checked;
        } catch (e) {
          check.checked = s.enabled;
          error(e.message);
        } finally {
          check.disabled = false;
        }
      };
    }
    button(
      t('refresh'),
      async () => {
        await refreshSkills(true);
        await manageSkills();
      },
      body,
    );
  }
  function renderGoal() {
    goalRow.hidden = !goal;
    goalRow.replaceChildren();
    if (!goal) return;
    const summary = el('summary', null, goalRow);
    el('strong', t('goal'), summary);
    el('span', goal.objective, summary);
    el('small', t('goal' + goal.status[0].toUpperCase() + goal.status.slice(1)), summary);
    el('p', goal.objective, goalRow);
    el(
      'p',
      `${t('tokensUsed')}: ${goal.tokensUsed.toLocaleString()}${goal.tokenBudget ? ' / ' + goal.tokenBudget.toLocaleString() : ''} · ${t('timeUsed')}: ${Math.round(goal.timeUsedSeconds)}s`,
      goalRow,
    );
    const actions = el('div', null, goalRow);
    if (goal.status !== 'complete')
      button(
        goal.status === 'active' ? t('pause') : t('resume'),
        () => setGoal({ status: goal.status === 'active' ? 'paused' : 'active' }),
        actions,
      );
    button(t('edit'), goalDialog, actions);
    button(
      t('clear'),
      async () => {
        await rpc('thread/goal/clear', { threadId: state().threadId });
        goal = null;
        renderGoal();
      },
      actions,
    );
  }
  async function setGoal(params) {
    goal = (await rpc('thread/goal/set', { threadId: state().threadId, ...params })).goal;
    renderGoal();
  }
  async function goalDialog() {
    goal = (await rpc('thread/goal/get', { threadId: state().threadId })).goal;
    renderGoal();
    const body = showDialog(t('goal'));
    const label = el('label', t('objective'), body);
    const objective = el('textarea', null, label);
    objective.value = goal?.objective || '';
    objective.rows = 4;
    const budgetLabel = el('label', t('tokenBudgetOptional'), body);
    const budget = el('input', null, budgetLabel);
    budget.type = 'number';
    budget.min = '1';
    budget.step = '1';
    budget.value = goal?.tokenBudget || '';
    button(
      t('save'),
      async () => {
        if (!objective.value.trim() || !budget.reportValidity()) return;
        await setGoal({
          objective: objective.value.trim(),
          tokenBudget: budget.value ? Number(budget.value) : null,
          status: goal?.status === 'paused' ? 'paused' : 'active',
        });
        dialog.close();
      },
      body,
    );
  }
  function statusDialog() {
    const body = showDialog(t('cmdStatus'));
    const s = state();
    for (const [key, value] of [
      [t('modelLabel'), s.model],
      [t('effortLabel'), s.effort],
      [t('scopeLabel'), s.scope],
      [t('thread'), s.threadId],
      [t('tokensUsed'), usage?.total?.totalTokens],
      [t('contextWindow'), usage?.modelContextWindow],
    ]) {
      const row = el('p', null, body);
      el('strong', key + ': ', row);
      el('span', value == null ? t('unavailable') : String(value), row);
    }
  }
  return {
    setMode(value) {
      mode = value === 'plan' ? 'plan' : 'default';
      document.getElementById('planMode').hidden = mode !== 'plan';
    },
    update,
    keydown,
    close,
    async initialize() {
      await Promise.all([refreshSkills(), refreshGoal()]);
    },
    input() {
      const chosen = [...selectedSkills];
      for (const s of skills)
        if (
          s.enabled &&
          !chosen.some((x) => x.name === s.name) &&
          skills.filter((x) => x.enabled && x.name === s.name).length === 1
        )
          chosen.push(s);
      return chosen
        .filter((s) => prompt.value.split(/\s+/).includes('$' + s.name))
        .map((s) => ({ type: 'skill', name: s.name, path: s.path }));
    },
    async interruptGoal() {
      if (goal?.status === 'active') await setGoal({ status: 'paused' });
    },
    sent() {
      selectedSkills = [];
      renderChips();
    },
    collaborationMode() {
      const s = state();
      return {
        mode,
        settings: { model: s.model, reasoning_effort: s.effort, developer_instructions: null },
      };
    },
    async submit(text) {
      if (!text.startsWith('/')) return false;
      const [, name, rest = ''] = text.match(/^\/(\S+)\s*([\s\S]*)$/) || [];
      if (name === 'goal' && rest) {
        consume();
        if (['pause', 'resume'].includes(rest))
          await setGoal({ status: rest === 'pause' ? 'paused' : 'active' });
        else if (rest === 'clear') {
          await rpc('thread/goal/clear', { threadId: state().threadId });
          goal = null;
          renderGoal();
        } else if (rest === 'edit' || rest === 'status') await goalDialog();
        else await setGoal({ objective: rest, status: 'active' });
        return true;
      }
      if (state().busy && ['new', 'compact', 'model'].includes(name)) {
        error(t('unavailableRunning'));
        return true;
      }
      const command = catalog.find(([n]) => n === name);
      if (command) {
        await command[1]();
        return true;
      }
      const skill = skills.find((s) => s.enabled && s.name === name);
      if (skill) {
        pickSkill(skill);
        return true;
      }
      error(t('unknownCommand'));
      return true;
    },
    notification(method, p) {
      if (method === 'skills/changed') void refreshSkills(true);
      if (method === 'thread/goal/updated') {
        goal = p.goal;
        renderGoal();
      }
      if (method === 'thread/goal/cleared') {
        goal = null;
        renderGoal();
      }
      if (method === 'thread/tokenUsage/updated') {
        usage = p.tokenUsage;
        const badge = document.getElementById('contextUsage');
        const used = usage.last?.totalTokens,
          total = usage.modelContextWindow;
        badge.hidden = !total;
        if (total) {
          badge.textContent =
            Math.max(0, Math.round(100 * (1 - used / total))) + '% ' + t('contextLeft');
          badge.title = `${used.toLocaleString()} / ${total.toLocaleString()} ${t('tokens')}`;
        }
      }
    },
  };
}
