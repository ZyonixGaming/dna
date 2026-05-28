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
window.renderTable = function () {
	const filterWords = currentFilter.toLowerCase().trim().split(/\s+/);

	let filtered = currentGenePairs.filter(p => 
	  filterWords.some(word => p.desc.toLowerCase().includes(word))
	);

    const thead = document.getElementById('dynamicThead');
    thead.innerHTML =
        `<th style="width:45px;">⭐</th>
         <th>Helix</th>
         <th>Position</th>
         <th>Description <a href="https://horseygame.miraheze.org/wiki/Genome" target="_blank">(?)</a></th>
         <th>Value</th>`;

    let html = '';
    for (let idx = 0; idx < filtered.length; idx++) {
        const gp = filtered[idx];
        const origIdx = currentGenePairs.findIndex(g =>
            g.h === gp.h && g.p === gp.p
        );
        const rowClass = gp.h % 2 === 0 ? 'helix-even' : 'helix-odd';
        const key = `${gp.h}:${gp.p}`;
        const isBookmarked = bookmarks.has(key);
        const entry = getGeneEntry(gp.h, gp.p);
        if (!entry) continue;

        const combos = getCombosForEntry(entry);
        const curPair = currentPairStr(gp);
        const invert = window.invertedGenes.get(key) || false;
        const descClass = invert ? 'desc-td inverted' : 'desc-td';
        const displayPair = invert ? (curPair.charAt(1) + curPair.charAt(0)) : curPair;
        const curCombo = combos.find(c => c.pairStr === curPair);

        const pairKey = `${gp.h}-${gp.p}`;
        let dropdownHtml = `<div class="custom-dropdown" id="dropdown-${pairKey}">
            <div class="selected-option" onclick="toggleDropdown('${pairKey}')">
                <span class="value-part">${curCombo ? getComboAnnotation(curCombo, entry) : curCombo.value}</span>
                <span class="bases-part">${coloredPairSpans(displayPair)}</span>
                <span class="arrow">▼</span>
            </div>
            <div class="dropdown-options" style="display:none;">`;

        for (const combo of combos) {
            const selectedClass = combo.pairStr === curPair ? ' selected' : '';
            const showPair = invert ? (combo.allele2 + combo.allele1) : combo.pairStr;
            dropdownHtml +=
                `<div class="option-item${selectedClass}"
                      data-value="${combo.value}"
                      data-pair="${combo.pairStr}"
                      onclick="selectOption('${pairKey}', '${combo.pairStr}', this)">
                      <span class="value-part">${getComboAnnotation(combo, entry)}</span>
                      <span class="bases-part">${coloredPairSpans(showPair)}</span>
                  </div>`;
        }
        dropdownHtml += `</div></div>`;

        html += `<tr class="${rowClass}" data-helix="${gp.h}" data-pair="${gp.p}">
            <td class="bookmark-col">
                <span class="bookmark-star${isBookmarked ? ' bookmarked' : ''}"
                      onclick="toggleBookmarkFromTable(${gp.h},${gp.p})">★</span>
            </td>
            <td class="helix-col">${gp.h}</td>
            <td class="pair-col">${gp.p}</td>
            <td class="${descClass}" title="${gp.desc}">${gp.desc}</td>
            <td>${dropdownHtml}</td>
        </tr>`;
    }

    document.getElementById('tableBody').innerHTML = html;
};

