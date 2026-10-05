// CDP input uses CSS viewport pixels, independent of screenshot device scale.
export async function nativeInput(tabId, args, checkScope) {
  let attached = false;
  const target = { tabId };
  const command = async (method, params = {}) => {
    await checkScope();
    return chrome.debugger.sendCommand(target, method, params);
  };
  const mouse = (type, x, y, extra = {}) =>
    command('Input.dispatchMouseEvent', { type, x, y, ...extra });
  try {
    await chrome.debugger.attach(target, '1.3');
    attached = true;
    const metrics = await command('Page.getLayoutMetrics');
    const viewport = metrics.cssVisualViewport;
    const point = (x, y) => {
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        y < 0 ||
        x >= viewport.clientWidth ||
        y >= viewport.clientHeight
      )
        throw Error(
          'Coordinates must be CSS pixels within the current viewport; take a fresh screenshot',
        );
      return { x, y };
    };
    if (args.action === 'screenshot') {
      const shot = await command('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: false,
      });
      return {
        ...shot,
        viewport: { width: viewport.clientWidth, height: viewport.clientHeight },
        coordinateSpace: 'CSS viewport pixels; scale screenshot pixels to viewport dimensions',
      };
    }
    if (args.action === 'press') {
      await press(args.key, command);
      return { success: true };
    }
    if (args.action === 'type') {
      await command('Input.insertText', { text: args.text });
      return { success: true };
    }
    const { x, y } = point(args.x ?? viewport.clientWidth / 2, args.y ?? viewport.clientHeight / 2);
    if (args.action === 'scroll') {
      await mouse('mouseWheel', x, y, { deltaX: args.deltaX || 0, deltaY: args.pixels ?? 600 });
      return { success: true };
    }
    await mouse('mouseMoved', x, y);
    if (args.action === 'hover') return { success: true };
    const button = args.button || 'left',
      buttons = { left: 1, right: 2, middle: 4 }[button];
    if (!buttons) throw Error('Invalid mouse button');
    if (args.action === 'drag') {
      const end = point(args.endX, args.endY);
      await mouse('mousePressed', x, y, { button, buttons, clickCount: 1 });
      try {
        for (let i = 1; i <= 16; i++)
          await mouse('mouseMoved', x + ((end.x - x) * i) / 16, y + ((end.y - y) * i) / 16, {
            button,
            buttons,
          });
      } finally {
        await mouse('mouseReleased', end.x, end.y, { button, buttons: 0, clickCount: 1 }).catch(
          () => {},
        );
      }
    } else if (args.action === 'click') {
      const count = args.clickCount ?? 1;
      if (![1, 2, 3].includes(count)) throw Error('Invalid click count');
      for (let i = 1; i <= count; i++) {
        await mouse('mousePressed', x, y, { button, buttons, clickCount: i });
        await mouse('mouseReleased', x, y, { button, buttons: 0, clickCount: i });
      }
    } else throw Error('Unsupported native input action');
    return { success: true };
  } finally {
    if (attached) await chrome.debugger.detach(target).catch(() => {});
  }
}
async function press(chord, command) {
  if (typeof chord !== 'string' || !chord) throw Error('A key is required');
  const parts = chord.split('+'),
    name = parts.pop();
  let modifiers = 0;
  for (const part of parts) {
    const bit = { Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Cmd: 4, Shift: 8 }[part];
    if (!bit) throw Error('Unknown key modifier');
    modifiers |= bit;
  }
  const keys = {
    Enter: ['Enter', 13, '\r'],
    Tab: ['Tab', 9],
    Escape: ['Escape', 27],
    Backspace: ['Backspace', 8],
    Delete: ['Delete', 46],
    ArrowLeft: ['ArrowLeft', 37],
    ArrowUp: ['ArrowUp', 38],
    ArrowRight: ['ArrowRight', 39],
    ArrowDown: ['ArrowDown', 40],
    Home: ['Home', 36],
    End: ['End', 35],
    PageUp: ['PageUp', 33],
    PageDown: ['PageDown', 34],
    Space: ['Space', 32, ' '],
  };
  const spec =
    keys[name] ||
    (name.length === 1
      ? [`Key${name.toUpperCase()}`, name.toUpperCase().charCodeAt(0), name]
      : null);
  if (!spec) throw Error('Unsupported key');
  const key = name === 'Space' ? ' ' : name;
  const common = { key, code: spec[0], windowsVirtualKeyCode: spec[1], modifiers };
  const selectAll = key.toLowerCase() === 'a' && modifiers & 6;
  await command('Input.dispatchKeyEvent', {
    type: 'keyDown',
    ...common,
    ...(spec[2] && !(modifiers & 7) ? { text: spec[2], unmodifiedText: spec[2] } : {}),
    ...(selectAll ? { commands: ['selectAll'] } : {}),
  });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
}
