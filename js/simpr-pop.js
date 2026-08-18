// =====================================================================
//  SIMPR – Presets section
//  Generates whole genomes and loads them into the editor or into compare.
//  Depends on: genes.js (HELIX_LENGTHS, arrayHp), pop.js (popData,
//  defaultWeights, loadPopDataFromXml), crispr.js (getRandomNuc,
//  parseAndLoadFromTextarea), simpr.js (pushSnapshot, setCompareReference).
//  Nothing in here modifies the shared files.
// =====================================================================

// ---------------------------------------------------------------------
//  Custom data (modded genes.xml / pop.xml), cached in localStorage
//  Read first so every loader below picks it up on this page load.
// ---------------------------------------------------------------------
const CUSTOM_GENES_KEY = 'simpr_custom_genes_xml';
const CUSTOM_POP_KEY = 'simpr_custom_pop_xml';

window.simprCustomGenesXml = localStorage.getItem(CUSTOM_GENES_KEY) || '';
window.simprCustomPopXml = localStorage.getItem(CUSTOM_POP_KEY) || '';

// ---------------------------------------------------------------------
//  Genome generation
// ---------------------------------------------------------------------

// One generator for every sampler; `sample(gene, helix, position)` returns a
// single base and is called twice per position, once per strand, so the two
// strands vary independently.
function buildGenomeText(sample) {
    const lines = [];
    for (let h = 0; h < HELIX_LENGTHS.length; h++) {
        let strand1 = '';
        let strand2 = '';
        for (let p = 0; p < HELIX_LENGTHS[h]; p++) {
            const gene = window.arrayHp[h][p];
            strand1 += sample(gene, h, p);
            strand2 += sample(gene, h, p);
        }
        const hh = String(h).padStart(2, '0');
        lines.push(`${hh}:${strand1}`, `${hh}:${strand2}`);
    }
    return lines.join('\n');
}

// Uniform over A/C/G/T - ignores dominance order, pop weights and gene values.
// Used by the Randomize button in the modifications panel.
function sampleUniform() {
    return getRandomNuc();
}

// pop.xml weights are RARITY, and the game inverts them: P(allele i) is
// proportional to 1/p(i). p=1 is common, p=20 is rare, p=0 is impossible.
// Same maths as pop.html, which keeps this inline rather than in pop.js.
function weightedRandom(weights) {
    const inverse = weights.map(w => (w === 0 ? 0 : 1 / w));
    const sum = inverse.reduce((a, b) => a + b, 0);
    if (sum === 0) return 0;
    let r = Math.random() * sum;
    for (let i = 0; i < inverse.length; i++) {
        r -= inverse[i];
        if (r <= 0) return i;
    }
    return inverse.length - 1;
}

// Resolved weights for one gene in one population. A gene the population never
// mentions falls back to defaultWeights ([1,0,0,0]), which locks it to n[0].
function popWeightsFor(popName, gene) {
    const config = (window.popData && window.popData[popName]) || {};
    return config[gene.desc] || defaultWeights;
}

function makePopSampler(popName) {
    return gene => gene.n[weightedRandom(popWeightsFor(popName, gene))];
}

// ---------------------------------------------------------------------
//  Preset registry - a flat list, one row per population
// ---------------------------------------------------------------------

let presetRows = [];

function getPresetRow(id) {
    return presetRows.find(r => r.id === id);
}

function generatePresetGenome(row) {
    if (!row) return null;
    if (!window.arrayHp || !window.arrayHp[0] || !window.arrayHp[0][0]) {
        showToast('Gene data is still loading');
        return null;
    }
    return buildGenomeText(makePopSampler(row.popName));
}

// ---------------------------------------------------------------------
//  Actions
// ---------------------------------------------------------------------

function loadPresetIntoEditor(id) {
    const row = getPresetRow(id);
    const text = generatePresetGenome(row);
    if (text === null) return;
    if (typeof pushSnapshot === 'function') pushSnapshot(`load ${row.name}`);
    document.getElementById('rawGeneInput').value = text;
    parseAndLoadFromTextarea();
    showToast(`Generated from ${row.name}`);
}

// Population currently loaded into compare - the target for legalizeForActivePop().
let activePopName = null;

function loadPresetIntoCompare(id) {
    const row = getPresetRow(id);
    const text = generatePresetGenome(row);
    if (text === null) return;
    setCompareReference(row.name, text);
    activePopName = row.popName;
    showToast(`Comparing against ${row.name}`);
}

document.addEventListener('simpr:compare-changed', e => {
    if (!e.detail.active) activePopName = null;
});

// ---------------------------------------------------------------------
//  Rendering
// ---------------------------------------------------------------------

