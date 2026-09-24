'use strict';
const GenomeSource = (function () {
    const FIXED = [
        { value: 'genome', label: 'Current genome (🧬)' },
        { value: 'donor', label: 'Clone an existing horse' },
        { value: 'random', label: 'Random on-map horse' }
    ];
    const DEFAULT_INCLUDE = ['genome', 'donor', 'random', 'pop', 'vat', 'lib'];
    let data = null;
    let started = false;
    const listeners = new Set();
    function announce() { for (const fn of [...listeners]) fn(); }
    function currentDoc(given) {
        if (given) return given;
        return (typeof App !== 'undefined' && App) ? App.doc : null;
    }
    let watchedDoc = null;
    let watchedSig = null;
    const boundSelects = new WeakSet();
    function saveRowSignature(doc) {
        const c = saveChoice(doc);
        return c.label + '|' + (c.disabled ? 1 : 0);
    }
    function watchDoc(doc) {
        if (!doc || doc === watchedDoc || !doc.bus || typeof doc.bus.on !== 'function') return;
        watchedDoc = doc;
        watchedSig = saveRowSignature(doc);
        doc.bus.on('doc:changed', () => {
            if (doc !== watchedDoc) return;
            const sig = saveRowSignature(doc);
            if (sig === watchedSig) return;
            watchedSig = sig;
            announce();
        });
    }
    function refreshSaveRow(select) {
        const doc = currentDoc();
        watchDoc(doc);
        const o = [...select.options].find((x) => x.value === 'vat:save');
        if (!o) return;
        const c = saveChoice(doc);
        o.textContent = c.label;
        o.disabled = c.disabled;
        o.title = c.reason || '';
    }
    function init() {
        if (started) return;
        started = true;
        if (typeof GameData === 'undefined') return;
        GameData.load().then((d) => { data = d; announce(); })
            .catch((e) => console.warn('GenomeSource: gene/pop data unavailable:', e.message));
        GameData.onChange((d) => { data = d; announce(); });
        if (typeof DnaLib !== 'undefined' && DnaLib.onChange) DnaLib.onChange(() => announce());
        if (typeof BioProfiles !== 'undefined' && BioProfiles.onChange) BioProfiles.onChange(() => announce());
    }
    function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    function fill(select, opts) {
        opts = opts || {};
        const include = opts.include || DEFAULT_INCLUDE;
        const want = new Set(include);
        let prev = opts.value !== undefined ? opts.value : select.value;
        if (typeof prev === 'string' && prev.startsWith('lib:')) prev = 'lib';
        select.innerHTML = '';
        for (const src of FIXED) {
            if (!want.has(src.value)) continue;
            const o = document.createElement('option');
            o.value = src.value;
            o.textContent = (src.value === 'donor' && opts.donorLabel) ? opts.donorLabel : src.label;
            select.appendChild(o);
        }
        if (want.has('pop') && data && data.presetNames && data.presetNames.length) {
            const g = document.createElement('optgroup');
            g.label = 'Population';
            for (const name of data.presetNames) {
                const o = document.createElement('option');
                o.value = 'pop:' + name;
                o.textContent = name;
                g.appendChild(o);
            }
            select.appendChild(g);
        }
        if (want.has('vat')) {
            watchDoc(currentDoc(opts.doc));
            const choices = vatChoices(opts.doc);
            if (choices.length) {
                const g = document.createElement('optgroup');
                g.label = 'Biohacker';
                for (const c of choices) {
                    const o = document.createElement('option');
                    o.value = c.value;
                    o.textContent = c.label;
                    o.disabled = c.disabled;
                    if (c.reason) o.title = c.reason;
                    g.appendChild(o);
                }
                select.appendChild(g);
            }
            if (!boundSelects.has(select)) {
                boundSelects.add(select);
                const r = () => refreshSaveRow(select);
                select.addEventListener('focus', r);
                select.addEventListener('mousedown', r);
            }
        }
        if (want.has('lib')) {
            const o = document.createElement('option');
            o.value = 'lib';
            o.textContent = 'DNA Library entry…';
            select.appendChild(o);
        }
        const has = [...select.options].some((o) => o.value === prev && !o.disabled);
        select.value = has ? prev : (select.options[0] ? select.options[0].value : '');
        return select;
    }
    function bindLibraryPicker(select, hostEl) {
        if (!hostEl || typeof LibPicker === 'undefined') {
            return { value: () => select.value, setEnabled() {}, destroy() {} };
        }
        let picker = null;
        let lastLibId = '';
        let enabled = true;
        function ensurePicker() {
            if (picker) return picker;
            picker = LibPicker.mount(hostEl, {
                placeholder: 'Search DNA Library…',
                onChange(entryId) { lastLibId = entryId || ''; }
            });
            return picker;
        }
        function sync() {
            const isLib = enabled && select.value === 'lib';
            hostEl.hidden = !isLib;
            if (isLib) ensurePicker();
        }
        select.addEventListener('change', sync);
        sync();
        return {
            value() { return select.value === 'lib' ? ('lib:' + lastLibId) : select.value; },
            setEnabled(v) { enabled = !!v; sync(); },
            destroy() {
                select.removeEventListener('change', sync);
                if (picker) picker.destroy();
            }
        };
    }
    function isDonor(value) { return value === 'donor'; }
    function saveChoice(doc) {
        let reason = null, cells = null;
        if (typeof BioVat === 'undefined') reason = 'The Biohacker module has not loaded.';
        else if (!doc) reason = 'No save is loaded.';
        else {
            reason = BioVat.unavailableReason(doc);
            if (!reason) {
                const vat = BioVat.read(doc);
                cells = vat ? BioVat.cellCount(vat) : 0;
                if (!cells) reason = 'The Bio-Hacker’s vat is empty.';
            }
        }
        return {
            value: 'vat:save',
            label: 'This save’s Bio-Hacker (' + (cells === null ? 'none' : cells) + ')',
            disabled: !!reason,
            reason
        };
    }
    function vatChoices(doc) {
        if (typeof BioVat === 'undefined') return [];
        const out = [saveChoice(currentDoc(doc))];
        if (typeof BioProfiles !== 'undefined') {
            for (const p of BioProfiles.all()) {
                const cells = BioProfiles.cellCount(p.bases);
                out.push({
                    value: 'vat:' + p.id, label: p.name + ' (' + cells + ')',
                    disabled: cells === 0, reason: cells === 0 ? 'That profile is empty.' : null
                });
            }
        } else {
            out.push({ value: 'vat:everything', label: '★ Everything (' + BioVat.CELLS + ')', disabled: false, reason: null });
        }
        return out;
    }
    function vatFor(value, ctx) {
        ctx = ctx || {};
        if (typeof BioVat === 'undefined') return { error: 'The Biohacker module has not loaded' };
        const id = String(value || '').replace(/^vat:/, '');
        if (id === 'save') {
            const doc = currentDoc(ctx.doc);
            const reason = doc ? BioVat.unavailableReason(doc) : 'No save is loaded.';
            if (reason) return { error: reason.replace(/\.$/, '') };
            const vat = BioVat.read(doc);
            if (!vat || !BioVat.cellCount(vat)) return { error: 'The Bio-Hacker’s vat is empty' };
            return { vat, name: 'the Bio-Hacker vat' };
        }
        if (typeof BioProfiles === 'undefined') {
            if (id === 'everything') return { vat: BioVat.everything(), name: '★ Everything' };
            return { error: 'Biohacker profiles are not available' };
        }
        const p = BioProfiles.get(id);
        if (!p) return { error: 'That Biohacker profile is gone' };
        const geneTable = ctx.geneTable || (data && data.geneTable);
        if (!geneTable) return { error: 'The gene table has not loaded' };
        const vat = BioVat.fromLetters(p.bases, geneTable);
        if (!BioVat.cellCount(vat)) return { error: 'That Biohacker profile is empty' };
        return { vat, name: p.name };
    }
    function legalizeTo(bytes, popName) {
        if (!popName || !data || !data.popTable || !data.popTable.has(popName)) return bytes;
        if (typeof PopData === 'undefined' || typeof PopData.legalizeBytes !== 'function') return bytes;
        return PopData.legalizeBytes(data.geneTable, data.popTable, popName, bytes).bytes;
    }
    function resolve(value, ctx) {
        ctx = ctx || {};
        const doc = ctx.doc;
        const warn = ctx.quiet ? function () {} : toastWarn;
        if (!value || value === 'donor') return {};
        if (value === 'genome') {
            const g = (typeof GenomeWorkspace !== 'undefined') ? GenomeWorkspace.currentGenomeBytes() : null;
            if (!g) { warn('The Genome workspace has not loaded its gene data'); return null; }
            return { genome: g.bytes, genomeHash: g.hash };
        }
        if (value === 'random') {
            if (!doc) return null;
            const pool = doc.liveHorses().filter((h) => h.container === 'map');
            if (!pool.length) { warn('This save has no horse on the map to copy'); return null; }
            const pick = pool[Math.floor(Math.random() * pool.length)];
            return {
                genome: doc.state.bytes.slice(pick.genomeOff, pick.genomeOff + SaveFile.GENOME_LEN),
                genomeHash: SaveFile.u32(doc.state.view, pick.genomeOff + SaveFile.GENOME_LEN, doc.state.bytes.length)
            };
        }
        if (value.startsWith('pop:')) {
            const name = value.slice(4);
            if (!data || !data.popTable || !data.popTable.has(name)) {
                warn('Population data has not loaded'); return null;
            }
            return { genome: legalizeTo(Genome.encodeGenome(data.geneTable,
                PopData.sampleGenome(data.geneTable, data.popTable, name), ctx.base), ctx.legalizeTo) };
        }
        if (value.startsWith('vat:')) {
            watchDoc(currentDoc(doc));
            if (!data) { warn('The gene table has not loaded'); return null; }
            const got = vatFor(value, { doc, geneTable: data.geneTable });
            if (got.error) { warn(got.error); return null; }
            const base = (ctx.base && ctx.base.length === SaveFile.GENOME_LEN) ? ctx.base : null;
            const drawn = BioVat.sample(got.vat, data.geneTable, { base });
            return { genome: legalizeTo(drawn.bytes, ctx.legalizeTo) };
        }
        if (value.startsWith('lib:')) {
            const hit = (typeof DnaLib !== 'undefined') ? DnaLib.findEntry(value.slice(4)) : null;
            if (!hit) { warn('That DNA Library entry is gone'); return null; }
            if (!data) { warn('The gene table has not loaded'); return null; }
            const model = Genome.parseGenomeText(hit.entry.dnaText);
            if (!model.some(([s1, s2]) => (s1 && s1.length) || (s2 && s2.length))) {
                warn('That DNA Library entry holds no readable DNA'); return null;
            }
            return { genome: Genome.encodeGenome(data.geneTable, model, ctx.base) };
        }
        return null;
    }
    function toastWarn(msg) {
        if (typeof Toast !== 'undefined') Toast.toast(msg + ' — cloned the donor instead.', 'warn');
    }
    function describe(value) {
        if (!value || value === 'donor') return 'cloned from an existing horse';
        if (value === 'genome') return 'carrying the genome from 🧬';
        if (value === 'random') return 'carrying a random on-map horse’s genome';
        if (value.startsWith('pop:')) return 'sampled from the ' + value.slice(4) + ' population';
        if (value === 'vat:save') return 'drawn from the Bio-Hacker vat';
        if (value.startsWith('vat:')) {
            const p = (typeof BioProfiles !== 'undefined') ? BioProfiles.get(value.slice(4)) : null;
            return p ? 'drawn from profile ' + p.name
                : (value === 'vat:everything' ? 'drawn from profile ★ Everything' : 'drawn from a Biohacker profile');
        }
        if (value.startsWith('lib:')) {
            const hit = (typeof DnaLib !== 'undefined') ? DnaLib.findEntry(value.slice(4)) : null;
            return 'from the DNA Library' + (hit ? ' (' + hit.entry.name + ')' : '');
        }
        return 'cloned from an existing horse';
    }
    return { init, fill, resolve, onChange, isDonor, describe, bindLibraryPicker, vatChoices, vatFor, DEFAULT_INCLUDE };
})();