// ---------- Override bookmarks list (uses arrayHp lookup) ----------
window.renderBookmarksList = function () {
    const container = document.getElementById('bookmarksList');
    if (bookmarks.size === 0) {
        container.innerHTML =
            '<div class="empty-bookmarks">No bookmarks yet.<br>Click ★ a row to add.</div>';
        return;
    }

    let html = '';
    for (const key of [...bookmarks].sort()) {
        const [h, p] = key.split(':').map(Number);
        const entry = getGeneEntry(h, p);
        if (!entry) continue;

        const gp = currentGenePairs.find(g => g.h === h && g.p === p);
        if (!gp) continue;

        const combos = getCombosForEntry(entry);
        const curPair = currentPairStr(gp);
        const invert = window.invertedGenes.get(key) || false;
        const displayPair = invert ? (curPair.charAt(1) + curPair.charAt(0)) : curPair;
        const curCombo = combos.find(c => c.pairStr === curPair);

        const pairKey = `bkm-${h}-${p}`;
        let dropdownHtml = `<div class="custom-dropdown" id="dropdown-${pairKey}">
            <div class="selected-option" onclick="toggleDropdown('${pairKey}')">
                <span class="value-part">${curCombo ? getComboAnnotation(curCombo, entry) : curCombo.value}</span>
                <span class="bases-part">${coloredPairSpans(displayPair)}</span>
                <span class="arrow">▼</span>
            </div>
            <div class="dropdown-options" style="display:none;">`;

        for (const combo of combos) {
            const selectedClass = combo.pairStr === curPair ? ' selected' : '';
            const showPair = invert ? (combo.allele2 + combo.allele1) : combo.pairStr;
            dropdownHtml +=
                `<div class="option-item${selectedClass}"
                      data-value="${combo.value}"
                      data-pair="${combo.pairStr}"
                      onclick="selectOption('${pairKey}', '${combo.pairStr}', this)">
                      <span class="value-part">${getComboAnnotation(combo, entry)}</span>
                      <span class="bases-part">${coloredPairSpans(showPair)}</span>
                  </div>`;
        }
        dropdownHtml += `</div></div>`;

        html += `<div class="bookmark-item">
            <div class="bookmark-info" title="${entry.desc}"
                 onclick="scrollToPair(${h},${p})" style="cursor:pointer; flex:1;">
                <strong>H${h}P${p}:</strong> ${entry.desc}
            </div>
            ${dropdownHtml}
            <button class="remove-bookmark"
                    onclick="event.stopPropagation(); removeBookmark('${key}')">✖</button>
        </div>`;
    }
    container.innerHTML = html;
};

// ---------- Dropdown handling (unchanged except the way gene is located) ----------
function toggleDropdown(pairKey) {
    const dropdown = document.getElementById(`dropdown-${pairKey}`);
    if (!dropdown) return;
    const options = dropdown.querySelector('.dropdown-options');
    const isOpen = options.style.display === 'block';
    closeAllDropdowns();
    if (!isOpen) {
        const selected = dropdown.querySelector('.selected-option');
        const rect = selected.getBoundingClientRect();
        options.style.top = rect.bottom + 4 + 'px';
        options.style.left = rect.left + 'px';
        options.style.minWidth = rect.width + 'px';
        options.style.display = 'block';
    }
}

function selectOption(pairKey, pairStr, element) {
    const dropdown = document.getElementById(`dropdown-${pairKey}`);
    if (!dropdown) return;

    let helix, pair;
    const tr = dropdown.closest('tr');
    if (tr) {
        helix = parseInt(tr.dataset.helix);
        pair = parseInt(tr.dataset.pair);
    } else {
        // Bookmark: id like "bkm-5-3"
        const parts = pairKey.replace('bkm-', '').split('-');
        if (parts.length === 2) {
            helix = parseInt(parts[0]);
            pair = parseInt(parts[1]);
        }
    }

    if (helix !== undefined && pair !== undefined) {
        applyCombinationChange(helix, pair, pairStr);
    }
    closeAllDropdowns();
}

function updateGeneDropdowns(helix, pair) {
    const key = `${helix}:${pair}`;
    const gp = currentGenePairs.find(g => g.h === helix && g.p === pair);
    if (!gp) return;
    const entry = getGeneEntry(helix, pair);
    if (!entry) return;
    const invert = window.invertedGenes.get(key) || false;
    const combos = getCombosForEntry(entry);
    const curPair = currentPairStr(gp);
    const displayPair = invert ? (curPair.charAt(1) + curPair.charAt(0)) : curPair;

    const tableDropdown = document.getElementById(`dropdown-${helix}-${pair}`);
    if (tableDropdown) {
        const selectedOption = tableDropdown.querySelector('.selected-option');
        const optionsContainer = tableDropdown.querySelector('.dropdown-options');
        if (selectedOption) {
            selectedOption.querySelector('.value-part').textContent = getComboAnnotation(combos.find(c => c.pairStr === curPair), entry);
            selectedOption.querySelector('.bases-part').innerHTML = coloredPairSpans(displayPair);
        }
        if (optionsContainer) {
            let optsHtml = '';
            for (const combo of combos) {
                const selectedClass = combo.pairStr === curPair ? ' selected' : '';
                const showPair = invert ? (combo.allele2 + combo.allele1) : combo.pairStr;
                optsHtml += `<div class="option-item${selectedClass}"
                      data-value="${combo.value}"
                      data-pair="${combo.pairStr}"
                      onclick="selectOption('${helix}-${pair}', '${combo.pairStr}', this)">
                      <span class="value-part">${getComboAnnotation(combo, entry)}</span>
                      <span class="bases-part">${coloredPairSpans(showPair)}</span>
                  </div>`;
            }
            optionsContainer.innerHTML = optsHtml;
        }
    }

    const bkmDropdown = document.getElementById(`dropdown-bkm-${helix}-${pair}`);
    if (bkmDropdown) {
        const selectedOption = bkmDropdown.querySelector('.selected-option');
        const optionsContainer = bkmDropdown.querySelector('.dropdown-options');
        if (selectedOption) {
            selectedOption.querySelector('.value-part').textContent = getComboAnnotation(combos.find(c => c.pairStr === curPair), entry);
            selectedOption.querySelector('.bases-part').innerHTML = coloredPairSpans(displayPair);
        }
        if (optionsContainer) {
            let optsHtml = '';
            for (const combo of combos) {
                const selectedClass = combo.pairStr === curPair ? ' selected' : '';
                const showPair = invert ? (combo.allele2 + combo.allele1) : combo.pairStr;
                optsHtml += `<div class="option-item${selectedClass}"
                      data-value="${combo.value}"
                      data-pair="${combo.pairStr}"
                      onclick="selectOption('bkm-${helix}-${pair}', '${combo.pairStr}', this)">
                      <span class="value-part">${getComboAnnotation(combo, entry)}</span>
                      <span class="bases-part">${coloredPairSpans(showPair)}</span>
                  </div>`;
            }
            optionsContainer.innerHTML = optsHtml;
        }
    }

    const row = document.querySelector(`tr[data-helix="${helix}"][data-pair="${pair}"]`);
    if (row) {
        const descCell = row.querySelector('.desc-td');
        if (descCell) {
            descCell.classList.toggle('inverted', !!invert);
        }
    }
    syncTextareaFromTable();
}

