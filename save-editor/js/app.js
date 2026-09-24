'use strict';
const App = {
    doc: null,
    activeWorkspace: 'world',
    fileHandle: null,
    focus: null,
    pendingFocus: null,
    mapSelection: null
};
const AppBus = Bus.createBus();
function setFocus(kind, ref, opts) {
    App.focus = kind ? { kind, ref } : null;
    if (!opts || opts.jump !== false) App.pendingFocus = App.focus;
    AppBus.emit('focus:changed', App.focus);
}
function setMapSelection(rect) {
    App.mapSelection = rect;
    AppBus.emit('mapSelection:changed', App.mapSelection);
}
const supportsFileSystemAccess = 'showOpenFilePicker' in window;
function openHandleDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('FileHandleDB', 1);
        req.onupgradeneeded = (e) => e.target.result.createObjectStore('handles');
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
}
async function persistHandle(handle) {
    try {
        const db = await openHandleDB();
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, 'lastUsed');
    } catch (e) {   }
}
async function recallHandle() {
    try {
        const db = await openHandleDB();
        return await new Promise((resolve) => {
            const req = db.transaction('handles').objectStore('handles').get('lastUsed');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) { return null; }
}
function fallbackDownload(bytes, name) {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name || 'save.dat';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
async function openFile() {
    if (supportsFileSystemAccess) {
        try {
            const options = { types: [{ description: 'DAT Files', accept: { 'application/x-dat': ['.dat'] } }] };
            if (App.fileHandle) options.startIn = App.fileHandle;
            const [handle] = await window.showOpenFilePicker(options);
            App.fileHandle = handle;
            persistHandle(handle);
            const file = await handle.getFile();
            const buf = await file.arrayBuffer();
            loadFromBytes(new Uint8Array(buf), file.name, handle);
        } catch (err) {
            if (err.name !== 'AbortError') Modal.alertModal('Could not open file: ' + err.message);
        }
    } else {
        document.getElementById('fallbackFileInput').click();
    }
}
document.getElementById('fallbackFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    loadFromBytes(new Uint8Array(buf), file.name, null);
});
async function writeBytesToFile(bytes, suggestedName) {
    if (supportsFileSystemAccess) {
        const options = { suggestedName, types: [{ description: 'DAT Files', accept: { 'application/x-dat': ['.dat'] } }] };
        if (App.fileHandle) options.startIn = App.fileHandle;
        const handle = await window.showSaveFilePicker(options);
        const writable = await handle.createWritable();
        await writable.write(bytes);
        await writable.close();
        App.fileHandle = handle;
        persistHandle(handle);
    } else {
        fallbackDownload(bytes, suggestedName);
    }
}
function loadFromBytes(bytes, name, handle) {
    let doc;
    try {
        doc = SaveDoc.createSaveDoc(bytes, name, handle);
    } catch (e) {
        Modal.alertModal('Could not parse save: ' + e.message, 'Load failed');
        return;
    }
    App.doc = doc;
    doc.bus.on('doc:changed', updateChrome);
    doc.bus.on('history:changed', updateChrome);
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('saveBtn').disabled = false;
    document.getElementById('revertBtn').disabled = false;
    setFocus(null, null);
    setMapSelection(null);
    if (typeof World !== 'undefined') World.onDocLoaded(doc);
    if (typeof Horses !== 'undefined') Horses.onDocLoaded(doc);
    if (typeof GenomeWorkspace !== 'undefined') GenomeWorkspace.onDocLoaded(doc);
    if (typeof Bulk !== 'undefined') Bulk.onDocLoaded(doc);
    if (typeof ItemsWorkspace !== 'undefined') ItemsWorkspace.onDocLoaded(doc);
    if (typeof BiohackWorkspace !== 'undefined') BiohackWorkspace.onDocLoaded(doc);
    if (typeof Settings !== 'undefined') Settings.onDocChanged();
    Toast.toast(`Loaded ${name} — v${doc.state.version}, ${doc.state.width}x${doc.state.height}`, 'ok');
    runProblemScan({ announce: true });
    updateChrome();
}
async function saveFile() {
    if (!App.doc) return;
    const validation = App.doc.validate();
    if (!validation.ok) {
        await Modal.show({
            title: 'Cannot export',
            body: 'This save cannot be written back safely:',
            errors: validation.errors,
            buttons: [{ label: 'OK', primary: true, value: true }]
        });
        return;
    }
    let bytes;
    try {
        bytes = App.doc.exportBytes();
    } catch (e) {
        Modal.alertModal('Export failed: ' + e.message, 'Export failed');
        return;
    }
    try {
        await writeBytesToFile(bytes, App.doc.fileName);
        loadFromBytes(bytes, App.doc.fileName, App.fileHandle);
        Toast.toast('Saved ' + App.doc.fileName, 'ok');
    } catch (err) {
        if (err.name !== 'AbortError') Modal.alertModal('Save failed: ' + err.message, 'Save failed');
    }
}
function updateChrome() {
    const doc = App.doc;
    const docInfo = document.getElementById('docInfo');
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const revertBtn = document.getElementById('revertBtn');
    const statusLeft = document.getElementById('statusLeft');
    const statusRight = document.getElementById('statusRight');
    if (!doc) {
        docInfo.textContent = 'No save loaded.';
        undoBtn.disabled = true; redoBtn.disabled = true; revertBtn.disabled = true;
        statusLeft.textContent = ''; statusRight.textContent = '';
        return;
    }
    const dirty = doc.dirty;
    const items = doc.state.items.filter((it) => !doc.deletedWorldItems.has(it.start)).length;
    docInfo.innerHTML = `${doc.fileName} · v${doc.state.version} · ${doc.state.width}&times;${doc.state.height} · ` +
        `${items} items` + (dirty ? ` <button class="dirty-dot changes-btn" title="List the pending changes">&#9679; ${doc.changeCount} change${doc.changeCount === 1 ? '' : 's'}</button>` : '') +
        (doc.addedHorseCount ? ` <span class="dirty-dot">+${doc.addedHorseCount} horse${doc.addedHorseCount === 1 ? '' : 's'}</span>` : '');
    undoBtn.disabled = !doc.history.canUndo;
    redoBtn.disabled = !doc.history.canRedo;
    revertBtn.disabled = !dirty;
    const c = { map: 0, stabled: 0, official: 0, owner: 0, champion: 0, lost: 0 };
    const horses = doc.liveHorses();
    for (const h of horses) c[h.container]++;
    const resident = c.owner + c.champion + c.lost;
    statusLeft.textContent = `${horses.length} horses (${c.map} map, ` +
        `${c.stabled} stabled, ${c.official} bookies, ${resident} resident) · ` +
        `${doc.liveLocations().length} locations · ${doc.buriedItems.length} buried`;
    renderFocusChip();
    renderProblemChip();
    scheduleProblemScan();
}
const PROBLEM_SCAN_MS = 600;
let problemsTimer = null;
let problemList = [];
function scheduleProblemScan() {
    clearTimeout(problemsTimer);
    problemsTimer = setTimeout(() => runProblemScan(), PROBLEM_SCAN_MS);
}
function runProblemScan(opts) {
    clearTimeout(problemsTimer);
    if (!App.doc) { problemList = []; renderProblemChip(); return; }
    try {
        problemList = App.doc.problems();
    } catch (e) {
        problemList = [{ severity: 'blocker', text: 'This save could not be checked: ' + e.message }];
    }
    renderProblemChip();
    if (opts && opts.announce && problemList.some((p) => p.severity !== 'warn')) showProblemsPanel();
}
function renderProblemChip() {
    const right = document.getElementById('statusRight');
    if (!right) return;
    right.innerHTML = '';
    const doc = App.doc;
    if (!doc) return;
    if (!doc.state.locationWalkOk) {
        const note = document.createElement('span');
        note.className = 'status-note';
        note.textContent = 'location walk incomplete — scanner fallback';
        note.title = 'This file\u2019s location block could not be walked structurally, so location edits cannot be written back.';
        right.appendChild(note);
    }
    if (!problemList.length) return;
    const fatal = problemList.filter((p) => p.severity !== 'warn').length;
    const btn = document.createElement('button');
    btn.className = 'problem-chip' + (fatal ? ' fatal' : '');
    btn.textContent = (fatal ? '⛔ ' : '⚠ ') + problemList.length +
        (problemList.length === 1 ? ' problem' : ' problems');
    btn.title = fatal
        ? 'This save has faults that stop it saving or stop the game loading it.'
        : 'This save has warnings. It will still write.';
    btn.addEventListener('click', () => showProblemsPanel());
    right.appendChild(btn);
}
const PROBLEM_HEADING = {
    blocker: '⛔ Stops the save from being written',
    crash: '⛔ The game will crash loading this',
    warn: '⚠ Legal, but the game never writes it'
};
async function showProblemsPanel() {
    if (!App.doc) return;
    const body = document.createElement('div');
    body.className = 'problems-body';
    if (!problemList.length) {
        body.appendChild(Object.assign(document.createElement('p'), { className: 'changes-lead', textContent: 'Nothing wrong with this save.' }));
    }
    for (const severity of ['blocker', 'crash', 'warn']) {
        const rows = problemList.filter((p) => p.severity === severity);
        if (!rows.length) continue;
        const h = document.createElement('div');
        h.className = 'problems-heading ' + severity;
        h.textContent = PROBLEM_HEADING[severity];
        body.appendChild(h);
        const ul = document.createElement('ul');
        ul.className = 'problems-list';
        for (const p of rows) {
            const li = document.createElement('li');
            li.textContent = p.text;
            ul.appendChild(li);
        }
        body.appendChild(ul);
    }
    await Modal.show({ title: 'Problems', body, wide: true, buttons: [{ label: 'Close', primary: true, value: null }] });
}
const FOCUS_TARGETS = {
    horse: ['world', 'horses', 'genome'],
    item: ['world', 'items', 'genome'],
    location: ['world', 'horses', 'items', 'bulk']
};
const WORKSPACE_ICON = { world: '\uD83D\uDDFA', horses: '\uD83D\uDC0E', genome: '\uD83E\uDDEC', bulk: '\u26A1', items: '\uD83D\uDCE6' };
const FOCUS_ICON = { horse: '\uD83D\uDC0E', item: '\uD83D\uDCE6', location: '\uD83D\uDCCD' };
function focusLabel(focus) {
    const doc = App.doc;
    if (!doc || !focus || !focus.ref) return '';
    const ref = focus.ref;
    if (focus.kind === 'horse') {
        const i = ref.recordIndex;
        const name = (i !== null && i >= 0)
            ? (doc.renamedRecords.has(i) ? doc.renamedRecords.get(i) : doc.state.recordNames[i]) : '';
        return name || '(unnamed horse)';
    }
    if (focus.kind === 'item') {
        const id = ref.itemId !== undefined ? ref.itemId : ref.index;
        return (Items.ITEM_LIST[id] || {}).displayName || ('item ' + id);
    }
    if (focus.kind === 'location') {
        const loc = doc.state.locations[ref.locationIndex];
        if (!loc) return '(location)';
        return LocTemplates.displayName(loc.index, loc.name);
    }
    return '';
}
function focusReachable(ws, focus) {
    if (ws !== 'world') return true;
    if (focus.kind === 'item') return focus.ref.container === 'map';
    if (focus.kind === 'horse') {
        return focus.ref.container === 'map' || focus.ref.type === 0;
    }
    return true;
}
function renderFocusChip() {
    const chip = document.getElementById('statusFocus');
    if (!chip) return;
    const focus = App.focus;
    const targets = focus ? (FOCUS_TARGETS[focus.kind] || []) : [];
    if (!App.doc || !focus || !targets.length) { chip.hidden = true; chip.innerHTML = ''; return; }
    chip.hidden = false;
    chip.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'focus-label';
    label.textContent = (FOCUS_ICON[focus.kind] || '') + ' ' + focusLabel(focus);
    label.title = 'The last thing you selected. The icons jump to it.';
    chip.appendChild(label);
    for (const ws of targets) {
        if (!focusReachable(ws, focus)) continue;
        const b = document.createElement('button');
        b.className = 'focus-go' + (ws === App.activeWorkspace ? ' here' : '');
        b.textContent = WORKSPACE_ICON[ws];
        b.title = ws === App.activeWorkspace ? 'Shown here' : 'Show in ' + ws;
        b.addEventListener('click', () => {
            setFocus(focus.kind, focus.ref);
            if (ws === App.activeWorkspace) {
                const mod = workspaceModule(ws);
                App.pendingFocus = null;
                if (mod && mod.focusOn) mod.focusOn(focus.kind, focus.ref);
                renderFocusChip();
            } else {
                switchWorkspace(ws);
            }
        });
        chip.appendChild(b);
    }
    const clear = document.createElement('button');
    clear.className = 'focus-clear';
    clear.textContent = '\u00D7';
    clear.title = 'Clear';
    clear.addEventListener('click', () => setFocus(null, null));
    chip.appendChild(clear);
}
AppBus.on('focus:changed', renderFocusChip);
function buildChangesBody(doc, dismiss) {
    const body = document.createElement('div');
    body.className = 'changes-body';
    const pending = doc.pendingChanges();
    const lead = document.createElement('p');
    lead.className = 'changes-lead';
    lead.textContent = pending.length
        ? 'Newest first. Nothing has moved in the file yet — these land when you save.'
        : 'No pending changes.';
    body.appendChild(lead);
    const list = document.createElement('div');
    list.className = 'changes-list';
    pending.forEach((c, i) => {
        const row = document.createElement('div');
        row.className = 'changes-row';
        const num = document.createElement('span');
        num.className = 'changes-num';
        num.textContent = String(c.index + 1);
        const label = document.createElement('span');
        label.className = 'changes-label';
        label.textContent = c.label || '(unlabelled edit)';
        const btn = document.createElement('button');
        btn.className = 'btn changes-undo';
        btn.textContent = '↶ ' + (i + 1);
        btn.title = i === 0 ? 'Undo this change.'
            : 'Undo this change and the ' + i + ' after it — ' + (i + 1) + ' undo steps.';
        btn.addEventListener('click', () => dismiss({ undo: i + 1 }));
        row.appendChild(num);
        row.appendChild(label);
        row.appendChild(btn);
        list.appendChild(row);
    });
    body.appendChild(list);
    const redo = doc.history.redoEntries();
    if (redo.length) {
        const r = document.createElement('p');
        r.className = 'changes-lead changes-redo';
        r.textContent = redo.length + (redo.length === 1 ? ' undone change is still redoable: ' : ' undone changes are still redoable: ')
            + redo.slice().reverse().map((e) => e.label).join('; ') + '.';
        body.appendChild(r);
    }
    return body;
}
async function showChangesPanel() {
    const doc = App.doc;
    if (!doc) return;
    let dismiss = () => {};
    const body = buildChangesBody(doc, (v) => dismiss(v));
    const buttons = [{ label: 'Close', value: null }];
    if (doc.changeCount) buttons.unshift({ label: '⟲ Revert all', value: 'revert' });
    const choice = await Modal.show({
        title: 'Pending changes',
        body,
        wide: true,
        buttons,
        onOpen: (api) => { dismiss = api.resolve; }
    });
    if (choice && choice.undo) {
        for (let k = 0; k < choice.undo; k++) doc.undo();
        Toast.toast('Undid ' + choice.undo + (choice.undo === 1 ? ' change.' : ' changes.'), 'info');
        return;
    }
    if (choice === 'revert') {
        const ok = await Modal.confirmModal(`Discard all ${doc.changeCount} pending change(s) and go back to the loaded file?`,
            { title: 'Revert all changes', confirmLabel: 'Revert' });
        if (ok) { doc.revertAll(); Toast.toast('Reverted all changes', 'info'); }
    }
}
document.getElementById('docInfo').addEventListener('click', (e) => {
    if (e.target.closest('.changes-btn')) showChangesPanel();
});
function workspaceModule(name) {
    if (name === 'world') return typeof World !== 'undefined' ? World : null;
    if (name === 'horses') return typeof Horses !== 'undefined' ? Horses : null;
    if (name === 'genome') return typeof GenomeWorkspace !== 'undefined' ? GenomeWorkspace : null;
    if (name === 'bulk') return typeof Bulk !== 'undefined' ? Bulk : null;
    if (name === 'items') return typeof ItemsWorkspace !== 'undefined' ? ItemsWorkspace : null;
    if (name === 'biohack') return typeof BiohackWorkspace !== 'undefined' ? BiohackWorkspace : null;
    return null;
}
function switchWorkspace(name) {
    App.activeWorkspace = name;
    document.querySelectorAll('.rail-btn').forEach((b) => b.classList.toggle('active', b.dataset.workspace === name));
    document.querySelectorAll('.workspace-pane').forEach((p) => p.classList.toggle('active', p.dataset.workspace === name));
    document.querySelectorAll('.toolbar-content').forEach((t) => t.classList.toggle('active', t.dataset.workspace === name));
    const mod = workspaceModule(name);
    if (mod && mod.onActivate) mod.onActivate();
    const pending = App.pendingFocus;
    App.pendingFocus = null;
    if (pending && mod && mod.focusOn) mod.focusOn(pending.kind, pending.ref);
    renderFocusChip();
}
document.querySelectorAll('.rail-btn').forEach((b) => b.addEventListener('click', () => switchWorkspace(b.dataset.workspace)));
function applyDensity() {
    const pref = (typeof Settings !== 'undefined' && Settings.getDensityPref) ? Settings.getDensityPref() : 'auto';
    const compact = pref === 'compact' || (pref === 'auto' && window.innerHeight < 900);
    document.body.classList.toggle('density-compact', compact);
}
window.addEventListener('resize', applyDensity);
applyDensity();
function applyNarrowLayout() {
    document.body.classList.toggle('narrow-layout', window.innerWidth < 1280);
}
window.addEventListener('resize', applyNarrowLayout);
applyNarrowLayout();
const THEME_MEDIA = (typeof window.matchMedia === 'function')
    ? window.matchMedia('(prefers-color-scheme: light)') : null;
function applyTheme() {
    const pref = (typeof Settings !== 'undefined' && Settings.getThemePref) ? Settings.getThemePref() : 'system';
    const theme = (pref === 'light' || pref === 'dark')
        ? pref
        : ((THEME_MEDIA && THEME_MEDIA.matches) ? 'light' : 'dark');
    if (document.documentElement.dataset.theme === theme) return;
    document.documentElement.dataset.theme = theme;
    AppBus.emit('theme:changed', theme);
}
if (THEME_MEDIA && THEME_MEDIA.addEventListener) THEME_MEDIA.addEventListener('change', applyTheme);
applyTheme();
document.getElementById('openBtn').addEventListener('click', openFile);
document.getElementById('emptyOpenBtn').addEventListener('click', openFile);
document.getElementById('saveBtn').addEventListener('click', saveFile);
document.getElementById('undoBtn').addEventListener('click', () => { App.doc && App.doc.undo(); });
document.getElementById('redoBtn').addEventListener('click', () => { App.doc && App.doc.redo(); });
document.getElementById('revertBtn').addEventListener('click', async () => {
    if (!App.doc) return;
    const ok = await Modal.confirmModal(`Discard all ${App.doc.changeCount} pending change(s) and go back to the loaded file?`, { title: 'Revert all changes', confirmLabel: 'Revert' });
    if (ok) { App.doc.revertAll(); Toast.toast('Reverted all changes', 'info'); }
});
const WORKSPACE_KEYS = { '1': 'world', '2': 'horses', '3': 'genome', '4': 'bulk', '5': 'items', '6': 'biohack' };
function activeScratchModule() {
    if (App.activeWorkspace === 'genome' && typeof GenomeWorkspace !== 'undefined'
        && typeof GenomeWorkspace.isScratchSubject === 'function' && GenomeWorkspace.isScratchSubject()) return GenomeWorkspace;
    if (App.activeWorkspace === 'biohack' && typeof BiohackWorkspace !== 'undefined'
        && typeof BiohackWorkspace.isScratchSubject === 'function' && BiohackWorkspace.isScratchSubject()) return BiohackWorkspace;
    return null;
}
window.addEventListener('keydown', (e) => {
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            const m = activeScratchModule();
            if (m) m.doUndo(); else App.doc && App.doc.undo();
        }
        else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
            e.preventDefault();
            const m = activeScratchModule();
            if (m) m.doRedo(); else App.doc && App.doc.redo();
        }
        else if (e.key === 'o') { e.preventDefault(); openFile(); }
        else if (e.key === 's') { e.preventDefault(); saveFile(); }
        return;
    }
    if (inField) return;
    if (WORKSPACE_KEYS[e.key]) switchWorkspace(WORKSPACE_KEYS[e.key]);
});
window.addEventListener('beforeunload', (e) => {
    if (App.doc && App.doc.dirty) {
        e.preventDefault();
        e.returnValue = '';
    }
});
(async function init() {
    if (typeof Settings !== 'undefined') Settings.init();
    if (typeof LocTemplates !== 'undefined') {
        LocTemplates.load().catch((e) => console.warn('Location templates unavailable:', e.message));
    }
    applyDensity();
    switchWorkspace(App.activeWorkspace);
    if (typeof World !== 'undefined') World.init();
    if (typeof Horses !== 'undefined') Horses.init(document.querySelector('.workspace-pane[data-workspace="horses"]'));
    if (typeof ItemsWorkspace !== 'undefined') ItemsWorkspace.init(document.querySelector('.workspace-pane[data-workspace="items"]'));
    if (typeof GenomeWorkspace !== 'undefined') GenomeWorkspace.init();
    if (typeof Bulk !== 'undefined') Bulk.init();
    if (typeof BiohackWorkspace !== 'undefined') BiohackWorkspace.init(document.querySelector('.workspace-pane[data-workspace="biohack"]'));
    if (supportsFileSystemAccess) {
        const handle = await recallHandle();
        if (handle) App.fileHandle = handle;
    }
    updateChrome();
})();