// Substring match on the population name, case-insensitive.
let presetFilterText = '';

function visiblePresetRows() {
    if (!presetFilterText) return presetRows;
    const needle = presetFilterText.toLowerCase();
    return presetRows.filter(r => r.name.toLowerCase().includes(needle));
}

function renderPresets() {
    // The list lives in its own scroll container so the filter box above it
    // stays put instead of scrolling out of view.
    const list = document.getElementById('presetList');
    if (!list) return;

    if (!presetRows.length) {
        list.innerHTML = '<div class="presets-empty">No presets loaded.</div>';
        return;
    }

    const rows = visiblePresetRows();
    if (!rows.length) {
        list.innerHTML = `<div class="presets-empty">No population matches "${presetFilterText}".</div>`;
        return;
    }

    list.innerHTML = rows.map(row => `
        <div class="preset-row" data-preset="${row.id}" title="${row.title || row.name}">
            <span class="preset-name">${row.name}</span>
            <button class="preset-compare" data-act="compare" title="Load into compare">⚖️</button>
            <span class="preset-dot" data-dot="${row.id}"></span>
        </div>`).join('');

    updatePresetDots();
}

(function initPresetFilter() {
    const input = document.getElementById('presetFilter');
    const clear = document.getElementById('presetFilterClear');
    if (!input) return;
    input.addEventListener('input', () => {
        presetFilterText = input.value.trim();
        renderPresets();
    });
    if (clear) clear.addEventListener('click', () => {
        input.value = '';
        presetFilterText = '';
        renderPresets();
        input.focus();
    });
})();

document.getElementById('presetsBody').addEventListener('click', e => {
    const rowEl = e.target.closest('.preset-row');
    if (!rowEl) return;
    const id = rowEl.dataset.preset;
    if (e.target.closest('[data-act="compare"]')) loadPresetIntoCompare(id);
    // the dot is a read-only status light; clicking it should not regenerate
    else if (!e.target.closest('.preset-dot')) loadPresetIntoEditor(id);
});

// ---------------------------------------------------------------------
//  Population list
//  pop.js resolves inheritance but flattens it into window.popData, discarding
//  the parent/child structure. We only need names here, and re-parsing keeps
//  pop.xml's document ordering rather than object-key ordering.
// ---------------------------------------------------------------------

const POP_XML_URL = './data/pop.xml';

async function fetchPopXmlText() {
    if (window.simprCustomPopXml) return window.simprCustomPopXml;
    try {
        const res = await fetch(POP_XML_URL);
        if (!res.ok) throw new Error('status ' + res.status);
        return await res.text();
    } catch (e) {
        return (typeof popXmlText === 'string') ? popXmlText : '';
    }
}

function buildPresetRowsFromXml(xmlText) {
    const rows = [];
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) {
        console.warn('pop.xml parse error');
        return rows;
    }
    // every <pop> at any depth, in document order, presented as one flat list
    doc.querySelectorAll('pop').forEach(node => {
        const name = node.getAttribute('name');
        if (!name) return;
        rows.push({
            id: 'pop:' + name,
            name,
            popName: name,
            title: `Click to generate a "${name}" genome, or use the scales to compare against one`
        });
    });
    return rows;
}

// Fall back to popData's own key order if the XML could not be read.
function buildPresetRowsFromPopData() {
    return Object.keys(window.popData || {}).map(name => ({
        id: 'pop:' + name,
        name,
        popName: name,
        title: `Click to generate a "${name}" genome, or use the scales to compare against one`
    }));
}

async function reloadPresets() {
    const xmlText = await fetchPopXmlText();
    presetRows = xmlText ? buildPresetRowsFromXml(xmlText) : [];
    if (!presetRows.length) presetRows = buildPresetRowsFromPopData();
    renderPresets();
}

// ---------------------------------------------------------------------
//  Validity dots - can the current genome occur in each population?
// ---------------------------------------------------------------------

// Every gene's `n` is a permutation of ACGT, so a base maps to exactly one
// allele index and legality is a single weight lookup.
function isBaseLegal(weights, gene, base) {
    const idx = gene.n.indexOf(base);
    return idx !== -1 && weights[idx] > 0;
}

// First reason the current genome cannot occur in `popName`, or null if it can.
function firstIllegalGene(popName) {
    const config = (window.popData && window.popData[popName]) || {};
    for (const gp of currentGenePairs) {
        const listed = Object.prototype.hasOwnProperty.call(config, gp.desc);
        const weights = listed ? config[gp.desc] : defaultWeights;
        for (const base of [gp.allele1, gp.allele2]) {
            if (!isBaseLegal(weights, gp, base)) {
                return {
                    desc: gp.desc,
                    base,
                    listed,
                    lockedTo: listed ? null : gp.n[0]   // defaultWeights allows index 0 only
                };
            }
        }
    }
    return null;
}

