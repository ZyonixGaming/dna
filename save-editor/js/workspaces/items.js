'use strict';
const ItemsWorkspace = (function () {
    const DNA_BY_DEFAULT = new Set([6, 7, 8, 12, 13]);
    const ROW_HEIGHT = 34;
    let lastAddedItemId = 0;
    let doc = null;
    let inited = false;
    let paneEl = null;
    const els = {};
    let genomePreview = null;
    const state = {
        rows: [],
        filtered: [],
        filters: { search: '', container: '', location: '', dna: '' },
        selectedStart: null
    };
    function itemName(id) {
        const it = Items.ITEM_LIST[id];
        return it ? it.displayName : 'item ' + id;
    }
    function locationLabel(doc, li) {
        const loc = doc.state.locations[li];
        if (!loc) return '(unknown location)';
        return LocTemplates.displayName(loc.index, loc.name);
    }
    function fillItemSelect(select, currentId) {
        select.innerHTML = '';
        const max = Items.BURIED_ITEM_MAX_INDEX;
        for (let id = 0; id <= max; id++) {
            const o = document.createElement('option');
            o.value = String(id);
            o.textContent = id + ' — ' + itemName(id);
            select.appendChild(o);
        }
        if (currentId > max) {
            const o = document.createElement('option');
            o.value = String(currentId);
            o.textContent = currentId + ' — ' + itemName(currentId) + ' (out of range)';
            select.appendChild(o);
        }
        select.value = String(currentId);
        return select;
    }
    function effByte(doc, off) { return doc.patches.has(off) ? doc.patches.get(off) : doc.state.bytes[off]; }
    function effU32(doc, off) {
        return (effByte(doc, off) | (effByte(doc, off + 1) << 8) | (effByte(doc, off + 2) << 16) | ((effByte(doc, off + 3) << 24) >>> 0)) >>> 0;
    }
    function effF32(doc, off) {
        const buf = new ArrayBuffer(4);
        const v = new DataView(buf);
        for (let i = 0; i < 4; i++) v.setUint8(i, effByte(doc, off + i));
        return v.getFloat32(0, true);
    }
    function live(doc, row) {
        const buf = new ArrayBuffer(8);
        const u8 = new Uint8Array(buf);
        for (let i = 0; i < 8; i++) u8[i] = effByte(doc, row.fields.xOff + i);
        const dv = new DataView(buf);
        return { id: effByte(doc, row.fields.idOff), x: dv.getFloat32(0, true), y: dv.getFloat32(4, true) };
    }
    function isDeleted(doc, row) { return doc.itemDeleted(row); }
    function computeRows(doc) {
        return SaveFile.buildItemIndex(doc.state).map((it) => {
            const v = live(doc, it);
            return Object.assign({}, it, {
                itemId: v.id, x: v.x, y: v.y,
                name: itemName(v.id),
                where: it.container === 'map'
                    ? 'Map (' + Math.round(v.x) + ', ' + Math.round(v.y) + ')'
                    : locationLabel(doc, it.locationIndex) + ' (' + v.x.toFixed(1) + ', ' + v.y.toFixed(1) + ')',
                locKey: it.container === 'map' ? '__map__' : locationLabel(doc, it.locationIndex),
                doomed: isDeleted(doc, it)
            });
        });
    }
    function applyFilters(rows) {
        const q = state.filters.search.trim().toLowerCase();
        return rows.filter((r) => {
            if (state.filters.container && r.container !== state.filters.container) return false;
            if (state.filters.location && r.locKey !== state.filters.location) return false;
            if (state.filters.dna === 'yes' && !r.hasDna) return false;
            if (state.filters.dna === 'no' && r.hasDna) return false;
            if (q && !(r.name.toLowerCase().includes(q) || String(r.itemId) === q)) return false;
            return true;
        });
    }
    function showEmpty(el, msg) {
        el.innerHTML = '';
        const d = document.createElement('div');
        d.className = 'hz-empty';
        d.textContent = msg;
        el.appendChild(d);
    }
    function renderFilters(rows) {
        const sel = els.locationFilter;
        if (!sel) return;
        const counts = new Map();
        for (const r of rows) counts.set(r.locKey, (counts.get(r.locKey) || 0) + 1);
        if (doc) {
            for (const loc of doc.state.locations) {
                const k = locationLabel(doc, doc.state.locations.indexOf(loc));
                if (!counts.has(k)) counts.set(k, 0);
            }
        }
        const prev = state.filters.location || sel.value;
        sel.innerHTML = '';
        const all = document.createElement('option');
        all.value = ''; all.textContent = 'Everywhere (' + rows.length + ')';
        sel.appendChild(all);
        const keys = [...counts.keys()].sort((a, b) =>
            (a === '__map__' ? -1 : b === '__map__' ? 1 : a.localeCompare(b)));
        for (const k of keys) {
            const o = document.createElement('option');
            o.value = k;
            o.textContent = (k === '__map__' ? 'On the map' : k) + ' (' + counts.get(k) + ')';
            sel.appendChild(o);
        }
        const valid = new Set(['', ...keys]);
        sel.value = valid.has(prev) ? prev : '';
        state.filters.location = sel.value;
    }
    function renderList() {
        const list = els.list;
        if (!list) return;
        if (!doc) { showEmpty(list, 'Open a save file to see its items.'); return; }
        if (!state.filtered.length) { showEmpty(list, 'No items match these filters.'); return; }
        list.innerHTML = '';
        for (const r of state.filtered) {
            const row = document.createElement('div');
            row.className = 'it-row' + (r.start === state.selectedStart ? ' selected' : '') + (r.doomed ? ' doomed' : '');
            row.dataset.start = String(r.start);
            row.innerHTML =
                '<span class="it-icon">' + (r.container === 'map' ? '🗺' : '🏠') + '</span>' +
                '<span class="it-name">' + escapeHtml(r.name) + '</span>' +
                (r.hasDna ? '<span class="it-dna" title="Carries a genome">🧬</span>' : '') +
                '<span class="it-where">' + escapeHtml(r.where) + '</span>';
            const del = document.createElement('button');
            del.className = 'it-del';
            del.textContent = r.doomed ? '\u21B6' : '\u2715';
            del.title = r.doomed ? 'Cancel this deletion' : 'Delete this item';
            del.addEventListener('click', (e) => {
                e.stopPropagation();
                doc.deleteItem(r);
                render();
            });
            row.appendChild(del);
            row.addEventListener('click', () => {
                state.selectedStart = r.start;
                if (typeof setFocus === 'function') setFocus('item', r, { jump: false });
                render();
            });
            list.appendChild(row);
        }
    }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function propRow(labelText, control) {
        const row = document.createElement('div');
        row.className = 'hz-prop-row';
        const l = document.createElement('label');
        l.textContent = labelText;
        row.appendChild(l);
        row.appendChild(control);
        return row;
    }
    function selectedRow() {
        return state.filtered.find((r) => r.start === state.selectedStart)
            || state.rows.find((r) => r.start === state.selectedStart) || null;
    }
    function renderInspector() {
        const box = els.inspector;
        if (!box) return;
        box.innerHTML = '';
        if (!doc) { showEmpty(box, 'Open a save file.'); return; }
        const r = selectedRow();
        if (!r) { showEmpty(box, 'Select an item.'); return; }
        const wrap = document.createElement('div');
        wrap.className = 'hz-props-inner';
        const title = document.createElement('div');
        title.className = 'hz-props-title';
        title.textContent = r.name + (r.hasDna ? ' 🧬' : '');
        wrap.appendChild(title);
        const idSel = fillItemSelect(document.createElement('select'), r.itemId);
        idSel.addEventListener('change', () => {
            doc.setItemId(r, Number(idSel.value));
            render();
        });
        wrap.appendChild(propRow('Item', idSel));
        const mkNum = (label, value, onChange, step, clamp, title) => {
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.step = step;
            inp.value = String(Math.round(value * 1000) / 1000);
            if (title) inp.title = title;
            inp.addEventListener('change', () => {
                const raw = Number(inp.value);
                const v = clamp ? SaveFile.clampRoomCoord(raw) : raw;
                if (v !== raw) inp.value = String(v);
                onChange(v);
            });
            return propRow(label, inp);
        };
        const commitPos = (x, y) => { doc.setItemPosition(r, x, y); render(); };
        if (r.container === 'map') {
            wrap.appendChild(mkNum('X (map pixels)', r.x, (v) => commitPos(v, r.y), '1'));
            wrap.appendChild(mkNum('Y (map pixels)', r.y, (v) => commitPos(r.x, v), '1'));
            const tile = document.createElement('span');
            tile.className = 'hz-readonly';
            tile.textContent = 'tile ' + Math.floor(r.x / 32) + ', ' + Math.floor(r.y / 32);
            wrap.appendChild(propRow('Tile', tile));
        } else {
            const where = document.createElement('span');
            where.className = 'hz-readonly';
            where.textContent = locationLabel(doc, r.locationIndex);
            wrap.appendChild(propRow('Inside', where));
            const tip = 'Position inside the building. Existing values are left alone, but a '
                + 'value you type outside 0…20 snaps to 5.';
            wrap.appendChild(mkNum('Room X', r.x, (v) => commitPos(v, r.y), '0.5', true, tip));
            wrap.appendChild(mkNum('Room Y', r.y, (v) => commitPos(r.x, v), '0.5', true, tip));
        }
        const dnaWrap = document.createElement('div');
        const dnaCb = document.createElement('input');
        dnaCb.type = 'checkbox';
        dnaCb.checked = r.hasDna;
        dnaCb.title = 'A full genome stored inside the item. Turning it off discards that genome, '
            + 'and Ctrl+Z restores it until you save.';
        dnaCb.addEventListener('change', () => toggleDna(r, dnaCb.checked));
        dnaWrap.appendChild(dnaCb);
        wrap.appendChild(propRow('Carries DNA', dnaWrap));
        if (r.hasDna) {
            const src = document.createElement('span');
            src.className = 'hz-readonly';
            src.textContent = '240 bytes at ' + r.genomeOff;
            const genomeOffRow = propRow('Genome', src);
            genomeOffRow.classList.add('dev-only');
            wrap.appendChild(genomeOffRow);
            if (typeof GenomePanel !== 'undefined') {
                const panelHost = document.createElement('div');
                wrap.appendChild(panelHost);
                genomePreview = GenomePanel.mount(panelHost, {
                    doc,
                    genomeOff: () => r.genomeOff,
                    geneTable,
                    label: () => itemName(r.itemId) + (r.container === 'map' ? ' on the map' : ' in ' + locationLabel(doc, r.locationIndex)),
                    collapseKey: 'horsey_studio_it_preview_open',
                    onOpenInGenome: () => {
                        if (typeof setFocus === 'function') setFocus('item', r);
                        if (typeof switchWorkspace === 'function') switchWorkspace('genome');
                    }
                });
            }
        } else {
            const hint = document.createElement('span');
            hint.className = 'hz-readonly';
            hint.textContent = 'Turning this on copies the genome from 🧬.';
            wrap.appendChild(propRow('', hint));
        }
        if (r.container === 'map') {
            const locate = document.createElement('button');
            locate.className = 'btn';
            locate.textContent = '🗺 Locate on map';
            locate.title = 'Centre the World map here and select this item.';
            locate.addEventListener('click', () => {
                if (typeof setFocus === 'function') setFocus('item', r);
                if (typeof switchWorkspace === 'function') switchWorkspace('world');
            });
            wrap.appendChild(propRow('', locate));
        }
        if (r.fields && r.fields.usageCountOff != null) {
            const usageOff = r.fields.usageCountOff;
            const usageVal = (effByte(doc, usageOff) | (effByte(doc, usageOff + 1) << 8)) >>> 0;
            wrap.appendChild(mkNum('Usage count', usageVal, (v) => {
                v = Math.max(0, Math.min(65535, Math.floor(v) || 0));
                doc.setByte(usageOff, v & 0xFF);
                doc.setByte(usageOff + 1, (v >> 8) & 0xFF);
                render();
            }, '1', false, 'Remaining uses (hay=10, disk=1, apple tree=80)'));
            const tickOff = r.fields.tickCounterOff;
            const tickVal = effU32(doc, tickOff);
            const tickRow = mkNum('Tick counter', tickVal, (v) => {
                doc.setU32(tickOff, Math.max(0, Math.floor(v) || 0));
                render();
            }, '1', false, 'Game update ticks (apple tree spawns at 60)');
            tickRow.classList.add('dev-only');
            wrap.appendChild(tickRow);
            const vxOff = r.fields.velocityXOff;
            const vyOff = r.fields.velocityYOff;
            const vx = effF32(doc, vxOff);
            const vy = effF32(doc, vyOff);
            const velLabel = document.createElement('span');
            velLabel.className = 'hz-readonly';
            velLabel.textContent = (Math.round(vx * 1000) / 1000) + ', ' + (Math.round(vy * 1000) / 1000);
            velLabel.title = 'Velocity X/Y (0.0 for static ground items)';
            const velRow = propRow('Velocity', velLabel);
            velRow.classList.add('dev-only');
            wrap.appendChild(velRow);
        }
        const del = document.createElement('button');
        del.className = 'btn danger';
        del.textContent = r.doomed ? '↶ Undo removal' : '✕ Delete item';
        del.addEventListener('click', () => {
            doc.deleteItem(r);
            Toast.toast(r.doomed ? 'Deletion cancelled' : 'Queued for deletion. It’s removed when you save.', 'ok');
            render();
        });
        wrap.appendChild(propRow('', del));
        box.appendChild(wrap);
    }
    function genomeForNewDna() {
        const g = (typeof GenomeWorkspace !== 'undefined') ? GenomeWorkspace.currentGenomeBytes() : null;
        return g ? g.bytes : null;
    }
    function toggleDna(r, on) {
        if (on) {
            const genome = genomeForNewDna();
            if (!genome) {
                Toast.toast('The Genome workspace has not loaded its gene data.', 'bad');
                render();
                return;
            }
            try { doc.setItemDna(r, true, genome); }
            catch (e) { Modal.alertModal(e.message, 'Could not add DNA'); render(); return; }
            Toast.toast('DNA added, copied from 🧬.', 'ok');
        } else {
            try { doc.setItemDna(r, false); }
            catch (e) { Modal.alertModal(e.message, 'Could not remove DNA'); render(); return; }
            Toast.toast('DNA removed. Ctrl+Z restores it until you save.', 'ok');
        }
        state.selectedStart = r.start;
        render();
    }
    function renderAddButton() {
        if (!els.addBtn) return;
        const key = state.filters.location;
        const canAdd = !!doc && !!key && key !== '__map__' && doc.state.locationWalkOk;
        els.addBtn.hidden = !doc || !key || key === '__map__';
        if (els.addBtn.hidden) return;
        els.addBtn.disabled = !canAdd;
        els.addBtn.textContent = '＋ Add item to ' + key;
        els.addBtn.title = canAdd
            ? 'Add an item to this location’s interior list.'
            : 'This save’s location data couldn’t be read, so interior counts can’t be written back.';
    }
    function hostLocation() {
        const key = state.filters.location;
        if (!key || key === '__map__' || !doc) return null;
        return doc.state.locations.find((l, i) => locationLabel(doc, i) === key) || null;
    }
    async function addItemHere() {
        const loc = hostLocation();
        if (!loc) return;
        const body = document.createElement('div');
        const sel = fillItemSelect(document.createElement('select'), lastAddedItemId);
        sel.style.width = '100%';
        body.appendChild(sel);
        const dnaLabel = document.createElement('label');
        dnaLabel.style.display = 'block';
        dnaLabel.style.marginTop = '8px';
        const dnaCb = document.createElement('input');
        dnaCb.type = 'checkbox';
        dnaLabel.appendChild(dnaCb);
        dnaLabel.appendChild(document.createTextNode(' Carries DNA (copied from 🧬)'));
        body.appendChild(dnaLabel);
        const syncDna = () => { dnaCb.checked = DNA_BY_DEFAULT.has(Number(sel.value)); };
        syncDna();
        sel.addEventListener('change', syncDna);
        const ok = await Modal.show({
            title: 'Add an item to ' + (loc.name || 'this location'),
            body,
            buttons: [{ label: 'Cancel', value: null }, { label: 'Add', primary: true, value: '__add__' }]
        });
        if (ok !== '__add__') return;
        const opts = { itemId: Number(sel.value), x: 5, y: 5 };
        if (dnaCb.checked) {
            const g = genomeForNewDna();
            if (!g) { Toast.toast('The Genome workspace has not loaded its gene data.', 'bad'); return; }
            opts.genome = g;
        }
        let added;
        try { added = doc.addInteriorItem(loc.nameOffset, opts); }
        catch (e) { Modal.alertModal(e.message, 'Could not add that item'); return; }
        lastAddedItemId = opts.itemId;
        state.selectedStart = added.start;
        render();
        Toast.toast(itemName(opts.itemId) + ' added' + (opts.genome ? ' with DNA' : '') + '.', 'ok');
    }
    let geneTable = null;
    function render() {
        if (!inited) return;
        if (!doc) {
            if (els.list) showEmpty(els.list, 'Open a save file to see its items.');
            if (els.inspector) showEmpty(els.inspector, 'Open a save file.');
            if (els.count) els.count.textContent = '';
            return;
        }
        state.rows = computeRows(doc);
        renderFilters(state.rows);
        state.filtered = applyFilters(state.rows);
        if (els.count) {
            els.count.textContent = state.filtered.length + ' / ' + state.rows.length + ' shown';
        }
        renderList();
        renderInspector();
        renderAddButton();
    }
    function cacheEls() {
        els.search = document.getElementById('itSearch');
        els.containerFilter = document.getElementById('itContainerFilter');
        els.locationFilter = document.getElementById('itLocationFilter');
        els.dnaFilter = document.getElementById('itDnaFilter');
        els.addBtn = document.getElementById('itAddBtn');
        els.count = document.getElementById('itCount');
        els.list = document.getElementById('itList');
        els.inspector = document.getElementById('itInspector');
    }
    let itInspectorSplitter = null;
    const IT_LIST_MIN = 420;
    const IT_HANDLE_W = 6;
    function itViewportOk() { return window.innerWidth >= 1280; }
    function boundedMax(container, absCap, computeReal) {
        return container.clientWidth ? Math.min(absCap, computeReal()) : absCap;
    }
    function setupSplitters() {
        if (typeof Splitter === 'undefined') return;
        const body = document.getElementById('itBody');
        if (!body) return;
        itInspectorSplitter = Splitter.attach({
            handle: '#itHandle',
            container: body,
            cssVar: '--it-inspector-w',
            side: 'right',
            min: 260,
            max: () => boundedMax(body, 520, () => body.clientWidth - IT_LIST_MIN - IT_HANDLE_W),
            defaultWidth: 320,
            storageKey: 'horsey_studio_items_right_w',
            enabled: itViewportOk
        });
        if (els.inspector && typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => { if (genomePreview) genomePreview.refresh(); }).observe(els.inspector);
        }
    }
    function init(pane) {
        if (inited) return;
        paneEl = pane;
        cacheEls();
        if (!els.list) return;
        inited = true;
        els.search.addEventListener('input', () => { state.filters.search = els.search.value; render(); });
        els.containerFilter.addEventListener('change', () => { state.filters.container = els.containerFilter.value; render(); });
        els.locationFilter.addEventListener('change', () => { state.filters.location = els.locationFilter.value; render(); });
        els.dnaFilter.addEventListener('change', () => { state.filters.dna = els.dnaFilter.value; render(); });
        els.addBtn.addEventListener('click', addItemHere);
        GameData.load()
            .then((d) => { geneTable = d.geneTable; render(); })
            .catch(() => {   });
        GameData.onChange((d) => { geneTable = d.geneTable; render(); });
        render();
        setupSplitters();
    }
    function resetFilters() {
        state.filters = { search: '', container: '', location: '', dna: '' };
        if (els.search) els.search.value = '';
        if (els.containerFilter) els.containerFilter.value = '';
        if (els.locationFilter) els.locationFilter.value = '';
        if (els.dnaFilter) els.dnaFilter.value = '';
    }
    function onDocLoaded(newDoc) {
        doc = newDoc;
        state.selectedStart = null;
        resetFilters();
        if (doc) {
            doc.bus.on('doc:changed', () => render());
            doc.bus.on('doc:rebased', () => { state.selectedStart = null; render(); });
        }
        render();
    }
    function onActivate() {
        render();
        if (itInspectorSplitter) itInspectorSplitter.clamp();
    }
    function focusOnLocation(ref) {
        if (!doc || !ref) return;
        const loc = doc.state.locations[ref.locationIndex];
        if (!loc) return;
        resetFilters();
        state.filters.location = locationLabel(doc, ref.locationIndex);
        state.selectedStart = null;
        render();
    }
    function focusOn(kind, ref) {
        if (kind === 'location') { focusOnLocation(ref); return; }
        if (kind !== 'item' || !ref) return;
        state.selectedStart = ref.start;
        resetFilters();
        render();
        const row = els.list && els.list.querySelector('.it-row.selected');
        if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    }
    return { init, onDocLoaded, onActivate, focusOn, DNA_BY_DEFAULT };
})();
