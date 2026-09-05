// The bits of a UI toolkit this app actually needs: element building, sheets,
// forms and toasts. No framework, because there is nothing here a framework
// would make shorter.

/** h('div.card#id', props, children) */
export function h(spec, props, children) {
  const [head, ...classes] = String(spec).split('.');
  const [tag, id] = head.split('#');
  const el = document.createElement(tag || 'div');
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(' ');

  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }

  add(el, children);
  return el;
}

function add(el, child) {
  if (child === null || child === undefined || child === false) return;
  if (Array.isArray(child)) { for (const c of child) add(el, c); return; }
  el.append(child instanceof Node ? child : document.createTextNode(String(child)));
}

export const frag = (children) => { const f = document.createDocumentFragment(); add(f, children); return f; };

export function mount(el, children) {
  el.replaceChildren();
  add(el, children);
  return el;
}

export const icon = (glyph, cls = '') => h('span.ico' + (cls ? '.' + cls : ''), { text: glyph });

// ------------------------------------------------------------------ toasts

let toastHost = null;
export function toast(message, kind = 'ok', ms = 3200) {
  if (!toastHost) {
    toastHost = h('div.toasts');
    document.body.append(toastHost);
  }
  const t = h('div.toast.' + kind, { text: message });
  toastHost.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 260);
  }, ms);
  return t;
}

export function xpToast(amount, extra = '') {
  if (!amount) return;
  const sign = amount > 0 ? '+' : '−';
  toast(`${sign}${Math.abs(amount)} XP${extra ? ' · ' + extra : ''}`, amount > 0 ? 'xp' : 'undo');
}

// ------------------------------------------------------------------ sheets

let openSheet = null;

/** Close whatever is open. `silent` skips the dismiss callback, which is what
 *  a successful submit needs — otherwise resolving null would race the result. */
export function closeSheet(silent = false) {
  if (!openSheet) return;
  const { el, onDismiss } = openSheet;
  openSheet = null;
  el.classList.add('out');
  setTimeout(() => el.remove(), 200);
  document.body.style.overflow = '';
  if (!silent && onDismiss) onDismiss();
}

function shell(title, body, footer, onDismiss) {
  closeSheet();
  const card = h('div.sheet', {}, [
    h('div.sheethead', {}, [
      h('h3', { text: title }),
      h('button.x', { onclick: () => closeSheet(), 'aria-label': 'Close', text: '✕' }),
    ]),
    h('div.sheetbody', {}, body),
    footer ? h('div.sheetfoot', {}, footer) : null,
  ]);
  const el = h('div.overlay', {
    onclick: (e) => { if (e.target === el) closeSheet(); },
  }, card);
  document.body.append(el);
  document.body.style.overflow = 'hidden';
  openSheet = { el, onDismiss };
  requestAnimationFrame(() => el.classList.add('in'));
  const first = card.querySelector('input,textarea,select,button.primary');
  if (first) setTimeout(() => first.focus(), 60);
  return { el, card };
}

export function confirmSheet(title, message, confirmText = 'Delete') {
  return new Promise((resolve) => {
    const { card } = shell(title, [h('p.dim', { text: message })], [
      h('button.ghost', { text: 'Cancel', onclick: () => closeSheet() }),
      h('button.danger', {
        text: confirmText,
        onclick: () => { closeSheet(true); resolve(true); },
      }),
    ], () => resolve(false));
    card.classList.add('narrow');
  });
}

// ------------------------------------------------------------------- forms