function updatePresetDots() {
    const dots = document.querySelectorAll('.preset-dot[data-dot]');
    if (!dots.length || !currentGenePairs.length) return;
    for (const el of dots) {
        const row = getPresetRow(el.dataset.dot);
        if (!row) continue;
        const bad = firstIllegalGene(row.popName);
        el.classList.toggle('invalid', !!bad);
        el.textContent = bad ? '○' : '●';
        if (!bad) {
            el.title = `This genome can occur naturally in "${row.name}"`;
        } else if (!bad.listed) {
            el.title = `Impossible in "${row.name}": ${bad.desc} is not defined for this `
                + `population, so it is locked to ${bad.lockedTo}, but this genome has ${bad.base}. `
                + `100 of the 240 genes are undefined even in "default", so hand-edited genomes `
                + `usually fail here.`;
        } else {
            el.title = `Impossible in "${row.name}": ${bad.desc} cannot be ${bad.base}`;
        }
    }
}

// Refresh the dots on every path that mutates alleles. syncTextareaFromTable()
// is the common denominator for edits; parseAndLoadFromTextarea() covers loads.
const _origSyncTextareaFromTable = syncTextareaFromTable;
syncTextareaFromTable = function () {
    _origSyncTextareaFromTable();
    updatePresetDots();
};

const _origParseForDots = parseAndLoadFromTextarea;
parseAndLoadFromTextarea = function () {
    _origParseForDots();
    updatePresetDots();
};

// ---------------------------------------------------------------------
//  Legalize - written and working, but not currently bound to a panel slot.
//  Snaps every illegal allele to a legal one for the compared population.
//  To put it back on the panel: MOD_BUTTONS[n].fn = () => legalizeForActivePop().
// ---------------------------------------------------------------------
function legalizeForActivePop() {
    if (!activePopName) { showToast('Compare against a population preset first'); return; }
    const config = (window.popData && window.popData[activePopName]) || {};

    pushSnapshot(`Legalize for ${activePopName}`);
    let changed = 0;
    for (const gp of currentGenePairs) {
        const listed = Object.prototype.hasOwnProperty.call(config, gp.desc);
        const weights = listed ? config[gp.desc] : defaultWeights;

        const legal = [0, 1, 2, 3].filter(i => weights[i] > 0);
        if (!legal.length) continue;
        const preferred = legal.reduce((a, b) => (weights[a] <= weights[b] ? a : b));

        for (const side of ['allele1', 'allele2']) {
            const idx = gp.n.indexOf(gp[side]);
            if (idx === -1 || weights[idx] === 0) {
                gp[side] = gp.n[preferred];
                changed++;
            }
        }
    }
    if (changed) {
        syncTextareaFromTable();
        autoDetectInvertFlags();
        renderTable();
    }
    showToast(`Legalized ${changed} allele${changed === 1 ? '' : 's'} for "${activePopName}"`);
}

// ---------------------------------------------------------------------
//  Custom data UI
// ---------------------------------------------------------------------

// genes.js maps each <gene> onto a hardcoded 240-entry HELIX_MAP by document
// order. A file with a different gene count would index past the end and leave
// the gene table half-populated, so the count is checked before anything is
// applied.
const EXPECTED_GENE_COUNT = 240;

function validateGenesXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) return { ok: false, reason: 'not valid XML' };
    const genes = doc.querySelectorAll('gene');
    if (!genes.length) return { ok: false, reason: 'no <gene> elements found' };
    if (genes.length !== EXPECTED_GENE_COUNT) {
        return {
            ok: false,
            reason: `${genes.length} genes, but this build's helix map is fixed at ${EXPECTED_GENE_COUNT}`
        };
    }
    let missingName = 0;
    genes.forEach(g => { if (!g.getAttribute('name')) missingName++; });
    if (missingName) return { ok: false, reason: `${missingName} gene(s) have no name attribute` };
    return { ok: true, count: genes.length };
}

function validatePopXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) return { ok: false, reason: 'not valid XML' };
    const pops = doc.querySelectorAll('pop');
    if (!pops.length) return { ok: false, reason: 'no <pop> elements found' };
    return { ok: true, count: pops.length };
}

function renderCustomDataStatus() {
    const el = document.getElementById('customDataStatus');
    if (!el) return;
    const parts = [];
    if (window.simprCustomGenesXml) parts.push('custom genes.xml');
    if (window.simprCustomPopXml) parts.push('custom pop.xml');
    if (!parts.length) {
        el.className = 'custom-status';
        el.textContent = 'Using bundled data.';
    } else {
        el.className = 'custom-status active';
        el.textContent = 'Active: ' + parts.join(' + ');
    }
}

