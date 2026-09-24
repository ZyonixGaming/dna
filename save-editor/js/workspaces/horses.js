const Horses = (function () {
    'use strict';
    const PERSONALITIES = ["Normal", "Preppy", "Grumpy", "Brainy", "Swaggy", "Cutey", "Baby",
        "Haughty", "Leprechaun", "Algernon de Horsey", "Sweetie", "Car", "Unknown?", "Mike"];
    const STATUSES = ["Normal", "Hot", "Tipsy", "Sick", "Drunk", "?unknown?", "Dead"];
    const REC = { FLAGS: 0, NAME_COLOR: 1, RACES: 2, REGULAR_WINS: 3, SUMO_WINS: 4, NAME_COLOR_COPY: 5, PARENT_A: 6, PARENT_B: 10 };
    const MEDAL_FLAGS = [
        [0x01, 'Rename on load'],
        [0x02, 'Championship Horse'], [0x04, 'GMO Horse'], [0x08, 'Diving Medal'],
        [0x10, 'Strong Horse Medal'], [0x20, 'Trampoline Medal'], [0x40, 'Acrobat Medal']
    ];
    const DET = {
        SPEED_RATING: 4,
        STATUS: 6, AGE: 7,
        WIN_COUNT: 8,
        PERSONALITY: 9,
        NOTIFY4: 10,
        EFFECT_IDX: 11,
        NOTIFY0: 12,
        LINKED_REF: 13,
        FLAGS2: 14,
        BBOX_W: 15,
        BBOX_H: 19
    };
    const STATE_FLAGS = [
        [0x01, 'Faces left'],
        [0x02, "Player owned"],
        [0x04, 'Hungry'], [0x08, 'Tired'],
        [0x20, 'Ragdoll']
    ];
    const ROW_HEIGHT = 46;
    const ROW_BUFFER = 8;
    let container = null;
    const els = {};
    let geneTable = null;
    let geneTableLoading = false;
    let genomePreview = null;
    const state = {
        filters: { search: '', location: '', namedOnly: true },
        selectedDetailOff: null,
        rows: [],
        filteredRows: [],
        horseIndex: new Map()
    };
    function effByte(doc, off) {
        return doc.patches.has(off) ? doc.patches.get(off) : doc.state.bytes[off];
    }
    function effU32(doc, off) {
        return (effByte(doc, off) | (effByte(doc, off + 1) << 8) |
            (effByte(doc, off + 2) << 16) | ((effByte(doc, off + 3) << 24) >>> 0)) >>> 0;
    }
    function effI32(doc, off) {
        const u = effU32(doc, off);
        return u > 0x7fffffff ? u - 0x100000000 : u;
    }
    function effU16(doc, off) {
        return (effByte(doc, off) | (effByte(doc, off + 1) << 8)) >>> 0;
    }
    function effI8(doc, off) {
        const v = effByte(doc, off);
        return v > 127 ? v - 256 : v;
    }
    function effF32(doc, off) {
        const buf = new ArrayBuffer(4);
        const v = new DataView(buf);
        for (let i = 0; i < 4; i++) v.setUint8(i, effByte(doc, off + i));
        return v.getFloat32(0, true);
    }
    function effGenomeBytes(doc, genomeOff) {
        const out = new Uint8Array(SaveFile.GENOME_LEN);
        for (let i = 0; i < SaveFile.GENOME_LEN; i++) out[i] = effByte(doc, genomeOff + i);
        return out;
    }
    function recordDisplayName(doc, idx) {
        if (idx === null || idx === undefined || idx < 0 || idx >= doc.state.records.length) return null;
        if (doc.renamedRecords.has(idx)) return doc.renamedRecords.get(idx);
        return doc.state.records[idx].name;
    }
    function locationDisplayName(name, index) { return LocTemplates.displayName(index, name); }
    const TAIL_ROLE = { owner: 'Owner', champion: 'Champion', lost: 'Lost Horse' };
    const CONTAINER_BADGE = {
        map: 'map', stabled: 'stabled', official: 'bookie',
        owner: 'owner', champion: 'champion', lost: 'lost horse'
    };
    function computeRows(doc) {
        const rows = [];
        const horses = doc.state.horses;
        for (let i = 0; i < horses.length; i++) {
            const h = horses[i];
            const name = h.recordIndex >= 0 ? (recordDisplayName(doc, h.recordIndex) || '') : '';
            let sub, locKey;
            if (h.container === 'map') {
                sub = 'Map (' + Math.round(h.x) + ', ' + Math.round(h.y) + ')';
                locKey = '__map__';
            } else if (h.container === 'stabled') {
                const loc = doc.state.locations[h.locationIndex];
                sub = loc ? locationDisplayName(loc.name, loc.index) : '(unknown location)';
                locKey = sub;
                const rp = roomPos(doc, h);
                if (rp) sub += ' (' + rp.x.toFixed(1) + ', ' + rp.y.toFixed(1) + ')';
            } else if (h.container === 'official') {
                sub = 'Bookie — Race Track';
                locKey = '__bookies__';
            } else {
                const loc = doc.state.locations[h.locationIndex];
                const where = loc ? locationDisplayName(loc.name, loc.index) : '(unknown location)';
                sub = TAIL_ROLE[h.container] + ' — ' + where;
                locKey = '__residents__';
            }
            const doomed = doc.horseDeleted(h);
            rows.push({ h, name, displayName: name || '(unnamed)', named: !!name, sub, locKey, doomed });
        }
        return rows;
    }
    function applyFilters(rows) {
        const q = state.filters.search.trim().toLowerCase();
        const loc = state.filters.location;
        const namedOnly = state.filters.namedOnly;
        return rows.filter((r) => {
            if (namedOnly && !r.named) return false;
            if (loc && r.locKey !== loc) return false;
            if (q && !r.displayName.toLowerCase().includes(q)) return false;
            return true;
        });
    }
    function loadGeneData() {
        if (geneTable || geneTableLoading) return;
        geneTableLoading = true;
        GameData.load().then((d) => {
            geneTable = d.geneTable;
            renderGenome();
        }).catch((e) => {
            console.error('Horses: failed to load gene data', e);
        }).finally(() => { geneTableLoading = false; });
        GameData.onChange((d) => { geneTable = d.geneTable; renderGenome(); });
    }
    let hzRosterSplitter = null, hzGenomeSplitter = null;
    const HZ_PROPS_MIN = 420;
    const HZ_HANDLE_W = 6;
    let genomeSourceLibBinding = null;
    function hzViewportOk() { return window.innerWidth >= 1280; }
    function boundedMax(container, absCap, computeReal) {
        return container.clientWidth ? Math.min(absCap, computeReal()) : absCap;
    }
    function setupSplitters() {
        if (typeof Splitter === 'undefined') return;
        const body = document.getElementById('hzBody');
        if (!body) return;
        hzRosterSplitter = Splitter.attach({
            handle: '#hzLeftHandle',
            container: body,
            cssVar: '--hz-roster-w',
            side: 'left',
            min: 220,
            max: () => boundedMax(body, 520, () => body.clientWidth - (hzGenomeSplitter ? hzGenomeSplitter.get() : 340) - HZ_PROPS_MIN - HZ_HANDLE_W * 2),
            defaultWidth: 340,
            storageKey: 'horsey_studio_horses_left_w',
            enabled: hzViewportOk
        });
        hzGenomeSplitter = Splitter.attach({
            handle: '#hzRightHandle',
            container: body,
            cssVar: '--hz-genome-w',
            side: 'right',
            min: 240,
            max: () => boundedMax(body, 520, () => body.clientWidth - (hzRosterSplitter ? hzRosterSplitter.get() : 340) - HZ_PROPS_MIN - HZ_HANDLE_W * 2),
            defaultWidth: 340,
            storageKey: 'horsey_studio_horses_right_w',
            enabled: hzViewportOk
        });
        if (els.genome && typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(() => { if (genomePreview) genomePreview.refresh(); }).observe(els.genome);
        }
    }
    function init(rootEl) {
        container = rootEl;
        if (!container) return;
        els.search = document.getElementById('hzSearch');
        els.locationFilter = document.getElementById('hzLocationFilter');
        els.namedOnly = document.getElementById('hzNamedOnly');
        els.count = document.getElementById('hzCount');
        els.playerRow = document.getElementById('hzPlayerRow');
        els.rosterScroll = document.getElementById('hzRosterScroll');
        els.rosterSpacer = document.getElementById('hzRosterSpacer');
        els.rosterRows = document.getElementById('hzRosterRows');
        els.props = document.getElementById('hzProps');
        els.genome = document.getElementById('hzGenome');
        els.addStabled = document.getElementById('hzAddStabled');
        els.addStabledSource = document.getElementById('hzAddStabledSource');
        els.addStabledSourceLib = document.getElementById('hzAddStabledSourceLib');
        els.addStabledCount = document.getElementById('hzAddStabledCount');
        if (els.addStabledCount) {
            for (const n of [1, 2, 5, 10]) {
                const opt = document.createElement('option');
                opt.value = String(n); opt.textContent = String(n);
                els.addStabledCount.appendChild(opt);
            }
        }
        let searchDebounce = null;
        els.search.addEventListener('input', () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                state.filters.search = els.search.value;
                refreshRosterFilter();
            }, 150);
        });
        els.locationFilter.addEventListener('change', () => {
            state.filters.location = els.locationFilter.value;
            refreshRosterFilter();
            renderAddStabledButton();
        });
        if (els.addStabled) els.addStabled.addEventListener('click', () => addStabledToFilteredLocation());
        if (els.addStabledSource) {
            GenomeSource.init();
            GenomeSource.fill(els.addStabledSource, {});
            GenomeSource.onChange(() => GenomeSource.fill(els.addStabledSource, {}));
            if (els.addStabledSourceLib) {
                genomeSourceLibBinding = GenomeSource.bindLibraryPicker(els.addStabledSource, els.addStabledSourceLib);
                genomeSourceLibBinding.setEnabled(false);
            }
        }
        els.namedOnly.addEventListener('change', () => {
            state.filters.namedOnly = els.namedOnly.checked;
            refreshRosterFilter();
        });
        let scrollScheduled = false;
        els.rosterScroll.addEventListener('scroll', () => {
            if (scrollScheduled) return;
            scrollScheduled = true;
            requestAnimationFrame(() => { scrollScheduled = false; renderRosterRows(); });
        });
        window.addEventListener('resize', () => renderRosterRows());
        loadGeneData();
        renderEmptyAll();
        setupSplitters();
    }
    function onDocLoaded(doc) {
        if (els.addStabledSource && typeof GenomeSource !== 'undefined') GenomeSource.fill(els.addStabledSource, {});
        state.filters = { search: '', location: '', namedOnly: true };
        state.selectedDetailOff = null;
        if (els.search) els.search.value = '';
        if (els.namedOnly) els.namedOnly.checked = true;
        if (els.locationFilter) els.locationFilter.value = '';
        state.horseIndex = new Map();
        doc.state.horses.forEach((h, i) => state.horseIndex.set(h.detailOff, i));
        doc.bus.on('doc:changed', () => render());
        doc.bus.on('doc:rebased', () => {
            state.selectedDetailOff = null;
            state.horseIndex = new Map();
            doc.state.horses.forEach((h, i) => state.horseIndex.set(h.detailOff, i));
            render();
        });
        render();
    }
    function onActivate() {
        if (App.doc) renderRosterRows();
        if (hzRosterSplitter) hzRosterSplitter.clamp();
        if (hzGenomeSplitter) hzGenomeSplitter.clamp();
    }
    function renderEmptyAll() {
        if (!els.props) return;
        showEmpty(els.props, 'Open a save file to browse its roster.');
        showEmpty(els.genome, 'Open a save file to preview a genome.');
        if (els.rosterRows) els.rosterRows.innerHTML = '';
        if (els.rosterSpacer) els.rosterSpacer.style.height = '0px';
        if (els.playerRow) els.playerRow.innerHTML = '';
        if (els.count) els.count.textContent = '';
        if (els.locationFilter) els.locationFilter.innerHTML = '<option value="">Everywhere</option>';
        if (els.addStabled) { els.addStabled.hidden = true; els.addStabledCount.hidden = true; }
    }
    function filteredLocation(doc) {
        const key = state.filters.location;
        if (!key || key.startsWith('__')) return null;
        return doc.state.locations
            .find((l) => locationDisplayName(l.name, l.index) === key) || null;
    }
    function renderAddStabledButton() {
        if (!els.addStabled || !els.addStabledCount) return;
        const doc = App.doc;
        const loc = doc ? filteredLocation(doc) : null;
        const canAdd = !!loc && doc.state.locationWalkOk && !!SaveFile.findStabledDonor(doc.state);
        els.addStabled.hidden = !loc;
        els.addStabledCount.hidden = !loc;
        if (els.addStabledSource) els.addStabledSource.hidden = !loc;
        if (genomeSourceLibBinding) genomeSourceLibBinding.setEnabled(!!loc);
        if (!loc) return;
        els.addStabled.disabled = !canAdd;
        els.addStabled.textContent = '＋ Add horse to ' + locationDisplayName(loc.name, loc.index);
        els.addStabled.title = canAdd
            ? 'Add a horse to this location, with a roster entry for its name. '
              + 'Its genome comes from whichever source the dropdown names.'
            : (doc.state.locationWalkOk
                ? 'This file has no plain stabled horse to clone from.'
                : 'This save’s location data couldn’t be read, so crowd counts can’t be written back.');
    }
    function addStabledToFilteredLocation() {
        const doc = App.doc;
        const loc = doc && filteredLocation(doc);
        if (!loc) return;
        const n = parseInt(els.addStabledCount.value, 10) || 1;
        const source = (genomeSourceLibBinding ? genomeSourceLibBinding.value()
            : (els.addStabledSource && els.addStabledSource.value)) || 'genome';
        const donor = SaveFile.findStabledDonor(doc.state);
        const base = donor ? doc.state.bytes.slice(donor.genomeOff, donor.genomeOff + SaveFile.GENOME_LEN) : undefined;
        const first = GenomeSource.resolve(source, { doc, base });
        const specs = Array.from({ length: n }, (_, i) => (
            first === null ? {}
                : i === 0 ? Object.assign({}, first)
                : (GenomeSource.resolve(source, { doc, base, quiet: true }) || {})
        ));
        let offs;
        try {
            offs = doc.addStabledHorses(loc.nameOffset, specs);
        } catch (e) {
            Modal.alertModal(e.message, 'Could not add a horse');
            return;
        }
        if (offs && offs.length) selectHorse(offs[0] + SaveFile.GENOME_LEN + SaveFile.DETAIL_GAP);
        Toast.toast(n + (n === 1 ? ' horse added to ' : ' horses added to ') +
            locationDisplayName(loc.name, loc.index) + ' — ' +
            GenomeSource.describe(first === null ? 'donor' : source) +
            ', each with its own roster entry.', 'good');
    }
    function showEmpty(el, msg) {
        el.innerHTML = '';
        const div = document.createElement('div');
        div.className = 'hz-empty';
        div.textContent = msg;
        el.appendChild(div);
    }
    function render() {
        if (!container) return;
        const doc = App.doc;
        if (!doc) { renderEmptyAll(); return; }
        state.rows = computeRows(doc);
        state.filteredRows = applyFilters(state.rows);
        renderLocationOptions(state.rows);
        renderCount();
        renderPlayerRow(doc);
        renderRosterRows();
        renderProps();
        renderGenome();
        renderAddStabledButton();
    }
    function refreshRosterFilter() {
        if (!App.doc) return;
        state.filteredRows = applyFilters(state.rows);
        renderCount();
        renderRosterRows();
    }
    function renderCount() {
        els.count.textContent = state.filteredRows.length + ' / ' + state.rows.length + ' shown';
    }
    function renderLocationOptions(rows) {
        const counts = new Map();
        const doc = App.doc;
        if (doc) {
            for (const loc of doc.state.locations) {
                const label = locationDisplayName(loc.name, loc.index);
                if (!counts.has(label)) counts.set(label, { label, count: 0 });
            }
        }
        for (const r of rows) {
            if (!counts.has(r.locKey)) {
                const label = r.locKey === '__map__' ? 'On the map'
                    : r.locKey === '__bookies__' ? 'Bookies'
                    : r.locKey === '__residents__' ? 'Owners, champions & Lost Horses'
                    : r.locKey;
                counts.set(r.locKey, { label, count: 0 });
            }
            counts.get(r.locKey).count++;
        }
        const prevValue = state.filters.location || els.locationFilter.value;
        els.locationFilter.innerHTML = '';
        const allOpt = document.createElement('option');
        allOpt.value = '';
        allOpt.textContent = 'Everywhere (' + rows.length + ')';
        els.locationFilter.appendChild(allOpt);
        const rank = (k) => (k === '__map__' ? 0 : k === '__bookies__' ? 2 : k === '__residents__' ? 3 : 1);
        const keys = [...counts.keys()].sort((a, b) => {
            const ra = rank(a), rb = rank(b);
            if (ra !== rb) return ra - rb;
            return counts.get(a).label.localeCompare(counts.get(b).label);
        });
        for (const k of keys) {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = counts.get(k).label + ' (' + counts.get(k).count + ')';
            els.locationFilter.appendChild(opt);
        }
        const validValues = new Set(['', ...keys]);
        els.locationFilter.value = validValues.has(prevValue) ? prevValue : '';
        state.filters.location = els.locationFilter.value;
    }
    let playerExpanded = false;
    function renderPlayerRow(doc) {
        els.playerRow.innerHTML = '';
        const p = SaveFile.playerOffsets(doc.state);
        if (!p) return;
        const truck = SaveFile.truckOffsets(doc.state);
        const wrap = document.createElement('div');
        wrap.className = 'hz-player';
        const toggle = document.createElement('button');
        toggle.className = 'hz-player-toggle';
        toggle.textContent = (playerExpanded ? '▾' : '▸') + ' Player';
        toggle.title = 'Progression, leaderboard, inventory and Truck upgrades';
        toggle.addEventListener('click', () => { playerExpanded = !playerExpanded; renderPlayerRow(doc); });
        wrap.appendChild(toggle);
        const coin = document.createElement('span');
        coin.className = 'hz-player-label';
        coin.textContent = '💰';
        wrap.appendChild(coin);
        const money = document.createElement('input');
        money.type = 'number'; money.min = '0'; money.max = '4294967295';
        money.className = 'hz-player-money';
        money.value = String(effU32(doc, p.money));
        money.title = 'Money';
        money.addEventListener('change', () => {
            doc.setU32(p.money, Math.max(0, Math.min(4294967295, Math.floor(Number(money.value)) || 0)));
        });
        wrap.appendChild(money);
        els.playerRow.appendChild(wrap);
        if (!playerExpanded) return;
        const panel = document.createElement('div');
        panel.className = 'hz-player-panel';
        const progHead = document.createElement('div');
        progHead.className = 'hz-player-section';
        progHead.textContent = 'Progression';
        panel.appendChild(progHead);
        const makeU32Row = (label, off, opts) => {
            const row = document.createElement('div');
            row.className = 'hz-inv-row';
            const lab = document.createElement('label');
            lab.className = 'hz-inv-name';
            lab.textContent = label;
            row.appendChild(lab);
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.min = String(opts && opts.min != null ? opts.min : 0);
            inp.max = String(opts && opts.max != null ? opts.max : 4294967295);
            inp.className = 'hz-inv-qty';
            inp.value = String(opts && opts.signed ? effI32(doc, off) : effU32(doc, off));
            if (opts && opts.title) inp.title = opts.title;
            inp.addEventListener('change', () => {
                const lo = opts && opts.min != null ? opts.min : 0;
                const hi = opts && opts.max != null ? opts.max : 4294967295;
                let v = Math.floor(Number(inp.value)) || 0;
                v = Math.max(lo, Math.min(hi, v));
                if (opts && opts.signed) doc.setU32(off, v < 0 ? v + 0x100000000 : v);
                else doc.setU32(off, v);
            });
            row.appendChild(inp);
            panel.appendChild(row);
        };
        const makeBoolRow = (label, off, opts) => {
            const row = document.createElement('div');
            row.className = 'hz-inv-row';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = effU32(doc, off) !== 0;
            cb.addEventListener('change', () => doc.setU32(off, cb.checked ? 1 : 0));
            const lab = document.createElement('label');
            lab.className = 'hz-inv-name';
            lab.appendChild(cb);
            lab.appendChild(document.createTextNode(' ' + label));
            if (opts && opts.title) lab.title = opts.title;
            row.appendChild(lab);
            panel.appendChild(row);
        };
        makeU32Row('Year (starts at 0)', p.year, { title: 'The game displays year+1' });
        makeU32Row('Sleep / day counter', p.sleep);
        makeU32Row('Digs completed', p.digs, { title: 'Increases prize tiers as you complete more digs.' });
        makeU32Row('Race participation', p.racePart, { title: 'Career race total; drives bar NPC dialogue' });
        makeBoolRow('Treasure map received', p.treasureMap, { title: 'One-time NPC gift flag' });
        makeBoolRow('First-place bonus pending', p.firstPlace, { title: 'Wild-horse hint active' });

        const invHead = document.createElement('div');
        invHead.className = 'hz-player-section';
        invHead.textContent = 'Inventory';
        panel.appendChild(invHead);
        for (const slot of p.inventory) {
            const row = document.createElement('div');
            row.className = 'hz-inv-row';
            const owned = document.createElement('input');
            owned.type = 'checkbox';
            owned.checked = effU32(doc, slot.owned) !== 0;
            owned.title = 'Owned — the game normally unlocks these in order.';
            owned.addEventListener('change', () => doc.setU32(slot.owned, owned.checked ? 1 : 0));
            const name = document.createElement('label');
            name.className = 'hz-inv-name';
            name.appendChild(owned);
            name.appendChild(document.createTextNode(' ' + slot.icon + ' ' + slot.name));
            row.appendChild(name);
            const qty = document.createElement('input');
            qty.type = 'number'; qty.min = '0'; qty.max = '4294967295';
            qty.className = 'hz-inv-qty';
            qty.value = String(effU32(doc, slot.quantity));
            qty.title = 'Quantity';
            qty.addEventListener('change', () => {
                doc.setU32(slot.quantity, Math.max(0, Math.min(4294967295, Math.floor(Number(qty.value)) || 0)));
            });
            row.appendChild(qty);
            const inf = document.createElement('input');
            inf.type = 'checkbox';
            inf.checked = effU32(doc, slot.infinite) !== 0;
            inf.addEventListener('change', () => doc.setU32(slot.infinite, inf.checked ? 1 : 0));
            const infLabel = document.createElement('label');
            infLabel.className = 'hz-inv-inf';
            infLabel.title = 'Infinite — the item never depletes';
            infLabel.appendChild(inf);
            infLabel.appendChild(document.createTextNode(' ∞'));
            row.appendChild(infLabel);
            panel.appendChild(row);
        }
        const invNote = document.createElement('div');
        invNote.className = 'hz-note';
        invNote.textContent = 'The game normally unlocks these in order, '
            + 'so clearing one in the middle isn’t a state the game '
            + 'would normally produce.';
        panel.appendChild(invNote);
        const tHead = document.createElement('div');
        tHead.className = 'hz-player-section';
        tHead.textContent = 'Truck upgrades';
        panel.appendChild(tHead);
        if (!truck) {
            const none = document.createElement('div');
            none.className = 'hz-note';
            none.textContent = 'This save has no Truck.';
            panel.appendChild(none);
        } else {
            for (const up of truck.upgrades) {
                const row = document.createElement('div');
                row.className = 'hz-inv-row';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = effU32(doc, up.off) !== 0;
                cb.addEventListener('change', () => doc.setU32(up.off, cb.checked ? 1 : 0));
                const lab = document.createElement('label');
                lab.className = 'hz-inv-name';
                lab.appendChild(cb);
                lab.appendChild(document.createTextNode(' ' + up.name + ' — ' + up.hint));
                row.appendChild(lab);
                panel.appendChild(row);
            }
            const tNote = document.createElement('div');
            tNote.className = 'hz-note';
            tNote.textContent = 'Normally bought in this order.';
            panel.appendChild(tNote);
            const routeHead = document.createElement('div');
            routeHead.className = 'hz-player-section dev-only';
            routeHead.textContent = 'Truck routing';
            panel.appendChild(routeHead);
            for (const [off, name, hint] of [[truck.unknownA, 'BalloonShadow', 'Redirect to BalloonShadow location'],
                                              [truck.unknownB, 'Cas9', 'Redirect to CRISPR Cas9 location']]) {
                const row = document.createElement('div');
                row.className = 'hz-inv-row dev-only';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = effU32(doc, off) !== 0;
                cb.addEventListener('change', () => doc.setU32(off, cb.checked ? 1 : 0));
                const lab = document.createElement('label');
                lab.className = 'hz-inv-name';
                lab.title = hint + ' (mutually exclusive)';
                lab.appendChild(cb);
                lab.appendChild(document.createTextNode(' ' + name));
                row.appendChild(lab);
                panel.appendChild(row);
            }
        }
        els.playerRow.appendChild(panel);
    }
    function renderRosterRows() {
        const total = state.filteredRows.length;
        els.rosterSpacer.style.height = (total * ROW_HEIGHT) + 'px';
        const scrollTop = els.rosterScroll.scrollTop;
        const viewportH = els.rosterScroll.clientHeight || 400;
        const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - ROW_BUFFER);
        const endIdx = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + ROW_BUFFER);
        els.rosterRows.style.transform = 'translateY(' + (startIdx * ROW_HEIGHT) + 'px)';
        els.rosterRows.innerHTML = '';
        const frag = document.createDocumentFragment();
        for (let i = startIdx; i < endIdx; i++) {
            frag.appendChild(buildRosterRowEl(state.filteredRows[i]));
        }
        els.rosterRows.appendChild(frag);
    }
    function buildRosterRowEl(row) {
        const el = document.createElement('div');
        el.className = 'hz-row' + (row.h.detailOff === state.selectedDetailOff ? ' selected' : '') +
            (row.doomed ? ' doomed' : '');
        el.style.height = ROW_HEIGHT + 'px';
        const line1 = document.createElement('div');
        line1.className = 'hz-row-line1';
        const nameEl = document.createElement('span');
        nameEl.className = 'hz-row-name' + (row.named ? '' : ' unnamed');
        nameEl.textContent = row.displayName;
        const badge = document.createElement('span');
        badge.className = 'hz-badge hz-badge-' + row.h.container;
        badge.textContent = CONTAINER_BADGE[row.h.container] || row.h.container;
        line1.appendChild(nameEl);
        line1.appendChild(badge);
        const line2 = document.createElement('div');
        line2.className = 'hz-row-line2';
        line2.textContent = row.sub;
        el.appendChild(line1);
        el.appendChild(line2);
        el.addEventListener('click', () => selectHorse(row.h.detailOff));
        return el;
    }
    function selectHorse(detailOff) {
        state.selectedDetailOff = detailOff;
        if (detailOff !== null && detailOff !== undefined && typeof setFocus === 'function') {
            const h = currentHorse(App.doc);
            if (h) setFocus('horse', h, { jump: false });
        }
        renderRosterRows();
        renderProps();
        renderGenome();
    }
    function currentHorse(doc) {
        if (state.selectedDetailOff === null) return null;
        const idx = state.horseIndex.get(state.selectedDetailOff);
        return idx === undefined ? null : doc.state.horses[idx];
    }
    function propRow(labelText, control) {
        const row = document.createElement('div');
        row.className = 'hz-prop-row';
        const label = document.createElement('label');
        label.textContent = labelText;
        row.appendChild(label);
        row.appendChild(control);
        return row;
    }
    function section(title) {
        const sec = document.createElement('div');
        sec.className = 'hz-section';
        const h = document.createElement('div');
        h.className = 'hz-section-title';
        h.textContent = title;
        sec.appendChild(h);
        return sec;
    }
    function makeCheckboxRow(label, checked, onChange) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = checked;
        cb.addEventListener('change', () => onChange(cb.checked));
        return propRow(label, cb);
    }
    function roomPos(doc, h) {
        if (h.roomXOff === null || h.roomXOff === undefined) return null;
        const buf = new ArrayBuffer(8);
        const u8 = new Uint8Array(buf);
        for (let i = 0; i < 8; i++) u8[i] = effByte(doc, h.roomXOff + i);
        const dv = new DataView(buf);
        return { x: dv.getFloat32(0, true), y: dv.getFloat32(4, true) };
    }
    function makeFloatRow(label, value, onChange, title) {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.step = '0.5';
        inp.value = String(Math.round(value * 1000) / 1000);
        if (title) inp.title = title;
        inp.addEventListener('change', () => {
            const raw = Number(inp.value);
            const v = SaveFile.clampRoomCoord(raw);
            if (v !== raw) inp.value = String(v);
            onChange(v);
        });
        return propRow(label, inp);
    }
    function makeNumberRow(label, value, min, max, onChange, title) {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.min = String(min);
        inp.max = String(max);
        inp.value = String(value);
        if (title) inp.title = title;
        inp.addEventListener('change', () => {
            let v = Math.floor(Number(inp.value));
            if (Number.isNaN(v)) v = min;
            v = Math.max(min, Math.min(max, v));
            onChange(v);
        });
        return propRow(label, inp);
    }
    function renderProps() {
        const doc = App.doc;
        els.props.innerHTML = '';
        if (!doc) { showEmpty(els.props, 'Open a save file to browse its roster.'); return; }
        const h = currentHorse(doc);
        if (!h) { showEmpty(els.props, 'Select a horse to edit its properties.'); return; }
        const rec = h.recordIndex >= 0 ? doc.state.records[h.recordIndex] : null;
        const wrap = document.createElement('div');
        wrap.className = 'hz-props-inner';
        const title = document.createElement('div');
        title.className = 'hz-props-title';
        title.textContent = (rec ? (recordDisplayName(doc, h.recordIndex) || '(blank)') : '(unnamed)') +
            ' #' + (h.recordIndex >= 0 ? h.recordIndex : '—');
        wrap.appendChild(title);
        const identity = section('Identity');
        if (rec) {
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = recordDisplayName(doc, h.recordIndex) || '';
            nameInput.addEventListener('change', () => doc.renameRecord(h.recordIndex, nameInput.value));
            identity.appendChild(propRow('Name', nameInput));
            const flags = effByte(doc, rec.fixedOffset + REC.FLAGS);
            for (const [bit, label] of MEDAL_FLAGS) {
                identity.appendChild(makeCheckboxRow(label, (flags & bit) !== 0, (checked) => {
                    const cur = effByte(doc, rec.fixedOffset + REC.FLAGS);
                    doc.setByte(rec.fixedOffset + REC.FLAGS, checked ? (cur | bit) : (cur & ~bit));
                }));
            }
            const details = document.createElement('details');
            details.className = 'hz-advanced';
            const summary = document.createElement('summary');
            summary.textContent = 'Advanced';
            details.appendChild(summary);
            details.appendChild(makeNumberRow('Name colour', effByte(doc, rec.fixedOffset + REC.NAME_COLOR), 0, 255,
                (v) => { doc.setByte(rec.fixedOffset + REC.NAME_COLOR, v); doc.setByte(rec.fixedOffset + REC.NAME_COLOR_COPY, v); }));
            details.appendChild(makeNumberRow('Races participated', effByte(doc, rec.fixedOffset + REC.RACES), 0, 255,
                (v) => doc.setByte(rec.fixedOffset + REC.RACES, v)));
            details.appendChild(makeNumberRow('Regular races won', effByte(doc, rec.fixedOffset + REC.REGULAR_WINS), 0, 255,
                (v) => doc.setByte(rec.fixedOffset + REC.REGULAR_WINS, v)));
            details.appendChild(makeNumberRow('Sumo wins', effByte(doc, rec.fixedOffset + REC.SUMO_WINS), 0, 255,
                (v) => doc.setByte(rec.fixedOffset + REC.SUMO_WINS, v)));
            const parentA = effI32(doc, rec.fixedOffset + REC.PARENT_A);
            const parentB = effI32(doc, rec.fixedOffset + REC.PARENT_B);
            const parentALabel = document.createElement('span');
            parentALabel.className = 'hz-readonly';
            parentALabel.textContent = parentA >= 0 ? ((recordDisplayName(doc, parentA) || '(blank)') + ' #' + parentA) : 'none';
            details.appendChild(propRow('Parent A', parentALabel));
            const parentBLabel = document.createElement('span');
            parentBLabel.className = 'hz-readonly';
            parentBLabel.textContent = parentB >= 0 ? ((recordDisplayName(doc, parentB) || '(blank)') + ' #' + parentB) : 'none';
            details.appendChild(propRow('Parent B', parentBLabel));
            identity.appendChild(details);
        } else {
            const note = document.createElement('div');
            note.className = 'hz-note';
            note.textContent = SaveFile.hasDetailBlock(h)
                ? 'This horse has no roster entry (most horses on the map don’t — that’s normal, not a ' +
                  'bug). Renaming, medals, win counts and parent links need a roster entry and are ' +
                  'unavailable here.'
                : 'A horse stored in a location’s own data has no roster entry at all, and none can be ' +
                  'added for it. Renaming, medals, win counts ' +
                  'and parent links are unavailable here.';
            identity.appendChild(note);
        }
        wrap.appendChild(identity);
        if (!SaveFile.hasDetailBlock(h)) {
            const tailSec = section('State');
            const note = document.createElement('div');
            note.className = 'hz-note';
            note.textContent = 'This horse is stored as a bare genome in ' +
                (doc.state.locations[h.locationIndex] ? '“' + doc.state.locations[h.locationIndex].name + '”' : 'a location') +
                '’s own data — it has no separate profile, so age, personality, status, state flags and ' +
                'worn items do not exist for it. Its genes are fully editable in the Genome workspace.';
            tailSec.appendChild(note);
            wrap.appendChild(tailSec);
            els.props.appendChild(wrap);
            return;
        }
        const stateSec = section('State');
        stateSec.appendChild(makeNumberRow('Age', effByte(doc, h.detailOff + DET.AGE), 0, 255,
            (v) => doc.setByte(h.detailOff + DET.AGE, v)));
        const personalityVal = effByte(doc, h.detailOff + DET.PERSONALITY);
        const personalitySelect = document.createElement('select');
        for (let i = 0; i < PERSONALITIES.length; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = PERSONALITIES[i];
            personalitySelect.appendChild(opt);
        }
        if (personalityVal >= 0 && personalityVal < PERSONALITIES.length) {
            personalitySelect.value = String(personalityVal);
        } else {
            const opt = document.createElement('option');
            opt.value = String(personalityVal);
            opt.textContent = '(raw value ' + personalityVal + ')';
            personalitySelect.appendChild(opt);
            personalitySelect.value = String(personalityVal);
        }
        personalitySelect.addEventListener('change', () => doc.setByte(h.detailOff + DET.PERSONALITY, Number(personalitySelect.value)));
        stateSec.appendChild(propRow('Personality', personalitySelect));
        const statusVal = effByte(doc, h.detailOff + DET.STATUS);
        if (statusVal >= 0 && statusVal < STATUSES.length) {
            const statusSelect = document.createElement('select');
            for (let i = 0; i < STATUSES.length; i++) {
                const opt = document.createElement('option');
                opt.value = String(i);
                opt.textContent = STATUSES[i];
                statusSelect.appendChild(opt);
            }
            statusSelect.value = String(statusVal);
            statusSelect.addEventListener('change', () => doc.setByte(h.detailOff + DET.STATUS, Number(statusSelect.value)));
            stateSec.appendChild(propRow('Status', statusSelect));
        } else {

        }



        const DEV_ONLY_STATE_FLAGS = new Set([]);
        const flags2 = effByte(doc, h.detailOff + DET.FLAGS2);
        for (const [bit, label] of STATE_FLAGS) {
            const flagRow = makeCheckboxRow(label, (flags2 & bit) !== 0, (checked) => {
                const cur = effByte(doc, h.detailOff + DET.FLAGS2);
                doc.setByte(h.detailOff + DET.FLAGS2, checked ? (cur | bit) : (cur & ~bit));
            });
            if (DEV_ONLY_STATE_FLAGS.has(label)) flagRow.classList.add('dev-only');
            stateSec.appendChild(flagRow);
        }
        const bboxW = effF32(doc, h.detailOff + DET.BBOX_W);
        const bboxH = effF32(doc, h.detailOff + DET.BBOX_H);
        const bboxLabel = document.createElement('span');
        bboxLabel.className = 'hz-readonly';
        bboxLabel.textContent = (Math.round(bboxW * 100) / 100) + ' x ' + (Math.round(bboxH * 100) / 100);
        bboxLabel.title = 'Body half-extents in world units (derived from genome phenotype)';
        const bboxRow = propRow('Bounding box', bboxLabel);
        bboxRow.classList.add('dev-only');
        stateSec.appendChild(bboxRow);
        wrap.appendChild(stateSec);
        const row = state.rows.find((r) => r.h.detailOff === h.detailOff);
        const worldSec = section('World');
        const worldLabel = document.createElement('span');
        worldLabel.className = 'hz-readonly';
        worldLabel.textContent = row ? row.sub : '—';
        worldSec.appendChild(propRow('Location', worldLabel));
        if (h.container === 'map') {
            const locateBtn = document.createElement('button');
            locateBtn.className = 'btn';
            locateBtn.textContent = '📍 Locate on map';
            locateBtn.addEventListener('click', () => {
                if (typeof setFocus === 'function') setFocus('horse', h);
                if (typeof switchWorkspace === 'function') switchWorkspace('world');
            });
            worldSec.appendChild(propRow('', locateBtn));
        }
        if (h.container === 'stabled') {
            const loc = doc.state.locations[h.locationIndex];
            const walkable = doc.state.locationWalkOk;
            const pending = doc.deletedStabledHorses.has(h.genomeOff);
            const pos = roomPos(doc, h);
            if (pos) {
                const commit = (nx, ny) => {
                    doc.setStabledPosition(h.roomXOff, h.roomYOff, nx, ny);
                    render();
                };
                const tip = 'Position inside the building. Existing negative or (0, 0) values are left as-is. '
                    + 'A value you type outside 0…20 snaps to 5.';
                worldSec.appendChild(makeFloatRow('Room X', pos.x, (v) => commit(v, pos.y), tip));
                worldSec.appendChild(makeFloatRow('Room Y', pos.y, (v) => commit(pos.x, v), tip));
            }
            const cloneBtn = document.createElement('button');
            cloneBtn.className = 'btn';
            cloneBtn.textContent = '⧉ Clone here';
            cloneBtn.disabled = !loc || !walkable || pending;
            if (!walkable) cloneBtn.title = 'This save’s location data couldn’t be read, so crowd counts can’t be written back.';
            cloneBtn.addEventListener('click', () => {
                try {
                    const genome = effGenomeBytes(doc, h.genomeOff);
                    const hash = effU32(doc, h.genomeOff + SaveFile.GENOME_LEN);
                    const offs = doc.addStabledHorses(loc.nameOffset, [{ genome, genomeHash: hash }]);
                    if (offs && offs.length) selectHorse(offs[0] + SaveFile.GENOME_LEN + SaveFile.DETAIL_GAP);
                    Toast.toast('Cloned into ' + locationDisplayName(loc.name, loc.index) +
                        ' — the copy has its own roster entry.', 'good');
                } catch (e) {
                    Modal.alertModal(e.message, 'Could not clone this horse');
                }
            });
            const delBtn = document.createElement('button');
            delBtn.className = 'btn danger';
            delBtn.textContent = pending ? '↶ Undo removal' : '✕ Remove from ' + (loc ? locationDisplayName(loc.name, loc.index) : 'this location');
            delBtn.disabled = !walkable || pending;
            delBtn.addEventListener('click', () => {
                try {
                    doc.deleteStabledHorse(h.genomeOff);
                    Toast.toast('Removed from ' + locationDisplayName(loc.name, loc.index) + '. It’s removed when you save.', 'good');
                } catch (e) {
                    Modal.alertModal(e.message, 'Could not remove this horse');
                }
            });
            const actions = document.createElement('div');
            actions.className = 'hz-actions';
            actions.appendChild(cloneBtn);
            actions.appendChild(delBtn);
            worldSec.appendChild(actions);
            if (pending) {
                const n = document.createElement('div');
                n.className = 'hz-note';
                n.textContent = 'Queued for removal — it will be gone from the file when you save. Undo (Ctrl+Z) puts it back.';
                worldSec.appendChild(n);
            }
        }
        wrap.appendChild(worldSec);
        wrap.appendChild(renderWardrobe(doc, h));
        els.props.appendChild(wrap);
    }
    function getCurrentItems(doc, h) {
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
    function occupiedSlots(items, excludeIndex) {
        const s = new Set();
        items.forEach((it, idx) => { if (idx !== excludeIndex) s.add(it.slot); });
        return s;
    }
    function buildItemSelect(items, excludeIndex, selectedItemId) {
        const occ = occupiedSlots(items, excludeIndex);
        const select = document.createElement('select');
        const bySlot = Items.groupBySlot();
        const slots = [...bySlot.keys()].sort((a, b) => a - b);
        let firstEnabled = null;
        for (const slot of slots) {
            const group = document.createElement('optgroup');
            group.label = 'Slot ' + slot;
            for (const it of bySlot.get(slot)) {
                const opt = document.createElement('option');
                opt.value = String(it.id);
                opt.textContent = it.displayName;
                if (occ.has(slot) && it.id !== selectedItemId) {
                    opt.disabled = true;
                } else if (firstEnabled === null) {
                    firstEnabled = it.id;
                }
                if (it.id === selectedItemId) opt.selected = true;
                group.appendChild(opt);
            }
            select.appendChild(group);
        }
        if (selectedItemId === null && firstEnabled !== null) select.value = String(firstEnabled);
        return { select, firstEnabled };
    }
    function renderWardrobe(doc, h) {
        const sec = section('Wardrobe');
        const items = getCurrentItems(doc, h);
        if (items.length === 0) {
            const none = document.createElement('div');
            none.className = 'hz-note';
            none.textContent = 'No items worn.';
            sec.appendChild(none);
        }
        items.forEach((item, idx) => {
            const itemInfo = Items.ITEM_LIST[item.itemId];
            const wrap = document.createElement('div');
            wrap.className = 'hz-item-row';
            const { select } = buildItemSelect(items, idx, item.itemId);
            select.addEventListener('change', () => {
                const newId = Number(select.value);
                const newSlot = Items.ITEM_LIST[newId].equipSlot;
                const next = items.slice();
                next[idx] = { slot: newSlot, itemId: newId };
                doc.setHorseItems(h.detailOff, next);
            });
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn icon';
            removeBtn.textContent = '✕';
            removeBtn.title = 'Remove ' + (itemInfo ? itemInfo.displayName : ('item ' + item.itemId));
            removeBtn.addEventListener('click', () => {
                const next = items.slice();
                next.splice(idx, 1);
                doc.setHorseItems(h.detailOff, next);
            });
            wrap.appendChild(select);
            wrap.appendChild(removeBtn);
            sec.appendChild(propRow('Slot ' + item.slot, wrap));
        });
        const totalSlots = new Set(Items.ITEM_LIST.filter((it) => it.equipSlot !== null).map((it) => it.equipSlot)).size;
        if (items.length < totalSlots) {
            const addWrap = document.createElement('div');
            addWrap.className = 'hz-item-row';
            const { select, firstEnabled } = buildItemSelect(items, -1, null);
            const addBtn = document.createElement('button');
            addBtn.className = 'btn';
            addBtn.textContent = '+ Add';
            addBtn.disabled = firstEnabled === null;
            addBtn.addEventListener('click', () => {
                const newId = Number(select.value);
                const info = Items.ITEM_LIST[newId];
                if (!info || info.equipSlot === null) return;
                if (occupiedSlots(items, -1).has(info.equipSlot)) {
                    Toast.toast('Slot ' + info.equipSlot + ' is already occupied.', 'warn');
                    return;
                }
                const next = items.concat([{ slot: info.equipSlot, itemId: newId }]);
                doc.setHorseItems(h.detailOff, next);
            });
            addWrap.appendChild(select);
            addWrap.appendChild(addBtn);
            sec.appendChild(propRow('Add item', addWrap));
        }
        return sec;
    }
    function renderGenome() {
        const doc = App.doc;
        els.genome.innerHTML = '';
        genomePreview = null;
        if (!doc) { showEmpty(els.genome, 'Open a save file to preview a genome.'); return; }
        const h = currentHorse(doc);
        if (!h) { showEmpty(els.genome, 'Select a horse to preview its genome.'); return; }
        if (typeof GenomePanel === 'undefined') return;
        genomePreview = GenomePanel.mount(els.genome, {
            doc,
            genomeOff: () => h.genomeOff,
            geneTable,
            label: () => (row => row ? row.displayName : 'Horse')(state.rows.find((r) => r.h.detailOff === h.detailOff)),
            collapseKey: 'horsey_studio_hz_preview_open',
            onOpenInGenome: () => {
                if (typeof setFocus === 'function') setFocus('horse', h);
                if (typeof switchWorkspace === 'function') switchWorkspace('genome');
            }
        });
    }
    function focusOnLocation(ref) {
        const doc = App.doc;
        if (!doc || !ref) return;
        const loc = doc.state.locations[ref.locationIndex];
        if (!loc) return;
        state.filters.search = ''; if (els.search) els.search.value = '';
        state.filters.namedOnly = false; if (els.namedOnly) els.namedOnly.checked = false;
        state.filters.location = locationDisplayName(loc.name, loc.index);
        state.selectedDetailOff = null;
        render();
    }
    function focusOn(kind, ref) {
        if (kind === 'location') { focusOnLocation(ref); return; }
        if (kind !== 'horse' || !App.doc || !ref) return;
        const detailOff = ref.detailOff;
        if (!state.horseIndex.has(detailOff)) return;
        const targetRow = state.rows.find((r) => r.h.detailOff === detailOff);
        let changed = false;
        if (state.filters.search) { state.filters.search = ''; els.search.value = ''; changed = true; }
        if (state.filters.namedOnly) { state.filters.namedOnly = false; els.namedOnly.checked = false; changed = true; }
        if (targetRow && state.filters.location && state.filters.location !== targetRow.locKey) {
            state.filters.location = ''; els.locationFilter.value = ''; changed = true;
        }
        if (changed) { state.filteredRows = applyFilters(state.rows); renderCount(); }
        const idx = state.filteredRows.findIndex((r) => r.h.detailOff === detailOff);
        selectHorse(detailOff);
        if (idx >= 0) els.rosterScroll.scrollTop = Math.max(0, idx * ROW_HEIGHT - els.rosterScroll.clientHeight / 2);
    }
    return { init, onDocLoaded, onActivate, render, focusOn };
})();
