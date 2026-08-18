// =====================================================================
//  CRISPR 2.0 Override – Custom fixed dropdown + nucleotide colours
//  Adapted for genes.js (no completeMapping, uses arrayHp)
// =====================================================================

// Helper: get gene entry from helix and pair (0‑based)
function getGeneEntry(helix, pair) {
    return window.arrayHp[helix]?.[pair];
}

// Helper: get base index in priority order (0..3)
function getBaseIndex(entry, base) {
    return entry.priorityOrder.indexOf(base);
}

// Weighted value lookup using precomputed matrix
function getWeightedValueFromEntry(entry, a1, a2) {
    const idx1 = getBaseIndex(entry, a1);
    const idx2 = getBaseIndex(entry, a2);
    if (idx1 === -1 || idx2 === -1) return 0; // fallback
    return entry.valueMatrix[idx1][idx2];
}

// ---------- Unordered allele pair list (10 combos) ----------
function getCombosForEntry(entry) {
    const bases = ['A', 'C', 'G', 'T'];
    const prio = entry.n;
    const combos = [];

    for (let idx1 = 0; idx1 < 4; idx1++) {
        for (let idx2 = idx1; idx2 < 4; idx2++) {
            // Get indices in priority order
            if (idx1 === -1 || idx2 === -1) continue;

            // Dominant = smaller index
            const domIdx = idx1 < idx2 ? idx1 : idx2;
            const recIdx = idx1 > idx2 ? idx1 : idx2;
            const domBase = prio[domIdx];
            const recBase = prio[recIdx];
            const pairStr = domBase + recBase;
            const value = entry.valueMatrix[idx1][idx2];

            combos.push({
                pairStr: pairStr,
                value: value,
                allele1: domBase,
                allele2: recBase
            });
        }
    }

    // Sort: value descending, then by priority order of dominant, then recessive
    combos.sort((c1, c2) => {
        if (c2.value !== c1.value) return c2.value - c1.value;
        const i1 = prio.indexOf(c1.allele1);
        const i2 = prio.indexOf(c2.allele1);
        if (i1 !== i2) return i1 - i2;
        return prio.indexOf(c1.allele2) - prio.indexOf(c2.allele2);
    });
    return combos;
}

// Current pair string (dominant + recessive) based on current alleles
function currentPairStr(gp) {
    const entry = getGeneEntry(gp.h, gp.p);
    if (!entry) return 'AA';
    const dom = getDominantNuc(gp.allele1, gp.allele2, entry.priorityOrder);
    const rec = dom === gp.allele1 ? gp.allele2 : gp.allele1;
    return dom + rec;
}

// Annotation text for a combo (value + special tags)
function getComboAnnotation(combo, entry) {
    const val = combo.value;
    const desc = entry.desc;

    if (desc === 'OSTO_SIZE') {
        if (combo.pairStr.includes('G')) return `${val} (rounded)`;
        return `${val}`;
    }
    if (desc === 'CHEST_SMALL') {
        if (combo.pairStr.includes('A')) return `${val} (sloped)`;
        return `${val}`;
    }
    if (desc.endsWith('_JOINT_TYPE')) {
        const jointNames = ['normal', 'rotate', 'piston'];
        const name = jointNames[val] !== undefined ? jointNames[val] : val;
        return `${val} (${name})`;
    }
    if (desc === 'DERRIERE') {
        if (val < 13) return `${val} (hidden)`;
        return `${val}`;
    }
    if (desc === 'TEETH_SHAPE') {
        if (val === 3) return `${val} (🥩)`;
        return `${val}`;
    }
    if (desc === 'EAR_SIZE') {
        if (val < 13) return `${val} (deaf)`;
        return `${val}`;
    }
    if (desc === 'HEAD_CHIMERA') {
        if (combo.pairStr=="TT") return `${val} (CHIMERA)`;
        return `${val}`;
    }	
    if (desc.endsWith('_TAG')) {
        const tagNames = ['nothing', 'leg', 'arm', 'tail', 'head'];
        const name = tagNames[val] !== undefined ? tagNames[val] : val;
        return `${val} (${name})`;
    }
    return `${val}`;
}

function coloredPairSpans(pairStr) {
    return pairStr.split('').map(ch => `<span class="nuc-${ch}">${ch}</span>`).join('');
}

