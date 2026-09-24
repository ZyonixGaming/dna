'use strict';
const GenomeWorkspace = (function () {
    const GENE_PROFILES = {
        legwheels: {
            label: 'Leg Wheels',
            describe: 'rotating leg and arm joints, round legs, no feet',
            ops: [
                { gene: 'LEG_JOINT_TYPE', value: 1 },
                { gene: 'ARM_JOINT_TYPE', value: 1 },
                { gene: 'LEG_TAG', value: 1 },
                { gene: 'ARM_TAG', value: 1 },
                { gene: 'LEG_TYPE', value: 1, ifEquals: 0 },
                { gene: 'LEG_IS_CIRCLE', value: 1 },
                { gene: 'FOOT_IS_CIRCLE', value: 0, affectsLit: false },
                { gene: 'LEG_HAS_FOOT', value: 0, affectsLit: false },
                { gene: 'HAS_FOOT', value: 0, affectsLit: false }
            ]
        },
        healthy: {
            label: 'Healthy',
            describe: 'long-lived, flu-immune, big litters, no ailments',
            ops: [
                { gene: 'OLD_AGE', value: 2 },
                { gene: 'FLU_IMMUNITY', value: 1 },
                { gene: 'LITTER_SIZE', value: 5 },
                { gene: 'NARCOLEPSY', value: 0 },
                { gene: 'BRAIN_SPASTIC', value: 0 },
                { gene: 'LIMP', value: 0 },
                { gene: 'MUSCLE_USE', value: 100 },
                { gene: 'BREAK_FORCE', value: 0 },
                { gene: 'WHITE_IS_LETHAL', value: 0 },
                { gene: 'LEG_AND_ARM_LIMP', value: 0 },
                { gene: 'EAR_SIZE', atLeast: 20 },
                { gene: 'NOSE_SIZE', atLeast: 10 },
                { gene: 'SPEED_FACTOR', value: 133 }
            ]
        },
        carnivore: {
            label: 'Carnivore',
            describe: 'meat teeth, not omnivorous, has a mouth',
            ops: [
                { gene: 'TEETH_SHAPE', value: 3 },
                { gene: 'OMNIVORE', value: 0 },
                { gene: 'HAS_MOUTH', value: 1 }
            ]
        },
        herbivore: {
            label: 'Herbivore',
            describe: 'non-meat teeth (0-2), not omnivorous, has a mouth',
            ops: [
                { gene: 'TEETH_SHAPE', value: 0, ifEquals: 3 },
                { gene: 'OMNIVORE', value: 0 },
                { gene: 'HAS_MOUTH', value: 1 }
            ]
        },
        omnivore: {
            label: 'Omnivore',
            describe: 'omnivorous, has a mouth',
            ops: [
                { gene: 'OMNIVORE', value: 1 },
                { gene: 'HAS_MOUTH', value: 1 }
            ]
        },
        nomouth: {
            label: 'No Mouth',
            describe: 'no mouth at all',
            ops: [{ gene: 'HAS_MOUTH', value: 0 }]
        }
    };
    const MOD_BUTTONS = [
        { id: 'undo', icon: '↩️', label: 'Revert' },
        { id: 'redo', icon: '↪️', label: 'Redo' },
        { id: 'legwheels', icon: '🛞', label: 'Leg Wheels', profile: 'legwheels' },
        { id: 'healthy', icon: '❤️', label: 'Healthy', profile: 'healthy' },
        { id: 'carnivore', icon: '🥩', label: 'Carnivore', profile: 'carnivore' },
        { id: 'herbivore', icon: '🌿', label: 'Herbivore', profile: 'herbivore' },
        { id: 'omnivore', icon: '🍽️', label: 'Omnivore', profile: 'omnivore' },
        { id: 'nomouth', icon: '🚫', label: 'No Mouth', profile: 'nomouth' },
        { id: 'homozygous', icon: '👥', label: 'Homozyg' },
        { id: 'randomize', icon: '🎰', label: 'Randomize' }
    ];
    const BASES = ['A', 'C', 'G', 'T'];
    let doc = null;
    let geneTable = null;
    let geneByDesc = null;
    let popTable = null;
    let presetNames = [];
    let dataReady = false;
    let inited = false;
    let paneEl = null;
    const els = {};
    let subject = { kind: 'scratch' };
    let scratchGenome = null;
    const scratchUndo = { stack: [], redo: [] };
    let compare = null;
    let diffOnly = false;
    let searchText = '';
    let library = null;
    let pop = null;
    let oddsPopName = null;
    let editMode = 'pair';
    function readByte(offset) { return doc.patches.has(offset) ? doc.patches.get(offset) : doc.state.bytes[offset]; }
    function currentHorse() { return (subject.kind === 'horse' && doc) ? doc.state.horses[subject.idx] : null; }
    function currentItem() {
        if (subject.kind !== 'item' || !doc) return null;
        const all = SaveFile.buildItemIndex(doc.state);
        let ord = 0;
        for (const it of all) {
            if (it.container !== subject.container) continue;
            if (subject.container === 'interior' && it.locationIndex !== subject.locationIndex) continue;
            if (ord === subject.ordinal) return it;
            ord++;
        }
        return null;
    }
    function itemOrdinalIn(all, entry) {
        let ord = 0;
        for (const it of all) {
            if (it.container !== entry.container) continue;
            if (entry.container === 'interior' && it.locationIndex !== entry.locationIndex) continue;
            if (it.start === entry.start) return ord;
            ord++;
        }
        return -1;
    }
    function currentSubjectGenomeOff() {
        if (subject.kind === 'horse') { const h = currentHorse(); return h ? h.genomeOff : null; }
        if (subject.kind === 'item') { const it = currentItem(); return it ? it.genomeOff : null; }
        return null;
    }
    function currentBytes() {
        if (subject.kind === 'horse' || subject.kind === 'item') {
            const off = currentSubjectGenomeOff();
            const out = new Uint8Array(SaveFile.GENOME_LEN);
            if (off === null) return out;
            for (let i = 0; i < SaveFile.GENOME_LEN; i++) out[i] = readByte(off + i);
            return out;
        }
        return scratchGenome ? scratchGenome.slice() : new Uint8Array(SaveFile.GENOME_LEN);
    }
    function pushScratchUndo() {
        scratchUndo.stack.push(scratchGenome.slice());
        scratchUndo.redo.length = 0;
        if (scratchUndo.stack.length > 60) scratchUndo.stack.shift();
    }
    function commitGenomeBatch(writes, label) {
        if (!writes.size) return false;
        const NO_PATCH = Symbol('no-patch');
        const prevPatch = new Map();
        const origByte = new Map();
        for (const offset of writes.keys()) {
            prevPatch.set(offset, doc.patches.has(offset) ? doc.patches.get(offset) : NO_PATCH);
            origByte.set(offset, doc.state.bytes[offset]);
        }
        const applyValues = (getValue) => {
            for (const offset of writes.keys()) {
                const v = getValue(offset);
                if (v === origByte.get(offset)) doc.patches.delete(offset);
                else doc.patches.set(offset, v);
            }
            doc._touched();
        };
        applyValues((offset) => writes.get(offset));
        doc.history.push({
            label: label || ('genome batch (' + writes.size + ')'),
            undo: () => applyValues((offset) => { const p = prevPatch.get(offset); return p === NO_PATCH ? origByte.get(offset) : p; }),
            redo: () => applyValues((offset) => writes.get(offset))
        });
        return true;
    }
    function commitSingleByte(rawId, newByte) {
        if (subject.kind === 'horse' || subject.kind === 'item') {
            const off = currentSubjectGenomeOff();
            if (off === null) return;
            doc.setByte(off + rawId, newByte);
            if (isPaneActive()) renderAll();
        } else {
            pushScratchUndo();
            scratchGenome[rawId] = newByte;
            renderAll();
        }
    }
    function commitBytes(newBytes, label) {
        if (subject.kind === 'horse' || subject.kind === 'item') {
            const off = currentSubjectGenomeOff();
            if (off === null) return false;
            const writes = new Map();
            for (let i = 0; i < SaveFile.GENOME_LEN; i++) {
                const offset = off + i;
                const cur = readByte(offset);
                if (newBytes[i] !== cur) writes.set(offset, newBytes[i]);
            }
            const applied = commitGenomeBatch(writes, label);
            if (isPaneActive()) renderAll();
            return applied;
        }
        pushScratchUndo();
        scratchGenome = Uint8Array.from(newBytes);
        renderAll();
        return true;
    }
    function isDocSubject() { return subject.kind === 'horse' || subject.kind === 'item'; }
    function isScratchSubject() { return subject.kind === 'scratch'; }
    function canUndo() { return isDocSubject() ? !!(doc && doc.history.canUndo) : scratchUndo.stack.length > 0; }
    function canRedo() { return isDocSubject() ? !!(doc && doc.history.canRedo) : scratchUndo.redo.length > 0; }
    function doUndo() {
        if (isDocSubject()) { if (doc) doc.undo(); return; }
        if (!scratchUndo.stack.length) return;
        scratchUndo.redo.push(scratchGenome.slice());
        scratchGenome = scratchUndo.stack.pop();
        renderAll();
    }
    function doRedo() {
        if (isDocSubject()) { if (doc) doc.redo(); return; }
        if (!scratchUndo.redo.length) return;
        scratchUndo.stack.push(scratchGenome.slice());
        scratchGenome = scratchUndo.redo.pop();
        renderAll();
    }
    function getCombosForGene(gene) {
        if (gene._combos) return gene._combos;
        const prio = gene.n;
        const combos = [];
        for (let idx1 = 0; idx1 < 4; idx1++) {
            for (let idx2 = idx1; idx2 < 4; idx2++) {
                combos.push({ pairStr: prio[idx1] + prio[idx2], value: gene.valueMatrix[idx1][idx2], allele1: prio[idx1], allele2: prio[idx2], idx1, idx2 });
            }
        }
        combos.sort((a, b) => b.value - a.value || prio.indexOf(a.allele1) - prio.indexOf(b.allele1) || prio.indexOf(a.allele2) - prio.indexOf(b.allele2));
        gene._combos = combos;
        return combos;
    }
    function geneValueFromBytes(bytes, desc) {
        const gene = geneByDesc.get(desc);
        if (!gene) return null;
        return Genome.byteToValue(gene, bytes[gene.id]);
    }
    function isOpSatisfied(bytes, op) {
        const cur = geneValueFromBytes(bytes, op.gene);
        if (cur === null || cur === undefined) return true;
        if (op.atLeast !== undefined) return cur >= op.atLeast;
        if (op.ifEquals !== undefined) return cur !== op.ifEquals;
        return cur === op.value;
    }
    function isProfileSatisfied(bytes, profile) {
        return profile.ops.filter((op) => op.affectsLit !== false).every((op) => isOpSatisfied(bytes, op));
    }
    function setGeneToValueInBytes(bytes, desc, target) {
        const gene = geneByDesc.get(desc);
        if (!gene) return { ok: false, reason: 'unknown gene ' + desc };
        const curByte = bytes[gene.id];
        const curPair = Genome.byteToPair(gene, curByte);
        const matches = getCombosForGene(gene).filter((c) => c.value === target);
        if (!matches.length) return { ok: false, reason: desc + ' cannot express ' + target };
        let best = matches[0], bestShared = -1;
        for (const c of matches) {
            let shared = 0;
            if (curPair) {
                if (c.allele1 === curPair[0] || c.allele1 === curPair[1]) shared++;
                if (c.allele2 === curPair[0] || c.allele2 === curPair[1]) shared++;
            }
            if (shared > bestShared) { bestShared = shared; best = c; }
        }
        const newByte = Genome.pairToByte(gene, best.allele1 + best.allele2);
        const changed = newByte !== curByte;
        bytes[gene.id] = newByte;
        return { ok: true, changed };
    }
    function applyGeneProfileToBytes(bytes, key) {
        const profile = GENE_PROFILES[key];
        if (!profile) return null;
        let changed = 0;
        const failures = [];
        for (const op of profile.ops) {
            if (isOpSatisfied(bytes, op)) continue;
            const target = op.atLeast !== undefined ? op.atLeast : op.value;
            const res = setGeneToValueInBytes(bytes, op.gene, target);
            if (!res.ok) failures.push(res.reason);
            else if (res.changed) changed++;
        }
        return { changed, failures, label: profile.label };
    }
    function isGenomeHomozygousBytes(bytes) {
        for (let id = 0; id < SaveFile.GENOME_LEN; id++) {
            const gene = geneTable.get(id);
            const pair = Genome.byteToPair(gene, bytes[id]);
            if (pair && pair[0] !== pair[1]) return false;
        }
        return true;
    }
    function forceDominantBytes(bytes) {
        let modified = 0;
        for (let id = 0; id < SaveFile.GENOME_LEN; id++) {
            const gene = geneTable.get(id);
            const pair = Genome.byteToPair(gene, bytes[id]);
            if (!pair) continue;
            const i1 = gene.n.indexOf(pair[0]), i2 = gene.n.indexOf(pair[1]);
            if (i1 === -1 || i2 === -1) continue;
            const dom = gene.n[Math.min(i1, i2)];
            const newByte = Genome.pairToByte(gene, dom + dom);
            if (newByte !== bytes[id]) modified++;
            bytes[id] = newByte;
        }
        return modified;
    }
    function randomizeBytes(bytes) {
        for (let id = 0; id < SaveFile.GENOME_LEN; id++) {
            const gene = geneTable.get(id);
            const pair = BASES[Math.floor(Math.random() * 4)] + BASES[Math.floor(Math.random() * 4)];
            const byte = Genome.pairToByte(gene, pair);
            if (byte !== null) bytes[id] = byte;
        }
    }
    function removeDiversityBytes(bytes) {
        let modified = 0;
        for (let id = 0; id < SaveFile.GENOME_LEN; id++) {
            const gene = geneTable.get(id);
            const byte = bytes[id];
            const pair = Genome.byteToPair(gene, byte);
            if (!pair) continue;
            const idx1 = gene.n.indexOf(pair[0]), idx2 = gene.n.indexOf(pair[1]);
            if (idx1 === -1 || idx2 === -1) continue;
            const domIdx = idx1 < idx2 ? idx1 : idx2;
            const recIdx = idx1 > idx2 ? idx1 : idx2;
            if (gene.m == 100 || gene.g[domIdx] == gene.g[recIdx]) {
                let newAllele = null;
                if (recIdx === 3 && (gene.desc === 'CHEST_SMALL' || gene.desc === 'OSTO_SIZE')) {
                    if (gene.g[domIdx] == gene.g[recIdx]) newAllele = gene.n[recIdx];
                } else {
                    newAllele = gene.n[domIdx];
                }
                if (newAllele !== null) {
                    const newByte = Genome.pairToByte(gene, newAllele + newAllele);
                    if (newByte !== byte) modified++;
                    bytes[id] = newByte;
                }
            }
        }
        return modified;
    }
    function randomDiversityBytes(bytes) {
        let modified = 0;
        for (let id = 0; id < SaveFile.GENOME_LEN; id++) {
            const gene = geneTable.get(id);
            const byte = bytes[id];
            const pair = Genome.byteToPair(gene, byte);
            if (!pair) continue;
            const { n, g, m, valueMatrix, desc } = gene;
            const idx1 = n.indexOf(pair[0]), idx2 = n.indexOf(pair[1]);
            if (idx1 === -1 || idx2 === -1) continue;
            const origDom = Math.min(idx1, idx2), origRec = Math.max(idx1, idx2);
            const isSpecial = (desc === 'CHEST_SMALL' || desc === 'OSTO_SIZE');
            const targetValue = m === 100 ? g[origDom] : valueMatrix[idx1][idx2];
            const candidates = [];
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    const newRec = Math.max(i, j);
                    if (isSpecial && ((newRec === 3) !== (origRec === 3))) continue;
                    if (m === 100) { if (g[Math.min(i, j)] !== targetValue) continue; }
                    else if (valueMatrix[i][j] !== targetValue) continue;
                    candidates.push([i, j]);
                }
            }
            if (!candidates.length) continue;
            const diffCandidates = candidates.filter(([i, j]) => i !== j);
            const finalCandidates = diffCandidates.length ? diffCandidates : candidates;
            const [newI, newJ] = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];
            const newByte = Genome.pairToByte(gene, n[newI] + n[newJ]);
            if (newByte !== byte) modified++;
            bytes[id] = newByte;
        }
        return modified;
    }
    function isPaneActive() { return !!(paneEl && paneEl.classList.contains('active')); }
    function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function horseLabel(h, idx) {
        let name = null;
        if (h.recordIndex >= 0 && doc) {
            const renamed = doc.renamedRecords.get(h.recordIndex);
            name = renamed !== undefined ? renamed : ((doc.state.records[h.recordIndex] && doc.state.records[h.recordIndex].name) || null);
        }
        return '🐎 ' + (name || '(unnamed)') + ' #' + idx + ' · ' + (h.container === 'official' ? 'bookie' : h.container === 'lost' ? 'lost horse' : h.container);
    }
    function itemDisplayName(id) {
        if (typeof Items === 'undefined') return 'item ' + id;
        const info = Items.ITEM_LIST[id];
        return info ? info.displayName : ('item ' + id);
    }
    function itemLabel(it) {
        const name = itemDisplayName(it.itemId);
        if (it.container === 'map') return name + ' on the map';
        const loc = doc.state.locations[it.locationIndex];
        if (!loc) return name + ' (unknown location)';
        const locName = (typeof LocTemplates !== 'undefined') ? LocTemplates.displayName(loc.index, loc.name) : loc.name;
        return name + ' in ' + locName;
    }
    function itemSubjectKey(container, locationIndex, ordinal) {
        return 'item:' + container + ':' + (locationIndex === null || locationIndex === undefined ? '' : locationIndex) + ':' + ordinal;
    }
    function subjectValueKey(s) {
        if (s.kind === 'horse') return 'horse:' + s.idx;
        if (s.kind === 'item') return itemSubjectKey(s.container, s.locationIndex, s.ordinal);
        return 'scratch';
    }
    function compareValueKey(c) {
        if (c.kind === 'preset') return 'preset:' + c.name;
        if (c.kind === 'library') return 'library:' + c.id;
        return 'horse:' + c.idx;
    }
    function liveHorseEntries() {
        if (!doc) return [];
        const out = [];
        doc.state.horses.forEach((h, i) => { if (!doc.horseDeleted(h)) out.push({ h, i }); });
        return out;
    }
    function liveDnaItemEntries() {
        if (!doc) return [];
        const all = SaveFile.buildItemIndex(doc.state);
        const out = [];
        for (const it of all) {
            if (!it.hasDna || doc.itemDeleted(it)) continue;
            out.push({ it, ordinal: itemOrdinalIn(all, it) });
        }
        return out;
    }
    function subjectGone() {
        if (subject.kind === 'horse') {
            const h = doc && doc.state.horses[subject.idx];
            return !h || doc.horseDeleted(h);
        }
        if (subject.kind === 'item') {
            const it = currentItem();
            return !it || !it.hasDna || doc.itemDeleted(it);
        }
        return false;
    }
    function renderSubjectOptions() {
        const sel = els.subjectSelect;
        if (subjectGone()) subject = { kind: 'scratch' };
        const live = liveHorseEntries();
        const dnaItems = liveDnaItemEntries();
        let html = '<option value="scratch">Scratch</option>';
        if (live.length) {
            html += live.map(({ h, i }) => '<option value="horse:' + i + '">' + escapeHtml(horseLabel(h, i)) + '</option>').join('');
        }
        if (dnaItems.length) {
            html += '<optgroup label="Items with DNA">' + dnaItems.map(({ it, ordinal }) =>
                '<option value="' + escapeHtml(itemSubjectKey(it.container, it.locationIndex, ordinal)) + '">' +
                escapeHtml('🧬 ' + itemLabel(it)) + '</option>').join('') + '</optgroup>';
        }
        sel.innerHTML = html;
        sel.value = subjectValueKey(subject);
        renderCompareOptions();
    }
    function renderCompareOptions() {
        const sel = els.compareSelect;
        const curVal = compare ? compareValueKey(compare) : '';
        let html = '<option value="">none</option>';
        if (presetNames.length) html += '<optgroup label="Presets">' + presetNames.map((n) => '<option value="preset:' + escapeHtml(n) + '">' + escapeHtml(n) + '</option>').join('') + '</optgroup>';
        const liveRows = liveHorseEntries();
        if (liveRows.length) html += '<optgroup label="Horses in this save">' + liveRows.map(({ h, i }) => '<option value="horse:' + i + '">' + escapeHtml(horseLabel(h, i)) + '</option>').join('') + '</optgroup>';
        const libRows = [];
        for (const cat of DnaLib.all()) {
            for (const entry of cat.entries) libRows.push({ id: entry.id, label: cat.name + ' / ' + entry.name });
        }
        if (libRows.length) {
            html += '<optgroup label="DNA Library">' + libRows.map((r) =>
                '<option value="library:' + escapeHtml(r.id) + '">' + escapeHtml(r.label) + '</option>').join('') + '</optgroup>';
        }
        sel.innerHTML = html;
        sel.value = curVal;
        if (curVal && sel.value !== curVal) { compare = null; sel.value = ''; }
    }
    function renderWriteBadge() { els.writeBadge.hidden = subject.kind === 'scratch'; }
    function renderRawText(bytes) {
        if (document.activeElement === els.rawText) return;
        const genome = Genome.decodeGenome(geneTable, bytes);
        els.rawText.value = Genome.formatGenomeText(genome);
    }
    function renderWarningsFromList(problems) {
        const el = els.warnings;
        if (!problems.length) { el.hidden = true; el.textContent = ''; return; }
        el.hidden = false;
        const shown = problems.slice(0, 15);
        el.textContent = '⚠ ' + problems.length + ' input issue' + (problems.length > 1 ? 's' : '') + ':\n' + shown.join('\n') + (problems.length > shown.length ? '\n...and ' + (problems.length - shown.length) + ' more' : '');
    }
    function isInvertedByte(byte) {
        if (!SaveFile.CODESET.has(byte)) return false;
        const n1 = byte % 8, n2 = (byte - n1) / 8;
        return n1 > n2;
    }
    function flipByte(byte) {
        const n1 = byte % 8, n2 = (byte - n1) / 8;
        return n1 * 8 + n2;
    }
    function setEditMode(mode) {
        const next = mode === 'bases' ? 'bases' : 'pair';
        if (next === editMode) return;
        editMode = next;
        els.modePairBtn.classList.toggle('active', editMode === 'pair');
        els.modePairBtn.setAttribute('aria-pressed', String(editMode === 'pair'));
        els.modeBasesBtn.classList.toggle('active', editMode === 'bases');
        els.modeBasesBtn.setAttribute('aria-pressed', String(editMode === 'bases'));
        renderTable(currentBytes());
    }
    function buildGeneSelect(gene, entry, inverted) {
        const combos = getCombosForGene(gene);
        const select = document.createElement('select');
        select.className = 'gn-value-select';
        let curLo = -1, curHi = -1;
        if (SaveFile.CODESET.has(entry.byte)) {
            const n1 = entry.byte % 8, n2 = (entry.byte - n1) / 8;
            curLo = Math.min(n1, n2) - 1; curHi = Math.max(n1, n2) - 1;
        } else {
            const opt = document.createElement('option');
            opt.value = ''; opt.textContent = '— invalid —'; opt.disabled = true; opt.selected = true;
            select.appendChild(opt);
        }
        for (const c of combos) {
            const opt = document.createElement('option');
            opt.value = c.pairStr;
            opt.textContent = Annotations.forCombo({ desc: gene.desc, value: c.value, pair: c.pairStr });
            if (c.idx1 === curLo && c.idx2 === curHi) opt.selected = true;
            select.appendChild(opt);
        }
        return select;
    }
    function buildPairCell(pair) {
        const td = document.createElement('td');
        td.className = 'gn-pair';
        if (!pair) { td.textContent = '—'; return td; }
        for (const base of pair) {
            const span = document.createElement('span');
            span.className = 'gn-base-' + base;
            span.textContent = base;
            td.appendChild(span);
        }
        return td;
    }
    function buildBaseSelect(gene, entry, rawId, side) {
        const pair = entry.pair || (gene.n[0] + gene.n[0]);
        const cur = side === 1 ? pair[0] : pair[1];
        const other = side === 1 ? pair[1] : pair[0];
        const rank = gene.n.indexOf(cur);
        const otherRank = gene.n.indexOf(other);
        const dominant = rank <= otherRank;
        const select = document.createElement('select');
        select.className = 'gn-base-select gn-base-select-' + cur + (dominant ? ' gn-base-dominant' : '');
        select.title = 'Strand ' + side + ': ' + cur + ' is priority ' + (rank + 1) + ' of 4 — ' +
            (dominant ? 'dominant' : 'recessive') + ' here. Order ' + gene.n.split('').join(' > ');
        select.setAttribute('aria-label', gene.desc + ' strand ' + side);
        for (let i = 0; i < 4; i++) {
            const b = gene.n[i];
            const opt = document.createElement('option');
            opt.value = b;
            opt.className = 'gn-base-opt-' + b;
            opt.textContent = b + ' ' + gene.g[i];
            if (b === cur) opt.selected = true;
            select.appendChild(opt);
        }
        select.addEventListener('change', () => {
            const newBase = select.value;
            if (!'ACGT'.includes(newBase) || newBase === cur) return;
            const newPair = side === 1 ? (newBase + other) : (other + newBase);
            const newByte = Genome.pairToByte(gene, newPair);
            if (newByte !== null) commitSingleByte(rawId, newByte);
        });
        return select;
    }
    function buildBaseValueCell(gene, entry) {
        const td = document.createElement('td');
        td.className = 'gn-base-value';
        td.textContent = (entry.value === null || entry.value === undefined)
            ? '—' : Annotations.forCombo({ desc: gene.desc, value: entry.value, pair: entry.pair });
        return td;
    }
    function renderTableHead() {
        const basesMode = editMode === 'bases';
        let html = '<th class="gn-hp-th">H:P</th>';
        if (basesMode) html += '<th class="gn-m-col" title="Dominance m: 100 = the dominant base alone sets the value; lower blends in the recessive base">M</th>';
        html += '<th>Gene</th>';
        html += basesMode
            ? '<th class="gn-strand-th" title="Each strand’s base, listed in priority order (most dominant first)">Strand 1</th>'
            + '<th class="gn-strand-th" title="Each strand’s base, listed in priority order (most dominant first)">Strand 2</th>'
            + '<th>Value</th>'
            : '<th>Pair</th><th>Value</th>';
        html += '<th id="gnCompareHeaderCell"' + (compare ? '' : ' hidden') + '>Compare</th>';
        html += '<th id="gnOddsHeaderCell" title="Chance the odds population produces the pair each gene currently has"' + (oddsPopName ? '' : ' hidden') + '>%</th>';
        els.theadRow.innerHTML = html;
        els.compareHeaderCell = document.getElementById('gnCompareHeaderCell');
        els.oddsHeaderCell = document.getElementById('gnOddsHeaderCell');
    }
    function renderTable(bytes) {
        const basesMode = editMode === 'bases';
        renderTableHead();
        const desc = Genome.describeGenome(geneTable, bytes);
        const compareDesc = (compare && compare.bytes) ? Genome.describeGenome(geneTable, compare.bytes) : null;
        const needle = searchText.trim().toLowerCase();
        const baseColCount = basesMode ? 6 : 4;
        const frag = document.createDocumentFragment();
        let shown = 0;
        for (let h = 0; h < GeneData.HELIX_COUNT; h++) {
            const row = GeneData.GENE_MAP[h];
            const visibleIds = row.filter((rawId) => {
                const gene = geneTable.get(rawId);
                if (needle && !gene.desc.toLowerCase().includes(needle)) return false;
                if (diffOnly && compareDesc && desc[rawId].value === compareDesc[rawId].value) return false;
                return true;
            });
            if (!visibleIds.length) continue;
            const headerTr = document.createElement('tr');
            headerTr.className = 'gn-helix-header';
            headerTr.dataset.helix = h;
            const td = document.createElement('td');
            td.colSpan = baseColCount + (compare ? 1 : 0) + (oddsPopName ? 1 : 0);
            td.textContent = 'HELIX ' + h + ' · ' + row.length + ' genes';
            headerTr.appendChild(td);
            frag.appendChild(headerTr);
            for (const rawId of visibleIds) {
                const gene = geneTable.get(rawId);
                const entry = desc[rawId];
                const inverted = isInvertedByte(entry.byte);
                const tr = document.createElement('tr');
                tr.className = 'gn-row';
                const tdHp = document.createElement('td'); tdHp.className = 'gn-hp'; tdHp.textContent = h + ':' + gene.p;
                tr.appendChild(tdHp);
                if (basesMode) {
                    const tdM = document.createElement('td');
                    tdM.className = 'gn-m-col';
                    tdM.textContent = gene.m;
                    tr.appendChild(tdM);
                }
                const tdDesc = document.createElement('td');
                tdDesc.className = 'gn-desc' + (inverted ? ' gn-inverted' : '');
                tdDesc.textContent = gene.desc;
                tdDesc.title = inverted
                    ? 'Strand order inverted (recessive allele on strand 1) — double-click to flip back'
                    : 'Double-click to invert strand order (same value, swapped strands)';
                tdDesc.addEventListener('dblclick', () => {
                    if (!SaveFile.CODESET.has(entry.byte)) return;
                    const n1 = entry.byte % 8, n2 = (entry.byte - n1) / 8;
                    if (n1 === n2) return;
                    commitSingleByte(rawId, flipByte(entry.byte));
                });
                tr.appendChild(tdDesc);
                if (basesMode) {
                    const tdS1 = document.createElement('td'); tdS1.className = 'gn-strand-td';
                    tdS1.appendChild(buildBaseSelect(gene, entry, rawId, 1));
                    const tdS2 = document.createElement('td'); tdS2.className = 'gn-strand-td';
                    tdS2.appendChild(buildBaseSelect(gene, entry, rawId, 2));
                    tr.appendChild(tdS1); tr.appendChild(tdS2);
                    tr.appendChild(buildBaseValueCell(gene, entry));
                } else {
                    const tdVal = document.createElement('td');
                    const select = buildGeneSelect(gene, entry, inverted);
                    select.addEventListener('change', () => {
                        if (!select.value) return;
                        const pair = inverted ? select.value[1] + select.value[0] : select.value;
                        const newByte = Genome.pairToByte(gene, pair);
                        if (newByte !== null) commitSingleByte(rawId, newByte);
                    });
                    tdVal.appendChild(select);
                    tr.appendChild(buildPairCell(entry.pair)); tr.appendChild(tdVal);
                }
                if (compare) {
                    const tdCmp = document.createElement('td'); tdCmp.className = 'gn-compare-value';
                    const cmpEntry = compareDesc[rawId];
                    tdCmp.textContent = (cmpEntry.value === null || cmpEntry.value === undefined) ? '—' : String(cmpEntry.value);
                    if (entry.value !== cmpEntry.value) tr.classList.add('gn-diff');
                    tr.appendChild(tdCmp);
                }
                if (oddsPopName) tr.appendChild(buildOddsCell(gene, entry.pair));
                frag.appendChild(tr);
                shown++;
            }
        }
        els.tableBody.innerHTML = '';
        els.tableBody.appendChild(frag);
        els.geneCount.textContent = shown + ' / ' + SaveFile.GENOME_LEN + ' genes';
        els.compareHeaderCell.hidden = !compare;
        els.oddsHeaderCell.hidden = !oddsPopName;
        els.table.classList.toggle('has-compare', !!compare);
        els.table.classList.toggle('has-odds', !!oddsPopName);
        els.table.classList.toggle('has-bases', basesMode);
    }
    function buildOddsCell(gene, pair) {
        const td = document.createElement('td');
        td.className = 'gn-odds-cell';
        if (!pair) { td.textContent = '—'; td.classList.add('gn-odds-zero'); return td; }
        const prob = PopData.pairProbability(popTable, oddsPopName, gene, pair);
        td.classList.add(oddsBandClass(prob));
        td.title = oddsTooltip(gene, pair);
        td.textContent = formatOddsPct(prob);
        const pctSign = document.createElement('span');
        pctSign.className = 'gn-odds-pct-sign';
        pctSign.textContent = '%';
        td.appendChild(pctSign);
        return td;
    }
    function renderModGrid(bytes) {
        MOD_BUTTONS.forEach((b, i) => {
            const btn = els.modGrid.querySelector('[data-mod="' + i + '"]');
            if (!btn) return;
            let lit = false, disabled = false, title = b.label;
            if (b.id === 'undo') { lit = canUndo(); disabled = !lit; title = disabled ? 'Nothing to undo' : 'Undo (Ctrl+Z)'; }
            else if (b.id === 'redo') { lit = canRedo(); disabled = !lit; title = disabled ? 'Nothing to redo' : 'Redo (Ctrl+Y)'; }
            else if (b.profile) {
                const profile = GENE_PROFILES[b.profile];
                lit = isProfileSatisfied(bytes, profile);
                title = lit ? ('Already applied: ' + profile.describe) : ('Apply: ' + profile.describe);
            } else if (b.id === 'homozygous') { lit = isGenomeHomozygousBytes(bytes); title = lit ? 'Every gene is already homozygous' : 'Force every gene to dominant homozygous'; }
            else { lit = true; title = 'Randomize all 240 gene pairs (uniform, ignores dominance/pop weights)'; }
            btn.classList.toggle('active', lit && !disabled);
            btn.disabled = disabled;
            btn.title = title;
        });
    }
    function currentDnaText() {
        return Genome.formatGenomeText(Genome.decodeGenome(geneTable, currentBytes()));
    }
    let preview = null;
    function renderAll() {
        if (!dataReady) return;
        const bytes = currentBytes();
        renderWriteBadge();
        renderRawText(bytes);
        if (preview) preview.refresh();
        renderTable(bytes);
        renderModGrid(bytes);
        if (pop) pop.genomeChanged();
        updateOddsBar(bytes);
    }
    function applyProfile(key) {
        const bytes = currentBytes();
        const res = applyGeneProfileToBytes(bytes, key);
        if (!res) return;
        if (!res.changed && !res.failures.length) { Toast.toast(res.label + ': already applied', 'info'); return; }
        commitBytes(bytes, 'Apply ' + res.label);
        if (res.failures.length) Toast.toast(res.label + ': ' + res.changed + ' changed, ' + res.failures.length + ' failed — ' + res.failures[0], 'warn');
        else Toast.toast(res.label + ': ' + res.changed + ' gene' + (res.changed === 1 ? '' : 's') + ' changed', 'ok');
    }
    function applyHomozygous() {
        const bytes = currentBytes();
        const modified = forceDominantBytes(bytes);
        if (modified) commitBytes(bytes, 'Homozygous');
        Toast.toast('Forced ' + modified + ' gene' + (modified === 1 ? '' : 's') + ' to dominant homozygous', modified ? 'ok' : 'info');
    }
    function applyRandomize() {
        const bytes = currentBytes();
        randomizeBytes(bytes);
        commitBytes(bytes, 'Randomize');
        Toast.toast('Randomized all 240 gene pairs', 'ok');
    }
    function applyRemoveDiversity() {
        const bytes = currentBytes();
        const modified = removeDiversityBytes(bytes);
        if (modified) commitBytes(bytes, 'Remove Diversity');
        Toast.toast('Remove Diversity: ' + modified + ' gene' + (modified === 1 ? '' : 's') + ' changed', modified ? 'ok' : 'info');
    }
    function applyRandomDiversity() {
        const bytes = currentBytes();
        const modified = randomDiversityBytes(bytes);
        if (modified) commitBytes(bytes, 'Random Diversity');
        Toast.toast('Random Diversity: ' + modified + ' gene' + (modified === 1 ? '' : 's') + ' changed', modified ? 'ok' : 'info');
    }
    function setCompare(c) {
        if (!c) { compare = null; els.compareSelect.value = ''; renderAll(); return; }
        if (c.kind === 'library') {
            const hit = DnaLib.findEntry(c.id);
            if (!hit) {
                compare = null; els.compareSelect.value = '';
                Toast.toast('That library entry no longer exists.', 'warn');
                renderAll();
                return;
            }
            const genome = Genome.parseGenomeText(hit.entry.dnaText);
            compare = {
                kind: 'library', id: hit.entry.id, name: hit.entry.name,
                bytes: Genome.encodeGenome(geneTable, genome, undefined)
            };
        } else if (c.kind === 'preset') {
            const sampled = PopData.sampleGenome(geneTable, popTable, c.name);
            compare = { kind: 'preset', name: c.name, bytes: Genome.encodeGenome(geneTable, sampled, undefined) };
        } else {
            const h = doc && doc.state.horses[c.idx];
            if (!h || doc.horseDeleted(h)) { compare = null; els.compareSelect.value = ''; renderAll(); return; }
            const bytes = new Uint8Array(SaveFile.GENOME_LEN);
            for (let i = 0; i < SaveFile.GENOME_LEN; i++) bytes[i] = readByte(h.genomeOff + i);
            compare = { kind: 'horse', idx: c.idx, bytes };
        }
        els.compareSelect.value = compareValueKey(compare);
        renderAll();
    }
    const SUPERSCRIPT = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    function formatLog10(l) {
        if (l > -2 && l < 6) return Number(Math.pow(10, l).toPrecision(3)).toLocaleString();
        let exp = Math.floor(l);
        let mant = Math.pow(10, l - exp);
        if (mant >= 9.95) { mant = 1; exp += 1; }
        return mant.toFixed(1) + ' × 10' + String(exp).replace(/./g, (c) => SUPERSCRIPT[c] || c);
    }
    function formatOddsPct(p) {
        if (p <= 0) return '0';
        const pct = p * 100;
        if (pct >= 10) return pct.toFixed(1);
        if (pct >= 0.01) return pct.toFixed(2);
        return '<0.01';
    }
    function oddsBandClass(p) {
        if (p <= 0) return 'gn-odds-zero';
        const pct = p * 100;
        if (pct >= 50) return 'gn-odds-high';
        if (pct >= 10) return 'gn-odds-mid';
        if (pct >= 1) return 'gn-odds-low';
        return 'gn-odds-rare';
    }
    function oddsTooltip(gene, pair) {
        const config = (popTable && popTable.get(oddsPopName)) || {};
        const listed = Object.prototype.hasOwnProperty.call(config, gene.desc);
        const weights = listed ? config[gene.desc] : PopData.DEFAULT_WEIGHTS;
        const p = PopData.weightsToProbabilities(weights);
        const perAllele = [...gene.n].map((b, i) => b + ' ' + (p[i] * 100).toFixed(1) + '%').join('   ');
        return gene.desc + ' in ' + oddsPopName + '\n'
            + (listed ? 'rarity weights [' + weights.join(', ') + ']  (lower = commoner, 0 = impossible)'
                : 'not defined for this population, so it is locked to ' + gene.n[0])
            + '\nper allele:  ' + perAllele
            + '\nthis pair:  ' + pair
            + (pair[0] === pair[1] ? '  (p × p)' : '  (2 × p1 × p2)');
    }
    function exactOddsHtml(bytes) {
        const lp = PopData.genomeLog10Probability(geneTable, popTable, oddsPopName, bytes);
        if (lp.impossible) return '';
        const title = 'Chance that "' + oddsPopName + '" produces exactly this genome — every gene’s strand 1 '
            + 'and strand 2 as shown. Ignoring which strand each base is on: ' + formatLog10(lp.unordered + 2)
            + ' % (1 in ' + formatLog10(-lp.unordered) + ').';
        return ' · <span class="gn-odds-exact" title="' + escapeHtml(title) + '">this exact genome: '
            + '<strong>' + formatLog10(lp.ordered + 2) + ' %</strong> (1 in ' + formatLog10(-lp.ordered) + ')</span>';
    }
    function updateOddsBar(bytes) {
        const bar = els.oddsBar;
        if (!bar) return;
        if (!oddsPopName || !dataReady) { bar.hidden = true; return; }
        const impossible = PopData.impossibleGenes(geneTable, popTable, oddsPopName, bytes);
        const total = SaveFile.GENOME_LEN;
        let html = '\u{1F4CA} Odds in <strong>' + escapeHtml(oddsPopName) + '</strong>';
        html += impossible.length
            ? ' — <strong class="gn-odds-impossible-count">' + impossible.length + '</strong> of ' + total +
              ' gene' + (impossible.length === 1 ? '' : 's') + ' cannot occur'
            : ' — all ' + total + ' genes can occur' + exactOddsHtml(bytes);
        els.oddsBarLabel.innerHTML = html;
        els.oddsLegalizeBtn.disabled = !impossible.length;
        els.oddsLegalizeBtn.title = impossible.length
            ? 'Change the ' + impossible.length + ' impossible gene' + (impossible.length === 1 ? '' : 's') +
              ' to the commonest allele "' + oddsPopName + '" allows (one undo)'
            : 'Every gene can already occur in "' + oddsPopName + '"';
        bar.hidden = false;
    }
    function setOddsPopulation(popName) {
        oddsPopName = (oddsPopName === popName) ? null : (popName || null);
        if (pop) pop.render();
        renderTable(currentBytes());
        updateOddsBar(currentBytes());
        Toast.toast(oddsPopName ? 'Showing odds for "' + oddsPopName + '"' : 'Odds mode off', 'ok');
    }
    function exitOddsMode() {
        if (!oddsPopName) return;
        oddsPopName = null;
        if (pop) pop.render();
        renderTable(currentBytes());
        updateOddsBar(currentBytes());
    }
    function legalizeOddsPop() {
        if (!oddsPopName) return;
        const bytes = currentBytes();
        const res = PopData.legalizeBytes(geneTable, popTable, oddsPopName, bytes);
        if (res.changed) commitBytes(res.bytes, 'Legalized ' + res.changed + ' alleles for ' + oddsPopName);
        updateOddsBar(currentBytes());
        Toast.toast('Legalized ' + res.changed + ' allele' + (res.changed === 1 ? '' : 's') + ' for "' + oddsPopName + '"',
            res.changed ? 'ok' : 'info');
    }
    function cacheEls() {
        els.subjectSelect = document.getElementById('gnSubjectSelect');
        els.writeBadge = document.getElementById('gnWriteBadge');
        els.compareSelect = document.getElementById('gnCompareSelect');
        els.diffOnly = document.getElementById('gnDiffOnly');
        els.copyLinkBtn = document.getElementById('gnCopyLinkBtn');
        els.rawText = document.getElementById('gnRawText');
        els.warnings = document.getElementById('gnWarnings');
        els.loadRawBtn = document.getElementById('gnLoadRawBtn');
        els.pasteRawBtn = document.getElementById('gnPasteRawBtn');
        els.copyRawBtn = document.getElementById('gnCopyRawBtn');
        els.previewBox = document.getElementById('gnPreviewBox');
        els.previewBg = document.getElementById('gnPreviewBg');
        els.helixNav = document.getElementById('gnHelixNav');
        els.removeDiversityBtn = document.getElementById('gnRemoveDiversityBtn');
        els.randomDiversityBtn = document.getElementById('gnRandomDiversityBtn');
        els.search = document.getElementById('gnSearch');
        els.modePairBtn = document.getElementById('gnModePairBtn');
        els.modeBasesBtn = document.getElementById('gnModeBasesBtn');
        els.geneCount = document.getElementById('gnGeneCount');
        els.table = document.getElementById('gnTable');
        els.theadRow = document.getElementById('gnTheadRow');
        els.tableBody = document.getElementById('gnTableBody');
        els.compareHeaderCell = document.getElementById('gnCompareHeaderCell');
        els.oddsHeaderCell = document.getElementById('gnOddsHeaderCell');
        els.oddsBar = document.getElementById('gnOddsBar');
        els.oddsBarLabel = document.getElementById('gnOddsBarLabel');
        els.oddsLegalizeBtn = document.getElementById('gnOddsLegalizeBtn');
        els.oddsExitBtn = document.getElementById('gnOddsExitBtn');
        els.modGrid = document.getElementById('gnModGrid');
        els.presetsHeader = document.getElementById('gnPresetsHeader');
        els.presetsBody = document.getElementById('gnPresetsBody');
        els.presetFilter = document.getElementById('gnPresetFilter');
        els.presetList = document.getElementById('gnPresetList');
        els.libAddCatBtn = document.getElementById('gnLibAddCatBtn');
        els.libSaveBtn = document.getElementById('gnLibSaveBtn');
        els.libSaveText = document.getElementById('gnLibSaveText');
        els.libExportBtn = document.getElementById('gnLibExportBtn');
        els.libImportBtn = document.getElementById('gnLibImportBtn');
        els.libImportFile = document.getElementById('gnLibImportFile');
        els.libSearch = document.getElementById('gnLibSearch');
        els.libSearchClear = document.getElementById('gnLibSearchClear');
        els.categoryList = document.getElementById('gnCategoryList');
    }
    function renderHelixNav() {
        els.helixNav.innerHTML = '';
        for (let h = 0; h < GeneData.HELIX_COUNT; h++) {
            const btn = document.createElement('button');
            btn.textContent = h;
            btn.addEventListener('click', () => {
                const tr = els.tableBody.querySelector('tr.gn-helix-header[data-helix="' + h + '"]');
                if (tr) tr.scrollIntoView({ block: 'start' });
            });
            els.helixNav.appendChild(btn);
        }
    }
    let gnLeftSplitter = null, gnRightSplitter = null;
    const GN_CENTER_MIN = 420;
    const GN_HANDLE_W = 6;
    function gnViewportOk() { return window.innerWidth >= 1280; }
    function boundedMax(container, absCap, computeReal) {
        return container.clientWidth ? Math.min(absCap, computeReal()) : absCap;
    }
    function setupSplitters() {
        if (typeof Splitter === 'undefined') return;
        const container = document.getElementById('gnBody');
        if (!container) return;
        gnLeftSplitter = Splitter.attach({
            handle: '#gnLeftHandle',
            container,
            cssVar: '--gn-left-w',
            side: 'left',
            min: 200,
            max: () => boundedMax(container, 420, () => container.clientWidth - (gnRightSplitter ? gnRightSplitter.get() : 320) - GN_CENTER_MIN - GN_HANDLE_W * 2),
            defaultWidth: 260,
            storageKey: 'horsey_studio_genome_left_w',
            enabled: gnViewportOk
        });
        gnRightSplitter = Splitter.attach({
            handle: '#gnRightHandle',
            container,
            cssVar: '--gn-right-w',
            side: 'right',
            min: 240,
            max: () => boundedMax(container, 460, () => container.clientWidth - (gnLeftSplitter ? gnLeftSplitter.get() : 260) - GN_CENTER_MIN - GN_HANDLE_W * 2),
            defaultWidth: 320,
            storageKey: 'horsey_studio_genome_right_w',
            enabled: gnViewportOk
        });
    }
    function wireStaticUI() {
        els.modGrid.innerHTML = MOD_BUTTONS.map((b, i) => '<button class="gn-mod-btn" data-mod="' + i + '"><span class="gn-mod-icon">' + b.icon + '</span><span>' + b.label + '</span></button>').join('');
        els.modGrid.addEventListener('click', (e) => {
            const btn = e.target.closest('.gn-mod-btn');
            if (!btn || btn.disabled) return;
            const b = MOD_BUTTONS[parseInt(btn.dataset.mod, 10)];
            if (!b) return;
            if (b.id === 'undo') doUndo();
            else if (b.id === 'redo') doRedo();
            else if (b.profile) applyProfile(b.profile);
            else if (b.id === 'homozygous') applyHomozygous();
            else if (b.id === 'randomize') applyRandomize();
        });
        els.subjectSelect.addEventListener('change', () => {
            const v = els.subjectSelect.value;
            if (v === 'scratch') subject = { kind: 'scratch' };
            else if (v.indexOf('item:') === 0) {
                const parts = v.split(':');
                subject = {
                    kind: 'item', container: parts[1],
                    locationIndex: parts[2] === '' ? null : parseInt(parts[2], 10),
                    ordinal: parseInt(parts[3], 10)
                };
            } else {
                subject = { kind: 'horse', idx: parseInt(v.split(':')[1], 10) };
            }
            renderAll();
        });
        els.compareSelect.addEventListener('change', () => {
            const v = els.compareSelect.value;
            if (!v) { setCompare(null); return; }
            const sep = v.indexOf(':');
            const kind = v.slice(0, sep), rest = v.slice(sep + 1);
            if (kind === 'preset') setCompare({ kind: 'preset', name: rest });
            else if (kind === 'library') setCompare({ kind: 'library', id: rest });
            else setCompare({ kind: 'horse', idx: parseInt(rest, 10) });
        });
        els.diffOnly.addEventListener('change', () => { diffOnly = els.diffOnly.checked; renderTable(currentBytes()); });
        els.search.addEventListener('input', () => { searchText = els.search.value; renderTable(currentBytes()); });
        els.modePairBtn.addEventListener('click', () => setEditMode('pair'));
        els.modeBasesBtn.addEventListener('click', () => setEditMode('bases'));
        els.loadRawBtn.addEventListener('click', () => {
            const base = currentBytes();
            const res = Genome.normalizeGenomeInput(els.rawText.value, { geneTable, base });
            if (!res.ok) {
                renderWarningsFromList(res.errors.length ? res.errors : ['Text was unreadable.']);
                Toast.toast('Could not read that genome — kept the current one.', 'bad');
                return;
            }
            renderWarningsFromList(res.warnings);
            commitBytes(res.bytes, 'Load raw sequence');
            els.rawText.value = res.text;
            Toast.toast('Loaded genome' + (res.warnings.length ? ' (' + res.warnings.length + ' repair' + (res.warnings.length === 1 ? '' : 's') + ')' : ''), res.warnings.length ? 'warn' : 'ok');
        });
        els.pasteRawBtn.addEventListener('click', async () => {
            try {
                const t = await navigator.clipboard.readText();
                if (!t.trim()) { Toast.toast('The clipboard is empty.', 'warn'); return; }
                els.rawText.value = t;
                els.rawText.focus();
                const res = Genome.normalizeGenomeInput(t, { geneTable, base: currentBytes() });
                renderWarningsFromList(res.ok ? res.warnings : (res.errors.length ? res.errors : ['Text was unreadable.']));
                Toast.toast('Pasted. Press Load to apply it.', 'ok');
            } catch (e) {
                Toast.toast('Paste failed: ' + e.message + '. Use Ctrl+V in the box instead.', 'bad');
            }
        });
        els.copyRawBtn.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(els.rawText.value); Toast.toast('Copied to clipboard', 'ok'); }
            catch (e) { Modal.alertModal('Could not copy to clipboard: ' + e.message); }
        });
        els.removeDiversityBtn.addEventListener('click', applyRemoveDiversity);
        els.randomDiversityBtn.addEventListener('click', applyRandomDiversity);
        els.oddsExitBtn.addEventListener('click', exitOddsMode);
        els.oddsLegalizeBtn.addEventListener('click', legalizeOddsPop);
        els.copyLinkBtn.addEventListener('click', async () => {
            const bytes = currentBytes();
            const genome = Genome.decodeGenome(geneTable, bytes);
            const token = Genome.encodeGenomeUrl(genome);
            const url = location.origin + location.pathname + '#genome=' + token;
            try { await navigator.clipboard.writeText(url); Toast.toast('Share link copied to clipboard', 'ok'); }
            catch (e) { Modal.alertModal('Could not copy automatically. Link:\n' + url, 'Copy share link'); }
        });
    }
    function sampleScratchGenome() {
        try {
            if (popTable.has('default')) return Genome.encodeGenome(geneTable, PopData.sampleGenome(geneTable, popTable, 'default'), undefined);
        } catch (e) {   }
        const bytes = new Uint8Array(SaveFile.GENOME_LEN);
        for (let id = 0; id < SaveFile.GENOME_LEN; id++) { const gene = geneTable.get(id); bytes[id] = Genome.pairToByte(gene, gene.n[0] + gene.n[0]); }
        return bytes;
    }
    function onDocChanged() {
        if (!isPaneActive()) return;
        renderSubjectOptions();
        renderAll();
    }
    async function init() {
        if (inited) return;
        inited = true;
        paneEl = document.querySelector('.workspace-pane[data-workspace="genome"]');
        cacheEls();
        const adopt = (d) => {
            geneTable = d.geneTable;
            geneByDesc = d.geneByDesc;
            popTable = d.popTable;
            presetNames = d.presetNames;
            dataReady = true;
        };
        try {
            adopt(await GameData.load());
        } catch (e) {
            console.error('Genome workspace: failed to load gene/pop data', e);
            Toast.toast('Failed to load genome data: ' + e.message, 'bad', 0);
            return;
        }
        GameData.onChange(async (d) => {
            adopt(d);
            if (!inited) return;
            scratchGenome = sampleScratchGenome();
            compare = null;
            oddsPopName = null;
            renderSubjectOptions();
            if (pop) await pop.reload(d.popXml);
            renderAll();
        });
        scratchGenome = sampleScratchGenome();
        wireStaticUI();
        renderHelixNav();
        preview = HorsePreview.mount(els.previewBox, { getBytes: () => (dataReady ? currentBytes() : null) });
        HorsePreview.attachBg({ bar: els.previewBg, target: els.previewBox });
        let resizeTimer = null;
        function requestPreviewRefresh() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (dataReady && paneEl && !paneEl.hidden && paneEl.offsetParent !== null && preview) preview.refresh();
            }, 150);
        }
        window.addEventListener('resize', requestPreviewRefresh);
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(requestPreviewRefresh).observe(els.previewBox);
        setupSplitters();
        library = DnaLibrary.create({
            listEl: els.categoryList,
            addCategoryBtn: els.libAddCatBtn,
            saveBtn: els.libSaveBtn,
            saveBtnText: els.libSaveText,
            exportBtn: els.libExportBtn,
            importBtn: els.libImportBtn,
            importInput: els.libImportFile,
            searchInput: els.libSearch,
            searchClear: els.libSearchClear,
            getGenome: () => currentDnaText(),
            loadGenome: (text, entry) => {
                const genome = Genome.parseGenomeText(text);
                const base = currentBytes();
                const newBytes = Genome.encodeGenome(geneTable, genome, base);
                commitBytes(newBytes, 'Load library: ' + entry.name);
            },
            onCompare: (name, text, entry) => setCompare({ kind: 'library', id: entry.id }),
            toast: (msg, kind) => Toast.toast(msg, kind === 'error' ? 'bad' : 'ok'),
            confirm: (m) => Modal.confirmModal(m),
            prompt: (m, d) => Modal.promptModal(m, d)
        });
        library.render();
        DnaLib.onChange((_cats, origin) => {
            if (origin !== 'remote') return;
            if (compare && compare.kind === 'library' && !DnaLib.findEntry(compare.id)) setCompare(null);
            renderCompareOptions();
        });
        pop = PopPresets.create({
            listEl: els.presetList,
            filterInput: els.presetFilter,
            headerEl: els.presetsHeader,
            bodyEl: els.presetsBody,
            collapseKey: 'horsey_studio_pop_open',
            popXmlUrl: 'data/pop.xml',
            loadGenome: (text, row) => {
                const genome = Genome.parseGenomeText(text);
                const base = currentBytes();
                const newBytes = Genome.encodeGenome(geneTable, genome, base);
                commitBytes(newBytes, 'Load preset ' + row.name);
            },
            onCompare: (label, text, row) => setCompare({ kind: 'preset', name: row.popName }),
            onOdds: (popName) => setOddsPopulation(popName),
            isOddsActive: (popName) => popName === oddsPopName,
            getGenePairs: () => PopData.genePairsFromBytes(geneTable, currentBytes()),
            toast: (msg, kind) => Toast.toast(msg, kind === 'error' ? 'bad' : 'ok')
        });
        await pop.reload((GameData.get() || {}).popXml);
        renderSubjectOptions();
        renderAll();
    }
    function onDocLoaded(newDoc) {
        doc = newDoc;
        compare = null;
        if (subjectGone()) subject = { kind: 'scratch' };
        if (doc) doc.bus.on('doc:changed', onDocChanged);
        if (doc) doc.bus.on('doc:rebased', () => {
            if (subject.kind === 'horse') { subject = { kind: 'scratch' }; compare = null; }
            else if (subject.kind === 'item' && subjectGone()) {
                subject = { kind: 'scratch' };
                compare = null;
                Toast.toast('That item is no longer available. Switched to Scratch.', 'warn');
            }
            if (inited) { renderSubjectOptions(); renderAll(); }
        });
        if (!inited) return;
        renderSubjectOptions();
        renderAll();
    }
    function onActivate() {
        if (!inited) return;
        if (gnLeftSplitter) gnLeftSplitter.clamp();
        if (gnRightSplitter) gnRightSplitter.clamp();
        renderSubjectOptions();
        renderAll();
    }
    function currentGenomeBytes() {
        if (!dataReady) return null;
        const bytes = currentBytes();
        let hash = null;
        let label = 'Scratch';
        const h = currentHorse();
        if (h && doc) {
            hash = 0;
            for (let i = 3; i >= 0; i--) hash = (hash * 256) + readByte(h.genomeOff + SaveFile.GENOME_LEN + i);
            hash = hash >>> 0;
            label = horseLabel(h, subject.idx);
        } else if (subject.kind === 'item' && doc) {
            const it = currentItem();
            if (it) label = itemLabel(it);
        }
        return { bytes, hash, label };
    }
    function focusOn(kind, ref) {
        if (!doc || !ref) return;
        if (kind === 'horse') {
            const idx = doc.state.horses.findIndex((h) => h.detailOff === ref.detailOff);
            if (idx === -1) return;
            subject = { kind: 'horse', idx };
            renderSubjectOptions();
            renderAll();
            return;
        }
        if (kind === 'item') {
            const all = SaveFile.buildItemIndex(doc.state);
            const ordinal = itemOrdinalIn(all, ref);
            if (ordinal === -1) return;
            subject = {
                kind: 'item', container: ref.container,
                locationIndex: ref.container === 'interior' ? ref.locationIndex : null,
                ordinal
            };
            renderSubjectOptions();
            renderAll();
        }
    }
    function loadScratch(bytes, label) {
        if (!bytes || bytes.length !== SaveFile.GENOME_LEN) {
            throw new Error('A genome is exactly ' + SaveFile.GENOME_LEN + ' bytes, got ' + (bytes ? bytes.length : 0) + '.');
        }
        subject = { kind: 'scratch' };
        compare = null;
        if (!scratchGenome) scratchGenome = new Uint8Array(SaveFile.GENOME_LEN);
        pushScratchUndo();
        scratchGenome = Uint8Array.from(bytes);
        if (!inited) return;
        renderSubjectOptions();
        renderAll();
    }
    return { init, onDocLoaded, onActivate, focusOn, currentGenomeBytes, loadScratch, isScratchSubject, doUndo, doRedo };
})();
