'use strict';
const BiohackWorkspace = (function () {
    const GENES = 240;
    const BASES = 4;
    const FULL = 0xF;
    const SCRATCH_KEY = 'horsey_studio_biohack_scratch';
    let doc = null;
    let geneTable = null, popTable = null, presetNames = [];
    let inited = false;
    let paneEl = null;
    const els = {};
    let subject = { kind: 'scratch' };
    let scratchVat = null;
    const scratchUndo = { stack: [], redo: [] };
    let filters = { search: '', le1: false, differs: false };
    let selectedProfileId = null;
    let lastGenerated = null;
    let libPicker = null;
    let previewApi = null;
    let unsubscribeProfiles = null;
    let unsubscribeDnaLib = null;
    let bhLeftSplitter = null, bhRightSplitter = null;
    let rowsBuilt = false;
    const rowEls = new Array(GENES);
    function popcount4(m) { return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1); }
    function effByte(d, off) { return d.patches.has(off) ? d.patches.get(off) : d.state.bytes[off]; }
    function effGenomeBytes(d, genomeOff) {
        const out = new Uint8Array(SaveFile.GENOME_LEN);
        for (let i = 0; i < SaveFile.GENOME_LEN; i++) out[i] = effByte(d, genomeOff + i);
        return out;
    }
    function locationLabel(d, loc) {
        return (typeof LocTemplates !== 'undefined') ? LocTemplates.displayName(loc.index, loc.name) : (loc.name || '(location)');
    }
    function horseDisplayName(h) {
        if (!doc) return '(unnamed horse)';
        if (h.recordIndex !== null && h.recordIndex !== undefined && h.recordIndex >= 0) {
            const name = doc.renamedRecords.has(h.recordIndex)
                ? doc.renamedRecords.get(h.recordIndex)
                : (doc.state.records[h.recordIndex] && doc.state.records[h.recordIndex].name);
            if (name) return name;
        }
        return '(unnamed horse)';
    }
    function liveHorses() { return doc ? doc.liveHorses() : []; }
    function isScratchSubject() { return subject.kind === 'scratch'; }
    function saveAvailable() { return !!doc && typeof BioVat !== 'undefined' && BioVat.unavailableReason(doc) === null; }
    function loadScratchFromStorage() {
        if (geneTable && typeof BioVat !== 'undefined') {
            try {
                const raw = localStorage.getItem(SCRATCH_KEY);
                if (raw && BioVat.isLetterString(raw)) return BioVat.fromLetters(raw, geneTable);
            } catch (e) {   }
        }
        return (typeof BioVat !== 'undefined') ? BioVat.empty() : new Uint8Array(GENES);
    }
    function persistScratch() {
        if (!scratchVat || !geneTable || typeof BioVat === 'undefined') return;
        try { localStorage.setItem(SCRATCH_KEY, BioVat.toLetters(scratchVat, geneTable)); }
        catch (e) {   }
    }
    function ensureScratchVat() {
        if (!scratchVat) scratchVat = loadScratchFromStorage();
        return scratchVat;
    }
    function effectiveVat() {
        if (!geneTable || typeof BioVat === 'undefined') return new Uint8Array(GENES);
        if (subject.kind === 'save') return (doc && BioVat.read(doc)) || BioVat.empty();
        return ensureScratchVat();
    }
    async function commitVat(nextVat, label) {
        if (subject.kind === 'save') {
            if (!saveAvailable()) return { changed: false };
            return BioVat.writeBatch(doc, nextVat, label);
        }
        const cur = ensureScratchVat();
        if (BioVat.equals(cur, nextVat)) return { changed: false };
        scratchUndo.stack.push(BioVat.clone(cur));
        scratchUndo.redo.length = 0;
        if (scratchUndo.stack.length > 60) scratchUndo.stack.shift();
        scratchVat = nextVat;
        persistScratch();
        if (inited) renderAll();
        return { changed: true };
    }
    function canUndo() { return isScratchSubject() ? scratchUndo.stack.length > 0 : !!(doc && doc.history.canUndo); }
    function canRedo() { return isScratchSubject() ? scratchUndo.redo.length > 0 : !!(doc && doc.history.canRedo); }
    function doUndo() {
        if (!isScratchSubject()) { if (doc) doc.undo(); return; }
        if (!scratchUndo.stack.length) return;
        scratchUndo.redo.push(BioVat.clone(ensureScratchVat()));
        scratchVat = scratchUndo.stack.pop();
        persistScratch();
        renderAll();
    }
    function doRedo() {
        if (!isScratchSubject()) { if (doc) doc.redo(); return; }
        if (!scratchUndo.redo.length) return;
        scratchUndo.stack.push(BioVat.clone(ensureScratchVat()));
        scratchVat = scratchUndo.redo.pop();
        persistScratch();
        renderAll();
    }
    async function toggleCell(geneId, col) {
        if (!geneTable) return;
        const vat = effectiveVat();
        const next = BioVat.clone(vat);
        next[geneId] ^= (1 << col);
        const gene = geneTable.get(geneId);
        const on = !!(next[geneId] & (1 << col));
        await commitVat(next, 'Bio-Hacker vat: ' + (on ? 'set ' : 'cleared ') + gene.desc + ' ' + gene.n[col]);
    }
    async function toggleGene(geneId) {
        if (!geneTable) return;
        const vat = effectiveVat();
        const next = BioVat.clone(vat);
        const gene = geneTable.get(geneId);
        next[geneId] = popcount4(next[geneId]) === BASES ? 0 : FULL;
        await commitVat(next, 'Bio-Hacker vat: toggled all of ' + gene.desc);
    }
    async function fillEmptyGenes() {
        const vat = effectiveVat();
        const stats = BioVat.stats(vat);
        if (!stats.emptyGenes) return;
        await commitVat(BioVat.fillEmpty(vat), 'Bio-Hacker vat: filled ' + stats.emptyGenes + ' empty gene' + (stats.emptyGenes === 1 ? '' : 's'));
    }
    async function clearVat() {
        const vat = effectiveVat();
        const count = BioVat.cellCount(vat);
        if (!count) { Toast.toast('The vat is already empty.', 'info'); return; }
        const ok = await Modal.confirmModal('Clear ' + count + ' bases?', { title: 'Clear vat', confirmLabel: 'Clear' });
        if (!ok) return;
        await commitVat(BioVat.empty(), 'Bio-Hacker vat: cleared (-' + count + ' bases)');
    }
    function onTableClick(e) {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const tr = target.closest('tr[data-gene]');
        if (!tr) return;
        const g = Number(tr.dataset.gene);
        if (target.dataset.action === 'base') toggleCell(g, Number(target.dataset.col));
        else if (target.dataset.action === 'gene') toggleGene(g);
    }
    function buildTableRows() {
        if (!els.tableBody || !geneTable) return;
        els.tableBody.innerHTML = '';
        let labelCh = 6;
        for (let g = 0; g < GENES; g++) {
            const gene = geneTable.get(g);
            for (let k = 0; k < BASES; k++) labelCh = Math.max(labelCh, (gene.n[k] + ' ' + gene.g[k]).length);
        }
        const tableEl = els.tableBody.closest('table');
        if (tableEl) tableEl.style.setProperty('--bh-base-ch', String(labelCh));
        for (let g = 0; g < GENES; g++) {
            const gene = geneTable.get(g);
            const tr = document.createElement('tr');
            tr.className = 'bh-row';
            tr.dataset.gene = String(g);
            const hp = document.createElement('td');
            hp.className = 'bh-hp';
            hp.textContent = gene.h + ':' + gene.p;
            tr.appendChild(hp);
            const nameTd = document.createElement('td');
            nameTd.className = 'bh-gene-name';
            nameTd.textContent = gene.desc;
            nameTd.title = 'Click to toggle all four bases on or off';
            nameTd.dataset.action = 'gene';
            tr.appendChild(nameTd);
            const mTd = document.createElement('td');
            mTd.className = 'bh-m';
            mTd.textContent = String(gene.m);
            tr.appendChild(mTd);
            const basesTd = document.createElement('td');
            const basesWrap = document.createElement('div');
            basesWrap.className = 'bh-bases';
            basesTd.appendChild(basesWrap);
            const btns = [];
            for (let k = 0; k < BASES; k++) {
                const letter = gene.n[k];
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'bh-base-btn bh-base-' + letter;
                btn.dataset.action = 'base';
                btn.dataset.col = String(k);
                btn.textContent = letter + ' ' + gene.g[k];
                basesWrap.appendChild(btn);
                btns.push(btn);
            }
            tr.appendChild(basesTd);
            els.tableBody.appendChild(tr);
            rowEls[g] = { tr, baseBtns: btns };
        }
        rowsBuilt = true;
    }
    function updateTableClasses() {
        if (!rowsBuilt || !geneTable) return;
        const vat = effectiveVat();
        const refProfile = selectedProfileId && typeof BioProfiles !== 'undefined' ? BioProfiles.get(selectedProfileId) : null;
        let refVat = null;
        if (filters.differs && refProfile) {
            try { refVat = BioVat.fromLetters(refProfile.bases, geneTable); } catch (e) { refVat = null; }
        }
        const q = filters.search.trim().toLowerCase();
        for (let g = 0; g < GENES; g++) {
            const row = rowEls[g];
            if (!row) continue;
            const mask = vat[g];
            for (let k = 0; k < BASES; k++) row.baseBtns[k].classList.toggle('on', !!(mask & (1 << k)));
            let hidden = false;
            if (q && !geneTable.get(g).desc.toLowerCase().includes(q)) hidden = true;
            if (!hidden && filters.le1 && popcount4(mask) > 1) hidden = true;
            if (!hidden && refVat && mask === refVat[g]) hidden = true;
            row.tr.classList.toggle('bh-hidden', hidden);
        }
    }
    function parsedTextboxBytes() {
        if (!els.rawText || !geneTable) return null;
        const res = Genome.normalizeGenomeInput(els.rawText.value, { geneTable });
        renderRawWarnings(res);
        return (res.ok && res.bytes) ? res.bytes : null;
    }
    function renderRawWarnings(res) {
        if (!els.warnings) return;
        const msgs = res && (res.errors.length ? res.errors : res.warnings);
        if (!msgs || !msgs.length) { els.warnings.hidden = true; els.warnings.textContent = ''; return; }
        els.warnings.hidden = false;
        els.warnings.textContent = (res.errors.length ? '⚠ ' : '') + msgs.join('\n');
    }
    async function addGenomeToVat(bytes, label) {
        const vat = effectiveVat();
        const next = BioVat.addGenome(vat, geneTable, bytes);
        const delta = BioVat.diffCount(vat, next);
        if (!delta) { Toast.toast('Nothing new to add — every base was already set.', 'info'); return; }
        await commitVat(next, label + ' (+' + delta + ' bases)');
    }
    async function removeGenomeFromVat(bytes, label) {
        const vat = effectiveVat();
        const next = BioVat.removeGenome(vat, geneTable, bytes);
        const delta = BioVat.diffCount(vat, next);
        if (!delta) { Toast.toast('Nothing to remove — none of those bases were set.', 'info'); return; }
        await commitVat(next, label + ' (-' + delta + ' bases)');
    }
    function onAddClick() {
        const bytes = parsedTextboxBytes();
        if (!bytes) { Toast.toast('Could not read that as a genome — nothing was added.', 'bad'); return; }
        addGenomeToVat(bytes, 'Bio-Hacker vat: added the pasted genome');
    }
    function onRemoveClick() {
        const bytes = parsedTextboxBytes();
        if (!bytes) { Toast.toast('Could not read that as a genome — nothing was removed.', 'bad'); return; }
        removeGenomeFromVat(bytes, 'Bio-Hacker vat: removed the pasted genome');
    }
    async function onPasteAddClick() {
        if (!navigator.clipboard || !navigator.clipboard.readText) {
            Toast.toast('Clipboard access is not available here.', 'bad'); return;
        }
        let text;
        try { text = await navigator.clipboard.readText(); }
        catch (e) { Toast.toast('Could not read the clipboard.', 'bad'); return; }
        if (els.rawText) els.rawText.value = text;
        onAddClick();
    }
    function setupLibPicker() {
        if (!els.libHost || typeof LibPicker === 'undefined') return;
        libPicker = LibPicker.mount(els.libHost, { placeholder: 'Search DNA Library…' });
    }
    function libraryEntryBytes(id) {
        if (!id || typeof DnaLib === 'undefined' || !geneTable) return null;
        const hit = DnaLib.findEntry(id);
        if (!hit) return null;
        try {
            const genome = Genome.parseGenomeText(hit.entry.dnaText);
            return { bytes: Genome.encodeGenome(geneTable, genome, undefined), name: hit.entry.name };
        } catch (e) { return null; }
    }
    function onLibraryAddClick() {
        const id = libPicker ? libPicker.get() : null;
        const hit = libraryEntryBytes(id);
        if (!hit) { Toast.toast('Pick a library entry first.', 'bad'); return; }
        addGenomeToVat(hit.bytes, 'Bio-Hacker vat: added ' + hit.name);
    }
    function renderPresetSelect(select) {
        if (!select) return;
        const prev = select.value;
        select.innerHTML = '';
        for (const name of presetNames) {
            const o = document.createElement('option');
            o.value = name; o.textContent = name;
            select.appendChild(o);
        }
        if (presetNames.includes(prev)) select.value = prev;
    }
    function onPopAddClick() {
        const name = els.popSelect && els.popSelect.value;
        if (!name || !popTable) return;
        const vat = effectiveVat();
        const next = BioVat.addPopulation(vat, geneTable, popTable, name);
        const delta = BioVat.diffCount(vat, next);
        if (!delta) { Toast.toast('Nothing new — the vat already covers ' + name + '.', 'info'); return; }
        commitVat(next, 'Bio-Hacker vat: added population ' + name + ' (+' + delta + ' bases)');
    }
    function populateLocationSelect(select, withCounts) {
        if (!select || !doc) return;
        let counts = null;
        if (withCounts) {
            counts = new Map();
            for (const h of liveHorses()) {
                if (h.container !== 'stabled') continue;
                counts.set(h.locationIndex, (counts.get(h.locationIndex) || 0) + 1);
            }
        }
        const prev = select.value;
        select.innerHTML = '';
        doc.state.locations.forEach((loc, li) => {
            const o = document.createElement('option');
            o.value = String(li);
            o.textContent = locationLabel(doc, loc) + (counts ? ' (' + (counts.get(li) || 0) + ')' : '');
            select.appendChild(o);
        });
        if ([...select.options].some((o) => o.value === prev)) select.value = prev;
    }
    async function addHorsesToVat(horses, label) {
        if (!horses.length) return;
        const vat = effectiveVat();
        let next = vat;
        for (const h of horses) next = BioVat.addGenome(next, geneTable, effGenomeBytes(doc, h.genomeOff));
        const delta = BioVat.diffCount(vat, next);
        if (!delta) { Toast.toast('Nothing new — every base was already set.', 'info'); return; }
        await commitVat(next, label + ' (+' + delta + ' bases)');
    }
    function onAddFocusedHorse() {
        const ref = (typeof App !== 'undefined' && App.focus && App.focus.kind === 'horse') ? App.focus.ref : null;
        const h = ref && liveHorses().find((x) => x.detailOff === ref.detailOff);
        if (!h) { Toast.toast('No horse is selected. Select one in Horses or World first.', 'bad'); return; }
        addHorsesToVat([h], 'Bio-Hacker vat: added ' + horseDisplayName(h));
    }
    function onAddLocationStabled() {
        const li = els.locationSelect ? Number(els.locationSelect.value) : NaN;
        const loc = doc && doc.state.locations[li];
        if (!loc) return;
        const horses = liveHorses().filter((h) => h.container === 'stabled' && h.locationIndex === li);
        if (!horses.length) { Toast.toast('No stabled horses at ' + locationLabel(doc, loc) + '.', 'info'); return; }
        addHorsesToVat(horses, 'Bio-Hacker vat: added ' + horses.length + ' horse' + (horses.length === 1 ? '' : 's') + ' from ' + locationLabel(doc, loc));
    }
    function onAddAllMapHorses() {
        const horses = liveHorses().filter((h) => h.container === 'map');
        if (!horses.length) { Toast.toast('No horses are on the map.', 'info'); return; }
        addHorsesToVat(horses, 'Bio-Hacker vat: added ' + horses.length + ' on-map horse' + (horses.length === 1 ? '' : 's'));
    }
    function doGenerate() {
        if (!geneTable) return;
        const vat = effectiveVat();
        const res = BioVat.sample(vat, geneTable, { rng: Math.random });
        let bytes = res.bytes;
        let legalizeNote = '';
        if (els.legalizeCb && els.legalizeCb.checked && els.legalizePop && els.legalizePop.value && popTable) {
            const leg = PopData.legalizeBytes(geneTable, popTable, els.legalizePop.value, bytes);
            bytes = leg.bytes;
            if (leg.changed) legalizeNote = ', legalized ' + leg.changed + ' allele' + (leg.changed === 1 ? '' : 's');
        }
        lastGenerated = { bytes, emptyGenes: res.emptyGenes };
        if (previewApi) previewApi.refresh();
        renderGenTargets();
        Toast.toast('Generated a genome' +
            (res.emptyGenes ? ' (' + res.emptyGenes + ' empty gene' + (res.emptyGenes === 1 ? '' : 's') + ' kept the current allele)' : '') +
            legalizeNote + '.', 'ok');
    }
    function onGenToScratch() {
        if (!lastGenerated || typeof GenomeWorkspace === 'undefined') return;
        GenomeWorkspace.loadScratch(lastGenerated.bytes, 'Generated from the Bio-Hacker vat');
        if (typeof switchWorkspace === 'function') switchWorkspace('genome');
        Toast.toast('Sent to Genome — Scratch.', 'ok');
    }
    function onGenToSelectedHorse() {
        if (!lastGenerated || !doc) return;
        const ref = (typeof App !== 'undefined' && App.focus && App.focus.kind === 'horse') ? App.focus.ref : null;
        const h = ref && liveHorses().find((x) => x.detailOff === ref.detailOff);
        if (!h) { Toast.toast('No horse is selected.', 'bad'); return; }
        const name = horseDisplayName(h);
        doc.setGenomeBytes(h.genomeOff, lastGenerated.bytes,
            'Bio-Hacker: wrote a generated genome to ' + (name === '(unnamed horse)' ? 'a horse' : name));
        Toast.toast('Wrote the generated genome to ' + name + '.', 'ok');
    }
    function onGenToNewHorse() {
        if (!lastGenerated || !doc) return;
        const li = els.genLocationSelect ? Number(els.genLocationSelect.value) : NaN;
        const loc = doc.state.locations[li];
        if (!loc) return;
        let offs;
        try { offs = doc.addStabledHorses(loc.nameOffset, [{ genome: lastGenerated.bytes }]); }
        catch (e) { Modal.alertModal(e.message, 'Could not add a horse'); return; }
        Toast.toast('Added a horse to ' + locationLabel(doc, loc) + ' with the generated genome.', 'ok');
    }
    async function onGenToLibrary() {
        if (!lastGenerated || !geneTable) return;
        const catId = els.genCategorySelect && els.genCategorySelect.value;
        const n = Math.max(1, Math.min(50, parseInt(els.genCount && els.genCount.value, 10) || 1));
        if (!catId || typeof DnaLib === 'undefined') { Toast.toast('Pick a library category first.', 'bad'); return; }
        const baseName = subject.kind === 'save' ? 'Bio-Hacker vat' : 'Scratch vat';
        const vat = effectiveVat();
        const items = [];
        for (let i = 0; i < n; i++) {
            const res = BioVat.sample(vat, geneTable, { rng: Math.random });
            const genome = Genome.decodeGenome(geneTable, res.bytes);
            items.push({ name: baseName + ' ' + (i + 1), dnaText: Genome.formatGenomeText(genome) });
        }
        try { DnaLib.addEntries(catId, items); }
        catch (e) { Modal.alertModal(e.message, 'Could not save to the Library'); return; }
        Toast.toast('Saved ' + n + ' genome' + (n === 1 ? '' : 's') + ' to the Library.', 'ok');
    }
    function renderGenTargets() {
        const have = !!lastGenerated;
        if (els.genScratchBtn) els.genScratchBtn.disabled = !have || typeof GenomeWorkspace === 'undefined';
        const ref = (typeof App !== 'undefined' && App.focus && App.focus.kind === 'horse') ? App.focus.ref : null;
        const focusedHorse = ref && liveHorses().find((x) => x.detailOff === ref.detailOff);
        if (els.genHorseBtn) {
            els.genHorseBtn.disabled = !have || !focusedHorse;
            els.genHorseBtn.title = focusedHorse ? 'Write to ' + horseDisplayName(focusedHorse) : 'No horse is selected';
        }
        const canAddHorse = !!doc && doc.state.locationWalkOk && !!(typeof SaveFile !== 'undefined' && SaveFile.findStabledDonor(doc.state));
        if (els.genLocationSelect) populateLocationSelect(els.genLocationSelect, false);
        if (els.genNewHorseBtn) {
            els.genNewHorseBtn.disabled = !have || !canAddHorse;
            els.genNewHorseBtn.title = canAddHorse ? '' : 'This save has no plain stabled horse to clone from, or its location data couldn’t be read.';
        }
        renderLibraryCategorySelect();
        if (els.genLibraryBtn) els.genLibraryBtn.disabled = !have || !(typeof DnaLib !== 'undefined' && els.genCategorySelect && els.genCategorySelect.value);
    }
    function renderLibraryCategorySelect() {
        if (!els.genCategorySelect || typeof DnaLib === 'undefined') return;
        const cats = DnaLib.all();
        const prev = els.genCategorySelect.value;
        els.genCategorySelect.innerHTML = '';
        for (const c of cats) {
            const o = document.createElement('option');
            o.value = c.id; o.textContent = c.name;
            els.genCategorySelect.appendChild(o);
        }
        if (cats.some((c) => c.id === prev)) els.genCategorySelect.value = prev;
    }
    function profilesAll() { return (typeof BioProfiles !== 'undefined') ? BioProfiles.all() : []; }
    function selectProfile(id) {
        selectedProfileId = id;
        const p = BioProfiles.get(id);
        if (p && geneTable) {
            let vat = null;
            try { vat = BioVat.fromLetters(p.bases, geneTable); }
            catch (e) { Toast.toast('That profile is corrupted and could not be loaded.', 'bad'); }
            if (vat) commitVat(vat, 'Bio-Hacker vat: loaded profile ' + p.name);
        }
        renderAll();
    }
    function moveProfile(id, dir) {
        const list = profilesAll();
        const idx = list.findIndex((p) => p.id === id);
        if (idx === -1) return;
        const targetIdx = idx + dir;
        if (targetIdx < 0 || targetIdx >= list.length) return;
        const beforeId = dir < 0 ? list[targetIdx].id : (targetIdx + 1 < list.length ? list[targetIdx + 1].id : null);
        BioProfiles.move(id, beforeId);
    }
    function renderProfilesList() {
        if (!els.profilesList) return;
        const list = profilesAll();
        if (selectedProfileId && !list.some((p) => p.id === selectedProfileId)) selectedProfileId = null;
        els.profilesList.innerHTML = '';
        for (const p of list) {
            const row = document.createElement('div');
            row.className = 'bh-profile-row' + (p.id === selectedProfileId ? ' selected' : '');
            row.dataset.id = p.id;
            row.tabIndex = 0;
            const handle = document.createElement('span');
            handle.className = 'bh-profile-handle';
            handle.textContent = p.builtin ? '★' : '⠿';
            row.appendChild(handle);
            const name = document.createElement('span');
            name.className = 'bh-profile-name';
            name.textContent = p.name;
            row.appendChild(name);
            const count = document.createElement('span');
            count.className = 'bh-profile-count';
            count.textContent = String(BioProfiles.cellCount(p.bases));
            row.appendChild(count);
            row.addEventListener('click', () => selectProfile(p.id));
            row.addEventListener('keydown', (e) => {
                if (!e.altKey || p.builtin) return;
                if (e.key === 'ArrowUp') { e.preventDefault(); moveProfile(p.id, -1); }
                else if (e.key === 'ArrowDown') { e.preventDefault(); moveProfile(p.id, 1); }
            });
            if (!p.builtin) {
                row.draggable = true;
                row.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', p.id);
                    row.classList.add('dragging');
                });
                row.addEventListener('dragend', () => row.classList.remove('dragging'));
            }
            row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drop-before'); });
            row.addEventListener('dragleave', () => row.classList.remove('drop-before'));
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                row.classList.remove('drop-before');
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId && draggedId !== p.id) BioProfiles.move(draggedId, p.id);
            });
            els.profilesList.appendChild(row);
        }
        updateProfileActionState();
    }
    function updateProfileActionState() {
        const p = selectedProfileId ? BioProfiles.get(selectedProfileId) : null;
        const isBuiltin = !!(p && p.builtin);
        if (els.profileUpdateBtn) els.profileUpdateBtn.disabled = !p || isBuiltin;
        if (els.profileRenameBtn) els.profileRenameBtn.disabled = !p || isBuiltin;
        if (els.profileDeleteBtn) els.profileDeleteBtn.disabled = !p || isBuiltin;
        if (els.profileDupBtn) els.profileDupBtn.disabled = !p;
    }
    async function onProfileSaveAs() {
        if (!geneTable) return;
        const vat = effectiveVat();
        const name = await Modal.promptModal('Name this profile:', '', { title: 'Save as profile' });
        if (!name || !name.trim()) return;
        let p;
        try { p = BioProfiles.create(name.trim(), BioVat.toLetters(vat, geneTable)); }
        catch (e) { Modal.alertModal(e.message, 'Could not save'); return; }
        selectedProfileId = p.id;
        renderProfilesList();
        Toast.toast('Saved profile "' + p.name + '".', 'ok');
    }
    async function onProfileUpdate() {
        const p = selectedProfileId && BioProfiles.get(selectedProfileId);
        if (!p || p.builtin || !geneTable) return;
        const vat = effectiveVat();
        let before;
        try { before = BioVat.fromLetters(p.bases, geneTable); } catch (e) { before = BioVat.empty(); }
        const delta = BioVat.diffCount(before, vat);
        if (!delta) { Toast.toast('No difference to update.', 'info'); return; }
        const ok = await Modal.confirmModal('Overwrite "' + p.name + '" — ' + delta + ' cell' + (delta === 1 ? '' : 's') + ' differ?',
            { title: 'Update profile', confirmLabel: 'Update' });
        if (!ok) return;
        BioProfiles.update(p.id, BioVat.toLetters(vat, geneTable));
        renderProfilesList();
        Toast.toast('Updated "' + p.name + '".', 'ok');
    }
    async function onProfileRename() {
        const p = selectedProfileId && BioProfiles.get(selectedProfileId);
        if (!p || p.builtin) return;
        const name = await Modal.promptModal('Rename profile:', p.name, { title: 'Rename profile' });
        if (!name || !name.trim() || name.trim() === p.name) return;
        BioProfiles.rename(p.id, name.trim());
        renderProfilesList();
    }
    function onProfileDuplicate() {
        const p = selectedProfileId && BioProfiles.get(selectedProfileId);
        if (!p) return;
        const dup = BioProfiles.duplicate(p.id);
        if (dup) { selectedProfileId = dup.id; renderProfilesList(); Toast.toast('Duplicated as "' + dup.name + '".', 'ok'); }
    }
    async function onProfileDelete() {
        const p = selectedProfileId && BioProfiles.get(selectedProfileId);
        if (!p || p.builtin) return;
        const ok = await Modal.confirmModal('Delete profile "' + p.name + '"?', { title: 'Delete profile', confirmLabel: 'Delete' });
        if (!ok) return;
        BioProfiles.remove(p.id);
        selectedProfileId = null;
        renderProfilesList();
    }
    function onProfileExport() {
        const text = BioProfiles.exportJson();
        const blob = new Blob([text], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = BioProfiles.EXPORT_FILENAME;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }
    async function onProfileImportChange() {
        const file = els.profileImportFile && els.profileImportFile.files[0];
        if (!file) return;
        const text = await file.text();
        try {
            const res = BioProfiles.importJson(text);
            Toast.toast('Imported ' + res.profiles + ' profile' + (res.profiles === 1 ? '' : 's') + '.', 'ok');
        } catch (e) { Modal.alertModal(e.message, 'Import failed'); }
        els.profileImportFile.value = '';
    }
    function renderSubjectOptions() {
        if (!els.subjectSelect) return;
        const reason = doc && typeof BioVat !== 'undefined' ? BioVat.unavailableReason(doc) : 'No save is loaded.';
        const saveOpt = els.subjectSelect.options[1];
        if (saveOpt) { saveOpt.disabled = !!reason; saveOpt.title = reason || ''; }
        if (subject.kind === 'save' && reason) subject = { kind: 'scratch' };
        els.subjectSelect.value = subject.kind;
        els.subjectSelect.title = (subject.kind === 'save' && reason) ? reason : '';
        if (els.writeBadge) els.writeBadge.hidden = subject.kind !== 'save';
    }
    function onSubjectChange() {
        const val = els.subjectSelect.value;
        if (val === 'save' && !saveAvailable()) { els.subjectSelect.value = subject.kind; return; }
        subject = { kind: val === 'save' ? 'save' : 'scratch' };
        renderAll();
    }
    function updateHeader() {
        if (!geneTable || typeof BioVat === 'undefined') return;
        const vat = effectiveVat();
        const stats = BioVat.stats(vat);
        if (els.cellCount) els.cellCount.textContent = stats.cells + '/' + BioVat.CELLS;
        if (els.partialBadge) {
            if (stats.isPartial) {
                els.partialBadge.hidden = false;
                els.partialBadge.innerHTML = '';
                const span = document.createElement('span');
                span.textContent = '⚠ partial — ' + stats.emptyGenes + ' empty gene' + (stats.emptyGenes === 1 ? '' : 's');
                const btn = document.createElement('button');
                btn.className = 'btn';
                btn.textContent = 'Fill empty genes';
                btn.addEventListener('click', fillEmptyGenes);
                els.partialBadge.appendChild(span);
                els.partialBadge.appendChild(btn);
            } else {
                els.partialBadge.hidden = true;
            }
        }
    }
    function renderAddFromHorsesState() {
        const has = !!doc;
        if (els.addFocusedBtn) els.addFocusedBtn.disabled = !has;
        if (els.addLocationBtn) els.addLocationBtn.disabled = !has;
        if (els.addAllMapBtn) els.addAllMapBtn.disabled = !has;
        if (has) populateLocationSelect(els.locationSelect, true);
    }
    function render() {
        if (!inited) return;
        renderSubjectOptions();
        if (!rowsBuilt && geneTable) buildTableRows();
        updateTableClasses();
        updateHeader();
        renderAddFromHorsesState();
        renderGenTargets();
        if (previewApi) previewApi.refresh();
        renderProfilesList();
    }
    function renderAll() { render(); }
    const BH_CENTER_MIN = 420;
    const BH_HANDLE_W = 6;
    function bhViewportOk() { return window.innerWidth >= 1280; }
    function boundedMax(container, absCap, computeReal) {
        return container.clientWidth ? Math.min(absCap, computeReal()) : absCap;
    }
    function setupSplitters() {
        if (typeof Splitter === 'undefined') return;
        const body = document.getElementById('bhBody');
        if (!body) return;
        bhLeftSplitter = Splitter.attach({
            handle: '#bhLeftHandle',
            container: body,
            cssVar: '--bh-left-w',
            side: 'left',
            min: 240,
            max: () => boundedMax(body, 480, () => body.clientWidth - (bhRightSplitter ? bhRightSplitter.get() : 280) - BH_CENTER_MIN - BH_HANDLE_W * 2),
            defaultWidth: 280,
            storageKey: 'horsey_studio_biohack_left_w',
            enabled: bhViewportOk
        });
        bhRightSplitter = Splitter.attach({
            handle: '#bhRightHandle',
            container: body,
            cssVar: '--bh-right-w',
            side: 'right',
            min: 220,
            max: () => boundedMax(body, 420, () => body.clientWidth - (bhLeftSplitter ? bhLeftSplitter.get() : 280) - BH_CENTER_MIN - BH_HANDLE_W * 2),
            defaultWidth: 280,
            storageKey: 'horsey_studio_biohack_right_w',
            enabled: bhViewportOk
        });
    }
    function cacheEls() {
        els.subjectSelect = document.getElementById('bhSubjectSelect');
        els.writeBadge = document.getElementById('bhWriteBadge');
        els.cellCount = document.getElementById('bhCellCount');
        els.partialBadge = document.getElementById('bhPartialBadge');
        els.search = document.getElementById('bhSearch');
        els.filterLE1 = document.getElementById('bhFilterLE1');
        els.filterDiffers = document.getElementById('bhFilterDiffers');
        els.rawText = document.getElementById('bhRawText');
        els.warnings = document.getElementById('bhWarnings');
        els.pasteAddBtn = document.getElementById('bhPasteAddBtn');
        els.addBtn = document.getElementById('bhAddBtn');
        els.removeBtn = document.getElementById('bhRemoveBtn');
        els.libHost = document.getElementById('bhLibHost');
        els.libAddBtn = document.getElementById('bhLibAddBtn');
        els.popSelect = document.getElementById('bhPopSelect');
        els.popAddBtn = document.getElementById('bhPopAddBtn');
        els.addFocusedBtn = document.getElementById('bhAddFocusedBtn');
        els.locationSelect = document.getElementById('bhLocationSelect');
        els.addLocationBtn = document.getElementById('bhAddLocationBtn');
        els.addAllMapBtn = document.getElementById('bhAddAllMapBtn');
        els.legalizeCb = document.getElementById('bhLegalizeCb');
        els.legalizePop = document.getElementById('bhLegalizePop');
        els.generateBtn = document.getElementById('bhGenerateBtn');
        els.genScratchBtn = document.getElementById('bhGenScratchBtn');
        els.genHorseBtn = document.getElementById('bhGenHorseBtn');
        els.genLocationSelect = document.getElementById('bhGenLocationSelect');
        els.genNewHorseBtn = document.getElementById('bhGenNewHorseBtn');
        els.genCategorySelect = document.getElementById('bhGenCategorySelect');
        els.genCount = document.getElementById('bhGenCount');
        els.genLibraryBtn = document.getElementById('bhGenLibraryBtn');
        els.clearBtn = document.getElementById('bhClearBtn');
        els.tableBody = document.getElementById('bhTableBody');
        els.profilesList = document.getElementById('bhProfilesList');
        els.profileSaveBtn = document.getElementById('bhProfileSaveBtn');
        els.profileUpdateBtn = document.getElementById('bhProfileUpdateBtn');
        els.profileRenameBtn = document.getElementById('bhProfileRenameBtn');
        els.profileDupBtn = document.getElementById('bhProfileDupBtn');
        els.profileDeleteBtn = document.getElementById('bhProfileDeleteBtn');
        els.profileExportBtn = document.getElementById('bhProfileExportBtn');
        els.profileImportBtn = document.getElementById('bhProfileImportBtn');
        els.profileImportFile = document.getElementById('bhProfileImportFile');
        els.previewBox = document.getElementById('bhPreviewBox');
        els.previewBg = document.getElementById('bhPreviewBg');
    }
    function loadGeneData() {
        if (typeof GameData === 'undefined') return;
        GameData.load().then(applyGameData).catch((e) => console.error('Biohacker: failed to load gene data', e));
        GameData.onChange(applyGameData);
    }
    function applyGameData(d) {
        geneTable = d.geneTable; popTable = d.popTable; presetNames = d.presetNames;
        rowsBuilt = false;
        renderPresetSelect(els.popSelect);
        renderPresetSelect(els.legalizePop);
        render();
    }
    function init(pane) {
        if (inited) return;
        paneEl = pane;
        cacheEls();
        if (!els.subjectSelect) return;
        inited = true;
        els.subjectSelect.addEventListener('change', onSubjectChange);
        els.search.addEventListener('input', () => { filters.search = els.search.value; updateTableClasses(); });
        els.filterLE1.addEventListener('change', () => { filters.le1 = els.filterLE1.checked; updateTableClasses(); });
        els.filterDiffers.addEventListener('change', () => {
            filters.differs = els.filterDiffers.checked;
            if (filters.differs && !selectedProfileId) {
                Toast.toast('Select a profile on the right first.', 'info');
                els.filterDiffers.checked = false;
                filters.differs = false;
            }
            updateTableClasses();
        });
        els.pasteAddBtn.addEventListener('click', onPasteAddClick);
        els.addBtn.addEventListener('click', onAddClick);
        els.removeBtn.addEventListener('click', onRemoveClick);
        els.libAddBtn.addEventListener('click', onLibraryAddClick);
        els.popAddBtn.addEventListener('click', onPopAddClick);
        els.addFocusedBtn.addEventListener('click', onAddFocusedHorse);
        els.addLocationBtn.addEventListener('click', onAddLocationStabled);
        els.addAllMapBtn.addEventListener('click', onAddAllMapHorses);
        els.generateBtn.addEventListener('click', doGenerate);
        els.genScratchBtn.addEventListener('click', onGenToScratch);
        els.genHorseBtn.addEventListener('click', onGenToSelectedHorse);
        els.genNewHorseBtn.addEventListener('click', onGenToNewHorse);
        els.genLibraryBtn.addEventListener('click', onGenToLibrary);
        els.genCategorySelect.addEventListener('change', renderGenTargets);
        els.clearBtn.addEventListener('click', clearVat);
        els.tableBody.addEventListener('click', onTableClick);
        els.profileSaveBtn.addEventListener('click', onProfileSaveAs);
        els.profileUpdateBtn.addEventListener('click', onProfileUpdate);
        els.profileRenameBtn.addEventListener('click', onProfileRename);
        els.profileDupBtn.addEventListener('click', onProfileDuplicate);
        els.profileDeleteBtn.addEventListener('click', onProfileDelete);
        els.profileExportBtn.addEventListener('click', onProfileExport);
        els.profileImportBtn.addEventListener('click', () => els.profileImportFile.click());
        els.profileImportFile.addEventListener('change', onProfileImportChange);
        setupLibPicker();
        if (typeof HorsePreview !== 'undefined') {
            previewApi = HorsePreview.mount(els.previewBox, { getBytes: () => (lastGenerated ? lastGenerated.bytes : null) });
            HorsePreview.attachBg({ bar: els.previewBg, target: els.previewBox });
        }
        if (typeof BioProfiles !== 'undefined') {
            unsubscribeProfiles = BioProfiles.onChange(() => renderProfilesList());
        }
        if (typeof DnaLib !== 'undefined') {
            unsubscribeDnaLib = DnaLib.onChange(() => { if (libPicker) libPicker.refresh(); renderLibraryCategorySelect(); });
        }
        loadGeneData();
        setupSplitters();
        render();
    }
    function onDocLoaded(newDoc) {
        doc = newDoc;
        if (doc) {
            doc.bus.on('doc:changed', () => render());
            doc.bus.on('doc:rebased', () => render());
        }
        if (!saveAvailable() && subject.kind === 'save') subject = { kind: 'scratch' };
        render();
    }
    function onActivate() {
        render();
        if (bhLeftSplitter) bhLeftSplitter.clamp();
        if (bhRightSplitter) bhRightSplitter.clamp();
    }
    return { init, onDocLoaded, onActivate, isScratchSubject, doUndo, doRedo, canUndo, canRedo };
})();