// ---------- Override renderTable (uses gp.h, gp.p) ----------
//
// Rows are emitted WITHOUT their 10 dropdown options. Rendering all of them up
// front cost ~2400 extra nodes plus 2640 inline onclick attributes across the
// 240 rows, and every single-gene edit rebuilt the lot. Options are now built on
// demand when a dropdown opens, clicks go through one delegated listener on the
// tbody, and a gene edit refreshes only its own row.
window.renderTable = function () {
    const filterWords = currentFilter.toLowerCase().trim().split(/\s+/);

    const filtered = currentGenePairs.filter(p =>
        filterWords.some(word => p.desc.toLowerCase().includes(word))
    );

    const thead = document.getElementById('dynamicThead');
    thead.innerHTML =
        `<th title="Helix">H</th>
         <th title="Position">P</th>
         <th>Description <a href="https://horseygame.miraheze.org/wiki/Genome" target="_blank">(?)</a></th>
         <th>Value</th>`
        + (compareModeActive ? '<th>Compare</th>' : '');

    const parts = [];
    let prevHelix = null;   // last helix actually rendered - drives the inter-helix gap

    for (let idx = 0; idx < filtered.length; idx++) {
        const gp = filtered[idx];
        const entry = getGeneEntry(gp.h, gp.p);
        if (!entry) continue;

        const rowClass = gp.h % 2 === 0 ? 'helix-even' : 'helix-odd';
        // gap before the first rendered row of each helix, but never above the first row overall
        const gapClass = (prevHelix !== null && gp.h !== prevHelix) ? ' helix-first' : '';
        prevHelix = gp.h;

        const key = `${gp.h}:${gp.p}`;
        const curPair = currentPairStr(gp);
        const invert = window.invertedGenes.get(key) || false;
        const descClass = invert ? 'desc-td inverted' : 'desc-td';
        const displayPair = invert ? (curPair.charAt(1) + curPair.charAt(0)) : curPair;
        const curValue = computeWeightedValue(entry, gp.allele1, gp.allele2);

        let compareCell = '';
        if (compareModeActive) {
            const refData = referenceMap.get(key);
            const refVal = refData ? refData.weightedValue : null;
            const diffClass = (refVal !== null && refVal !== curValue) ? ' diff-highlight' : '';
            compareCell = `<td class="compare-cell${diffClass}"><span class="final-value-badge">${refVal !== null ? refVal : '—'}</span></td>`;
        }

        parts.push(`<tr class="${rowClass}${gapClass}" data-helix="${gp.h}" data-pair="${gp.p}">
            <td class="helix-col">${gp.h}</td>
            <td class="pair-col">${gp.p}</td>
            <td class="${descClass}" title="${geneTooltip(entry)}">${gp.desc}</td>
            <td><div class="custom-dropdown" id="dropdown-${gp.h}-${gp.p}">
                <div class="selected-option">
                    <span class="value-part">${annotateValue(entry, curPair, curValue)}</span>
                    <span class="bases-part">${coloredPairSpans(displayPair)}</span>
                </div>
                <div class="dropdown-options" style="display:none;"></div>
            </div></td>
            ${compareCell}
        </tr>`);
    }

    document.getElementById('tableBody').innerHTML = parts.join('');
};

// Bookmarks removed: keep the hook crispr.js calls, make it inert.
window.renderBookmarksList = function () {};

// ---------- Dropdown rendering ----------

// Annotation for the currently selected pair without building the full combo list.
function annotateValue(entry, pairStr, value) {
    return getComboAnnotation({ pairStr, value }, entry);
}

function buildOptionsHtml(entry, gp) {
    const key = `${gp.h}:${gp.p}`;
    const invert = window.invertedGenes.get(key) || false;
    const curPair = currentPairStr(gp);
    let html = '';
    for (const combo of getCombosForEntry(entry)) {
        const selectedClass = combo.pairStr === curPair ? ' selected' : '';
        const showPair = invert ? (combo.allele2 + combo.allele1) : combo.pairStr;
        html += `<div class="option-item${selectedClass}" data-pair="${combo.pairStr}" data-value="${combo.value}">
            <span class="value-part">${getComboAnnotation(combo, entry)}</span>
            <span class="bases-part">${coloredPairSpans(showPair)}</span>
        </div>`;
    }
    return html;
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-options').forEach(opt => {
        opt.style.display = 'none';
    });
}

function openRowDropdown(helix, pair) {
    const dropdown = document.getElementById(`dropdown-${helix}-${pair}`);
    if (!dropdown) return;
    const gp = currentGenePairs.find(g => g.h === helix && g.p === pair);
    const entry = getGeneEntry(helix, pair);
    if (!gp || !entry) return;

    const options = dropdown.querySelector('.dropdown-options');
    // rebuilt on every open so the selected marker and any inversion stay current
    options.innerHTML = buildOptionsHtml(entry, gp);

    const rect = dropdown.querySelector('.selected-option').getBoundingClientRect();
    options.style.top = rect.bottom + 4 + 'px';
    options.style.left = rect.left + 'px';
    options.style.minWidth = rect.width + 'px';
    options.style.display = 'block';
}

function toggleRowDropdown(helix, pair) {
    const dropdown = document.getElementById(`dropdown-${helix}-${pair}`);
    if (!dropdown) return;
    const wasOpen = dropdown.querySelector('.dropdown-options').style.display === 'block';
    closeAllDropdowns();
    if (!wasOpen) openRowDropdown(helix, pair);
}

// Refresh one row's selected value + inversion styling. Display only - callers
// decide whether the textarea also needs syncing.
function updateGeneDropdowns(helix, pair) {
    const gp = currentGenePairs.find(g => g.h === helix && g.p === pair);
    const entry = getGeneEntry(helix, pair);
    if (!gp || !entry) return;

    const key = `${helix}:${pair}`;
    const invert = window.invertedGenes.get(key) || false;
    const curPair = currentPairStr(gp);
    const displayPair = invert ? (curPair.charAt(1) + curPair.charAt(0)) : curPair;
    const curValue = computeWeightedValue(entry, gp.allele1, gp.allele2);

    const dropdown = document.getElementById(`dropdown-${helix}-${pair}`);
    if (dropdown) {
        const selected = dropdown.querySelector('.selected-option');
        if (selected) {
            selected.querySelector('.value-part').textContent = annotateValue(entry, curPair, curValue);
            selected.querySelector('.bases-part').innerHTML = coloredPairSpans(displayPair);
        }
        const options = dropdown.querySelector('.dropdown-options');
        if (options && options.style.display === 'block') {
            options.innerHTML = buildOptionsHtml(entry, gp);
        }
    }

    const row = document.querySelector(`tr[data-helix="${helix}"][data-pair="${pair}"]`);
    if (row) {
        const descCell = row.querySelector('.desc-td');
        if (descCell) descCell.classList.toggle('inverted', !!invert);
    }
    updateCompareCell(helix, pair);
}

