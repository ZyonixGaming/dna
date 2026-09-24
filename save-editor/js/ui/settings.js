'use strict';
const Settings = (function () {
    const DENSITY_KEY = 'horsey_studio_density';
    const THEME_KEY = 'horsey_studio_theme';
    function isOpen() { return document.getElementById('settings-drawer').style.display !== 'none'; }
    function open() {
        document.getElementById('settings-drawer').style.display = 'flex';
        document.getElementById('settings-backdrop').classList.add('show');
    }
    function close() {
        document.getElementById('settings-drawer').style.display = 'none';
        document.getElementById('settings-backdrop').classList.remove('show');
    }
    function switchTab(name) {
        document.querySelectorAll('.settings-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
        document.querySelectorAll('.settings-panel').forEach((p) => p.classList.toggle('active', p.id === 'settings-' + name));
    }
    function getDensityPref() {
        return localStorage.getItem(DENSITY_KEY) || 'auto';
    }
    function setDensityPref(v) {
        localStorage.setItem(DENSITY_KEY, v);
        if (typeof applyDensity === 'function') applyDensity();
    }
    function getThemePref() {
        try { return localStorage.getItem(THEME_KEY) || 'system'; } catch (e) { return 'system'; }
    }
    function setThemePref(v) {
        try { localStorage.setItem(THEME_KEY, v); } catch (e) {   }
        if (typeof applyTheme === 'function') applyTheme();
    }
    function runDiagnostics() {
        const doc = (typeof App !== 'undefined') ? App.doc : null;
        const resultEl = document.getElementById('diagnosticsResult');
        if (!doc) { resultEl.innerHTML = '<p class="settings-note">No save loaded.</p>'; return; }
        const { accepted: heurSet, why } = SaveFile.heuristicScan(doc.state.bytes, doc.state.view, doc.state.tableEnd, doc.state.records.length);
        const structural = new Set(doc.state.horses.map((h) => h.detailOff));
        const missed = [...structural].filter((x) => !heurSet.has(x));
        const extra = [...heurSet].filter((x) => !structural.has(x));
        const rows = [
            ['structural (unified horses[])', structural.size],
            ['heuristic (findDnaRuns cross-check)', heurSet.size],
            ['missed — structurally real, heuristic drops it', missed.length],
            ['extra — heuristic claims it, structural read does not', extra.length]
        ];
        let html = '<table class="diag-table"><tbody>' +
            rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('') +
            '</tbody></table>';
        if (why.size) {
            html += '<p class="settings-note" style="margin-top:8px;">Why the heuristic missed a structurally-real horse:</p>';
            html += '<table class="diag-table"><tbody>' +
                [...why.entries()].map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('') +
                '</tbody></table>';
        }
        if (extra.length) {
            html += `<p class="settings-note" style="margin-top:8px;">${extra.length} extra genome run(s) sit outside all three containers — see plan section 2.6. Not lost data; nothing in the export path depends on classifying them.</p>`;
        }
        resultEl.innerHTML = html;
    }
    function runFormatCheck() {
        const doc = (typeof App !== 'undefined') ? App.doc : null;
        const el = document.getElementById('formatCheckResult');
        if (!doc) { el.innerHTML = '<p class="settings-note">No save loaded.</p>'; return; }
        const st = doc.state;
        const bytes = st.bytes;
        const view = st.view;
        const len = bytes.length;
        const issues = [];
        const ok = (label) => issues.push({ label, status: 'ok' });
        const warn = (label, detail) => issues.push({ label, status: 'warn', detail });
        const fail = (label, detail) => issues.push({ label, status: 'fail', detail });
        try {
            const expectedMapStart = st.tableEnd + 0xF0 + 4 + st.someCount.length * (st.version >= 12 ? 8 : 6) + 8;
            if (st.block && st.block.blockOffset != null) {
                const actualMapStart = st.block.blockOffset;
                if (actualMapStart === expectedMapStart) ok('Section chaining: player block -> map');
                else warn('Section chaining', 'Expected map at ' + expectedMapStart + ', got ' + actualMapStart);
            }
            if (st.buriedOffset != null && st.block && st.block.mapEnd != null) {
                if (st.buriedOffset === st.block.mapEnd) ok('Section chaining: map -> buried');
                else warn('Section chaining', 'Buried at ' + st.buriedOffset + ', mapEnd at ' + st.block.mapEnd);
            }
        } catch (e) { warn('Section chaining', e.message); }
        try {
            let recOk = true;
            for (let i = 0; i < st.records.length; i++) {
                const r = st.records[i];
                if (r.parentA !== undefined && r.parentA !== -1 && (r.parentA < 0 || r.parentA >= st.records.length)) {
                    fail('Record #' + i + ' parentA', 'Index ' + r.parentA + ' out of range [0,' + st.records.length + ')');
                    recOk = false;
                }
                if (r.parentB !== undefined && r.parentB !== -1 && (r.parentB < 0 || r.parentB >= st.records.length)) {
                    fail('Record #' + i + ' parentB', 'Index ' + r.parentB + ' out of range [0,' + st.records.length + ')');
                    recOk = false;
                }
            }
            if (recOk) ok('Record table: ' + st.records.length + ' records, all parent indices in range');
        } catch (e) { warn('Record table', e.message); }
        try {
            const CODESET = new Set([9,10,11,12,17,18,19,20,25,26,27,28,33,34,35,36]);
            let badGenomes = 0;
            for (const h of st.horses) {
                for (let i = 0; i < 240; i++) {
                    if (!CODESET.has(bytes[h.genomeOff + i])) { badGenomes++; break; }
                }
            }
            if (badGenomes === 0) ok('Genome legality: ' + st.horses.length + ' genomes, all bytes in CODESET');
            else warn('Genome legality', badGenomes + ' genome(s) with illegal bytes');
        } catch (e) { warn('Genome legality', e.message); }
        try {
            const bad = SaveFile.findBadCrowdOrdinals ? SaveFile.findBadCrowdOrdinals(st) : [];
            if (bad.length === 0) ok('Crowd ordinals: all valid');
            else fail('Crowd ordinals', bad.length + ' invalid: ' + bad.map((b) => b.name + ' (idx ' + b.index + ')').join(', '));
        } catch (e) { warn('Crowd ordinals', e.message); }
        try {
            const mismatches = (SaveFile.findTileFamilyMismatches && st.grid) ? SaveFile.findTileFamilyMismatches(st.grid, 50) : [];
            if (mismatches.length === 0) ok('Tile consistency: no family/id mismatches');
            else warn('Tile consistency', mismatches.length + ' tile(s) with family/id mismatch');
        } catch (e) { warn('Tile consistency', e.message); }
        try {
            const boolOffs = [0x1C, 0x20, 0x30, 0x3C];
            let boolBad = 0;
            for (const off of boolOffs) {
                const abs = st.tableEnd + off;
                if (abs + 4 <= len) {
                    const v = view.getUint32(abs, true);
                    if (v !== 0 && v !== 1) boolBad++;
                }
            }
            if (boolBad === 0) ok('Boolean fields: all global block bools are 0 or 1');
            else warn('Boolean fields', boolBad + ' global block boolean(s) not 0 or 1');
        } catch (e) { warn('Boolean fields', e.message); }
        try {
            if (st.locationWalkOk) ok('Location walk: completed successfully (' + st.locations.length + ' records)');
            else fail('Location walk', st.locationWalkError || 'walk did not complete');
        } catch (e) { warn('Location walk', e.message); }
        try {
            if (st.locations && st.locations.length > 0) {
                const last = st.locations[st.locations.length - 1];
                if (last.tailEnd != null) {
                    const gap = len - last.tailEnd;
                    if (gap === 0) ok('EOF: tailEnd == fileSize (' + len + ' bytes)');
                    else warn('EOF', gap + ' byte(s) unaccounted after last location tail');
                }
            }
        } catch (e) { warn('EOF accounting', e.message); }
        let html = '<table class="diag-table"><tbody>';
        for (const iss of issues) {
            const icon = iss.status === 'ok' ? '✅' : iss.status === 'warn' ? '⚠️' : '❌';
            html += '<tr><td>' + icon + '</td><td>' + iss.label + (iss.detail ? ' — ' + iss.detail : '') + '</td></tr>';
        }
        html += '</tbody></table>';
        el.innerHTML = html;
    }
    function onDocChanged() {
        document.getElementById('runDiagnosticsBtn').disabled = !(typeof App !== 'undefined' && App.doc);
        document.getElementById('runFormatCheckBtn').disabled = !(typeof App !== 'undefined' && App.doc);
    }
    function renderCustomDataStatus() {
        const st = GameData.status();
        const fmt = (on, bytes) => (on
            ? '✅ using a custom file (' + (bytes / 1024).toFixed(1) + ' KB)'
            : 'using the bundled file');
        const g = document.getElementById('customGenesStatus');
        const p = document.getElementById('customPopStatus');
        if (g) g.textContent = fmt(st.genes, st.genesBytes);
        if (p) p.textContent = fmt(st.pop, st.popBytes);
    }
    async function uploadCustom(which, input) {
        const file = input.files[0];
        if (!file) return;
        const label = which === 'pop' ? 'pop.xml' : 'genes.xml';
        try {
            const d = await GameData.setCustom(which, await file.text());
            renderCustomDataStatus();
            Toast.toast('Using your ' + label + ' — ' + d.genes.length + ' genes, ' +
                d.popTable.size + ' populations.', 'ok');
            for (const w of d.warnings || []) Toast.toast(w, 'warn', 8000);
        } catch (e) {
            Modal.alertModal('That ' + label + ' could not be used:\n\n' + e.message +
                '\n\nThe previous data is still in use.', 'Custom data rejected');
        }
        input.value = '';
    }
    async function resetCustomData() {
        try {
            await GameData.clearCustom();
            renderCustomDataStatus();
            Toast.toast('Back to the bundled genes.xml and pop.xml.', 'ok');
        } catch (e) {
            Modal.alertModal('Could not reload the bundled data: ' + e.message, 'Reset failed');
        }
    }
    const ATLAS_FILES = ['terrain.png', 'terrain.xml', 'locs.png', 'locs.xml', 'sprites.png', 'sprites.xml'];
    function renderAtlasStatus() {
        const el = document.getElementById('atlasStatus');
        if (!el) return;
        const over = (typeof World !== 'undefined' && World.atlasOverride) ? World.atlasOverride() : {};
        const names = ATLAS_FILES.filter((n) => over[n]);
        el.textContent = names.length
            ? '✅ overriding ' + names.length + ' of 6: ' + names.join(', ')
            : 'using the bundled atlases';
    }
    async function uploadAtlas(input) {
        const files = [...input.files];
        input.value = '';
        if (!files.length) return;
        const taken = {};
        const ignored = [];
        for (const f of files) {
            if (ATLAS_FILES.includes(f.name)) taken[f.name] = f;
            else ignored.push(f.name);
        }
        if (!Object.keys(taken).length) {
            Modal.alertModal('None of those are atlas files. Expected any of:\n\n  ' +
                ATLAS_FILES.join('\n  '), 'Nothing to use');
            return;
        }
        try {
            await World.setAtlasOverride(taken);
            renderAtlasStatus();
            const n = Object.keys(taken).length;
            Toast.toast('Using ' + n + ' modded atlas file' + (n === 1 ? '' : 's') + '.' +
                (ignored.length ? ' Ignored: ' + ignored.join(', ') + '.' : ''), 'ok');
        } catch (e) {
            Modal.alertModal('Those atlas files could not be used:\n\n' + e.message +
                '\n\nThe bundled atlases are still in use.', 'Atlas rejected');
            renderAtlasStatus();
        }
    }
    async function resetAtlas() {
        try {
            await World.setAtlasOverride(null);
            renderAtlasStatus();
            Toast.toast('Back to the bundled atlases.', 'ok');
        } catch (e) {
            Modal.alertModal('Could not reload the bundled atlases: ' + e.message, 'Reset failed');
        }
    }
    function parseTmxCsvLayer(xmlDoc) {
        const mapElem = xmlDoc.querySelector('map');
        if (!mapElem) throw new Error('Not a TMX file: no <map> element.');
        const width = parseInt(mapElem.getAttribute('width'), 10);
        const height = parseInt(mapElem.getAttribute('height'), 10);
        const layer = xmlDoc.querySelector("layer[name='Tiles']") || xmlDoc.querySelector('layer');
        if (!layer) throw new Error('No tile layer in this TMX.');
        const dataElem = layer.querySelector('data');
        if (!dataElem || dataElem.getAttribute('encoding') !== 'csv') {
            throw new Error('Only CSV-encoded TMX layers are supported. Re-export from Tiled with ' +
                'Tile Layer Format set to CSV.');
        }
        const numbers = (dataElem.textContent.match(/\d+/g) || []).map((n) => parseInt(n, 10));
        if (numbers.length !== width * height) {
            throw new Error('Tile count mismatch: the file lists ' + numbers.length +
                ' tiles but says it is ' + width + 'x' + height + '.');
        }
        return { width, height, gids: numbers };
    }
    async function importTmx(input) {
        const file = input.files[0];
        input.value = '';
        if (!file) return;
        const doc = (typeof App !== 'undefined') ? App.doc : null;
        const status = document.getElementById('tmxStatus');
        if (!doc) { Modal.alertModal('Open a save file first.', 'No save loaded'); return; }
        let layer;
        try {
            layer = parseTmxCsvLayer(new DOMParser().parseFromString(await file.text(), 'text/xml'));
        } catch (e) { Modal.alertModal(e.message, 'TMX import failed'); return; }
        if (layer.width !== doc.grid.width || layer.height !== doc.grid.height) {
            Modal.alertModal('The TMX is ' + layer.width + '×' + layer.height +
                ' but the loaded map is ' + doc.grid.width + '×' + doc.grid.height +
                '. Resize the map to match first, then import again.', 'Dimensions do not match');
            return;
        }
        const ok = await Modal.confirmModal(
            'Replace all ' + (layer.width * layer.height).toLocaleString() + ' tiles with this TMX layer?\n\n' +
            'Growth stages reset to their family default and mountain variants are re-randomised — ' +
            'TMX stores neither. Locations, horses, items and buried items are left untouched.\n\n' +
            'This lands as one undo step.',
            { title: 'Import TMX', confirmLabel: 'Import' });
        if (!ok) return;
        try {
            const next = doc.grid.clone();
            SaveFile.applyTmxLayer(next, layer.gids);
            doc.replaceGrid(next, 'Import TMX (' + file.name + ')');
        } catch (e) { Modal.alertModal(e.message, 'TMX import failed'); return; }
        if (status) status.textContent = '✅ imported ' + file.name;
        Toast.toast('Imported ' + (layer.width * layer.height).toLocaleString() +
            ' tiles from ' + file.name + '.', 'ok');
    }
    function init() {
        document.getElementById('settingsBtn').addEventListener('click', () => { isOpen() ? close() : open(); });
        document.getElementById('settingsCloseBtn').addEventListener('click', close);
        document.getElementById('settings-backdrop').addEventListener('click', close);
        document.querySelectorAll('.settings-tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));
        const pref = getDensityPref();
        const radio = document.querySelector(`input[name="density"][value="${pref}"]`);
        if (radio) radio.checked = true;
        document.querySelectorAll('input[name="density"]').forEach((r) => r.addEventListener('change', () => setDensityPref(r.value)));
        const themePref = getThemePref();
        const themeRadio = document.querySelector(`input[name="theme"][value="${themePref}"]`);
        if (themeRadio) themeRadio.checked = true;
        document.querySelectorAll('input[name="theme"]').forEach((r) => r.addEventListener('change', () => setThemePref(r.value)));
        document.getElementById('runDiagnosticsBtn').addEventListener('click', runDiagnostics);
        document.getElementById('runFormatCheckBtn').addEventListener('click', runFormatCheck);
        const wire = (id, fn) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', fn);
        };
        wire('customGenesFile', (e) => uploadCustom('genes', e.target));
        wire('customPopFile', (e) => uploadCustom('pop', e.target));
        wire('atlasFiles', (e) => uploadAtlas(e.target));
        wire('tmxFile', (e) => importTmx(e.target));
        const resetData = document.getElementById('customDataResetBtn');
        if (resetData) resetData.addEventListener('click', resetCustomData);
        const resetAtlasBtn = document.getElementById('atlasResetBtn');
        if (resetAtlasBtn) resetAtlasBtn.addEventListener('click', resetAtlas);
        renderCustomDataStatus();
        renderAtlasStatus();
        onDocChanged();
    }
    return { init, open, close, getDensityPref, getThemePref, setThemePref, onDocChanged, parseTmxCsvLayer, THEME_KEY };
})();