function field(f, values, onInput) {
  const set = (v) => { values[f.name] = v; if (onInput) onInput(values); };
  const id = 'f_' + f.name;
  let input;

  switch (f.type) {
    case 'textarea':
      input = h('textarea', {
        id, rows: f.rows || 3, placeholder: f.placeholder || '',
        value: values[f.name] ?? '', oninput: (e) => set(e.target.value),
      });
      break;

    case 'select':
      input = h('select', { id, onchange: (e) => set(e.target.value) },
        f.options.map((o) => h('option', {
          value: o.value, text: o.label, selected: String(values[f.name]) === String(o.value),
        })));
      break;

    case 'chips': {
      const wrap = h('div.chips');
      const paint = () => {
        wrap.replaceChildren();
        for (const o of f.options) {
          const on = String(values[f.name]) === String(o.value);
          wrap.append(h('button.chip' + (on ? '.on' : ''), {
            type: 'button', text: o.label,
            style: on && o.color ? { borderColor: o.color, color: o.color } : {},
            onclick: () => { set(o.value); paint(); },
          }));
        }
      };
      paint();
      input = wrap;
      break;
    }

    case 'toggle':
      input = h('button.switch' + (values[f.name] ? '.on' : ''), {
        type: 'button', id,
        onclick: (e) => { set(!values[f.name]); e.currentTarget.classList.toggle('on', !!values[f.name]); },
      }, h('i'));
      break;

    case 'photo': {
      const wrap = h('div.photo');
      const preview = h('div.shot');
      const paint = () => {
        preview.replaceChildren();
        if (values[f.name]) {
          preview.append(
            h('img', { src: values[f.name], alt: 'The photo you attached' }),
            h('button.x', { type: 'button', title: 'Remove', text: '✕',
              onclick: () => { set(''); paint(); } }));
        }
      };
      const picker = h('input', {
        type: 'file', accept: 'image/*', capture: 'environment',
        onchange: async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          wrap.classList.add('busy');
          try {
            set(await f.shrink(file));
            paint();
          } catch (err) {
            toast(err.message, 'warn');
          } finally {
            wrap.classList.remove('busy');
          }
        },
      });
      wrap.append(preview, h('label.pickshot', {}, [
        h('span', { text: values[f.name] ? 'Choose a different photo' : 'Take or choose a photo' }),
        picker,
      ]));
      input = wrap;
      paint();
      break;
    }

    case 'color':
      input = h('input', {
        id, type: 'color', value: values[f.name] || '#E2C044',
        oninput: (e) => set(e.target.value),
      });
      break;

    case 'number':
      input = h('input', {
        id, type: 'number', step: f.step || 1, min: f.min ?? 0, max: f.max,
        placeholder: f.placeholder || '', value: values[f.name] ?? '',
        oninput: (e) => set(e.target.value === '' ? '' : Number(e.target.value)),
      });
      break;

    default:
      input = h('input', {
        id, type: f.type || 'text', placeholder: f.placeholder || '',
        value: values[f.name] ?? '', autocomplete: f.autocomplete || 'off',
        oninput: (e) => set(e.target.value),
      });
  }

  // A chip set is a row of buttons; squeezed into half a column it wraps into
  // a tower, so it always gets the full width.
  const wide = f.wide || f.type === 'chips' || f.type === 'textarea' || f.type === 'photo';
  return h('label.field' + (f.type === 'toggle' ? '.row' : '') + (wide ? '.wide' : ''), { for: id }, [
    h('span.flabel', { text: f.label }),
    input,
    f.hint ? h('span.fhint', { text: f.hint }) : null,
  ]);
}

/**
 * A modal form. Resolves with the values, or null if dismissed.
 * `fields` is a flat list; anything with `.group` starts a new section.
 */
export function formSheet({ title, fields, values = {}, submit = 'Save', extra = null,
                           onChange = null, wide = false }) {
  return new Promise((resolve) => {
    const vals = { ...values };
    const body = [];
    let group = null;

    for (const f of fields) {
      if (f.group) { body.push(h('div.fgroup', { text: f.group })); continue; }
      if (f.note) { body.push(h('p.fnote', { text: f.note })); continue; }
      body.push(field(f, vals, onChange));
    }
    if (extra) body.push(extra);

    const done = () => {
      for (const f of fields) {
        if (f.required && !String(vals[f.name] ?? '').trim()) {
          toast(`${f.label} is needed`, 'warn');
          return;
        }
      }
      closeSheet(true);
      resolve(vals);
    };

    const { el, card } = shell(title, h('form.form', {
      onsubmit: (e) => { e.preventDefault(); done(); },
    }, body), [
      h('button.ghost', { type: 'button', text: 'Cancel', onclick: () => closeSheet() }),
      h('button.primary', { type: 'button', text: submit, onclick: done }),
    ], () => resolve(null));

    if (wide) card.classList.add('wide');
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); done(); }
    });
  });
}

export function panelSheet(title, body, footer) {
  return new Promise((resolve) => {
    const { card } = shell(title, body, footer, () => resolve(null));
    card.classList.add('wide');
  });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && openSheet) { e.preventDefault(); closeSheet(); }
});

// ------------------------------------------------------------------ pieces

export function ring(pct, size = 44, stroke = 4) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.classList.add('ring');
  svg.innerHTML =
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--hair2)" stroke-width="${stroke}"/>` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--ac)" stroke-width="${stroke}"` +
    ` stroke-linecap="round" stroke-dasharray="${(c * Math.min(100, pct)) / 100} ${c}"` +
    ` transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
  return svg;
}

export function bar(pct, cls = '') {
  return h('div.bar' + (cls ? '.' + cls : ''), {},
    h('i', { style: { width: Math.max(0, Math.min(100, pct)) + '%' } }));
}

export function empty(title, note, action) {
  return h('div.empty', {}, [
    h('h4', { text: title }),
    note ? h('p', { text: note }) : null,
    action || null,
  ]);
}