function updateCompareCell(helix, pair) {
    if (!compareModeActive) return;
    const row = document.querySelector(`tr[data-helix="${helix}"][data-pair="${pair}"]`);
    if (!row) return;
    const cell = row.querySelector('.compare-cell');
    if (!cell) return;
    const gp = currentGenePairs.find(g => g.h === helix && g.p === pair);
    const entry = getGeneEntry(helix, pair);
    if (!gp || !entry) return;
    const refData = referenceMap.get(`${helix}:${pair}`);
    const refVal = refData ? refData.weightedValue : null;
    const curVal = computeWeightedValue(entry, gp.allele1, gp.allele2);
    cell.classList.toggle('diff-highlight', refVal !== null && refVal !== curVal);
}

// ---------- Delegated table clicks ----------
document.getElementById('tableBody').addEventListener('click', e => {
    const option = e.target.closest('.option-item');
    if (option) {
        const tr = option.closest('tr');
        if (tr) applyCombinationChange(+tr.dataset.helix, +tr.dataset.pair, option.dataset.pair);
        closeAllDropdowns();
        return;
    }

    const selected = e.target.closest('.selected-option');
    if (selected) {
        const tr = selected.closest('tr');
        if (tr) toggleRowDropdown(+tr.dataset.helix, +tr.dataset.pair);
        return;
    }

    // clicking the description flips which strand carries the dominant base
    const descTd = e.target.closest('.desc-td');
    if (!descTd) return;
    const tr = descTd.closest('tr');
    if (!tr) return;
    const helix = parseInt(tr.dataset.helix, 10);
    const pair = parseInt(tr.dataset.pair, 10);
    const key = `${helix}:${pair}`;

    const gp = currentGenePairs.find(g => g.h === helix && g.p === pair);
    if (!gp) return;

    const entry = getGeneEntry(helix, pair);
    // Flipping a homozygous pair swaps identical bases, so it is a genuine
    // no-op; recording it would add an undo step that appears to do nothing.
    if (gp.allele1 !== gp.allele2) {
        pushSnapshot(`flip ${entry ? entry.desc : key}`);
    }

    const current = window.invertedGenes.get(key) || false;
    window.invertedGenes.set(key, !current);
    [gp.allele1, gp.allele2] = [gp.allele2, gp.allele1];

    syncTextareaFromTable();
    updateGeneDropdowns(helix, pair);
});

document.addEventListener('click', e => {
    if (!e.target.closest('.custom-dropdown')) closeAllDropdowns();
});

window.addEventListener('scroll', closeAllDropdowns, true);
window.addEventListener('resize', closeAllDropdowns);

// ---------- Apply allele pair change ----------
function applyCombinationChange(helix, pair, newPairStr) {
    const gp = currentGenePairs.find(g => g.h === helix && g.p === pair);
    if (!gp) return;
    const entry = getGeneEntry(helix, pair);
    if (!entry) return;
    const chosen = getCombosForEntry(entry).find(c => c.pairStr === newPairStr);
    if (!chosen) return;

    pushSnapshot(`edit ${entry.desc}`);

    const invert = window.invertedGenes.get(`${helix}:${pair}`) || false;
    if (invert) {
        gp.allele1 = chosen.allele2;
        gp.allele2 = chosen.allele1;
    } else {
        gp.allele1 = chosen.allele1;
        gp.allele2 = chosen.allele2;
    }

    syncTextareaFromTable();
    updateGeneDropdowns(helix, pair);   // targeted: no full 240-row rebuild
}

// ---------- Compare mode (restored) ----------
// crispr.js's own toggleCompareMode() pokes #compareArea and shows a button that
// SIMPR does not lay out, so it is replaced wholesale here. crispr.js calls
// toggleCompareMode() unqualified from the DNA Library's compare button, which
// resolves through window and therefore picks up this override.
let compareSourceLabel = '';

function renderCompareBar() {
    const bar = document.getElementById('compareBar');
    const label = document.getElementById('compareBarLabel');
    if (!bar || !label) return;
    if (compareModeActive) {
        label.innerHTML = compareSourceLabel
            ? `⚖️ Comparing against <strong>${compareSourceLabel}</strong>`
            : '⚖️ Compare mode active';
        bar.style.display = '';
    } else {
        bar.style.display = 'none';
    }
    // Every compare state change funnels through here, so this is the one place
    // dependants need to observe. An event avoids the stale-reference problem of
    // wrapping exitCompareMode after its listener has already been bound.
    document.dispatchEvent(new CustomEvent('simpr:compare-changed', {
        detail: { active: compareModeActive, label: compareSourceLabel }
    }));
}

window.toggleCompareMode = function () {
    compareModeActive = !compareModeActive;
    if (compareModeActive) {
        updateReferenceMapFromText();
    } else {
        referenceMap.clear();
        compareSourceLabel = '';
    }
    renderCompareBar();
    renderTable();
};

