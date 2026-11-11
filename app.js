// Data lives in localStorage under one key. Version 1 held a single goal; version 2 adds
// several goals, templates and favourites. Older data is migrated when it is read.
const storageKey = 'keep-design-v1'; // Unchanged so existing goals and entries carry over.
const MAX_FAVOURITES = 3;
const uid = () => crypto.randomUUID();
const MAX_PICTURE_CHARS = 700000; // Pictures are shrunk before saving so they fit in device storage.
const defaultTemplates = () => []; // Templates are entirely the user's own.
function freshState() {
  const id = uid();
  return {version: 2, goals: [{id, name: 'A little Alpine escape', target: 1000}], activeGoal: id,
    templates: defaultTemplates(), entries: []};
}
const validName = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const validAmount = v => Number.isFinite(v) && v >= .01 && v <= 1000000;
const validEntry = e => e && (typeof e.id === 'string' || Number.isFinite(e.id)) && validName(e.name, 70) &&
  validAmount(e.amount) && typeof e.date === 'string' && Number.isFinite(Date.parse(e.date));
const unique = list => new Set(list.map(x => x.id)).size === list.length;
function validV1(s) {
  return s && validName(s.goal, 50) && Number.isFinite(s.target) && s.target >= 1 && s.target <= 10000000 &&
    Array.isArray(s.entries) && s.entries.every(validEntry) && unique(s.entries);
}
function validState(s) {
  if (!s || s.version !== 2 || !Array.isArray(s.goals) || !Array.isArray(s.templates) || !Array.isArray(s.entries)) return false;
  if (s.goals.length < 1 || s.goals.length > 50 || s.templates.length > 100) return false;
  if (!s.goals.every(g => g && typeof g.id === 'string' && validName(g.name, 50) &&
    Number.isFinite(g.target) && g.target >= 1 && g.target <= 10000000 &&
    (g.image == null || (typeof g.image === 'string' && g.image.startsWith('data:image/') && g.image.length <= MAX_PICTURE_CHARS)) &&
    (g.ended == null || (typeof g.ended === 'string' && Number.isFinite(Date.parse(g.ended))))) || !unique(s.goals)) return false;
  const goalIds = new Set(s.goals.map(g => g.id));
  // The selected goal must be one that is still running; ended goals only keep their history.
  if (!s.goals.some(g => g.id === s.activeGoal && !g.ended)) return false;
  if (!s.templates.every(t => t && typeof t.id === 'string' && validName(t.name, 50) &&
    (t.amount === null || validAmount(t.amount)) && typeof t.favorite === 'boolean') || !unique(s.templates)) return false;
  if (s.templates.filter(t => t.favorite).length > MAX_FAVOURITES) return false;
  return s.entries.every(e => validEntry(e) && goalIds.has(e.goalId)) && unique(s.entries);
}
function migrate(s) {
  if (!s || s.version !== undefined || !validV1(s)) return s;
  const id = uid();
  return {version: 2, goals: [{id, name: s.goal, target: s.target}], activeGoal: id,
    templates: defaultTemplates(), entries: s.entries.map(e => ({...e, goalId: id}))};
}

let state;
let storageBlocked = false;
try {
  const raw = localStorage.getItem(storageKey);
  state = raw === null ? freshState() : migrate(JSON.parse(raw));
  if (!validState(state)) throw new Error('Invalid saved data');
  localStorage.setItem('keep-storage-check', '1'); localStorage.removeItem('keep-storage-check');
} catch { state = freshState(); storageBlocked = true; }

let editingGoal = state.activeGoal; // A goal id, or 'new' while the form creates one.
let editingTemplate = null;         // A template id while the form edits one.
let newGoalImage = null;            // Picture chosen for a goal that is not created yet.
let histGoal = 'all', histPeriod = 'all', histBar = null; // "My skips" filters and the tapped timeline bar.

