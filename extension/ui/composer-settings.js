export function createComposerSettings({ i18n, rpc, bridge, error, save, ready }) {
  const $ = (id) => document.getElementById(id);
  const modes = {
    ask: ['permissionAsk', 'permissionAskHint'],
    auto: ['permissionAuto', 'permissionAutoHint'],
    full: ['permissionFull', 'permissionFullHint'],
  };
  let changing = false;
  function refresh() {
    const model = $('model').selectedOptions[0]?.textContent || i18n('selectModel');
    const effort = $('effort').selectedOptions[0]?.textContent || '';
    $('modelLabel').textContent = model;
    $('selectedModel').textContent = model;
    $('effortLabel').textContent = effort;
    $('selectedEffort').textContent = effort;
    const options = [...$('effort').options];
    $('effortRange').max = Math.max(0, options.length - 1);
    $('effortRange').value = Math.max(0, $('effort').selectedIndex);
    $('effortRange').disabled = options.length < 2;
    $('effortRange').style.setProperty(
      '--progress',
      `${options.length > 1 ? (Math.max(0, $('effort').selectedIndex) / (options.length - 1)) * 100 : 0}%`,
    );
    $('effortRange').setAttribute('aria-valuetext', effort);
    $('effortTicks').replaceChildren(
      ...options.map(() => {
        const tick = document.createElement('span');
        tick.textContent = '·';
        return tick;
      }),
    );
    $('scopeButtonLabel').textContent = $('scope').selectedOptions[0]?.textContent || '';
    for (const button of $('scopeOptions').children)
      button.setAttribute('aria-checked', String(button.dataset.scope === $('scope').value));
    const mode = bridge.settings?.permissionMode || 'ask';
    $('permissionLabel').textContent = i18n(modes[mode][0]);
    $('permissionButton').classList.toggle('full-access', mode === 'full');
    $('permissionButton').disabled = !ready() || changing;
    $('modelButton').disabled = !ready();
    for (const button of $('permissionOptions').children)
      button.setAttribute('aria-checked', String(button.dataset.mode === mode));
  }
  $('modelMenuHeader').onclick = () => {
    $('effortControl').hidden = true;
    $('modelMenuHeader').hidden = true;
    $('modelOptions').hidden = false;
    $('modelOptions').replaceChildren();
    for (const option of $('model').options) {
      if (!option.value) continue;
      const button = document.createElement('button');
      button.textContent = option.textContent;
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', String(option.selected));
      button.onclick = () => {
        $('model').value = option.value;
        $('model').dispatchEvent(new Event('change'));
        $('modelMenu').hidePopover();
      };
      $('modelOptions').append(button);
    }
  };
  $('modelMenu').addEventListener('beforetoggle', (event) => {
    if (event.newState === 'open') {
      $('effortControl').hidden = false;
      $('modelMenuHeader').hidden = false;
      $('modelOptions').hidden = true;
      refresh();
    }
  });
  $('effortRange').oninput = () => {
    $('effort').selectedIndex = Number($('effortRange').value);
    $('effort').dispatchEvent(new Event('change'));
  };
  for (const [mode, keys] of Object.entries(modes)) {
    const button = document.createElement('button');
    button.dataset.mode = mode;
    button.setAttribute('role', 'menuitemradio');
    const label = document.createElement('span'),
      hint = document.createElement('small');
    label.textContent = i18n(keys[0]);
    hint.textContent = i18n(keys[1]);
    button.append(label, hint);
    button.onclick = async () => {
      if (changing) return;
      changing = true;
      refresh();
      try {
        await rpc('bridge/permissions/set', { mode });
        bridge.settings = { ...bridge.settings, permissionMode: mode };
        save();
        $('permissionMenu').hidePopover();
      } catch (e) {
        error(e.message);
      } finally {
        changing = false;
        refresh();
      }
    };
    $('permissionOptions').append(button);
  }
  for (const [scope, labelKey, hintKey] of [
    ['window', 'scopeWindow', 'scopeWindowExplanation'],
    ['browser', 'scopeBrowser', 'scopeBrowserExplanation'],
  ]) {
    const button = document.createElement('button');
    button.dataset.scope = scope;
    button.setAttribute('role', 'menuitemradio');
    const label = document.createElement('span'),
      hint = document.createElement('small');
    label.textContent = i18n(labelKey);
    hint.textContent = i18n(hintKey);
    button.append(label, hint);
    button.onclick = () => {
      $('scope').value = scope;
      $('scope').dispatchEvent(new Event('change'));
      refresh();
      $('scopeMenu').hidePopover();
    };
    $('scopeOptions').append(button);
  }
  $('scopeMenu').addEventListener('beforetoggle', (event) => {
    if (event.newState === 'open') refresh();
  });
  return {
    refresh,
    async applySaved() {
      await rpc('bridge/permissions/set', { mode: bridge.settings?.permissionMode || 'ask' });
    },
  };
}