// Load an arbitrary genome as the comparison reference.
window.setCompareReference = function (label, dnaText) {
    document.getElementById('compareGeneInput').value = dnaText;
    compareSourceLabel = label || '';
    if (!compareModeActive) {
        compareModeActive = true;
    }
    updateReferenceMapFromText();
    renderCompareBar();
    renderTable();
};

window.exitCompareMode = function () {
    if (!compareModeActive) return;
    compareModeActive = false;
    referenceMap.clear();
    compareSourceLabel = '';
    renderCompareBar();
    renderTable();
};

document.getElementById('compareBarExit').addEventListener('click', exitCompareMode);

// Keep the reference map refreshed whenever crispr.js rebuilds it, so the bar
// stays in sync when the DNA Library's own compare handler drives the change.
const _origUpdateReferenceMapFromText = updateReferenceMapFromText;
updateReferenceMapFromText = function () {
    _origUpdateReferenceMapFromText();
    renderCompareBar();
};

// Capture-phase sniff of the Library's compare button purely to learn the entry
// name for the bar; crispr.js's own bubble-phase handler still does the work.
document.getElementById('categoryList').addEventListener('click', e => {
    const btn = e.target.closest('button[title="Load into compare"]');
    if (!btn) return;
    const nameEl = btn.closest('.entry-item')?.querySelector('.entry-name');
    compareSourceLabel = nameEl ? nameEl.textContent : 'saved DNA';
}, true);


// ---------- Ensure scrolling still works ----------
window.scrollToPair = function (h, p) {
    const row = document.querySelector(`tr[data-helix="${h}"][data-pair="${p}"]`);
    if (row) {
        row.scrollIntoView({ behavior: 'instant', block: 'start' });
        row.classList.add('helix-highlight');
        setTimeout(() => row.classList.remove('helix-highlight'), 1000);
    }
};

// ---------- Inversion auto-detection based on alleles ----------
window.invertedGenes = new Map();
function autoDetectInvertFlags() {
    currentGenePairs.forEach(gp => {
        const key = `${gp.h}:${gp.p}`;
        if (gp.allele1 === gp.allele2) {
            window.invertedGenes.delete(key);
            return;
        }
        const entry = getGeneEntry(gp.h, gp.p);
        if (!entry) return;
        const dom = getDominantNuc(gp.allele1, gp.allele2, entry.priorityOrder);
        const isInverted = (gp.allele1 !== dom);
        if (isInverted) {
            window.invertedGenes.set(key, true);
        } else {
            window.invertedGenes.delete(key);
        }
    });
}

// ---------- Bookmarks removed: stop crispr.js seeding defaults ----------
loadBookmarks = function () {};

// ---------- Override parse to auto-detect invert flags ----------
const _originalParse = parseAndLoadFromTextarea;
parseAndLoadFromTextarea = function() {
    _originalParse();
    autoDetectInvertFlags();
    renderTable();
    renderBookmarksList();
};

// =====================================================================
//  Right sidebar: Modifications panel (10 slots) + Presets shell
// =====================================================================

// Each slot declares how its lit/dim state is derived:
//   'stack'   - lit while its undo/redo stack has entries, dim + inert when empty
//   'profile' - lit while the genome already satisfies the named gene profile
//   'action'  - always lit; a one-shot operation with no meaningful "on" state
const MOD_BUTTONS = [
    { icon: '↩️', label: 'Revert',    state: 'stack',   stack: 'undo',        fn: () => undoGenome() },
    { icon: '↪️', label: 'Redo',      state: 'stack',   stack: 'redo',        fn: () => redoGenome() },
    { icon: '🛞', label: 'Leg Wheels', state: 'profile', profile: 'legwheels', fn: () => applyGeneProfile('legwheels') },
    { icon: '❤️', label: 'Healthy',   state: 'profile', profile: 'healthy',   fn: () => applyGeneProfile('healthy') },
    { icon: '🥩', label: 'Carnivore', state: 'profile', profile: 'carnivore', fn: () => applyGeneProfile('carnivore') },
    { icon: '🌿', label: 'Herbivore', state: 'profile', profile: 'herbivore', fn: () => applyGeneProfile('herbivore') },
    { icon: '🍽️', label: 'Omnivore',  state: 'profile', profile: 'omnivore',  fn: () => applyGeneProfile('omnivore') },
    { icon: '🚫', label: 'No Mouth',  state: 'profile', profile: 'nomouth',   fn: () => applyGeneProfile('nomouth') },
    { icon: '👥', label: 'Homozyg',   state: 'action',  fn: () => { pushSnapshot('Homozygous'); forceDominant(); } },
    { icon: '🎰', label: 'Randomize', state: 'action',  fn: () => randomiseWholeGenome() }
];

function renderModPanel() {
    const grid = document.getElementById('modGrid');
    if (!grid) return;
    grid.innerHTML = MOD_BUTTONS.map((b, i) =>
        `<button class="mod-btn" data-mod="${i}">
            <span class="mod-icon">${b.icon}</span><span class="mod-label">${b.label}</span>
         </button>`
    ).join('');
    updateModPanelState();
}