const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('de-CH', {minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2}).format(n);
const round2 = n => Math.round(n * 100) / 100;
function el(tag, props, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
function commit(next) {
  if (storageBlocked) { toast('Storage is unavailable. Your existing data has not been changed.'); return false; }
  try { localStorage.setItem(storageKey, JSON.stringify(next)); state = next; return true; }
  catch { $('#storage-error').hidden = false; toast('Could not save. Free some device storage and try again.'); return false; }
}
const activeGoal = () => state.goals.find(g => g.id === state.activeGoal);
const goalName = id => state.goals.find(g => g.id === id)?.name ?? '';
const sum = entries => round2(entries.reduce((total, e) => total + e.amount, 0));
const entriesFor = id => state.entries.filter(e => e.goalId === id);
const iconFor = name => /coffee|white|latte|espresso|cappuccino/i.test(name) ? '☕' : /lunch|dinner|takeaway|food|grocer/i.test(name) ? '♨' : /impulse|shop|buy/i.test(name) ? '♧' : '↗';
const favourites = () => state.templates.filter(t => t.favorite);
const openGoals = () => state.goals.filter(g => !g.ended);
const shortDate = iso => new Date(iso).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});

function entryRow(e) {
  const date = new Date(e.date).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
  return el('div', {className: 'entry'},
    el('span', {className: 'entry-icon', textContent: iconFor(e.name)}),
    el('div', {className: 'entry-text'}, el('strong', {textContent: e.name}), el('small', {textContent: date + ' · ' + goalName(e.goalId)})),
    el('span', {className: 'entry-amount', textContent: '+ CHF ' + money(e.amount)}));
}
const emptyNote = text => el('p', {className: 'empty-note', textContent: text});

function renderHome() {
  const goal = activeGoal(), mine = entriesFor(goal.id), total = sum(mine);
  $('#goal-switch').replaceChildren(
    ...openGoals().map(g => el('button', {type: 'button', className: 'chip' + (g.id === goal.id ? ' active' : ''), textContent: g.name, onclick: () => selectGoal(g.id)})),
    el('button', {type: 'button', className: 'chip ghost', textContent: '＋ New goal', onclick: () => { tab('goal'); startNewGoal(); }}));
  $('#goal-switch').querySelector('.active')?.setAttribute('aria-pressed', 'true');
  const parts = total.toFixed(2).split('.');
  $('#total').textContent = money(Number(parts[0])); $('#cents').textContent = '.' + parts[1];
  $('#goal-name').textContent = goal.name;
  $('#goal-target').textContent = 'of CHF ' + money(goal.target);
  const pct = Math.min(100, total / goal.target * 100);
  $('#percent').textContent = Math.round(pct) + '%';
  $('#progress-fill').style.width = pct + '%';
  $('.progress').setAttribute('aria-valuenow', pct.toFixed(1));
  $('.goal-bottom span').textContent = total >= goal.target ? 'You did it. Look at all those little wins.' : 'Little by little, you’re getting there.';
  const card = $('.goal-card');
  card.classList.toggle('has-picture', !!goal.image);
  if (goal.image) card.style.setProperty('--picture', 'url("' + goal.image + '")'); else card.style.removeProperty('--picture');
  const week = buckets('week').map(b => sum(mine.filter(e => inBucket(e, b)))), weekMax = Math.max(...week, 1);
  $('#week-total').textContent = 'CHF ' + money(round2(week.reduce((a, b) => a + b, 0)));
  const today = (new Date().getDay() + 6) % 7;
  $('#week-bars').replaceChildren(...week.map((value, i) => {
    const bar = el('i', {className: i === today ? 'today' : ''});
    bar.style.height = Math.max(8, value / weekMax * 100) + '%';
    return bar;
  }));
  const favs = favourites();
  $('#quick-grid').replaceChildren(...(favs.length ? favs.map(t => el('button', {type: 'button', onclick: () => openAdd(t.name, t.amount)},
    el('span', {className: 'quick-icon', textContent: iconFor(t.name)}),
    el('strong', {textContent: t.name}),
    el('small', {}, t.amount === null ? 'Set amount ' : 'CHF ' + money(t.amount) + ' ', el('b', {textContent: '＋'}))))
    : [el('button', {type: 'button', className: 'quick-empty', onclick: () => tab('templates'),
      textContent: state.templates.length ? 'Star up to three templates to keep them here ↗' : 'Create templates for the things you often skip ↗'})]));
}

