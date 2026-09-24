'use strict';
const GenomePanel = (function () {
    function effGenomeBytes(doc, genomeOff) {
        const out = new Uint8Array(SaveFile.GENOME_LEN);
        for (let i = 0; i < SaveFile.GENOME_LEN; i++) {
            out[i] = doc.patches.has(genomeOff + i) ? doc.patches.get(genomeOff + i) : doc.state.bytes[genomeOff + i];
        }
        return out;
    }
    function mount(container, opts) {
        const host = (typeof container === 'string') ? document.querySelector(container) : container;
        if (!host) return { refresh() {} };
        const doc = opts.doc;
        const genomeOff = opts.genomeOff;
        const geneTable = opts.geneTable;
        const label = opts.label || (() => 'Genome');
        host.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'hz-genome-inner';
        let previewApi = { refresh() {} };
        if (typeof HorsePreview !== 'undefined') {
            const previewHost = document.createElement('div');
            wrap.appendChild(previewHost);
            previewApi = HorsePreview.mountPanel(previewHost, {
                getBytes: () => effGenomeBytes(doc, genomeOff()),
                collapseKey: opts.collapseKey,
                label: 'Preview'
            });
        }
        const title = document.createElement('div');
        title.className = 'hz-props-title';
        title.textContent = 'Genome';
        wrap.appendChild(title);
        const genomeBytes = effGenomeBytes(doc, genomeOff());
        let text;
        if (geneTable) {
            try {
                const genome = Genome.decodeGenome(geneTable, genomeBytes);
                text = Genome.formatGenomeText(genome);
            } catch (e) {
                text = '(genome decode failed: ' + e.message + ')';
            }
        } else {
            text = 'Loading gene data…\n\nRaw bytes (hex):\n' +
                Array.from(genomeBytes).map((b) => b.toString(16).padStart(2, '0')).join(' ');
        }
        const ta = document.createElement('textarea');
        ta.className = 'hz-genome-text';
        ta.readOnly = !geneTable;
        ta.spellcheck = false;
        ta.value = text;
        wrap.appendChild(ta);
        const warnings = document.createElement('div');
        warnings.className = 'hz-genome-warnings';
        warnings.hidden = true;
        wrap.appendChild(warnings);
        function showWarnings(list) {
            if (!list.length) { warnings.hidden = true; warnings.textContent = ''; return; }
            warnings.hidden = false;
            const shown = list.slice(0, 15);
            warnings.textContent = '⚠ ' + shown.join('\n') + (list.length > shown.length ? '\n...and ' + (list.length - shown.length) + ' more' : '');
        }
        const btnRow = document.createElement('div');
        btnRow.className = 'hz-genome-actions';
        const loadBtn = document.createElement('button');
        loadBtn.className = 'btn primary';
        loadBtn.textContent = '⭳ Load';
        loadBtn.disabled = !geneTable;
        loadBtn.title = 'Parse the text above and write it into this genome';
        loadBtn.addEventListener('click', () => {
            const base = effGenomeBytes(doc, genomeOff());
            const res = Genome.normalizeGenomeInput(ta.value, { geneTable, base });
            if (!res.ok) {
                showWarnings(res.errors.length ? res.errors : ['Text was unreadable.']);
                Toast.toast('Could not read that genome — kept the current one.', 'bad');
                return;
            }
            showWarnings(res.warnings);
            doc.setGenomeBytes(genomeOff(), res.bytes, 'Replaced the genome of ' + label());
            ta.value = res.text;
            Toast.toast('Genome updated' + (res.warnings.length ? ' (' + res.warnings.length + ' repair' + (res.warnings.length === 1 ? '' : 's') + ')' : ''), res.warnings.length ? 'warn' : 'ok');
        });
        btnRow.appendChild(loadBtn);
        const pasteBtn = document.createElement('button');
        pasteBtn.className = 'btn';
        pasteBtn.textContent = '📥 Paste';
        pasteBtn.disabled = !geneTable;
        pasteBtn.title = 'Paste genome text from the clipboard into the box above';
        pasteBtn.addEventListener('click', async () => {
            try {
                const t = await navigator.clipboard.readText();
                if (!t.trim()) { Toast.toast('The clipboard is empty.', 'warn'); return; }
                ta.value = t;
                ta.focus();
                Toast.toast('Pasted. Press Load to apply it.', 'ok');
            } catch (e) {
                Toast.toast('Paste failed: ' + e.message + '. Use Ctrl+V in the box instead.', 'bad');
            }
        });
        btnRow.appendChild(pasteBtn);
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn';
        copyBtn.textContent = '📋 Copy';
        copyBtn.disabled = !geneTable;
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(ta.value)
                .then(() => Toast.toast('Genome copied to clipboard', 'ok'))
                .catch((e) => Toast.toast('Copy failed: ' + e.message, 'bad'));
        });
        btnRow.appendChild(copyBtn);
        wrap.appendChild(btnRow);
        const saveLibBtn = document.createElement('button');
        saveLibBtn.className = 'btn';
        saveLibBtn.textContent = '💾 Save to Library';
        saveLibBtn.disabled = !geneTable;
        saveLibBtn.title = 'Save this genome to the DNA Library, shared with the Genome workspace and SIMPR';
        saveLibBtn.addEventListener('click', async () => {
            const cats = DnaLib.all();
            const body = document.createElement('div');
            const catRow = document.createElement('label');
            catRow.style.display = 'block';
            catRow.style.marginBottom = '8px';
            catRow.textContent = 'Category';
            const catSelect = document.createElement('select');
            catSelect.style.width = '100%';
            for (const c of cats) {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.name + ' (' + c.entries.length + ')';
                catSelect.appendChild(opt);
            }
            const newOpt = document.createElement('option');
            newOpt.value = '__new__';
            newOpt.textContent = '＋ New category…';
            catSelect.appendChild(newOpt);
            catRow.appendChild(catSelect);
            body.appendChild(catRow);
            const newNameInput = document.createElement('input');
            newNameInput.type = 'text';
            newNameInput.placeholder = 'New category name';
            newNameInput.style.width = '100%';
            newNameInput.style.marginBottom = '8px';
            newNameInput.hidden = true;
            body.appendChild(newNameInput);
            catSelect.addEventListener('change', () => {
                newNameInput.hidden = catSelect.value !== '__new__';
                if (!newNameInput.hidden) newNameInput.focus();
            });
            const nameRow = document.createElement('label');
            nameRow.style.display = 'block';
            nameRow.textContent = 'Name';
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.placeholder = 'Genome name';
            nameInput.value = label();
            nameInput.style.width = '100%';
            nameRow.appendChild(nameInput);
            body.appendChild(nameRow);
            const value = await Modal.show({
                title: 'Save to DNA Library',
                body,
                buttons: [{ label: 'Cancel', value: null }, { label: 'Save', primary: true, value: '__save__' }]
            });
            if (value !== '__save__') return;
            const name = nameInput.value.trim() || 'Genome ' + new Date().toLocaleString();
            try {
                let catId = catSelect.value;
                let catName;
                if (catId === '__new__') {
                    const newName = newNameInput.value.trim();
                    if (!newName) { Toast.toast('The new category needs a name.', 'bad'); return; }
                    const created = DnaLib.addCategory(newName);
                    catId = created.id;
                    catName = created.name;
                } else {
                    const cat = DnaLib.getCategory(catId);
                    if (!cat) { Toast.toast('That category no longer exists.', 'bad'); return; }
                    catName = cat.name;
                }
                DnaLib.addEntry(catId, name, text);
                Toast.toast('Saved “' + name + '” to “' + catName + '”', 'ok');
            } catch (e) { Toast.toast('Could not save to the library: ' + e.message, 'bad'); }
        });
        wrap.appendChild(saveLibBtn);
        const openBtn = document.createElement('button');
        openBtn.className = 'btn primary';
        openBtn.textContent = 'Open in 🧬 ▸';
        openBtn.title = 'Edit these genes directly — writes live to the save';
        openBtn.addEventListener('click', () => {
            if (typeof opts.onOpenInGenome === 'function') opts.onOpenInGenome();
        });
        wrap.appendChild(openBtn);
        host.appendChild(wrap);
        return previewApi;
    }
    return { mount };
})();
