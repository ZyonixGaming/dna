'use strict';
const LibPicker = (function () {
    let seq = 0;
    function appendHighlighted(el, text, lowerQuery) {
        if (!lowerQuery) { el.appendChild(document.createTextNode(text)); return; }
        const lowerText = text.toLowerCase();
        let idx = 0;
        while (idx < text.length) {
            const matchIdx = lowerText.indexOf(lowerQuery, idx);
            if (matchIdx === -1) { el.appendChild(document.createTextNode(text.slice(idx))); return; }
            if (matchIdx > idx) el.appendChild(document.createTextNode(text.slice(idx, matchIdx)));
            const mark = document.createElement('mark');
            mark.className = 'libpicker-match';
            mark.textContent = text.slice(matchIdx, matchIdx + lowerQuery.length);
            el.appendChild(mark);
            idx = matchIdx + lowerQuery.length;
        }
    }
    function labelFor(id) {
        if (!id || typeof DnaLib === 'undefined') return '';
        const hit = DnaLib.findEntry(id);
        return hit ? (hit.category.name + ' / ' + hit.entry.name) : '';
    }
    function mount(hostEl, opts) {
        opts = opts || {};
        const onChangeCb = typeof opts.onChange === 'function' ? opts.onChange : null;
        const uid = 'libpicker-' + (++seq);
        hostEl.innerHTML = '';
        hostEl.classList.add('libpicker');
        const inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.className = 'libpicker-input';
        inputEl.autocomplete = 'off';
        inputEl.spellcheck = false;
        inputEl.setAttribute('role', 'combobox');
        inputEl.setAttribute('aria-expanded', 'false');
        inputEl.setAttribute('aria-autocomplete', 'list');
        inputEl.setAttribute('aria-haspopup', 'listbox');
        inputEl.setAttribute('aria-controls', uid + '-list');
        inputEl.placeholder = opts.placeholder || 'Search DNA Library…';
        const listEl = document.createElement('div');
        listEl.className = 'libpicker-list';
        listEl.id = uid + '-list';
        listEl.setAttribute('role', 'listbox');
        listEl.hidden = true;
        hostEl.appendChild(inputEl);
        hostEl.appendChild(listEl);
        let currentId = opts.value || '';
        let isOpen = false;
        let query = '';
        let activeIndex = -1;
        let items = [];
        inputEl.value = labelFor(currentId);
        function fireChange(id) {
            if (!onChangeCb) return;
            try { onChangeCb(id); } catch (e) {   }
        }
        function setActiveIndex(i) {
            if (activeIndex >= 0 && items[activeIndex]) items[activeIndex].el.classList.remove('active');
            activeIndex = i;
            if (i >= 0 && items[i]) {
                items[i].el.classList.add('active');
                inputEl.setAttribute('aria-activedescendant', items[i].el.id);
                items[i].el.scrollIntoView({ block: 'nearest' });
            } else {
                inputEl.removeAttribute('aria-activedescendant');
            }
        }
        function moveActive(delta) {
            if (!items.length) return;
            let i = activeIndex < 0 ? (delta > 0 ? 0 : items.length - 1) : activeIndex + delta;
            if (i < 0) i = 0;
            if (i >= items.length) i = items.length - 1;
            setActiveIndex(i);
        }
        function renderEmpty(text) {
            const row = document.createElement('div');
            row.className = 'libpicker-empty';
            row.textContent = text;
            listEl.appendChild(row);
        }
        function renderList() {
            listEl.innerHTML = '';
            items = [];
            const lowerQuery = query.trim().toLowerCase();
            const total = (typeof DnaLib !== 'undefined' && DnaLib.counts) ? DnaLib.counts().entries : 0;
            if (!total) { renderEmpty('The DNA Library is empty — save a genome to it first.'); return; }
            const groups = (typeof DnaLib !== 'undefined' && DnaLib.search) ? DnaLib.search(lowerQuery) : [];
            if (!groups.length) { renderEmpty('No DNA matches “' + query.trim() + '”.'); return; }
            let curIdx = -1;
            groups.forEach((g) => {
                const header = document.createElement('div');
                header.className = 'libpicker-group';
                header.setAttribute('role', 'presentation');
                appendHighlighted(header, g.category.name, lowerQuery);
                listEl.appendChild(header);
                g.entries.forEach((entry) => {
                    const opt = document.createElement('div');
                    opt.className = 'libpicker-option';
                    opt.id = uid + '-opt-' + items.length;
                    opt.setAttribute('role', 'option');
                    opt.dataset.entryId = entry.id;
                    opt.setAttribute('aria-selected', entry.id === currentId ? 'true' : 'false');
                    if (entry.id === currentId) { opt.classList.add('current'); curIdx = items.length; }
                    appendHighlighted(opt, entry.name, lowerQuery);
                    listEl.appendChild(opt);
                    items.push({ entry, el: opt });
                });
            });
            activeIndex = -1;
            if (curIdx !== -1) setActiveIndex(curIdx);
        }
        function positionList() {
            const r = inputEl.getBoundingClientRect();
            listEl.style.top = r.bottom + 'px';
            listEl.style.left = r.left + 'px';
            listEl.style.minWidth = r.width + 'px';
        }
        function onScrollOrResize() { hide(true); }
        function show() {
            if (!isOpen) {
                isOpen = true;
                inputEl.setAttribute('aria-expanded', 'true');
                listEl.hidden = false;
                window.addEventListener('scroll', onScrollOrResize, true);
                window.addEventListener('resize', onScrollOrResize);
            }
            renderList();
            positionList();
        }
        function hide(restoreLabel) {
            if (isOpen) {
                isOpen = false;
                inputEl.setAttribute('aria-expanded', 'false');
                inputEl.removeAttribute('aria-activedescendant');
                listEl.hidden = true;
                activeIndex = -1;
                window.removeEventListener('scroll', onScrollOrResize, true);
                window.removeEventListener('resize', onScrollOrResize);
            }
            if (restoreLabel) inputEl.value = labelFor(currentId);
        }
        function selectEntry(id) {
            const changed = id !== currentId;
            currentId = id;
            inputEl.value = labelFor(id);
            hide(false);
            inputEl.focus();
            if (changed) fireChange(id);
        }
        inputEl.addEventListener('focus', () => { query = ''; inputEl.select(); show(); });
        inputEl.addEventListener('blur', () => hide(true));
        inputEl.addEventListener('input', () => {
            query = inputEl.value;
            show();
            if (items.length) setActiveIndex(0);
        });
        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); isOpen ? moveActive(1) : show(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); isOpen ? moveActive(-1) : show(); }
            else if (e.key === 'Enter') {
                if (isOpen && activeIndex >= 0 && items[activeIndex]) { e.preventDefault(); selectEntry(items[activeIndex].entry.id); }
                else if (!isOpen) { e.preventDefault(); show(); }
            } else if (e.key === 'Escape') {
                if (isOpen) { e.preventDefault(); e.stopPropagation(); hide(true); }
            }
        });
        listEl.addEventListener('mousedown', (e) => e.preventDefault());
        listEl.addEventListener('click', (e) => {
            const optEl = e.target.closest('.libpicker-option');
            if (!optEl) return;
            selectEntry(optEl.dataset.entryId);
        });
        const unsubscribe = (typeof DnaLib !== 'undefined' && DnaLib.onChange)
            ? DnaLib.onChange(() => refresh()) : null;
        function refresh() {
            if (currentId && typeof DnaLib !== 'undefined' && !DnaLib.findEntry(currentId)) {
                currentId = '';
                fireChange(null);
            }
            if (isOpen) { renderList(); positionList(); } else { inputEl.value = labelFor(currentId); }
        }
        function destroy() {
            hide(false);
            if (unsubscribe) unsubscribe();
            hostEl.innerHTML = '';
            hostEl.classList.remove('libpicker');
        }
        return {
            get: () => currentId || null,
            set(id) {
                currentId = id || '';
                if (isOpen) renderList(); else inputEl.value = labelFor(currentId);
            },
            refresh,
            destroy
        };
    }
    return { mount };
})();