// "My skips": filters, summary, timeline and breakdowns.
const PERIODS = [['all', 'All time'], ['year', 'This year'], ['month', 'This month'], ['week', 'This week']];
const inBucket = (e, b) => { const d = new Date(e.date); return d >= b.from && d < b.to; };
// The time slices drawn as timeline bars: days for a week or month, months otherwise.
function buckets(period) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), list = [];
  if (period === 'week') {
    const monday = new Date(y, m, now.getDate() - (now.getDay() + 6) % 7);
    for (let i = 0; i < 7; i++) {
      const from = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      list.push({from, to: new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1), label: 'MTWTFSS'[i],
        name: from.toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'short'})});
    }
  } else if (period === 'month') {
    const days = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const from = new Date(y, m, d);
      list.push({from, to: new Date(y, m, d + 1), label: (d - 1) % 7 === 0 ? String(d) : '',
        name: from.toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short'})});
    }
  } else {
    const first = period === 'year' ? new Date(y, 0, 1) : new Date(y, m - 11, 1);
    for (let i = 0; i < 12; i++) {
      const from = new Date(first.getFullYear(), first.getMonth() + i, 1);
      list.push({from, to: new Date(from.getFullYear(), from.getMonth() + 1, 1),
        label: from.toLocaleDateString('en-GB', {month: 'short'}).slice(0, 1),
        name: from.toLocaleDateString('en-GB', {month: 'long', year: 'numeric'})});
    }
  }
  return list;
}
function barRow(name, note, value, max) {
  const fill = el('i'); fill.style.width = Math.max(2, value / max * 100) + '%';
  return el('div', {className: 'bar-row'},
    el('div', {className: 'bar-row-top'}, el('span', {}, name, note ? el('small', {textContent: ' ' + note}) : ''), el('strong', {textContent: 'CHF ' + money(value)})),
    el('div', {className: 'bar-track'}, fill));
}
function filterChip(label, selected, onclick) {
  const chip = el('button', {type: 'button', className: 'chip' + (selected ? ' active' : ''), textContent: label, onclick});
  chip.setAttribute('aria-pressed', String(selected));
  return chip;
}
function renderHistory() {
  if (histGoal !== 'all' && !state.goals.some(g => g.id === histGoal)) histGoal = 'all';
  const setFilter = change => { change(); histBar = null; renderHistory(); };
  $('#filter-goal').replaceChildren(filterChip('All goals', histGoal === 'all', () => setFilter(() => histGoal = 'all')),
    ...state.goals.map(g => filterChip(g.name + (g.ended ? ' (ended)' : ''), histGoal === g.id, () => setFilter(() => histGoal = g.id))));
  $('#filter-goal').hidden = state.goals.length < 2;
  $('#filter-period').replaceChildren(...PERIODS.map(([id, label]) => filterChip(label, histPeriod === id, () => setFilter(() => histPeriod = id))));

  const slices = buckets(histPeriod);
  const forGoal = state.entries.filter(e => histGoal === 'all' || e.goalId === histGoal);
  // "All time" lists everything; the other periods list what falls inside the slices shown.
  const list = histPeriod === 'all' ? forGoal : forGoal.filter(e => new Date(e.date) >= slices[0].from);
  const total = sum(list);
  $('#history-label').textContent = 'TOTAL KEPT · ' + PERIODS.find(p => p[0] === histPeriod)[1].toUpperCase();
  $('#history-total').textContent = 'CHF ' + money(total);
  $('#history-count').textContent = histGoal === 'all' ? 'Across all your goals.' : 'For ' + goalName(histGoal) + '.';
  $('#stat-average').textContent = list.length ? 'CHF ' + money(round2(total / list.length)) : '–';
  $('#stat-biggest').textContent = list.length ? 'CHF ' + money(Math.max(...list.map(e => e.amount))) : '–';
  $('#stat-count').textContent = String(list.length);

  const values = slices.map(b => { const inside = forGoal.filter(e => inBucket(e, b)); return {total: sum(inside), count: inside.length}; });
  const max = Math.max(...values.map(v => v.total), 1);
  const describe = i => slices[i].name + ' · CHF ' + money(values[i].total) + ' · ' + values[i].count + (values[i].count === 1 ? ' skip' : ' skips');
  $('#timeline-unit').textContent = histPeriod === 'week' || histPeriod === 'month' ? 'PER DAY' : histPeriod === 'year' ? 'PER MONTH' : 'PER MONTH · LAST 12 MONTHS';
  $('#timeline').replaceChildren(...slices.map((b, i) => {
    const bar = el('i'); bar.style.height = values[i].total ? Math.max(3, values[i].total / max * 100) + '%' : '2px';
    const button = el('button', {type: 'button', title: describe(i), className: (values[i].total ? '' : 'zero') + (histBar === i ? ' selected' : ''),
      onclick: () => { histBar = histBar === i ? null : i; renderHistory(); }}, bar);
    button.setAttribute('aria-label', describe(i));
    return button;
  }));
  $('#timeline-labels').replaceChildren(...slices.map(b => el('span', {textContent: b.label})));
  $('#timeline-detail').textContent = histBar !== null ? describe(histBar) : list.length ? 'Tap a bar to see its total.' : 'Nothing kept in this period yet.';

  const perGoal = state.goals.map(g => ({goal: g, total: sum(list.filter(e => e.goalId === g.id))})).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
  $('#by-goal-block').hidden = histGoal !== 'all' || perGoal.length < 2;
  $('#by-goal').replaceChildren(...perGoal.map(x => barRow(x.goal.name, x.goal.ended ? '(ended)' : '', x.total, perGoal[0].total)));
  const groups = new Map();
  for (const e of list) {
    const key = e.name.trim().toLowerCase(), group = groups.get(key) ?? {name: e.name.trim(), total: 0, count: 0};
    group.total = round2(group.total + e.amount); group.count++; groups.set(key, group);
  }
  const top = [...groups.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  $('#top-block').hidden = !top.length;
  $('#top-skips').replaceChildren(...top.map(x => barRow(x.name, '×' + x.count, x.total, top[0].total)));

  const rows = []; let lastDay = '';
  for (const e of list) {
    const day = new Date(e.date).toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
    if (day !== lastDay) { rows.push(el('p', {className: 'day-heading', textContent: day})); lastDay = day; }
    rows.push(entryRow(e));
  }
  $('#history-list').replaceChildren(...(rows.length ? rows : [emptyNote('No skips match these filters yet.')]));
}
function renderGoals() {
  const progress = g => 'CHF ' + money(sum(entriesFor(g.id))) + ' of CHF ' + money(g.target);
  $('#goal-list').replaceChildren(...openGoals().map(g => {
    const selected = g.id === state.activeGoal;
    return el('button', {type: 'button', className: 'goal-row' + (selected ? ' active' : ''), onclick: () => selectGoal(g.id)},
      el('div', {className: 'entry-text'}, el('strong', {textContent: g.name}), el('small', {textContent: progress(g)})),
      el('span', {className: 'entry-amount', textContent: selected ? 'Selected' : 'Select'}));
  }));
  const ended = state.goals.filter(g => g.ended);
  $('#ended-goals').hidden = !ended.length;
  $('#ended-list').replaceChildren(...ended.map(g => {
    const remove = el('button', {type: 'button', className: 'row-btn', textContent: '×', onclick: () => deleteGoal(g.id)});
    remove.setAttribute('aria-label', 'Delete ended goal: ' + g.name);
    return el('div', {className: 'entry'},
      el('span', {className: 'entry-icon', textContent: '⚑'}),
      el('div', {className: 'entry-text'}, el('strong', {textContent: g.name}),
        el('small', {textContent: 'Ended ' + shortDate(g.ended) + ' · kept ' + progress(g)})),
      el('button', {type: 'button', className: 'row-btn', textContent: 'Reopen', onclick: () => reopenGoal(g.id)}), remove);
  }));
  const creating = editingGoal === 'new';
  if (!creating) {
    editingGoal = state.activeGoal;
    $('#goal-input').value = activeGoal().name; $('#target-input').value = activeGoal().target;
  }
  $('#goal-form-title').textContent = creating ? 'New goal' : 'Edit this goal';
  $('#goal-submit').textContent = creating ? 'Create goal ↗' : 'Save my goal ↗';
  const picture = creating ? newGoalImage : activeGoal().image;
  $('#goal-picture-preview').hidden = !picture;
  $('#goal-picture-preview').style.backgroundImage = picture ? 'url("' + picture + '")' : '';
  $('#remove-picture').hidden = !picture;
  $('#end-goal').hidden = creating;
  $('#delete-goal').hidden = creating || openGoals().length < 2;
}
function renderTemplates() {
  $('#template-list').replaceChildren(...(state.templates.length ? state.templates.map(t => {
    const star = el('button', {type: 'button', className: 'star', textContent: t.favorite ? '★' : '☆', onclick: () => toggleFavourite(t.id)});
    star.setAttribute('aria-pressed', String(t.favorite));
    star.setAttribute('aria-label', (t.favorite ? 'Remove from favourites: ' : 'Add to favourites: ') + t.name);
    const remove = el('button', {type: 'button', className: 'row-btn', textContent: '×', onclick: () => deleteTemplate(t.id)});
    remove.setAttribute('aria-label', 'Delete template: ' + t.name);
    return el('div', {className: 'entry'}, star,
      el('div', {className: 'entry-text'}, el('strong', {textContent: t.name}),
        el('small', {textContent: t.amount === null ? 'Amount filled in each time' : 'CHF ' + money(t.amount)})),
      el('button', {type: 'button', className: 'row-btn', textContent: 'Edit', onclick: () => editTemplate(t.id)}), remove);
  }) : [emptyNote('No templates yet. Add your first one below.')]));
  const editing = state.templates.some(t => t.id === editingTemplate);
  if (!editing) editingTemplate = null;
  $('#template-form-title').textContent = editing ? 'Edit template' : 'New template';
  $('#template-submit').textContent = editing ? 'Save changes' : 'Add template';
  $('#template-cancel').hidden = !editing;
}
function render() { renderHome(); renderHistory(); renderGoals(); renderTemplates(); }

function tab(name) {
  document.querySelectorAll('.screen').forEach(s => s.hidden = s.id !== name);
  document.querySelectorAll('[data-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
    b.setAttribute('aria-current', b.dataset.tab === name ? 'page' : 'false');
  });
}
let toastTimer;
function toast(message, undo) {
  clearTimeout(toastTimer);
  const box = $('#toast');
  box.replaceChildren(document.createTextNode(message));
  if (undo) box.append(el('button', {textContent: 'Undo', onclick: () => { undo(); box.classList.remove('show'); }}));
  box.classList.add('show');
  toastTimer = setTimeout(() => box.classList.remove('show'), 6500);
}