// Recomputes every button's lit/dim/disabled class from current state. Profile
// buttons are lit when the genome already satisfies them, which makes the four
// diet buttons naturally mutually exclusive - their predicates cannot overlap -
// and means hand-editing a gene out of profile un-lights the button by itself.
function updateModPanelState() {
    const grid = document.getElementById('modGrid');
    if (!grid) return;
    MOD_BUTTONS.forEach((b, i) => {
        const btn = grid.querySelector(`.mod-btn[data-mod="${i}"]`);
        if (!btn) return;
        let lit = true;
        let disabled = false;
        let title = b.label;

        if (b.state === 'stack') {
            const stack = b.stack === 'undo' ? undoStack : redoStack;
            lit = stack.length > 0;
            disabled = stack.length === 0;
            const keys = b.stack === 'undo' ? 'Ctrl+Z' : 'Ctrl+Y';
            title = stack.length
                ? `${b.stack === 'undo' ? 'Undo' : 'Redo'} "${stack[stack.length - 1].label}" — ${keys} (${stack.length} stored)`
                : `Nothing to ${b.stack === 'undo' ? 'undo' : 'redo'} (${keys})`;
        } else if (b.state === 'profile') {
            const profile = GENE_PROFILES[b.profile];
            lit = !!profile && isProfileSatisfied(profile);
            title = profile
                ? (lit ? `Already applied: ${profile.describe}` : `Apply: ${profile.describe}`)
                : b.label;
        } else {
            title = b.actionTitle || b.label;
        }

        btn.classList.toggle('active', lit && !disabled);
        btn.classList.toggle('dim', !lit);
        btn.classList.toggle('disabled', disabled);
        btn.title = title;
    });
}

document.getElementById('modGrid').addEventListener('click', e => {
    const btn = e.target.closest('.mod-btn');
    if (!btn) return;
    if (btn.classList.contains('disabled')) return;
    const slot = MOD_BUTTONS[parseInt(btn.dataset.mod, 10)];
    if (!slot) return;
    if (typeof slot.fn === 'function') slot.fn();
});

// ---------- Presets section collapse ----------
const PRESETS_OPEN_KEY = 'simpr_presets_open';

function applyPresetsCollapse(open) {
    const body = document.getElementById('presetsBody');
    const toggle = document.getElementById('presetsToggle');
    if (!body || !toggle) return;
    body.style.display = open ? '' : 'none';
    toggle.classList.toggle('collapsed', !open);
}

function initPresetsCollapse() {
    const open = localStorage.getItem(PRESETS_OPEN_KEY) !== '0';
    applyPresetsCollapse(open);
    document.getElementById('presetsToggle').addEventListener('click', () => {
        const nowOpen = localStorage.getItem(PRESETS_OPEN_KEY) === '0';
        localStorage.setItem(PRESETS_OPEN_KEY, nowOpen ? '1' : '0');
        applyPresetsCollapse(nowOpen);
    });
}

// renderModPanel() is deliberately NOT called here: updateModPanelState()
// reads undoStack and GENE_PROFILES, which are declared further down this
// file. Touching a const before its declaration is a TDZ ReferenceError and
// would kill the rest of the script. The first render happens at the bottom.
initPresetsCollapse();


// =====================================================================
//  Genome history (undo for bulk modifications)
// =====================================================================
const undoStack = [];
const redoStack = [];
const GENOME_HISTORY_MAX = 60;

// Serialize from the table, not the textarea: on first load the textarea is
// still empty while currentGenePairs already holds a randomly-filled genome,
// so reading the textarea would silently drop the first snapshot.
function serializeGenome() {
    const helixMap = new Map();
    for (const gp of currentGenePairs) {
        if (!helixMap.has(gp.h)) helixMap.set(gp.h, { left: [], right: [] });
        const e = helixMap.get(gp.h);
        e.left.push(gp.allele1);
        e.right.push(gp.allele2);
    }
    const lines = [];
    for (const [helix, seqs] of [...helixMap.entries()].sort((a, b) => a[0] - b[0])) {
        const hh = String(helix).padStart(2, '0');
        lines.push(`${hh}:${seqs.left.join('')}`, `${hh}:${seqs.right.join('')}`);
    }
    return lines.join('\n');
}

// Guard so restoring a snapshot does not itself get recorded as an edit.
let restoringGenome = false;

function pushSnapshot(label) {
    if (restoringGenome) return;
    const text = serializeGenome();
    if (!text) return;                              // no genome loaded yet
    // collapse no-op edits
    const top = undoStack[undoStack.length - 1];
    if (top && top.text === text) { top.label = label || top.label; return; }
    undoStack.push({ text, label: label || 'change' });
    if (undoStack.length > GENOME_HISTORY_MAX) undoStack.shift();
    redoStack.length = 0;                           // a fresh edit invalidates redo
    updateModPanelState();
}

function restoreGenome(text) {
    restoringGenome = true;
    try {
        document.getElementById('rawGeneInput').value = text;
        parseAndLoadFromTextarea();
    } finally {
        restoringGenome = false;
    }
}

function undoGenome() {
    if (!undoStack.length) { showToast('Nothing to undo'); return; }
    const current = serializeGenome();
    const snap = undoStack.pop();
    redoStack.push({ text: current, label: snap.label });
    restoreGenome(snap.text);
    updateModPanelState();
    showToast(`Undid ${snap.label}`);
}

