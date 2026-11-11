// Data lives in localStorage under one key. Version 1 held a single goal; version 2 adds
// several goals, templates and favourites. Older data is migrated when it is read.
const storageKey = 'keep-design-v1'; // Unchanged so existing goals and entries carry over.
const MAX_FAVOURITES = 3;
const uid = () => crypto.randomUUID();
const defaultTemplates = () => [['Flat white', 10], ['Takeaway lunch', 25], ['Impulse buy', 30]]
  .map(([name, amount]) => ({id: uid(), name, amount, favorite: true}));
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
  const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  $('#week-total').textContent = 'CHF ' + money(sum(mine.filter(e => new Date(e.date) >= monday)));
  const favs = favourites();
  $('#quick-grid').replaceChildren(...(favs.length ? favs.map(t => el('button', {type: 'button', onclick: () => openAdd(t.name, t.amount)},
    el('span', {className: 'quick-icon', textContent: iconFor(t.name)}),
    el('strong', {textContent: t.name}),
    el('small', {}, t.amount === null ? 'Set amount ' : 'CHF ' + money(t.amount) + ' ', el('b', {textContent: '＋'}))))
    : [el('button', {type: 'button', className: 'quick-empty', textContent: 'Star up to three templates to keep them here ↗', onclick: () => tab('templates')})]));
  $('#recent-list').replaceChildren(...(mine.length ? mine.slice(0, 2).map(entryRow) : [emptyNote('Nothing kept for this goal yet.')]));
}
function renderHistory() {
  $('#history-list').replaceChildren(...(state.entries.length ? state.entries.map(entryRow) : [emptyNote('Your skips will appear here.')]));
  $('#history-total').textContent = 'CHF ' + money(sum(state.entries));
  $('#history-count').textContent = state.entries.length + ' purchases skipped. A little closer to your goals.';
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
function startNewGoal() {
  editingGoal = 'new';
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
    next = {...state, goals: [...state.goals, {id, name, target}], activeGoal: id};
  } else {
    next = {...state, goals: state.goals.map(g => g.id === state.activeGoal ? {...g, name, target} : g)};
  }
  if (!commit(next)) return;
  editingGoal = state.activeGoal;
  render(); tab('home'); toast('Your goal is ready. One small skip at a time.');
};
function deleteGoal(id) {
  const goal = state.goals.find(g => g.id === id), count = entriesFor(id).length;
  const goals = state.goals.filter(g => g.id !== id), next = goals.find(g => !g.ended);
  if (!goal || !next) return;
  if (!confirm('Delete “' + goal.name + '”' + (count ? ' and its ' + count + ' skip' + (count > 1 ? 's' : '') : '') + '? This cannot be undone.')) return;
  if (!commit({...state, goals, activeGoal: id === state.activeGoal ? next.id : state.activeGoal, entries: state.entries.filter(e => e.goalId !== id)})) return;
  if (editingGoal !== 'new') editingGoal = state.activeGoal;
  render(); toast('Goal deleted.');
}
$('#delete-goal').onclick = () => deleteGoal(state.activeGoal);
// Ending a goal closes it at whatever was kept, reached or not. Its skips stay in the history.
$('#end-goal').onclick = () => {
  const goal = activeGoal(), next = openGoals().find(g => g.id !== goal.id);
  if (!next) { toast('This is your only running goal. Create your next goal first, then end this one.'); return; }
  const kept = sum(entriesFor(goal.id));
  if (!confirm('End “' + goal.name + '” at CHF ' + money(kept) + ' of CHF ' + money(goal.target) + '? Its skips stay in your history and you can reopen it later.')) return;
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
    if (file.size > 5000000) throw new Error();
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