// Goals
function selectGoal(id) {
  editingGoal = id;
  if (id === state.activeGoal || commit({...state, activeGoal: id})) render();
}
// A bottom sheet that asks before something final. Resolves true only on the confirm button.
function ask({icon = '⚑', title, body, detail = [], yes, no, danger = false}) {
  const dialog = $('#confirm-dialog');
  $('#confirm-icon').textContent = icon; $('#confirm-icon').classList.toggle('danger', danger);
  $('#confirm-title').textContent = title; $('#confirm-body').textContent = body;
  $('#confirm-detail').replaceChildren(...detail); $('#confirm-detail').hidden = !detail.length;
  $('#confirm-yes').textContent = yes; $('#confirm-yes').classList.toggle('danger', danger);
  $('#confirm-no').textContent = no;
  dialog.returnValue = '';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), {once: true});
    dialog.showModal(); $('#confirm-no').focus();
  });
}
function progressDetail(goal, kept) {
  const pct = Math.min(100, kept / goal.target * 100), fill = el('div'); fill.style.width = pct + '%';
  return [el('strong', {textContent: 'CHF ' + money(kept) + ' of CHF ' + money(goal.target) + ' · ' + Math.round(pct) + '%'}),
    el('div', {className: 'progress'}, fill)];
}
// Pictures are scaled down and saved as JPEG text inside the goal, so backups include them.
async function readPicture(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    for (const [side, quality] of [[1000, .78], [800, .7], [600, .6]]) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = el('canvas', {width: Math.round(img.naturalWidth * scale), height: Math.round(img.naturalHeight * scale)});
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= MAX_PICTURE_CHARS) return data;
    }
    throw new Error('Picture too large');
  } finally { URL.revokeObjectURL(url); }
}
function setPicture(image) {
  if (editingGoal === 'new') { newGoalImage = image; renderGoals(); return true; }
  const goals = state.goals.map(g => { if (g.id !== state.activeGoal) return g; const {image: old, ...rest} = g; return image ? {...rest, image} : rest; });
  if (!commit({...state, goals})) return false;
  render(); return true;
}
$('#goal-picture').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try { if (setPicture(await readPicture(file))) toast('Picture added.'); }
  catch { toast('That picture could not be used. Try another one.'); }
};
$('#remove-picture').onclick = () => { if (setPicture(null)) toast('Picture removed.'); };