function redoGenome() {
    if (!redoStack.length) { showToast('Nothing to redo'); return; }
    const current = serializeGenome();
    const snap = redoStack.pop();
    undoStack.push({ text: current, label: snap.label });
    restoreGenome(snap.text);
    updateModPanelState();
    showToast(`Redid ${snap.label}`);
}

// kept for older call sites
function updateRevertButton() { updateModPanelState(); }

// =====================================================================
//  Remove Diversity: single press = value-neutral merge (unchanged),
//  double press within 500 ms = force every gene to dominant homozygous.
// =====================================================================
const FORCE_DOMINANT_WINDOW_MS = 500;

function forceDominant() {
    let modified = 0;
    for (const gp of currentGenePairs) {
        const i1 = gp.n.indexOf(gp.allele1);
        const i2 = gp.n.indexOf(gp.allele2);
        if (i1 === -1 || i2 === -1) continue;
        const dom = gp.n[Math.min(i1, i2)];
        if (gp.allele1 !== dom || gp.allele2 !== dom) modified++;
        gp.allele1 = dom;
        gp.allele2 = dom;
    }
    if (modified) {
        syncTextareaFromTable();
        autoDetectInvertFlags();     // every pair is homozygous now, so all invert flags clear
        renderTable();
    }
    showToast(`Forced ${modified} gene${modified === 1 ? '' : 's'} to dominant homozygous`);
}

(function wireDiversityButtons() {
    const removeBtn = document.getElementById('removeDiversityBtn');
    const randomBtn = document.getElementById('randomDiversityBtn');

    // crispr.js bound these by name at load; detach so we can add snapshots + double-press
    if (removeBtn) removeBtn.removeEventListener('click', removeDiversity);
    if (randomBtn) randomBtn.removeEventListener('click', randomDiversity);

    if (randomBtn) {
        randomBtn.addEventListener('click', () => {
            pushSnapshot('Random Diversity');
            randomDiversity();
        });
    }

    if (!removeBtn) return;
    let lastClick = 0;
    let armTimer = null;

    removeBtn.title = 'Merge genes where possible without changing the horse. '
        + 'Press twice quickly to force every gene to its dominant base instead.';

    removeBtn.addEventListener('click', () => {
        const now = Date.now();
        const isDouble = (now - lastClick) < FORCE_DOMINANT_WINDOW_MS;
        lastClick = isDouble ? 0 : now;

        if (armTimer) { clearTimeout(armTimer); armTimer = null; }
        removeBtn.classList.remove('armed');

        if (isDouble) {
            const ok = confirm(
                'FORCE DOMINANT\n\n'
                + 'Set BOTH bases of all 240 genes to the dominant base, ignoring the '
                + 'm value and value-equality checks.\n\n'
                + 'Unlike a normal Remove Diversity, this WILL change the horse.\n\n'
                + 'Continue?'
            );
            if (ok) {
                pushSnapshot('Force Dominant');
                forceDominant();
            }
            return;
        }

        pushSnapshot('Remove Diversity');
        removeDiversity();
        removeBtn.classList.add('armed');
        armTimer = setTimeout(() => {
            removeBtn.classList.remove('armed');
            armTimer = null;
        }, FORCE_DOMINANT_WINDOW_MS);
    });
})();

// panel state is first painted at the bottom of this file, once every
// declaration it depends on exists


// =====================================================================
//  Gene-data readiness gate
//
//  crispr.js, simpr.js and simpr-pop.js each register their own async 'load'
//  handler. They interleave at every await, so work that touches gene objects
//  can land BEFORE crispr.js's own `await loadGeneDataFromXml()` resolves - and
//  that call rebuilds every gene object from scratch, discarding whatever the
//  earlier work wrote. window.allEntries is assigned last inside that function,
//  so it is a reliable "gene data is built" signal. The extra macrotask tick
//  lets crispr.js run the synchronous tail after its await before we touch
//  anything.
// =====================================================================
async function waitForGeneData(timeoutMs = 5000) {
    const start = Date.now();
    while (!(window.allEntries && window.allEntries.length)) {
        if (Date.now() - start > timeoutMs) {
            console.warn('waitForGeneData timed out');
            return false;
        }
        await new Promise(r => setTimeout(r, 20));
    }
    await new Promise(r => setTimeout(r, 0));
    return true;
}

// =====================================================================
//  Recover the true `s` attribute
//  genes.js line ~394 reads it as `(+attr, 10) || 1` - a comma expression, so
//  every gene ends up with s === 10 and the XML value is lost. genes.js is
//  shared, so re-read the attribute here instead and stash it as `trueS`.
//  Displayed values are deliberately left untouched; this is tooltip-only.
// =====================================================================
async function recoverGeneScales() {
    let xmlText = window.simprCustomGenesXml || '';
    if (!xmlText) {
        try {
            const res = await fetch('./data/genes.xml');
            if (!res.ok) throw new Error('status ' + res.status);
            xmlText = await res.text();
        } catch (e) {
            xmlText = (typeof genesXmlText === 'string') ? genesXmlText : '';
        }
    }
    if (!xmlText) return;

    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) return;

    if (!window.geneByDesc) return;      // gene data not built yet
    doc.querySelectorAll('gene').forEach(node => {
        const name = node.getAttribute('name');
        if (!name) return;
        const entry = window.geneByDesc.get(name);
        if (!entry) return;
        const s = parseInt(node.getAttribute('s'), 10);
        entry.trueS = (Number.isFinite(s) && s > 0) ? s : 1;
    });
}

