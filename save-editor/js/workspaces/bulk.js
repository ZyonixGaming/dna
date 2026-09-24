'use strict';
const Bulk = (function () {
    const DET = { AGE: 7, PERSONALITY: 9 };
    const PERSONALITIES = ["Normal", "Preppy", "Grumpy", "Brainy", "Swaggy", "Cutey", "Baby",
        "Haughty", "Leprechaun", "Algernon de Horsey", "Sweetie", "Car", "Unknown?", "Mike"];
    const GENE_PROFILES = {
        legwheels: {
            label: 'Leg Wheels',
            ops: [
                { gene: 'LEG_JOINT_TYPE', value: 1 }, { gene: 'ARM_JOINT_TYPE', value: 1 },
                { gene: 'LEG_TAG', value: 1 }, { gene: 'ARM_TAG', value: 1 },
                { gene: 'LEG_TYPE', value: 1, ifEquals: 0 }, { gene: 'LEG_IS_CIRCLE', value: 1 },
                { gene: 'FOOT_IS_CIRCLE', value: 0 }, { gene: 'LEG_HAS_FOOT', value: 0 }, { gene: 'HAS_FOOT', value: 0 }
            ]
        },
        healthy: {
            label: 'Healthy',
            ops: [
                { gene: 'OLD_AGE', value: 2 }, { gene: 'FLU_IMMUNITY', value: 1 }, { gene: 'LITTER_SIZE', value: 5 },
                { gene: 'NARCOLEPSY', value: 0 }, { gene: 'BRAIN_SPASTIC', value: 0 }, { gene: 'LIMP', value: 0 },
                { gene: 'MUSCLE_USE', value: 100 }, { gene: 'BREAK_FORCE', value: 0 }, { gene: 'WHITE_IS_LETHAL', value: 0 },
                { gene: 'LEG_AND_ARM_LIMP', value: 0 }, { gene: 'EAR_SIZE', atLeast: 20 }, { gene: 'NOSE_SIZE', atLeast: 10 },
                { gene: 'SPEED_FACTOR', value: 133 }
            ]
        },
        carnivore: { label: 'Carnivore', ops: [{ gene: 'TEETH_SHAPE', value: 3 }, { gene: 'OMNIVORE', value: 0 }, { gene: 'HAS_MOUTH', value: 1 }] },
        herbivore: { label: 'Herbivore', ops: [{ gene: 'TEETH_SHAPE', value: 0, ifEquals: 3 }, { gene: 'OMNIVORE', value: 0 }, { gene: 'HAS_MOUTH', value: 1 }] },
        omnivore: { label: 'Omnivore', ops: [{ gene: 'OMNIVORE', value: 1 }, { gene: 'HAS_MOUTH', value: 1 }] },
        nomouth: { label: 'No Mouth', ops: [{ gene: 'HAS_MOUTH', value: 0 }] }
    };
    const PROFILE_KEYS = ['legwheels', 'healthy', 'carnivore', 'herbivore', 'omnivore', 'nomouth'];
    let doc = null;
    let geneTable = null, geneByDesc = null, popTable = null, presetNames = [];
    let dataReady = false;
    let inited = false;
    let paneEl = null;
    const els = {};
    let library = [];
    let libraryPicker = null;
    let rollSamples = null;
    const ROLL_COUNT = 3;
    const RANDOM_SOURCES = new Set(['population', 'vat', 'random']);
    let selectedOp = 'replaceDna';
    const target = {
        onMap: true, farmHorses: true, otherBuildings: true,
        oneLocation: false, locationIndex: 0, bookies: false, inSelection: false
    };
    const FARM_INDEX_MIN = 1, FARM_INDEX_MAX = 12;
    function isFarmHorse(h) {
        return h.container === 'stabled'
            && h.locationGameIndex >= FARM_INDEX_MIN && h.locationGameIndex <= FARM_INDEX_MAX
            && h.crowdSlot >= 1;
    }
    const params = {
        replaceDna: {
            source: 'population', popName: '', vatValue: null, libraryId: '', profileKey: 'legwheels',
            legalize: false, legalizePop: ''
        },
        applyProfile: { profileKey: 'legwheels' },
        setAgePersonality: { setAge: false, age: 4, setPersonality: false, personality: 0 }
    };
    function readByte(offset) { return doc.patches.has(offset) ? doc.patches.get(offset) : doc.state.bytes[offset]; }
    function locationDisplayName(name, index) { return LocTemplates.displayName(index, name); }
    function nameFor(h) {
        if (h.recordIndex !== null && h.recordIndex >= 0 && h.recordIndex < doc.state.records.length) {
            const rec = doc.state.records[h.recordIndex];
            return doc.renamedRecords.has(h.recordIndex) ? doc.renamedRecords.get(h.recordIndex) : (rec.name || '(unnamed)');
        }
        return '(unnamed)';
    }
    function horseLabel(h) {
        const containerLabel = h.container === 'official' ? 'bookie' : h.container === 'lost' ? 'lost horse' : h.container;
        return nameFor(h) + ' [' + containerLabel + ' @' + h.detailOff + ']';
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
    const comboCache = new Map();
    function getCombosForGene(gene) {
        if (comboCache.has(gene.id)) return comboCache.get(gene.id);
        const prio = gene.n;
        const combos = [];
        for (let idx1 = 0; idx1 < 4; idx1++) {
            for (let idx2 = idx1; idx2 < 4; idx2++) {
                combos.push({ value: gene.valueMatrix[idx1][idx2], allele1: prio[idx1], allele2: prio[idx2] });
            }
        }
        comboCache.set(gene.id, combos);
        return combos;
    }
    function setGeneToValueInBytes(bytes, desc, targetValue) {
        const gene = geneByDesc.get(desc);
        if (!gene) return { ok: false };
        const curByte = bytes[gene.id];
        const curPair = Genome.byteToPair(gene, curByte);
        const matches = getCombosForGene(gene).filter((c) => c.value === targetValue);
        if (!matches.length) return { ok: false };
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
        if (!profile) return;
        for (const op of profile.ops) {
            if (isOpSatisfied(bytes, op)) continue;
            const targetValue = op.atLeast !== undefined ? op.atLeast : op.value;
            setGeneToValueInBytes(bytes, op.gene, targetValue);
        }
    }
    function loadLibrary() {
        library = [];
        for (const cat of DnaLib.all()) {
            for (const entry of cat.entries) {
                library.push({ id: entry.id, name: cat.name + ' / ' + entry.name, dnaText: entry.dnaText });
            }
        }
    }
    function commitPatchBatch(writes, label) {
        if (!writes.size) return false;
        const NO_PATCH = Symbol('no-patch');
        const prevPatch = new Map(), origByte = new Map();
        for (const offset of writes.keys()) {
            prevPatch.set(offset, doc.patches.has(offset) ? doc.patches.get(offset) : NO_PATCH);
            origByte.set(offset, doc.state.bytes[offset]);
        }
        const applyValues = (getValue) => {
            for (const offset of writes.keys()) {
                const v = getValue(offset);
                if (v === origByte.get(offset)) doc.patches.delete(offset); else doc.patches.set(offset, v);
            }
            doc._touched();
        };
        applyValues((offset) => writes.get(offset));
        doc.history.push({
            label,
            undo: () => applyValues((offset) => { const p = prevPatch.get(offset); return p === NO_PATCH ? origByte.get(offset) : p; }),
            redo: () => applyValues((offset) => writes.get(offset))
        });
        return true;
    }
    function commitItemsBatch(writes, label) {
        if (!writes.size) return false;
        const NO_ENTRY = Symbol('no-entry');
        const prev = new Map();
        for (const detailOff of writes.keys()) prev.set(detailOff, doc.changedHorseItems.has(detailOff) ? doc.changedHorseItems.get(detailOff) : NO_ENTRY);
        const applyValues = (getValue) => {
            for (const detailOff of writes.keys()) {
                const v = getValue(detailOff);
                if (v === undefined || v === NO_ENTRY) doc.changedHorseItems.delete(detailOff); else doc.changedHorseItems.set(detailOff, v);
            }
            doc._touched();
        };
        applyValues((detailOff) => writes.get(detailOff));
        doc.history.push({
            label,
            undo: () => applyValues((detailOff) => { const p = prev.get(detailOff); return p === NO_ENTRY ? undefined : p; }),
            redo: () => applyValues((detailOff) => writes.get(detailOff))
        });
        return true;
    }
    function commitDeleteWorldItemsBatch(starts, label) {
        const toAdd = starts.filter((s) => !doc.deletedWorldItems.has(s));
        if (!toAdd.length) return false;
        for (const s of toAdd) doc.deletedWorldItems.add(s);
        doc._touched();
        doc.history.push({
            label,
            undo: () => { for (const s of toAdd) doc.deletedWorldItems.delete(s); doc._touched(); },
            redo: () => { for (const s of toAdd) doc.deletedWorldItems.add(s); doc._touched(); }
        });
        return true;
    }
    function commitGridBatch(entries, label) {
        if (!entries.length) return false;
        for (const e of entries) doc.grid.set(e.x, e.y, e.after);
        doc.touchGrid(+1);
        doc._touched();
        const apply = (useAfter, delta) => {
            for (const e of entries) doc.grid.set(e.x, e.y, useAfter ? e.after : e.before);
            doc.touchGrid(delta);
            doc._touched();
        };
        doc.history.push({ label, undo: () => apply(false, -1), redo: () => apply(true, +1) });
        return true;
    }
    function inMapSelection(h) {
        const sel = (typeof App !== 'undefined') ? App.mapSelection : null;
        if (!sel) return true;
        const moved = doc.movedWorldItems.get(h.worldItemStart);
        const x = moved ? moved.x : h.x, y = moved ? moved.y : h.y;
        return x >= sel.x0 && x < sel.x1 && y >= sel.y0 && y < sel.y1;
    }
    function computeTargets() {
        if (!doc) return [];
        const out = [];
        for (const h of doc.liveHorses()) {
            let include = false;
            if (h.container === 'map' && target.onMap) include = true;
            else if (h.container === 'stabled') {
                const farm = isFarmHorse(h);
                if (farm ? target.farmHorses : target.otherBuildings) include = true;
                else if (target.oneLocation && h.locationIndex === target.locationIndex) include = true;
            } else if (h.container === 'official' && target.bookies) include = true;
            if (include && target.inSelection && (h.container !== 'map' || !inMapSelection(h))) include = false;
            if (include) out.push(h);
        }
        return out;
    }
    function isDeletableHorse(h) {
        return h.container === 'map' || h.container === 'stabled';
    }
    function crowdShortfalls(victims) {
        const losing = new Map();
        for (const h of victims) {
            if (h.container !== 'stabled') continue;
            losing.set(h.locationIndex, (losing.get(h.locationIndex) || 0) + 1);
        }
        const out = [];
        for (const [li, n] of losing) {
            const loc = doc.state.locations[li];
            if (!loc || loc.index === null) continue;
            const tpl = (typeof LocTemplates !== 'undefined') ? LocTemplates.get(loc.index) : null;
            const min = tpl ? tpl.minCrowd : 0;
            const now = (loc.horseBlocks || [])
                .filter((b) => !doc.deletedStabledHorses.has(b.genomeOff)).length;
            const after = now - n;
            if (min > 0 && after < min) {
                out.push({ name: locationDisplayName(loc.name, loc.index), from: now, to: after, min });
            }
        }
        return out.sort((a, b) => (a.min - a.to) - (b.min - b.to)).reverse();
    }
    function commitHorseDeletion(victims) {
        const mapStarts = [];
        const stabledOffs = [];
        for (const h of victims) {
            if (h.container === 'map' && h.worldItemStart !== null && !doc.deletedWorldItems.has(h.worldItemStart)) {
                mapStarts.push(h.worldItemStart);
            } else if (h.container === 'stabled' && !doc.deletedStabledHorses.has(h.genomeOff)) {
                stabledOffs.push(h.genomeOff);
            }
        }
        if (!mapStarts.length && !stabledOffs.length) return false;
        const apply = (on) => {
            for (const s of mapStarts) { if (on) doc.deletedWorldItems.add(s); else doc.deletedWorldItems.delete(s); }
            for (const g of stabledOffs) { if (on) doc.deletedStabledHorses.add(g); else doc.deletedStabledHorses.delete(g); }
            doc._touched();
        };
        apply(true);
        doc.history.push({
            label: 'Bulk clear ' + (mapStarts.length + stabledOffs.length) + ' horses',
            undo: () => apply(false),
            redo: () => apply(true)
        });
        return true;
    }
    function computeVegetationTiles(wantMax) {
        const entries = [];
        const grid = doc.grid;
        for (let y = 0; y < grid.height; y++) {
            for (let x = 0; x < grid.width; x++) {
                const rec = grid.get(x, y);
                const fam = SaveFile.VEGETATION[rec.id];
                if (!fam) continue;
                const wantHealth = wantMax ? fam.maxHealth : 0;
                if (rec.health === wantHealth) continue;
                entries.push({ x, y, before: rec, after: Object.assign({}, rec, { health: wantHealth }) });
            }
        }
        return entries;
    }
    function computeFenceTiles() {
        const entries = [];
        const grid = doc.grid;
        for (let y = 0; y < grid.height; y++) {
            for (let x = 0; x < grid.width; x++) {
                const rec = grid.get(x, y);
                if (!rec.fenceT && !rec.fenceL) continue;
                entries.push({ x, y, before: rec, after: Object.assign({}, rec, { fenceT: false, fenceL: false }) });
            }
        }
        return entries;
    }
    const WATER = Object.freeze({ fam: 6, fenceT: false, fenceL: false, id: 9, health: null });
    function computeResetTiles() {
        const entries = [];
        const grid = doc.grid;
        for (let y = 0; y < grid.height; y++) {
            for (let x = 0; x < grid.width; x++) {
                if (grid.isBorder(x, y)) continue;
                const rec = grid.get(x, y);
                if (rec.fam === WATER.fam && rec.fenceT === WATER.fenceT && rec.fenceL === WATER.fenceL && rec.id === WATER.id && rec.health === WATER.health) continue;
                entries.push({ x, y, before: rec, after: Object.assign({}, WATER) });
            }
        }
        return entries;
    }
    function computeWorldItemsByType(type) {
        return doc.state.items.filter((it) => it.type === type && !doc.deletedWorldItems.has(it.start));
    }
    function randomBuriedPos(grid) {
        const col = 1 + Math.floor(Math.random() * Math.max(1, grid.width - 2));
        const row = 1 + Math.floor(Math.random() * Math.max(1, grid.height - 2));
        return { x: col * 32, y: row * 32 + 32 };
    }
    function currentGenome(h) {
        const bytes = new Uint8Array(SaveFile.GENOME_LEN);
        for (let i = 0; i < SaveFile.GENOME_LEN; i++) bytes[i] = readByte(h.genomeOff + i);
        return bytes;
    }
    function legalizePopFor(p) {
        if (!p.legalize || (p.source !== 'population' && p.source !== 'vat')) return null;
        return (p.legalizePop && popTable && popTable.has(p.legalizePop)) ? p.legalizePop : null;
    }
    function replaceDnaGenerator(p) {
        const legalizePop = legalizePopFor(p);
        const legal = (bytes) => (legalizePop
            ? PopData.legalizeBytes(geneTable, popTable, legalizePop, bytes).bytes : bytes);
        if (p.source === 'genome' || p.source === 'random') {
            const probe = GenomeSource.resolve(p.source, { doc });
            if (!probe || !probe.genome) return null;
            return p.source === 'genome'
                ? () => probe.genome
                : (baseBytes) => {
                    const g = GenomeSource.resolve('random', { doc, base: baseBytes, quiet: true });
                    return (g && g.genome) || baseBytes;
                };
        }
        if (p.source === 'population') {
            if (!p.popName || !popTable.has(p.popName)) { Toast.toast('Pick a population first.', 'bad'); return null; }
            return (baseBytes) => legal(Genome.encodeGenome(geneTable, PopData.sampleGenome(geneTable, popTable, p.popName), baseBytes));
        }
        if (p.source === 'vat') {
            if (!p.vatValue) { Toast.toast('Pick a Biohacker vat or profile first.', 'bad'); return null; }
            const got = GenomeSource.vatFor(p.vatValue, { doc, geneTable });
            if (got.error) { Toast.toast(got.error + '.', 'bad'); return null; }
            if (!GenomeSource.resolve(p.vatValue, { doc, quiet: true })) {
                Toast.toast('The Biohacker source is not ready yet — try again in a moment.', 'bad'); return null;
            }
            return (baseBytes) => {
                const g = GenomeSource.resolve(p.vatValue, { doc, base: baseBytes, legalizeTo: legalizePop, quiet: true });
                return (g && g.genome) || baseBytes;
            };
        }
        if (p.source === 'library') {
            const entry = library.find((e) => e.id === p.libraryId);
            if (!entry) { Toast.toast('Pick a DNA Library entry first.', 'bad'); return null; }
            const parsed = Genome.parseGenomeText(entry.dnaText);
            return (baseBytes) => Genome.encodeGenome(geneTable, parsed, baseBytes);
        }
        return null;
    }
    function replaceDnaSourceLabel(p) {
        let s;
        if (p.source === 'genome') s = 'current genome';
        else if (p.source === 'random') s = 'random on-map horse';
        else if (p.source === 'population') s = p.popName + ' population';
        else if (p.source === 'library') {
            const entry = library.find((e) => e.id === p.libraryId);
            s = 'library' + (entry ? ' ' + entry.name : '');
        } else if (p.source === 'vat') {
            const got = GenomeSource.vatFor(p.vatValue, { doc, geneTable });
            s = got.error ? 'Biohacker' : (p.vatValue === 'vat:save' ? 'Bio-Hacker vat' : 'profile ' + got.name);
        } else s = p.source;
        const lp = legalizePopFor(p);
        return lp ? s + ', legalized to ' + lp : s;
    }
    function rollKey(p) {
        return [p.source, p.popName, p.vatValue, legalizePopFor(p) || ''].join('|');
    }
    function rollExamples(p, targets) {
        const genFn = replaceDnaGenerator(p);
        if (!genFn) return;
        const base = (targets && targets.length) ? currentGenome(targets[0]) : null;
        const genomes = [];
        for (let i = 0; i < ROLL_COUNT; i++) {
            const g = genFn(base);
            if (g && g.length === SaveFile.GENOME_LEN) genomes.push(Uint8Array.from(g));
        }
        rollSamples = { key: rollKey(p), genomes };
        renderParams();
    }
    const OPS = {
        replaceDna: {
            group: 'HORSES', label: 'Replace DNA', kind: 'horses',
            desc: 'Overwrite every targeted horse’s genome. The Gene profile source edits named genes instead of replacing the whole genome.',
            affected: (targets) => targets.length,
            preview: (targets) => targets.slice(0, 8).map(horseLabel),
            apply: (targets) => {
                const p = params.replaceDna;
                if (p.source === 'profile') {
                    return applyProfileToTargets(p.profileKey, targets,
                        'Bulk replace DNA (profile ' + GENE_PROFILES[p.profileKey].label + ') on ' + targets.length + ' horses');
                }
                const genFn = replaceDnaGenerator(p);
                if (!genFn) return false;
                const writes = new Map();
                for (const h of targets) {
                    const baseBytes = currentGenome(h);
                    const newBytes = genFn(baseBytes);
                    for (let i = 0; i < SaveFile.GENOME_LEN; i++) {
                        const off = h.genomeOff + i;
                        if (newBytes[i] !== readByte(off)) writes.set(off, newBytes[i]);
                    }
                }
                return commitPatchBatch(writes, 'Bulk replace DNA (' + replaceDnaSourceLabel(p) + ') on ' + targets.length + ' horses');
            }
        },
        applyProfile: {
            group: 'HORSES', label: 'Apply profile', kind: 'horses',
            desc: 'Apply a named gene profile to every targeted horse’s current genome. Edits named genes only.',
            affected: (targets) => targets.length,
            preview: (targets) => targets.slice(0, 8).map(horseLabel),
            apply: (targets) => applyProfileToTargets(params.applyProfile.profileKey, targets,
                'Bulk apply profile (' + GENE_PROFILES[params.applyProfile.profileKey].label + ') on ' + targets.length + ' horses')
        },
        setAgePersonality: {
            group: 'HORSES', label: 'Set age / personality', kind: 'horses',
            desc: 'Set every targeted horse’s age and/or personality to a fixed value.',
            affected: (targets) => targets.length,
            preview: (targets) => targets.slice(0, 8).map(horseLabel),
            apply: (targets) => {
                const p = params.setAgePersonality;
                if (!p.setAge && !p.setPersonality) { Toast.toast('Tick Age and/or Personality first.', 'bad'); return false; }
                const writes = new Map();
                for (const h of targets) {
                    if (p.setAge) { const off = h.detailOff + DET.AGE, v = p.age & 0xFF; if (readByte(off) !== v) writes.set(off, v); }
                    if (p.setPersonality) { const off = h.detailOff + DET.PERSONALITY, v = p.personality & 0xFF; if (readByte(off) !== v) writes.set(off, v); }
                }
                return commitPatchBatch(writes, 'Bulk set age/personality on ' + targets.length + ' horses');
            }
        },
        clearItems: {
            group: 'HORSES', label: 'Clear items', kind: 'horses',
            desc: 'Remove every worn item from each targeted horse.',
            affected: (targets) => targets.filter((h) => getCurrentItemsFor(h).length > 0).length,
            preview: (targets) => targets.filter((h) => getCurrentItemsFor(h).length > 0).slice(0, 8).map(horseLabel),
            apply: (targets) => {
                const writes = new Map();
                for (const h of targets) if (getCurrentItemsFor(h).length > 0) writes.set(h.detailOff, []);
                return commitItemsBatch(writes, 'Bulk clear items on ' + writes.size + ' horses');
            }
        },
        clearHorses: {
            group: 'HORSES', label: 'Clear horses', kind: 'horses',
            desc: 'Delete the targeted horses. Only horses on the map or stabled, because ' +
                  'Bookies and shop owners sit in fixed slots.',
            affected: (targets) => targets.filter(isDeletableHorse).length,
            preview: (targets) => targets.filter(isDeletableHorse).slice(0, 8).map(horseLabel),
            apply: (targets) => {
                const victims = targets.filter(isDeletableHorse);
                if (!victims.length) return false;
                return commitHorseDeletion(victims);
            }
        },
        growAll: {
            group: 'WORLD', label: 'Grow All', kind: 'world',
            desc: 'Set every vegetation tile’s growth to its family maximum.',
            affected: () => computeVegetationTiles(true).length,
            preview: () => computeVegetationTiles(true).slice(0, 8).map((e) => '(' + e.x + ',' + e.y + ') ' + SaveFile.VEGETATION[e.before.id].name + ' ' + (e.before.health === null ? '?' : e.before.health) + '→' + e.after.health),
            apply: () => commitGridBatch(computeVegetationTiles(true), 'Bulk grow all')
        },
        ungrowAll: {
            group: 'WORLD', label: 'Ungrow all', kind: 'world',
            desc: 'Cut every vegetation tile down to growth 0.',
            affected: () => computeVegetationTiles(false).length,
            preview: () => computeVegetationTiles(false).slice(0, 8).map((e) => '(' + e.x + ',' + e.y + ') ' + SaveFile.VEGETATION[e.before.id].name + ' ' + (e.before.health === null ? '?' : e.before.health) + '→0'),
            apply: () => commitGridBatch(computeVegetationTiles(false), 'Bulk ungrow all')
        },
        clearHoles: {
            group: 'WORLD', label: 'Clear holes', kind: 'world',
            desc: 'Remove every hole from the map.',
            affected: () => computeWorldItemsByType(4).length,
            preview: () => computeWorldItemsByType(4).slice(0, 8).map((it) => '(' + Math.round(it.x) + ',' + Math.round(it.y) + ') item ' + it.index),
            apply: () => commitDeleteWorldItemsBatch(computeWorldItemsByType(4).map((it) => it.start), 'Bulk clear holes')
        },
        clearGround: {
            group: 'WORLD', label: 'Clear ground', kind: 'world',
            desc: 'Remove every ground item from the map.',
            affected: () => computeWorldItemsByType(3).length,
            preview: () => computeWorldItemsByType(3).slice(0, 8).map((it) => '(' + Math.round(it.x) + ',' + Math.round(it.y) + ') item ' + it.index),
            apply: () => commitDeleteWorldItemsBatch(computeWorldItemsByType(3).map((it) => it.start), 'Bulk clear ground')
        },
        removeFences: {
            group: 'WORLD', label: 'Remove fences', kind: 'world',
            desc: 'Clear every top/left fence edge on every tile.',
            affected: () => computeFenceTiles().length,
            preview: () => computeFenceTiles().slice(0, 8).map((e) => '(' + e.x + ',' + e.y + ')' + (e.before.fenceT ? ' T' : '') + (e.before.fenceL ? ' L' : '')),
            apply: () => commitGridBatch(computeFenceTiles(), 'Bulk remove fences')
        },
        scatterBuried: {
            group: 'WORLD', label: 'Scatter buried', kind: 'world',
            desc: 'Move every buried item to a new random position. The items themselves do not change.',
            affected: () => doc.buriedItems.length,
            preview: () => doc.buriedItems.slice(0, 8).map((it) => 'item ' + it.itemIndex + ' @ (' + it.x + ',' + it.y + ')'),
            apply: () => {
                if (!doc.buriedItems.length) return false;
                const next = doc.buriedItems.map((it) => Object.assign({}, it, randomBuriedPos(doc.grid)));
                doc.setBuriedItems(next);
                return true;
            }
        },
        resetAllTiles: {
            group: 'CLEANUP', label: 'Reset all tiles', kind: 'cleanup',
            desc: 'Every non-border tile becomes plain water. Border tiles are left untouched. Destructive and map-wide — there is no undo once you close the document, though it is one normal undo entry while the session is open.',
            affected: () => computeResetTiles().length,
            preview: () => computeResetTiles().slice(0, 8).map((e) => '(' + e.x + ',' + e.y + ') fam ' + e.before.fam + ' id ' + e.before.id + ' → water'),
            apply: () => commitGridBatch(computeResetTiles(), 'Bulk reset all tiles')
        }
    };
    const OP_ORDER = ['replaceDna', 'applyProfile', 'setAgePersonality', 'clearItems', 'clearHorses',
        'growAll', 'ungrowAll', 'clearHoles', 'clearGround', 'removeFences', 'scatterBuried',
        'resetAllTiles'];
    function getCurrentItemsFor(h) {
        if (doc.changedHorseItems.has(h.detailOff)) return doc.changedHorseItems.get(h.detailOff).slice();
        const loc = SaveExport.locateHorseItemList(doc.state.bytes, doc.state.view, h.detailOff);
        const items = [];
        for (let i = 0; i < loc.itemCount; i++) {
            const off = loc.itemListStart + i * 8;
            items.push({
                slot: SaveFile.u32(doc.state.view, off, doc.state.bytes.length),
                itemId: SaveFile.u32(doc.state.view, off + 4, doc.state.bytes.length)
            });
        }
        return items;
    }
    function applyProfileToTargets(profileKey, targets, label) {
        const profile = GENE_PROFILES[profileKey];
        if (!profile) return false;
        const writes = new Map();
        for (const h of targets) {
            const bytes = new Uint8Array(SaveFile.GENOME_LEN);
            for (let i = 0; i < SaveFile.GENOME_LEN; i++) bytes[i] = readByte(h.genomeOff + i);
            applyGeneProfileToBytes(bytes, profileKey);
            for (let i = 0; i < SaveFile.GENOME_LEN; i++) {
                const off = h.genomeOff + i;
                if (bytes[i] !== readByte(off)) writes.set(off, bytes[i]);
            }
        }
        return commitPatchBatch(writes, label);
    }
    function isPaneActive() { return paneEl && paneEl.classList.contains('active'); }
    function el(tag, cls, text) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }
    function renderOpsList() {
        els.opsList.innerHTML = '';
        let lastGroup = null;
        for (const id of OP_ORDER) {
            const op = OPS[id];
            if (op.group !== lastGroup) {
                els.opsList.appendChild(el('div', 'bk-group-title', op.group));
                lastGroup = op.group;
            }
            const btn = el('button', 'bk-op' + (id === selectedOp ? ' active' : ''), op.label);
            btn.dataset.op = id;
            btn.addEventListener('click', () => { selectedOp = id; renderAll(); });
            els.opsList.appendChild(btn);
        }
    }
    function renderTargetSection(container) {
        const sec = el('div', 'bk-section');
        sec.appendChild(el('div', 'bk-section-title', 'Target'));
        const counts = { map: 0, stabled: 0, official: 0, farm: 0, otherBuildings: 0 };
        for (const h of doc.liveHorses()) {
            counts[h.container]++;
            if (h.container === 'stabled') counts[isFarmHorse(h) ? 'farm' : 'otherBuildings']++;
        }
        const row = (labelText, checked, count, onChange) => {
            const r = el('label', 'bk-check-row');
            const cb = document.createElement('input');
            cb.type = 'checkbox'; cb.checked = checked;
            cb.addEventListener('change', () => { onChange(cb.checked); renderParams(); });
            r.appendChild(cb);
            r.appendChild(el('span', 'bk-check-label', labelText));
            r.appendChild(el('span', 'bk-check-count', String(count)));
            return r;
        };
        sec.appendChild(row('On the map', target.onMap, counts.map, (v) => { target.onMap = v; }));
        const farmRow = row('Farm horses', target.farmHorses, counts.farm, (v) => { target.farmHorses = v; });
        farmRow.title = 'The twelve stables (numbered ' + FARM_INDEX_MIN + '–' + FARM_INDEX_MAX +
            '), starting from the second horse in each — not the one it already came with.';
        sec.appendChild(farmRow);
        const otherRow = row('Others in Buildings', target.otherBuildings, counts.otherBuildings,
            (v) => { target.otherBuildings = v; });
        otherRow.title = 'Every other stabled horse: all non-stable buildings, plus the first horse in each stable. ' +
            'Together with Farm horses, this covers every stabled horse.';
        sec.appendChild(otherRow);
        const oneLocRow = el('div', 'bk-check-row bk-onelocation');
        const oneLocCb = document.createElement('input');
        oneLocCb.type = 'checkbox'; oneLocCb.checked = target.oneLocation;
        oneLocCb.addEventListener('change', () => { target.oneLocation = oneLocCb.checked; renderParams(); });
        oneLocRow.appendChild(oneLocCb);
        oneLocRow.appendChild(el('span', 'bk-check-label', 'One location'));
        const locSelect = document.createElement('select');
        locSelect.disabled = !target.oneLocation;
        doc.state.locations.forEach((loc, i) => {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = locationDisplayName(loc.name, loc.index) + ' (' + loc.crowd + ')';
            if (i === target.locationIndex) opt.selected = true;
            locSelect.appendChild(opt);
        });
        locSelect.addEventListener('change', () => { target.locationIndex = Number(locSelect.value); renderParams(); });
        oneLocRow.appendChild(locSelect);
        sec.appendChild(oneLocRow);
        const offRow = el('div', 'bk-check-row');
        const offCb = document.createElement('input');
        offCb.type = 'checkbox'; offCb.checked = target.bookies;
        offCb.addEventListener('change', () => { target.bookies = offCb.checked; renderParams(); });
        offRow.appendChild(offCb);
        offRow.appendChild(el('span', 'bk-check-label', 'Bookies'));
        offRow.appendChild(el('span', 'bk-check-count', String(counts.official)));
        sec.appendChild(offRow);
        const sel = (typeof App !== 'undefined') ? App.mapSelection : null;
        const selRow = el('div', 'bk-check-row');
        const selCb = document.createElement('input');
        selCb.type = 'checkbox'; selCb.checked = target.inSelection; selCb.disabled = !sel;
        selCb.addEventListener('change', () => { target.inSelection = selCb.checked; renderParams(); });
        selRow.appendChild(selCb);
        selRow.appendChild(el('span', 'bk-check-label', 'Only inside map selection'));
        sec.appendChild(selRow);
        sec.appendChild(el('div', 'hint', sel
            ? 'Applies to On-the-map horses only (stabled/bookies have no map position).'
            : 'No region selected yet — in the World workspace, pick Rect, check "select region", then drag on the map.'));
        container.appendChild(sec);
    }
    function radioRow(name, value, checked, labelText, onChange) {
        const r = el('label', 'bk-radio-row');
        const rb = document.createElement('input');
        rb.type = 'radio'; rb.name = name; rb.value = value; rb.checked = checked;
        rb.addEventListener('change', () => { if (rb.checked) onChange(); });
        r.appendChild(rb);
        r.appendChild(el('span', null, labelText));
        return { row: r, radio: rb };
    }
    function renderReplaceDnaSource(container, targets) {
        const p = params.replaceDna;
        const sec = el('div', 'bk-section');
        sec.appendChild(el('div', 'bk-section-title', 'Source'));
        const curR = radioRow('bkSource', 'genome', p.source === 'genome', 'Current genome (\uD83E\uDDEC)', () => { p.source = 'genome'; renderParams(); });
        sec.appendChild(curR.row);
        if (p.source === 'genome') {
            sec.appendChild(el('div', 'hint', 'Every targeted horse gets the same genome \u2014 the one the Genome workspace is showing.'));
        }
        const randR = radioRow('bkSource', 'random', p.source === 'random', 'Random on-map horse', () => { p.source = 'random'; renderParams(); });
        sec.appendChild(randR.row);
        if (p.source === 'random') {
            sec.appendChild(el('div', 'hint', 'A fresh donor is drawn for each targeted horse, so this shuffles the herd rather than cloning one horse across it.'));
        }
        const popWrap = el('div', 'bk-radio-line');
        const popR = radioRow('bkSource', 'population', p.source === 'population', 'Population', () => { p.source = 'population'; renderParams(); });
        popWrap.appendChild(popR.row);
        const popSelect = document.createElement('select');
        presetNames.forEach((name) => {
            const opt = document.createElement('option'); opt.value = name; opt.textContent = name;
            if (name === p.popName) opt.selected = true;
            popSelect.appendChild(opt);
        });
        popSelect.addEventListener('change', () => { p.popName = popSelect.value; renderParams(); });
        popSelect.addEventListener('focus', () => { popR.radio.checked = true; p.source = 'population'; });
        popWrap.appendChild(popSelect);
        sec.appendChild(popWrap);
        if (p.source === 'population') {
            sec.appendChild(el('div', 'hint',
                'Each horse is sampled independently. Most populations lock the majority of their 240 genes to one allele, so draws look alike: "helix" locks every one of them and hands every horse the same genome, and "duck" varies at 5 positions. "freak" varies at 225.'));
        }
        const vatWrap = el('div', 'bk-radio-line');
        const vatR = radioRow('bkSource', 'vat', p.source === 'vat', 'Biohacker', () => { p.source = 'vat'; renderParams(); });
        vatWrap.appendChild(vatR.row);
        const vatSelect = document.createElement('select');
        const choices = GenomeSource.vatChoices(doc);
        if (!choices.some((c) => c.value === p.vatValue)) {
            const firstOk = choices.find((c) => !c.disabled);
            p.vatValue = firstOk ? firstOk.value : (choices[0] ? choices[0].value : null);
        }
        for (const c of choices) {
            const opt = document.createElement('option');
            opt.value = c.value; opt.textContent = c.label; opt.disabled = c.disabled;
            if (c.reason) opt.title = c.reason;
            if (c.value === p.vatValue) opt.selected = true;
            vatSelect.appendChild(opt);
        }
        vatSelect.disabled = !choices.length;
        vatSelect.addEventListener('change', () => { p.vatValue = vatSelect.value; p.source = 'vat'; renderParams(); });
        vatSelect.addEventListener('focus', () => { vatR.radio.checked = true; p.source = 'vat'; });
        vatWrap.appendChild(vatSelect);
        sec.appendChild(vatWrap);
        if (p.source === 'vat') {
            const got = p.vatValue ? GenomeSource.vatFor(p.vatValue, { doc, geneTable })
                : { error: 'The Biohacker module has not loaded' };
            if (got.error) {
                sec.appendChild(el('div', 'bk-warn-note bk-indent', got.error + '.'));
            } else {
                const empty = BioVat.stats(got.vat).emptyGenes;
                if (empty > 0) {
                    sec.appendChild(el('div', 'bk-warn-note bk-indent',
                        empty + ' gene' + (empty === 1 ? '' : 's') + ' empty — those keep each horse’s own alleles.'));
                }
            }
        }
        const libR = radioRow('bkSource', 'library', p.source === 'library', 'Library entry', () => { p.source = 'library'; renderParams(); });
        sec.appendChild(libR.row);
        if (p.source === 'library') {
            if (!p.libraryId && library.length) p.libraryId = library[0].id;
            const libHost = document.createElement('div');
            libHost.className = 'libpicker-host bk-inline-libpicker';
            sec.appendChild(libHost);
            libraryPicker = LibPicker.mount(libHost, {
                value: p.libraryId,
                placeholder: 'Search DNA Library…',
                onChange(entryId) { p.libraryId = entryId || ''; renderParams(); }
            });
        }
        const profR = radioRow('bkSource', 'profile', p.source === 'profile', 'Gene profile', () => { p.source = 'profile'; renderParams(); });
        sec.appendChild(profR.row);
        if (p.source === 'profile') {
            const profSelect = document.createElement('select');
            profSelect.className = 'bk-inline-select';
            PROFILE_KEYS.forEach((key) => {
                const opt = document.createElement('option'); opt.value = key; opt.textContent = GENE_PROFILES[key].label;
                if (key === p.profileKey) opt.selected = true;
                profSelect.appendChild(opt);
            });
            profSelect.addEventListener('change', () => { p.profileKey = profSelect.value; renderParams(); });
            sec.appendChild(profSelect);
            sec.appendChild(el('div', 'hint', 'Edits specific genes on each horse’s CURRENT genome — does not replace the whole genome.'));
        }
        container.appendChild(sec);
        if (RANDOM_SOURCES.has(p.source)) renderReplaceDnaDraw(container, targets);
    }
    function renderReplaceDnaDraw(container, targets) {
        const p = params.replaceDna;
        const sec = el('div', 'bk-section');
        sec.appendChild(el('div', 'bk-section-title', 'Draw'));
        if (p.source === 'population' || p.source === 'vat') {
            const legRow = el('div', 'bk-check-row bk-legalize');
            const legCb = document.createElement('input');
            legCb.type = 'checkbox'; legCb.checked = p.legalize;
            legCb.addEventListener('change', () => { p.legalize = legCb.checked; renderParams(); });
            legRow.appendChild(legCb);
            legRow.appendChild(el('span', 'bk-check-label', 'Legalize to'));
            const legSelect = document.createElement('select');
            legSelect.disabled = !p.legalize;
            presetNames.forEach((name) => {
                const opt = document.createElement('option'); opt.value = name; opt.textContent = name;
                if (name === p.legalizePop) opt.selected = true;
                legSelect.appendChild(opt);
            });
            legSelect.addEventListener('change', () => { p.legalizePop = legSelect.value; renderParams(); });
            legRow.appendChild(legSelect);
            legRow.title = 'Each drawn genome has every allele this population cannot produce snapped to its commonest legal one.';
            sec.appendChild(legRow);
        }
        const rollBtn = el('button', 'btn', '🎲 Roll 3');
        rollBtn.title = 'Draw three example genomes from this source. Nothing is written.';
        rollBtn.addEventListener('click', () => rollExamples(p, targets));
        const rollLine = el('div', 'bk-roll-line');
        rollLine.appendChild(rollBtn);
        sec.appendChild(rollLine);
        const mounts = [];
        if (rollSamples && rollSamples.key === rollKey(p) && rollSamples.genomes.length) {
            const row = el('div', 'bk-roll-row');
            for (const g of rollSamples.genomes) {
                const box = el('div', 'bk-roll-box');
                row.appendChild(box);
                mounts.push({ box, g });
            }
            sec.appendChild(row);
            sec.appendChild(el('div', 'hint', 'Examples only — Apply draws fresh per horse.'));
        }
        container.appendChild(sec);
        if (typeof HorsePreview !== 'undefined') {
            for (const m of mounts) HorsePreview.mount(m.box, { getBytes: () => m.g });
        }
    }
    function renderApplyProfileParams(container) {
        const p = params.applyProfile;
        const sec = el('div', 'bk-section');
        sec.appendChild(el('div', 'bk-section-title', 'Profile'));
        const select = document.createElement('select');
        select.className = 'bk-inline-select';
        PROFILE_KEYS.forEach((key) => {
            const opt = document.createElement('option'); opt.value = key; opt.textContent = GENE_PROFILES[key].label;
            if (key === p.profileKey) opt.selected = true;
            select.appendChild(opt);
        });
        select.addEventListener('change', () => { p.profileKey = select.value; renderParams(); });
        sec.appendChild(select);
        container.appendChild(sec);
    }
    function renderSetAgePersonalityParams(container) {
        const p = params.setAgePersonality;
        const sec = el('div', 'bk-section');
        sec.appendChild(el('div', 'bk-section-title', 'Values'));
        const ageRow = el('div', 'bk-check-row');
        const ageCb = document.createElement('input');
        ageCb.type = 'checkbox'; ageCb.checked = p.setAge;
        ageCb.addEventListener('change', () => { p.setAge = ageCb.checked; renderParams(); });
        ageRow.appendChild(ageCb);
        ageRow.appendChild(el('span', 'bk-check-label', 'Age'));
        const ageInput = document.createElement('input');
        ageInput.type = 'number'; ageInput.min = '0'; ageInput.max = '255'; ageInput.value = String(p.age);
        ageInput.disabled = !p.setAge;
        ageInput.addEventListener('input', () => { p.age = Math.max(0, Math.min(255, Number(ageInput.value) || 0)); });
        ageRow.appendChild(ageInput);
        sec.appendChild(ageRow);
        const persRow = el('div', 'bk-check-row');
        const persCb = document.createElement('input');
        persCb.type = 'checkbox'; persCb.checked = p.setPersonality;
        persCb.addEventListener('change', () => { p.setPersonality = persCb.checked; renderParams(); });
        persRow.appendChild(persCb);
        persRow.appendChild(el('span', 'bk-check-label', 'Personality'));
        const persSelect = document.createElement('select');
        persSelect.disabled = !p.setPersonality;
        PERSONALITIES.forEach((name, i) => {
            const opt = document.createElement('option'); opt.value = String(i); opt.textContent = name + ' (' + i + ')';
            if (i === p.personality) opt.selected = true;
            persSelect.appendChild(opt);
        });
        persSelect.addEventListener('change', () => { p.personality = Number(persSelect.value); });
        persRow.appendChild(persSelect);
        sec.appendChild(persRow);
        container.appendChild(sec);
    }
    function renderParams() {
        if (!doc || !dataReady) return;
        loadLibrary();
        const op = OPS[selectedOp];
        if (libraryPicker) { libraryPicker.destroy(); libraryPicker = null; }
        els.params.innerHTML = '';
        const header = el('div', 'bk-op-header');
        header.appendChild(el('div', 'bk-op-title', op.label));
        header.appendChild(el('div', 'bk-op-desc', op.desc));
        els.params.appendChild(header);
        let targets = null;
        if (op.kind === 'horses') {
            renderTargetSection(els.params);
            targets = computeTargets();
        }
        if (selectedOp === 'replaceDna') renderReplaceDnaSource(els.params, targets);
        else if (selectedOp === 'applyProfile') renderApplyProfileParams(els.params);
        else if (selectedOp === 'setAgePersonality') renderSetAgePersonalityParams(els.params);
        const count = op.kind === 'horses' ? op.affected(targets) : op.affected();
        const footer = el('div', 'bk-footer');
        const unit = op.kind === 'horses' ? 'horse' + (count === 1 ? '' : 's') :
            (selectedOp === 'clearHoles' ? 'hole' + (count === 1 ? '' : 's') :
                selectedOp === 'clearGround' ? 'ground item' + (count === 1 ? '' : 's') :
                    selectedOp === 'scatterBuried' ? 'buried item' + (count === 1 ? '' : 's') : 'tile' + (count === 1 ? '' : 's'));
        footer.appendChild(el('div', 'bk-affected', 'Affects ' + count + ' ' + unit + '.'));
        const previewBox = el('div', 'bk-preview');
        previewBox.hidden = true;
        footer.appendChild(previewBox);
        const btnRow = el('div', 'bk-btn-row');
        const previewBtn = el('button', 'btn', 'Preview');
        previewBtn.disabled = count === 0;
        previewBtn.addEventListener('click', () => {
            const lines = op.kind === 'horses' ? op.preview(targets) : op.preview();
            previewBox.innerHTML = '';
            if (!lines.length) { previewBox.hidden = true; return; }
            for (const line of lines) previewBox.appendChild(el('div', 'bk-preview-line', line));
            if (count > lines.length) previewBox.appendChild(el('div', 'bk-preview-line bk-preview-more', '… and ' + (count - lines.length) + ' more'));
            previewBox.hidden = false;
        });
        const applyBtn = el('button', 'btn primary', 'Apply');
        applyBtn.disabled = count === 0;
        applyBtn.addEventListener('click', async () => {
            const liveTargets = op.kind === 'horses' ? computeTargets() : null;
            const liveCount = op.kind === 'horses' ? op.affected(liveTargets) : op.affected();
            if (liveCount === 0) { Toast.toast('Nothing to apply.', 'warn'); return; }
            let extra = '';
            if (selectedOp === 'clearHorses') {
                const short = crowdShortfalls(liveTargets.filter(isDeletableHorse));
                if (short.length) {
                    extra = '\n\n⚠ ' + short.length + ' location' + (short.length === 1 ? '' : 's') +
                        ' would drop below the fewest horses the game has ever been seen with there:\n' +
                        short.slice(0, 8).map((s) => '  • ' + s.name + ': ' + s.from + ' → ' + s.to +
                            ' (never seen below ' + s.min + ')').join('\n') +
                        (short.length > 8 ? '\n  … and ' + (short.length - 8) + ' more' : '') +
                        '\n\nAn empty location has crashed the game before. Ctrl+Z undoes this ' +
                        'until you save.';
                }
            }
            const ok = await Modal.confirmModal(
                'Apply "' + op.label + '" to ' + liveCount + ' ' + unit.replace(/^\d+\s/, '') + '? This lands as one undo step.' + extra,
                { title: 'Bulk operation', confirmLabel: 'Apply' }
            );
            if (!ok) return;
            let applied;
            try { applied = op.kind === 'horses' ? op.apply(liveTargets) : op.apply(); }
            catch (e) { Toast.toast('Bulk op failed: ' + e.message, 'bad'); return; }
            if (applied) Toast.toast(op.label + ': applied to ' + liveCount + ' ' + unit.replace(/^\d+\s/, '') + '.', 'ok');
            renderParams();
        });
        btnRow.appendChild(previewBtn);
        btnRow.appendChild(applyBtn);
        footer.appendChild(btnRow);
        els.params.appendChild(footer);
    }
    function renderAll() {
        if (!isPaneActive()) return;
        renderOpsList();
        if (!doc) {
            els.params.innerHTML = '';
            els.params.appendChild(el('div', 'bk-empty', 'Open a save file to run bulk operations.'));
            return;
        }
        if (!dataReady) {
            els.params.innerHTML = '';
            els.params.appendChild(el('div', 'bk-empty', 'Loading gene/population data…'));
            return;
        }
        renderParams();
    }
    function cacheEls() {
        els.opsList = paneEl.querySelector('#bkOpsList');
        els.params = paneEl.querySelector('#bkParams');
    }
    function onDocChanged() { if (isPaneActive()) renderAll(); }
    async function init() {
        if (inited) return;
        inited = true;
        paneEl = document.querySelector('.workspace-pane[data-workspace="bulk"]');
        cacheEls();
        if (typeof AppBus !== 'undefined') AppBus.on('mapSelection:changed', () => { if (isPaneActive()) renderAll(); });
        const adopt = (d) => {
            geneTable = d.geneTable;
            geneByDesc = d.geneByDesc;
            popTable = d.popTable;
            presetNames = d.presetNames;
            const fallbackPop = popTable.has('default') ? 'default' : (presetNames[0] || '');
            if (!popTable.has(params.replaceDna.popName)) params.replaceDna.popName = fallbackPop;
            if (!popTable.has(params.replaceDna.legalizePop)) params.replaceDna.legalizePop = fallbackPop;
            dataReady = true;
        };
        if (typeof GenomeSource !== 'undefined') {
            GenomeSource.init();
            GenomeSource.onChange(() => { if (selectedOp === 'replaceDna' && isPaneActive()) renderAll(); });
        }
        try {
            adopt(await GameData.load());
        } catch (e) {
            console.error('Bulk workspace: failed to load gene/pop data', e);
            Toast.toast('Bulk: could not load genome data: ' + e.message, 'bad', 0);
        }
        GameData.onChange((d) => { adopt(d); renderAll(); });
        renderAll();
    }
    function onDocLoaded(newDoc) {
        doc = newDoc;
        target.oneLocation = false;
        target.farmHorses = true;
        target.otherBuildings = true;
        target.locationIndex = 0;
        target.bookies = false;
        target.inSelection = false;
        if (doc) doc.bus.on('doc:changed', onDocChanged);
        if (!inited) return;
        renderAll();
    }
    function onActivate() { if (inited) renderAll(); }
    function focusOn(kind, ref) {
        if (kind !== 'location' || !doc || !ref) return;
        target.onMap = false;
        target.farmHorses = false;
        target.otherBuildings = false;
        target.bookies = false;
        target.inSelection = false;
        target.oneLocation = true;
        target.locationIndex = ref.locationIndex;
        if (inited) renderAll();
    }
    return { init, onDocLoaded, onActivate, focusOn };
})();