function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-options').forEach(opt => opt.style.display = 'none');
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.custom-dropdown')) {
        closeAllDropdowns();
    }
});

document.querySelector('#geneTable tbody').addEventListener('click', function(e) {
    const descTd = e.target.closest('.desc-td');
    if (!descTd) return;
    const tr = descTd.closest('tr');
    if (!tr) return;
    const helix = parseInt(tr.dataset.helix);
    const pair = parseInt(tr.dataset.pair);
    const key = `${helix}:${pair}`;

    const current = window.invertedGenes.get(key) || false;
    window.invertedGenes.set(key, !current);

    const gp = currentGenePairs.find(g => g.h === helix && g.p === pair);
    if (gp) {
        [gp.allele1, gp.allele2] = [gp.allele2, gp.allele1];
    }

    syncTextareaFromTable();
    updateGeneDropdowns(helix, pair);
    descTd.classList.toggle('inverted', !current);
});

window.addEventListener('scroll', closeAllDropdowns, true);
window.addEventListener('resize', closeAllDropdowns);

// ---------- Apply allele pair change ----------
function applyCombinationChange(helix, pair, newPairStr) {
    const gp = currentGenePairs.find(g => g.h === helix && g.p === pair);
    if (!gp) return;
    const entry = getGeneEntry(helix, pair);
    if (!entry) return;
    const combos = getCombosForEntry(entry);
    const chosen = combos.find(c => c.pairStr === newPairStr);
    if (!chosen) return;

    const key = `${helix}:${pair}`;
    const invert = window.invertedGenes.get(key) || false;
    if (invert) {
        gp.allele1 = chosen.allele2;
        gp.allele2 = chosen.allele1;
    } else {
        gp.allele1 = chosen.allele1;
        gp.allele2 = chosen.allele2;
    }

    syncTextareaFromTable();
    renderTable();
    renderBookmarksList();
}

// ---------- Disable removed features ----------
window.toggleCompareMode = function () {};
window.onCompareInput = function () {};


document.getElementById('compareGeneInput').addEventListener('input', function(){});
document.getElementById('toggleCompareBtn').addEventListener('click', function(){});


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

// ---------- Initial bookmarks override ----------
const _originalLoadBookmarks = loadBookmarks;
loadBookmarks = function () {
    _originalLoadBookmarks();
    if (bookmarks.size === 0) {
        const defaults = [
            '1:9',   // LITTER_SIZE (helix 1, pair 9 (0‑based))
            '1:10',  // OLD_AGE
            '1:11',  // OMNIVORE
            '12:0',  // TEETH_SHAPE
            '12:1'   // HAS_MOUTH
        ];
        defaults.forEach(key => bookmarks.add(key));
        saveBookmarks();
    }
};

// ---------- Override parse to auto-detect invert flags ----------
const _originalParse = parseAndLoadFromTextarea;
parseAndLoadFromTextarea = function() {
    _originalParse();
    autoDetectInvertFlags();
    renderTable();
    renderBookmarksList();
};