function geneTooltip(entry) {
    if (!entry) return '';
    const parts = [entry.desc, `m=${entry.m}`];
    if (entry.trueS !== undefined) parts.push(`s=${entry.trueS}`);
    parts.push(`g=[${entry.g.join(', ')}]`, `order=${entry.n}`);
    return parts.join('  ·  ');
}

// =====================================================================
//  Paste / input diagnostics
//  parseUserGenes() silently coerces bad input (junk bases get mapped, short
//  lines get random padding). Surface what was actually wrong instead.
// =====================================================================
function validateRawDna(text) {
    const problems = [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length);
    if (!lines.length) return problems;

    const strandCount = new Map();
    lines.forEach((line, i) => {
        const m = line.match(/^(\d+):(.*)$/);
        if (!m) { problems.push(`Line ${i + 1}: not in HH:SEQUENCE form`); return; }
        const helix = parseInt(m[1], 10);
        const seq = m[2].trim();
        if (helix < 0 || helix >= HELIX_LENGTHS.length) {
            problems.push(`Line ${i + 1}: helix ${helix} is outside 0-${HELIX_LENGTHS.length - 1}`);
            return;
        }
        strandCount.set(helix, (strandCount.get(helix) || 0) + 1);
        if (seq.length !== HELIX_LENGTHS[helix]) {
            problems.push(`Line ${i + 1} (helix ${helix}): ${seq.length} bases, expected ${HELIX_LENGTHS[helix]}`);
        }
        const badChars = [...new Set([...seq].filter(ch => !'ACGT'.includes(ch.toUpperCase())))];
        if (badChars.length) {
            problems.push(`Line ${i + 1} (helix ${helix}): invalid base${badChars.length > 1 ? 's' : ''} ${badChars.join(' ')}`);
        }
    });

    for (let helix = 0; helix < HELIX_LENGTHS.length; helix++) {
        const count = strandCount.get(helix) || 0;
        if (count === 0) problems.push(`Helix ${helix}: absent - both strands randomised`);
        else if (count === 1) problems.push(`Helix ${helix}: only one strand - the second is randomised`);
        else if (count > 2) problems.push(`Helix ${helix}: ${count} strands - all but the first two ignored`);
    }
    return problems;
}

function renderDnaWarnings() {
    const el = document.getElementById('dnaWarnings');
    if (!el) return;
    const problems = validateRawDna(document.getElementById('rawGeneInput').value);
    if (!problems.length) { el.style.display = 'none'; el.title = ''; return; }
    const shown = problems.slice(0, 15);
    el.textContent = `⚠ ${problems.length} input issue${problems.length > 1 ? 's' : ''} - hover for detail`;
    el.title = shown.join('\n')
        + (problems.length > shown.length ? `\n...and ${problems.length - shown.length} more` : '');
    el.style.display = '';
}

// =====================================================================
//  Bulk modification helpers
//  extremiseValues() is written and working but no longer bound to a panel
//  slot. To put Max/Min back: MOD_BUTTONS[n].fn = () => extremiseValues(true).
// =====================================================================
function applyToAllGenes(mutate, label) {
    let modified = 0;
    for (const gp of currentGenePairs) {
        const entry = getGeneEntry(gp.h, gp.p);
        if (!entry) continue;
        const before = gp.allele1 + gp.allele2;
        mutate(gp, entry);
        if (gp.allele1 + gp.allele2 !== before) modified++;
    }
    if (modified) {
        syncTextareaFromTable();
        autoDetectInvertFlags();
        renderTable();
    }
    showToast(`${label}: ${modified} gene${modified === 1 ? '' : 's'} changed`);
    return modified;
}

// combos come back sorted by value descending, so the ends are the extremes
function extremiseValues(wantMax) {
    const label = wantMax ? 'Maximise' : 'Minimise';
    pushSnapshot(label);
    applyToAllGenes((gp, entry) => {
        const combos = getCombosForEntry(entry);
        const pick = wantMax ? combos[0] : combos[combos.length - 1];
        if (!pick) return;
        gp.allele1 = pick.allele1;
        gp.allele2 = pick.allele2;
    }, label);
}

function randomiseWholeGenome() {
    pushSnapshot('Randomise');
    document.getElementById('rawGeneInput').value = buildGenomeText(sampleUniform);
    parseAndLoadFromTextarea();
    showToast('Randomised all 240 gene pairs');
}

// =====================================================================
//  Gene profiles - set named genes to target VALUES, not to raw alleles
//
//  Each op names a gene and a target value. Ops come in three shapes:
//    { gene, value }            always drive the gene to exactly `value`
//    { gene, value, ifEquals }  only act while the gene currently reads `ifEquals`
//    { gene, atLeast }          only act while the gene reads below `atLeast`
//  `satisfied` mirrors each shape, so a profile button can light up purely from
//  the genome rather than from remembering that it was clicked.
// =====================================================================
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
            // Applied with the profile, but deliberately excluded from the lit
            // check: the button reports "wheels" from the joint/circle genes
            // alone, so removing feet does not by itself light it up.
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
            { gene: 'NOSE_SIZE', atLeast: 10 }
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
            // TEETH_SHAPE can only express 0/1/2/3, so "any of 0,1,2" is exactly
            // "not 3": lit whenever the teeth are not the meat shape, and clicking
            // only rewrites them when they currently are.
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
        ops: [
            { gene: 'HAS_MOUTH', value: 0 }
        ]
    }
};