function startNewGoal() {
  editingGoal = 'new'; newGoalImage = null;
  $('#goal-input').value = ''; $('#target-input').value = '';
  renderGoals();
  $('#goal-input').focus();
}
$('#new-goal').onclick = startNewGoal;
$('#goal-form').onsubmit = e => {
  e.preventDefault();
  const name = $('#goal-input').value.trim(), target = round2(Number($('#target-input').value));
  if (!name || !Number.isFinite(target) || target < 1 || target > 10000000) return;
  let next;
  if (editingGoal === 'new') {
    if (state.goals.length >= 50) { toast('That is a lot of goals. Delete one before adding another.'); return; }
    const id = uid();
    next = {...state, goals: [...state.goals, newGoalImage ? {id, name, target, image: newGoalImage} : {id, name, target}], activeGoal: id};
  } else {
    next = {...state, goals: state.goals.map(g => g.id === state.activeGoal ? {...g, name, target} : g)};
  }
  if (!commit(next)) return;
  editingGoal = state.activeGoal; newGoalImage = null;
  render(); tab('home'); toast('Your goal is ready. One small skip at a time.');
};
async function deleteGoal(id) {
  const goal = state.goals.find(g => g.id === id), mine = entriesFor(id), count = mine.length;
  if (!goal || !state.goals.some(g => g.id !== id && !g.ended)) return;
  const detail = count ? [el('strong', {textContent: count + (count > 1 ? ' skips' : ' skip') + ' · CHF ' + money(sum(mine)) + ' will be removed'}),
    el('small', {textContent: goal.ended ? 'They disappear from My skips and your statistics.' : 'Want to keep the history? End the goal instead of deleting it.'})] : [];
  if (!await ask({icon: '×', danger: true, title: 'Delete this goal?', detail, yes: 'Delete goal', no: 'Cancel',
    body: '“' + goal.name + '” will be removed for good. This cannot be undone.'})) return;
  const goals = state.goals.filter(g => g.id !== id), next = goals.find(g => !g.ended);
  if (!next || goals.length === state.goals.length) return;
  if (!commit({...state, goals, activeGoal: id === state.activeGoal ? next.id : state.activeGoal, entries: state.entries.filter(e => e.goalId !== id)})) return;
  if (editingGoal !== 'new') editingGoal = state.activeGoal;
  render(); toast('Goal deleted.');
}
$('#delete-goal').onclick = () => deleteGoal(state.activeGoal);
// Ending a goal closes it at whatever was kept, reached or not. Its skips stay in the history.
$('#end-goal').onclick = async () => {
  const goal = activeGoal();
  if (openGoals().length < 2) { toast('This is your only running goal. Create your next goal first, then end this one.'); return; }
  const kept = sum(entriesFor(goal.id)), reached = kept >= goal.target;
  const note = reached ? 'You reached your target. Well done.' : 'CHF ' + money(round2(goal.target - kept)) + ' short of your target. That is still money you kept.';
  if (!await ask({icon: reached ? '✳' : '⚑', title: reached ? 'Wrap up this goal?' : 'End this goal early?',
    body: '“' + goal.name + '” will stop collecting skips. Everything you kept stays in your history, and you can reopen it any time.',
    detail: [...progressDetail(goal, kept), el('small', {textContent: note})], yes: reached ? 'Wrap it up' : 'End goal anyway', no: reached ? 'Not yet' : 'Keep going'})) return;
  const next = openGoals().find(g => g.id !== goal.id);
  if (!next || state.activeGoal !== goal.id) return;
  if (!commit({...state, goals: state.goals.map(g => g.id === goal.id ? {...g, ended: new Date().toISOString()} : g), activeGoal: next.id})) return;
  editingGoal = state.activeGoal;
  render(); toast('Goal ended with CHF ' + money(kept) + ' kept.', () => reopenGoal(goal.id, true));
};
function reopenGoal(id, select) {
  if (!state.goals.some(g => g.id === id && g.ended)) return;
  const goals = state.goals.map(g => { if (g.id !== id) return g; const {ended, ...rest} = g; return rest; });
  if (!commit({...state, goals, activeGoal: select ? id : state.activeGoal})) return;
  if (editingGoal !== 'new') editingGoal = state.activeGoal;
  render(); if (!select) toast('Goal reopened.');
}