function cacheCustomXml(key, text) {
    try {
        localStorage.setItem(key, text);
        return true;
    } catch (e) {
        showToast('Loaded, but too large to remember across reloads', 4000);
        return false;
    }
}

// Rebuild everything that depends on gene data, preserving the current genome.
async function applyCustomGenesXml(xmlText) {
    const genome = serializeGenome();
    await loadGeneDataFromXml(xmlText);
    await recoverGeneScales();
    if (genome) document.getElementById('rawGeneInput').value = genome;
    parseAndLoadFromTextarea();
    renderTable();
}

document.getElementById('genesXmlInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const check = validateGenesXml(text);
    if (!check.ok) { showToast(`genes.xml rejected: ${check.reason}`, 5000); return; }

    window.simprCustomGenesXml = text;
    cacheCustomXml(CUSTOM_GENES_KEY, text);
    await applyCustomGenesXml(text);
    renderCustomDataStatus();
    updatePresetDots();
    showToast(`Loaded custom genes.xml (${check.count} genes)`);
});

document.getElementById('popXmlInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const check = validatePopXml(text);
    if (!check.ok) { showToast(`pop.xml rejected: ${check.reason}`, 5000); return; }

    window.simprCustomPopXml = text;
    cacheCustomXml(CUSTOM_POP_KEY, text);
    await loadPopDataFromXml(text);
    await reloadPresets();
    exitCompareMode();
    renderCustomDataStatus();
    showToast(`Loaded custom pop.xml (${check.count} populations)`);
});

document.getElementById('resetCustomDataBtn').addEventListener('click', async () => {
    const hadGenes = !!window.simprCustomGenesXml;
    if (!hadGenes && !window.simprCustomPopXml) { showToast('Already using bundled data'); return; }

    localStorage.removeItem(CUSTOM_GENES_KEY);
    localStorage.removeItem(CUSTOM_POP_KEY);
    window.simprCustomGenesXml = '';
    window.simprCustomPopXml = '';

    if (hadGenes) {
        const genome = serializeGenome();
        await loadGeneDataFromXml();          // no arg -> bundled
        await recoverGeneScales();
        if (genome) document.getElementById('rawGeneInput').value = genome;
        parseAndLoadFromTextarea();
        renderTable();
    }
    await loadPopDataFromXml();
    await reloadPresets();
    exitCompareMode();
    renderCustomDataStatus();
    showToast('Reverted to bundled genes.xml and pop.xml');
});

// ---------- Custom data section collapse ----------
const CUSTOM_OPEN_KEY = 'simpr_customdata_open';

function applyCustomDataCollapse(open) {
    const body = document.getElementById('customDataBody');
    const toggle = document.getElementById('customDataToggle');
    if (!body || !toggle) return;
    body.style.display = open ? '' : 'none';
    toggle.classList.toggle('collapsed', !open);
}

(function initCustomDataCollapse() {
    // collapsed by default - most sessions use the bundled data
    const open = localStorage.getItem(CUSTOM_OPEN_KEY) === '1';
    applyCustomDataCollapse(open);
    document.getElementById('customDataToggle').addEventListener('click', () => {
        const nowOpen = localStorage.getItem(CUSTOM_OPEN_KEY) !== '1';
        localStorage.setItem(CUSTOM_OPEN_KEY, nowOpen ? '1' : '0');
        applyCustomDataCollapse(nowOpen);
    });
})();

// ---------------------------------------------------------------------
//  Init
// ---------------------------------------------------------------------
window.addEventListener('load', async () => {
    try {
        // Wait until crispr.js has finished building the bundled gene data,
        // otherwise its pending fetch resolves later and overwrites ours.
        await waitForGeneData();

        // With the bundled data settled, re-apply a cached custom genes.xml over
        // the top before anything reads gene entries.
        if (window.simprCustomGenesXml) {
            const check = validateGenesXml(window.simprCustomGenesXml);
            if (check.ok) {
                await applyCustomGenesXml(window.simprCustomGenesXml);
            } else {
                console.warn('cached custom genes.xml rejected:', check.reason);
                localStorage.removeItem(CUSTOM_GENES_KEY);
                window.simprCustomGenesXml = '';
                showToast(`Cached genes.xml discarded: ${check.reason}`, 5000);
            }
        }
        await loadPopDataFromXml(window.simprCustomPopXml || '');
        await reloadPresets();
        renderCustomDataStatus();
    } catch (e) {
        console.warn('preset init failed', e);
    }
});