// Current expressed value of a gene by name, or null if absent.
function geneValueByName(desc) {
    const entry = window.geneByDesc ? window.geneByDesc.get(desc) : null;
    if (!entry) return null;
    const gp = currentGenePairs.find(g => g.h === entry.h && g.p === entry.p);
    if (!gp) return null;
    return computeWeightedValue(entry, gp.allele1, gp.allele2);
}

function isOpSatisfied(op) {
    const cur = geneValueByName(op.gene);
    if (cur === null) return true;                       // unknown gene cannot block
    if (op.atLeast !== undefined) return cur >= op.atLeast;
    if (op.ifEquals !== undefined) return cur !== op.ifEquals;
    return cur === op.value;
}

// Ops flagged `affectsLit: false` are still applied on click, but are ignored
// when deciding whether the button is lit.
function isProfileSatisfied(profile) {
    if (!currentGenePairs.length) return false;
    return profile.ops.filter(op => op.affectsLit !== false).every(isOpSatisfied);
}

// Drive one gene to a target value by picking an allele pair that produces it.
// Prefers a pair that keeps one of the existing alleles, so unrelated dominance
// relationships survive where possible.
function setGeneToValue(desc, target) {
    const entry = window.geneByDesc ? window.geneByDesc.get(desc) : null;
    if (!entry) return { ok: false, reason: `unknown gene ${desc}` };
    const gp = currentGenePairs.find(g => g.h === entry.h && g.p === entry.p);
    if (!gp) return { ok: false, reason: `${desc} not in the current genome` };

    const matches = getCombosForEntry(entry).filter(c => c.value === target);
    if (!matches.length) return { ok: false, reason: `${desc} cannot express ${target}` };

    const scored = matches.map(c => {
        let shared = 0;
        if (c.allele1 === gp.allele1 || c.allele1 === gp.allele2) shared++;
        if (c.allele2 === gp.allele1 || c.allele2 === gp.allele2) shared++;
        return { c, shared };
    }).sort((a, b) => b.shared - a.shared);

    const pick = scored[0].c;
    const changed = gp.allele1 !== pick.allele1 || gp.allele2 !== pick.allele2;
    gp.allele1 = pick.allele1;
    gp.allele2 = pick.allele2;
    return { ok: true, changed };
}

function applyGeneProfile(key) {
    const profile = GENE_PROFILES[key];
    if (!profile) return;
    if (!currentGenePairs.length) { showToast('No genome loaded'); return; }

    pushSnapshot(profile.label);

    let changed = 0;
    const failures = [];
    for (const op of profile.ops) {
        if (isOpSatisfied(op)) continue;                 // already fine, or condition not met
        const target = op.atLeast !== undefined ? op.atLeast : op.value;
        const res = setGeneToValue(op.gene, target);
        if (!res.ok) failures.push(res.reason);
        else if (res.changed) changed++;
    }

    if (changed) {
        syncTextareaFromTable();
        autoDetectInvertFlags();
        renderTable();
    }
    updateModPanelState();

    if (failures.length) {
        showToast(`${profile.label}: ${changed} changed, ${failures.length} failed - ${failures[0]}`, 4000);
        console.warn(profile.label + ' failures:', failures);
    } else {
        showToast(`${profile.label}: ${changed} gene${changed === 1 ? '' : 's'} changed`);
    }
}

// Keep the panel in step with any allele change, from any source.
const _origSyncForPanel = syncTextareaFromTable;
syncTextareaFromTable = function () {
    _origSyncForPanel();
    updateModPanelState();
};

const _origParseForPanel = parseAndLoadFromTextarea;
parseAndLoadFromTextarea = function () {
    _origParseForPanel();
    updateModPanelState();
};

renderModPanel();

// =====================================================================
//  Keyboard guards
//  crispr.js binds a document-level Ctrl+C / Ctrl+V handler that hijacks both
//  shortcuts globally. It cannot be detached (anonymous listener), so stop the
//  event in the capture phase when the user clearly meant a normal copy/paste.
// =====================================================================
document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    const tag = document.activeElement ? document.activeElement.tagName : '';
    const inField = tag === 'INPUT' || tag === 'TEXTAREA';

    if (key === 'c') {
        const sel = window.getSelection();
        const hasSelection = sel && !sel.isCollapsed && String(sel).length > 0;
        if (hasSelection) e.stopImmediatePropagation();     // let the browser copy the selection
        return;
    }
    if (key === 'v' && inField) {
        e.stopImmediatePropagation();                       // paste into the focused field, not the genome
        return;
    }

    // Undo / redo the genome. Skipped while a text field has focus so the
    // browser's own undo keeps working inside the textarea and filter boxes.
    if (!inField && (key === 'z' || key === 'y')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (key === 'y' || e.shiftKey) redoGenome();
        else undoGenome();
    }
}, true);

// =====================================================================
//  Wire the diagnostics + scale recovery into the load / parse cycle
// =====================================================================
const _origParseForWarnings = parseAndLoadFromTextarea;
parseAndLoadFromTextarea = function () {
    _origParseForWarnings();
    renderDnaWarnings();
};

window.addEventListener('load', async () => {
    await waitForGeneData();
    await recoverGeneScales();
    renderDnaWarnings();
    renderTable();
});