// Templates
function toggleFavourite(id) {
  const template = state.templates.find(t => t.id === id);
  if (!template.favorite && favourites().length >= MAX_FAVOURITES) { toast('You already have three favourites. Unstar one first.'); return; }
  if (commit({...state, templates: state.templates.map(t => t.id === id ? {...t, favorite: !t.favorite} : t)})) render();
}
function resetTemplateForm() {
  editingTemplate = null;
  $('#template-name').value = ''; $('#template-amount').value = '';
}
function editTemplate(id) {
  const template = state.templates.find(t => t.id === id);
  editingTemplate = id;
  $('#template-name').value = template.name; $('#template-amount').value = template.amount ?? '';
  renderTemplates();
  $('#template-name').focus();
}
function deleteTemplate(id) {
  const index = state.templates.findIndex(t => t.id === id), removed = state.templates[index];
  if (!commit({...state, templates: state.templates.filter(t => t.id !== id)})) return;
  if (editingTemplate === id) resetTemplateForm();
  render();
  toast('Template deleted.', () => {
    if (state.templates.some(t => t.id === id)) return;
    const restored = {...removed, favorite: removed.favorite && favourites().length < MAX_FAVOURITES};
    const templates = [...state.templates]; templates.splice(Math.min(index, templates.length), 0, restored);
    if (commit({...state, templates})) render();
  });
}
$('#template-cancel').onclick = () => { resetTemplateForm(); renderTemplates(); };
$('#template-form').onsubmit = e => {
  e.preventDefault();
  const name = $('#template-name').value.trim(), field = $('#template-amount');
  if (!name || field.validity.badInput) return;
  const amount = field.value.trim() === '' ? null : round2(Number(field.value));
  if (amount !== null && !validAmount(amount)) return;
  let templates;
  if (editingTemplate) templates = state.templates.map(t => t.id === editingTemplate ? {...t, name, amount} : t);
  else {
    if (state.templates.length >= 100) { toast('Delete a template before adding another.'); return; }
    templates = [...state.templates, {id: uid(), name, amount, favorite: favourites().length < MAX_FAVOURITES}];
  }
  const wasEditing = !!editingTemplate;
  if (!commit({...state, templates})) return;
  resetTemplateForm(); render();
  toast(wasEditing ? 'Template updated.' : 'Template saved.');
};

// Adding a skip
function fillAdd(name, amount) {
  $('#purchase-input').value = name;
  $('#amount-input').value = amount ?? '';
}
function openAdd(name = '', amount = null) {
  fillAdd(name, amount);
  $('#template-chips').replaceChildren(...state.templates.map(t => el('button', {type: 'button', className: 'chip',
    textContent: t.amount === null ? t.name : t.name + ' · ' + money(t.amount),
    onclick: () => { fillAdd(t.name, t.amount); if (t.amount === null) $('#amount-input').focus(); }})));
  $('#template-chips').hidden = !state.templates.length;
  $('#goal-select').replaceChildren(...openGoals().map(g => el('option', {value: g.id, textContent: g.name})));
  $('#goal-select').value = state.activeGoal;
  $('#add-dialog').showModal();
  if (name && amount === null) $('#amount-input').focus();
}
$('.close').onclick = () => $('#add-dialog').close();
$('#add-form').onsubmit = e => {
  e.preventDefault();
  const name = $('#purchase-input').value.trim(), amount = round2(Number($('#amount-input').value));
  const goalId = openGoals().some(g => g.id === $('#goal-select').value) ? $('#goal-select').value : state.activeGoal;
  if (!name || !validAmount(amount)) return;
  const id = uid();
  if (!commit({...state, entries: [{id, name, amount, date: new Date().toISOString(), goalId}, ...state.entries]})) return;
  render(); $('#add-dialog').close();
  toast('CHF ' + money(amount) + ' kept' + (goalId === state.activeGoal ? '. Nice choice.' : ' for ' + goalName(goalId) + '.'),
    () => { if (commit({...state, entries: state.entries.filter(x => x.id !== id)})) render(); });
};

document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => tab(b.dataset.tab));
document.querySelectorAll('[data-action]').forEach(b => b.onclick = () => b.dataset.action === 'add' ? openAdd() : tab(b.dataset.action));

// Backup
$('#export-data').onclick = () => {
  const name = 'keep-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  const json = JSON.stringify({format: 'keep-backup', version: 2, data: state}, null, 2);
  // The Android APK saves through the system file picker; its WebView cannot download blob links.
  if (window.KeepAndroid) { window.KeepAndroid.saveBackup(name, json); return; }
  const url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
  const link = el('a', {href: url, download: name}); document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
$('#import-data').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try {
    if (file.size > 40000000) throw new Error();
    const backup = JSON.parse(await file.text());
    if (backup.format !== 'keep-backup' || ![1, 2].includes(backup.version)) throw new Error();
    const data = migrate(backup.data);
    if (!validState(data)) throw new Error();
    if (!confirm('Replace your current goals, templates and skips with this backup? Export your current data first if you want to keep it.')) return;
    if (commit(data)) { editingGoal = state.activeGoal; resetTemplateForm(); render(); toast('Your backup is restored.'); }
  } catch { toast('That file is not a valid Keep backup. Nothing was changed.'); }
  finally { e.target.value = ''; }
};
window.addEventListener('storage', e => {
  if (e.key !== storageKey) return;
  try {
    const next = e.newValue === null ? freshState() : migrate(JSON.parse(e.newValue));
    if (validState(next)) { state = next; if (editingGoal !== 'new') editingGoal = state.activeGoal; render(); }
  } catch {}
});
render();
if (storageBlocked) $('#storage-error').hidden = false;
