/* ======================================================================
   DnaLibrary - reusable DNA category/entry library
   ----------------------------------------------------------------------
   Ported from the DNA LIBRARY + GENOME CORE section of simpr-main.js
   (roughly lines 91-580), including the Round 7 drag & drop fix (an
   entry dropped onto another entry is inserted at the marked position,
   not appended to the end).

   API
     const lib = DnaLibrary.create({
       listEl, addCategoryBtn, saveBtn, saveBtnText,
       exportBtn, importBtn, importInput,   // each Element or selector string;
                                             // importInput is created (hidden
                                             // <input type=file accept=.json>)
                                             // when omitted
       searchInput, searchClear,            // optional; Element or selector
                                             // string. Omitted -> no search UI,
                                             // behaviour is exactly as before.
       getGenome: () => string,             // text to save
       loadGenome: (text, entry) => {},     // host parses; entry.dnaText is
                                             // passed RAW, never cleaned here
       onCompare: (name, text, entry) => {},// optional; omit -> no compare
                                             // (⚖️) button on entries
       toast: (msg, kind) => {},            // optional; kind: 'ok'|'error'|undefined
       confirm, prompt                      // optional overrides, default
                                             // window.confirm / window.prompt
     });
     lib.render();          // (re)draw the list from the in-memory categories
     lib.refresh();         // re-read storage, then render
     lib.destroy();         // remove listeners, close the BroadcastChannel
     lib.getCategories();   // -> deep copy of the current categories
     lib.getSelectedId();   // -> string | null
     lib.select(id | null); // select (or deselect with null) a category
     lib.setQuery(q);       // set the library-wide search query and re-render
     lib.getQuery();        // -> current (trimmed) search query string

   Search (only wired up when searchInput is supplied):
     - matching is case-insensitive against trimmed input
     - a category is shown if its name matches (all its entries listed) or
       any of its entries match (only those entries listed); matched text is
       wrapped in <mark class="lib-match">
     - shown categories render expanded regardless of selection; drag & drop
       is disabled while a query is active (a partial list can't be reordered)

   Storage / sync contract (shared with SIMPR, CRISPR and the DNA
   Shortener - do not change):
     - localStorage['dna_shortener_categories'] =
         [{ id, name, entries: [{ id, name, dnaText }] }]
     - legacy localStorage['horsey_saved_dna'] = [{ name, rawText }] is
       migrated into a single 'Default' category on first load, then removed
     - an empty or invalid store becomes a single 'Default' category
     - new BroadcastChannel('dna-shortener-sync'); every mutation saves to
       storage then posts { type: 'update', categories: <deep copy> }; a
       received 'update' uses event.data.categories when present, else
       re-reads storage; a selection whose category vanished is cleared
     - storage is re-read immediately before every mutation (two open tabs
       must not clobber each other)
     - ids: Date.now().toString(36) + Math.random().toString(36).substr(2, 5)
     - export downloads 'dna_library.json' (JSON.stringify(categories, null, 2));
       import APPENDS categories under fresh ids, after the same validation
       SIMPR performs
   ====================================================================== */

(function () {
    'use strict';

    var STORAGE_KEY_LIBRARY = 'dna_shortener_categories';
    var LEGACY_KEY = 'horsey_saved_dna';
    var CHANNEL_NAME = 'dna-shortener-sync';
    var DROP_MARKER = '2px solid #3b82f6';

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    function resolveEl(target) {
        if (!target) return null;
        if (typeof target === 'string') return document.querySelector(target);
        return target;
    }

    function safeGetItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function safeSetItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) { /* ignore quota / access errors */ }
    }

    function safeRemoveItem(key) {
        try {
            localStorage.removeItem(key);
        } catch (e) { /* ignore */ }
    }

    function deepCopy(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    function create(opts) {
        opts = opts || {};

        var listEl = resolveEl(opts.listEl);
        var addCategoryBtn = resolveEl(opts.addCategoryBtn);
        var saveBtn = resolveEl(opts.saveBtn);
        var saveBtnText = resolveEl(opts.saveBtnText);
        var exportBtn = resolveEl(opts.exportBtn);
        var importBtn = resolveEl(opts.importBtn);
        var importInput = resolveEl(opts.importInput);
        var searchInput = resolveEl(opts.searchInput);
        var searchClear = resolveEl(opts.searchClear);
        var createdImportInput = false;

        if (!importInput) {
            importInput = document.createElement('input');
            importInput.type = 'file';
            importInput.accept = '.json';
            importInput.style.display = 'none';
            document.body.appendChild(importInput);
            createdImportInput = true;
        }

        var getGenome = typeof opts.getGenome === 'function' ? opts.getGenome : function () { return ''; };
        var loadGenome = typeof opts.loadGenome === 'function' ? opts.loadGenome : function () {};
        var onCompare = typeof opts.onCompare === 'function' ? opts.onCompare : null;
        var toast = typeof opts.toast === 'function' ? opts.toast : function (msg) { console.log(msg); };
        var doConfirm = typeof opts.confirm === 'function' ? opts.confirm : function (msg) { return window.confirm(msg); };
        var doPrompt = typeof opts.prompt === 'function' ? opts.prompt : function (msg, def) { return window.prompt(msg, def); };

        var categories = loadCategories();
        var selectedCategoryId = null;
        var searchQuery = '';
        var destroyed = false;

        var draggedCategoryId = null, draggedEntryId = null, draggedFromCategoryId = null;

        var syncChannel = null;
        try {
            syncChannel = new BroadcastChannel(CHANNEL_NAME);
        } catch (e) {
            syncChannel = null;
        }

        function onChannelMessage(event) {
            if (destroyed) return;
            if (event.data && event.data.type === 'update') {
                if (event.data.categories) {
                    categories = event.data.categories;
                } else {
                    categories = loadCategories();
                }
                if (selectedCategoryId && !categories.some(function (c) { return c.id === selectedCategoryId; })) {
                    selectedCategoryId = null;
                }
                render();
                updateSaveButton();
            }
        }

        if (syncChannel) syncChannel.onmessage = onChannelMessage;

        function loadCategories() {
            var raw = safeGetItem(STORAGE_KEY_LIBRARY);
            if (raw) {
                try {
                    var parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
                } catch (e) { /* fall through */ }
            }
            var defaultCat = { id: generateId(), name: 'Default', entries: [] };
            var oldDna = safeGetItem(LEGACY_KEY);
            if (oldDna) {
                try {
                    var oldList = JSON.parse(oldDna);
                    if (Array.isArray(oldList)) {
                        oldList.forEach(function (item) {
                            defaultCat.entries.push({ id: generateId(), name: item.name || 'Unnamed', dnaText: item.rawText || '' });
                        });
                    }
                    saveCategoriesArr([defaultCat]);
                    broadcastCategories([defaultCat]);
                    safeRemoveItem(LEGACY_KEY);
                } catch (e) { /* ignore corrupt legacy data */ }
            } else {
                // Persist the new Default straight away. Otherwise every re-read before
                // the first save invents another Default with a new id, the selected
                // category "disappears", and Save / Add Category silently do nothing.
                // (SIMPR used to do this at startup: `if (!getItem(KEY)) saveCategories()`.)
                saveCategoriesArr([defaultCat]);
            }
            return [defaultCat];
        }

        function saveCategoriesArr(cats) {
            safeSetItem(STORAGE_KEY_LIBRARY, JSON.stringify(cats));
        }

        function broadcastCategories(cats) {
            if (!syncChannel) return;
            try {
                syncChannel.postMessage({ type: 'update', categories: deepCopy(cats) });
            } catch (e) { /* ignore */ }
        }

        function saveCategories() {
            saveCategoriesArr(categories);
        }

        function broadcastUpdate() {
            saveCategories();
            broadcastCategories(categories);
        }

        function reloadCategoriesFromStorage() {
            categories = loadCategories();
            if (selectedCategoryId && !categories.some(function (c) { return c.id === selectedCategoryId; })) {
                selectedCategoryId = null;
            }
        }

        function updateSaveButton() {
            if (!saveBtnText && !saveBtn) return;
            var cat = categories.find(function (c) { return c.id === selectedCategoryId; });
            if (saveBtnText) {
                saveBtnText.textContent = cat ? ('Save to ' + cat.name) : 'Select a category to save';
            }
            if (saveBtn) {
                saveBtn.disabled = !cat;
            }
        }

        function selectCategory(id) {
            if (selectedCategoryId === id) {
                // Clicking the already-selected category's name deselects it.
                selectedCategoryId = null;
            } else {
                selectedCategoryId = id;
            }
            render();
            updateSaveButton();
        }

        function select(id) {
            selectedCategoryId = id || null;
            render();
            updateSaveButton();
        }

        function loadEntry(entry) {
            loadGenome(entry.dnaText, entry);
            toast('Loaded DNA "' + entry.name + '"');
        }

        // ---- Search ----

        function setQuery(q) {
            searchQuery = (q || '').trim();
            if (searchInput && searchInput.value !== searchQuery) searchInput.value = searchQuery;
            render();
        }

        function getQuery() {
            return searchQuery;
        }

        // Appends `text` to `el` as plain text, wrapping every case-insensitive
        // occurrence of `lowerQuery` in a <mark class="lib-match">. Built with
        // DOM APIs / textContent only - never innerHTML with user-provided text.
        function appendHighlighted(el, text, lowerQuery) {
            var lowerText = text.toLowerCase();
            var idx = 0;
            while (idx < text.length) {
                var matchIdx = lowerText.indexOf(lowerQuery, idx);
                if (matchIdx === -1) {
                    el.appendChild(document.createTextNode(text.slice(idx)));
                    return;
                }
                if (matchIdx > idx) el.appendChild(document.createTextNode(text.slice(idx, matchIdx)));
                var mark = document.createElement('mark');
                mark.className = 'lib-match';
                mark.textContent = text.slice(matchIdx, matchIdx + lowerQuery.length);
                el.appendChild(mark);
                idx = matchIdx + lowerQuery.length;
            }
        }

        function onSearchInput() {
            searchQuery = (searchInput.value || '').trim();
            render();
        }

        function onSearchKeydown(e) {
            if (e.key === 'Escape') {
                searchInput.value = '';
                searchQuery = '';
                render();
                searchInput.focus();
            }
        }

        function onSearchClear() {
            if (searchInput) searchInput.value = '';
            searchQuery = '';
            render();
            if (searchInput) searchInput.focus();
        }

        // ---- Drag & drop ----

        function clearDropMarker(e) {
            e.currentTarget.style.borderTop = '';
        }

        function handleDragEnd() {
            this.classList.remove('dragging');
            if (listEl) {
                var els = listEl.querySelectorAll('.category-item, .entry-item');
                for (var i = 0; i < els.length; i++) els[i].style.borderTop = '';
            }
            draggedCategoryId = null;
            draggedEntryId = null;
            draggedFromCategoryId = null;
        }

        function handleCategoryDragStart(e) {
            draggedCategoryId = this.dataset.categoryId;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggedCategoryId);
        }

        function handleCategoryDragOver(e) {
            e.preventDefault();
            var target = e.currentTarget;
            if (target && target.dataset.categoryId !== draggedCategoryId) {
                target.style.borderTop = DROP_MARKER;
            }
        }

        function handleCategoryDropUnified(e) {
            e.preventDefault();
            var target = e.currentTarget;
            target.style.borderTop = '';
            var targetCategoryId = target.dataset.categoryId;
            if (!targetCategoryId) return;

            reloadCategoriesFromStorage();

            // Case 1: dropping a category (reorder categories)
            if (draggedCategoryId && draggedCategoryId !== targetCategoryId) {
                var draggedIndex = categories.findIndex(function (c) { return c.id === draggedCategoryId; });
                var targetIndex = categories.findIndex(function (c) { return c.id === targetCategoryId; });
                if (draggedIndex !== -1 && targetIndex !== -1) {
                    var moved = categories.splice(draggedIndex, 1)[0];
                    categories.splice(targetIndex, 0, moved);
                    broadcastUpdate();
                    render();
                    toast('Category moved');
                }
                return;
            }

            // Case 2: dropping an entry into this category (append)
            if (draggedEntryId && draggedFromCategoryId) {
                var sourceCat = categories.find(function (c) { return c.id === draggedFromCategoryId; });
                var targetCat = categories.find(function (c) { return c.id === targetCategoryId; });
                if (!sourceCat || !targetCat) return;

                var entryIndex = sourceCat.entries.findIndex(function (ent) { return ent.id === draggedEntryId; });
                if (entryIndex === -1) return;

                var movedEntry = sourceCat.entries.splice(entryIndex, 1)[0];
                targetCat.entries.push(movedEntry);

                broadcastUpdate();
                render();
                toast('Moved DNA to "' + targetCat.name + '"');
                return;
            }
        }

        function handleEntryDragStart(e) {
            draggedEntryId = this.dataset.entryId;
            draggedFromCategoryId = this.dataset.categoryId;
            this.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggedEntryId);
            e.stopPropagation();
        }

        // Drop marker is a line on the target's TOP edge, so a dropped entry
        // lands immediately BEFORE the entry it was dropped on.
        function handleEntryDragOver(e) {
            e.preventDefault();
            e.stopPropagation();
            var target = e.currentTarget;
            if (target && target.dataset.entryId !== draggedEntryId
                       && target.dataset.categoryId === draggedFromCategoryId) {
                target.style.borderTop = DROP_MARKER;
            }
        }

        function handleEntryDrop(e) {
            e.preventDefault();
            // Entries sit inside the category <li>, which has its own drop
            // handler; without this the event bubbles to
            // handleCategoryDropUnified() which re-reads storage and appends
            // to the end, silently undoing a same-category reorder.
            e.stopPropagation();

            var target = e.currentTarget;
            target.style.borderTop = '';
            if (!draggedEntryId || !draggedFromCategoryId) return;

            var targetCategoryId = target.dataset.categoryId;
            var targetEntryId = target.dataset.entryId;
            if (!targetCategoryId || targetEntryId === draggedEntryId) return;

            reloadCategoriesFromStorage();
            var sourceCat = categories.find(function (c) { return c.id === draggedFromCategoryId; });
            var targetCat = categories.find(function (c) { return c.id === targetCategoryId; });
            if (!sourceCat || !targetCat) return;

            var fromIndex = sourceCat.entries.findIndex(function (ent) { return ent.id === draggedEntryId; });
            if (fromIndex === -1) return;
            var moved = sourceCat.entries.splice(fromIndex, 1)[0];

            // Looked up AFTER the removal: within one category that shifts every
            // later index down by one, exactly compensating for an
            // insert-before-target. Correct in both directions (Round 7 fix).
            var toIndex = targetCat.entries.findIndex(function (ent) { return ent.id === targetEntryId; });
            if (toIndex === -1) targetCat.entries.push(moved);
            else targetCat.entries.splice(toIndex, 0, moved);

            broadcastUpdate();
            render();
            toast(sourceCat === targetCat
                ? ('Moved "' + moved.name + '"')
                : ('Moved "' + moved.name + '" to "' + targetCat.name + '"'));
        }

        // ---- Rendering ----

        function render() {
            if (!listEl) return;
            listEl.innerHTML = '';

            if (searchQuery) {
                renderFiltered();
                return;
            }

            categories.forEach(function (cat) {
                var li = document.createElement('li');
                li.className = 'category-item';
                if (cat.id === selectedCategoryId) li.classList.add('selected');
                li.draggable = true;
                li.dataset.categoryId = cat.id;

                li.addEventListener('dragstart', handleCategoryDragStart);
                li.addEventListener('dragover', handleCategoryDragOver);
                li.addEventListener('drop', handleCategoryDropUnified);
                li.addEventListener('dragleave', clearDropMarker);
                li.addEventListener('dragend', handleDragEnd);

                var header = document.createElement('div');
                header.className = 'category-header';

                var dragHandle = document.createElement('span');
                dragHandle.className = 'drag-handle';
                dragHandle.textContent = '⋮⋮';
                var nameSpan = document.createElement('span');
                nameSpan.className = 'category-name';
                nameSpan.textContent = cat.name;
                nameSpan.addEventListener('click', function (e) {
                    e.stopPropagation();
                    selectCategory(cat.id);
                });

                var actions = document.createElement('div');
                actions.className = 'category-actions';

                var renameBtn = document.createElement('button');
                renameBtn.innerHTML = '✏️';
                renameBtn.title = 'Rename category';
                renameBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var newName = doPrompt('New category name:', cat.name);
                    if (newName && newName.trim()) {
                        reloadCategoriesFromStorage();
                        var targetCat = categories.find(function (c) { return c.id === cat.id; });
                        if (targetCat) {
                            targetCat.name = newName.trim();
                            broadcastUpdate();
                            render();
                            toast('Category renamed to "' + targetCat.name + '"');
                        }
                    }
                });

                var deleteBtn = document.createElement('button');
                deleteBtn.innerHTML = '🗑️';
                deleteBtn.title = 'Delete category';
                deleteBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (doConfirm('Delete category "' + cat.name + '" and all its DNA?')) {
                        reloadCategoriesFromStorage();
                        categories = categories.filter(function (c) { return c.id !== cat.id; });
                        if (selectedCategoryId === cat.id) selectedCategoryId = null;
                        broadcastUpdate();
                        render();
                        updateSaveButton();
                        toast('Category "' + cat.name + '" deleted', 'error');
                    }
                });

                actions.appendChild(renameBtn);
                actions.appendChild(deleteBtn);
                header.appendChild(dragHandle);
                header.appendChild(nameSpan);
                header.appendChild(actions);
                li.appendChild(header);

                if (cat.id === selectedCategoryId) {
                    var entryList = document.createElement('ul');
                    entryList.className = 'entry-list';
                    cat.entries.forEach(function (entry) {
                        var entryLi = document.createElement('li');
                        entryLi.className = 'entry-item';
                        entryLi.draggable = true;
                        entryLi.dataset.entryId = entry.id;
                        entryLi.dataset.categoryId = cat.id;

                        entryLi.addEventListener('dragstart', handleEntryDragStart);
                        entryLi.addEventListener('dragover', handleEntryDragOver);
                        entryLi.addEventListener('drop', handleEntryDrop);
                        entryLi.addEventListener('dragleave', clearDropMarker);
                        entryLi.addEventListener('dragend', handleDragEnd);

                        var entryDragHandle = document.createElement('span');
                        entryDragHandle.className = 'drag-handle';
                        entryDragHandle.textContent = '⋮';
                        var entryName = document.createElement('span');
                        entryName.className = 'entry-name';
                        entryName.textContent = entry.name;
                        entryLi.addEventListener('click', function () { loadEntry(entry); });

                        var entryActions = document.createElement('div');
                        entryActions.className = 'entry-actions';

                        var entryRename = document.createElement('button');
                        entryRename.innerHTML = '✏️';
                        entryRename.title = 'Rename DNA';
                        entryRename.addEventListener('click', function (e) {
                            e.stopPropagation();
                            var newName = doPrompt('New name:', entry.name);
                            if (newName && newName.trim()) {
                                reloadCategoriesFromStorage();
                                var targetCat = categories.find(function (c) { return c.id === cat.id; });
                                if (targetCat) {
                                    var targetEntry = targetCat.entries.find(function (e2) { return e2.id === entry.id; });
                                    if (targetEntry) {
                                        targetEntry.name = newName.trim();
                                        broadcastUpdate();
                                        render();
                                        toast('DNA renamed to "' + targetEntry.name + '"');
                                    }
                                }
                            }
                        });

                        var entryDelete = document.createElement('button');
                        entryDelete.innerHTML = '🗑️';
                        entryDelete.title = 'Delete DNA';
                        entryDelete.addEventListener('click', function (e) {
                            e.stopPropagation();
                            if (doConfirm('Delete DNA "' + entry.name + '"?')) {
                                reloadCategoriesFromStorage();
                                var targetCat = categories.find(function (c) { return c.id === cat.id; });
                                if (targetCat) {
                                    targetCat.entries = targetCat.entries.filter(function (e2) { return e2.id !== entry.id; });
                                    broadcastUpdate();
                                    render();
                                    toast('DNA "' + entry.name + '" deleted', 'error');
                                }
                            }
                        });

                        entryActions.appendChild(entryDelete);
                        entryLi.appendChild(entryDragHandle);
                        entryLi.appendChild(entryName);

                        if (onCompare) {
                            var entryCompare = document.createElement('button');
                            entryCompare.innerHTML = '⚖️';
                            entryCompare.title = 'Load into compare';
                            entryCompare.addEventListener('click', function (e) {
                                e.stopPropagation();
                                onCompare(entry.name, entry.dnaText, entry);
                                toast('"' + entry.name + '" loaded for comparison');
                            });
                            entryActions.insertBefore(entryCompare, entryActions.firstChild);
                        }

                        entryActions.insertBefore(entryRename, entryActions.lastChild);
                        entryLi.appendChild(entryActions);
                        entryList.appendChild(entryLi);
                    });
                    li.appendChild(entryList);
                }
                listEl.appendChild(li);
            });
        }

        // Search-filtered view: expanded, non-draggable, highlighted subset of
        // categories/entries matching searchQuery. Selection & category-click
        // (select/deselect) still work; entry click/rename/delete/⚖️ still work.
        function renderFiltered() {
            var lowerQuery = searchQuery.toLowerCase();
            var shown = [];
            categories.forEach(function (cat) {
                var catMatches = cat.name.toLowerCase().indexOf(lowerQuery) !== -1;
                if (catMatches) {
                    shown.push({ cat: cat, entries: cat.entries });
                    return;
                }
                var matchedEntries = cat.entries.filter(function (en) {
                    return en.name.toLowerCase().indexOf(lowerQuery) !== -1;
                });
                if (matchedEntries.length > 0) shown.push({ cat: cat, entries: matchedEntries });
            });

            if (shown.length === 0) {
                var emptyLi = document.createElement('li');
                emptyLi.className = 'library-empty';
                emptyLi.textContent = 'No DNA matches "' + searchQuery + '".';
                listEl.appendChild(emptyLi);
                return;
            }

            shown.forEach(function (pair) {
                var cat = pair.cat;
                var li = document.createElement('li');
                li.className = 'category-item drag-disabled';
                if (cat.id === selectedCategoryId) li.classList.add('selected');
                li.draggable = false;
                li.dataset.categoryId = cat.id;

                var header = document.createElement('div');
                header.className = 'category-header';

                var dragHandle = document.createElement('span');
                dragHandle.className = 'drag-handle drag-disabled';
                dragHandle.style.visibility = 'hidden';
                dragHandle.textContent = '⋮⋮';
                var nameSpan = document.createElement('span');
                nameSpan.className = 'category-name';
                appendHighlighted(nameSpan, cat.name, lowerQuery);
                nameSpan.addEventListener('click', function (e) {
                    e.stopPropagation();
                    selectCategory(cat.id);
                });

                var actions = document.createElement('div');
                actions.className = 'category-actions';

                var renameBtn = document.createElement('button');
                renameBtn.innerHTML = '✏️';
                renameBtn.title = 'Rename category';
                renameBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var newName = doPrompt('New category name:', cat.name);
                    if (newName && newName.trim()) {
                        reloadCategoriesFromStorage();
                        var targetCat = categories.find(function (c) { return c.id === cat.id; });
                        if (targetCat) {
                            targetCat.name = newName.trim();
                            broadcastUpdate();
                            render();
                            toast('Category renamed to "' + targetCat.name + '"');
                        }
                    }
                });

                var deleteBtn = document.createElement('button');
                deleteBtn.innerHTML = '🗑️';
                deleteBtn.title = 'Delete category';
                deleteBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    if (doConfirm('Delete category "' + cat.name + '" and all its DNA?')) {
                        reloadCategoriesFromStorage();
                        categories = categories.filter(function (c) { return c.id !== cat.id; });
                        if (selectedCategoryId === cat.id) selectedCategoryId = null;
                        broadcastUpdate();
                        render();
                        updateSaveButton();
                        toast('Category "' + cat.name + '" deleted', 'error');
                    }
                });

                actions.appendChild(renameBtn);
                actions.appendChild(deleteBtn);
                header.appendChild(dragHandle);
                header.appendChild(nameSpan);
                header.appendChild(actions);
                li.appendChild(header);

                var entryList = document.createElement('ul');
                entryList.className = 'entry-list';
                pair.entries.forEach(function (entry) {
                    var entryLi = document.createElement('li');
                    entryLi.className = 'entry-item drag-disabled';
                    entryLi.draggable = false;
                    entryLi.dataset.entryId = entry.id;
                    entryLi.dataset.categoryId = cat.id;

                    var entryDragHandle = document.createElement('span');
                    entryDragHandle.className = 'drag-handle drag-disabled';
                    entryDragHandle.style.visibility = 'hidden';
                    entryDragHandle.textContent = '⋮';
                    var entryName = document.createElement('span');
                    entryName.className = 'entry-name';
                    appendHighlighted(entryName, entry.name, lowerQuery);
                    entryLi.addEventListener('click', function () { loadEntry(entry); });

                    var entryActions = document.createElement('div');
                    entryActions.className = 'entry-actions';

                    var entryRename = document.createElement('button');
                    entryRename.innerHTML = '✏️';
                    entryRename.title = 'Rename DNA';
                    entryRename.addEventListener('click', function (e) {
                        e.stopPropagation();
                        var newName = doPrompt('New name:', entry.name);
                        if (newName && newName.trim()) {
                            reloadCategoriesFromStorage();
                            var targetCat = categories.find(function (c) { return c.id === cat.id; });
                            if (targetCat) {
                                var targetEntry = targetCat.entries.find(function (e2) { return e2.id === entry.id; });
                                if (targetEntry) {
                                    targetEntry.name = newName.trim();
                                    broadcastUpdate();
                                    render();
                                    toast('DNA renamed to "' + targetEntry.name + '"');
                                }
                            }
                        }
                    });

                    var entryDelete = document.createElement('button');
                    entryDelete.innerHTML = '🗑️';
                    entryDelete.title = 'Delete DNA';
                    entryDelete.addEventListener('click', function (e) {
                        e.stopPropagation();
                        if (doConfirm('Delete DNA "' + entry.name + '"?')) {
                            reloadCategoriesFromStorage();
                            var targetCat = categories.find(function (c) { return c.id === cat.id; });
                            if (targetCat) {
                                targetCat.entries = targetCat.entries.filter(function (e2) { return e2.id !== entry.id; });
                                broadcastUpdate();
                                render();
                                toast('DNA "' + entry.name + '" deleted', 'error');
                            }
                        }
                    });

                    entryActions.appendChild(entryDelete);
                    entryLi.appendChild(entryDragHandle);
                    entryLi.appendChild(entryName);

                    if (onCompare) {
                        var entryCompare = document.createElement('button');
                        entryCompare.innerHTML = '⚖️';
                        entryCompare.title = 'Load into compare';
                        entryCompare.addEventListener('click', function (e) {
                            e.stopPropagation();
                            onCompare(entry.name, entry.dnaText, entry);
                            toast('"' + entry.name + '" loaded for comparison');
                        });
                        entryActions.insertBefore(entryCompare, entryActions.firstChild);
                    }

                    entryActions.insertBefore(entryRename, entryActions.lastChild);
                    entryLi.appendChild(entryActions);
                    entryList.appendChild(entryLi);
                });
                li.appendChild(entryList);

                listEl.appendChild(li);
            });
        }

        function refresh() {
            reloadCategoriesFromStorage();
            render();
            updateSaveButton();
        }

        // ---- Toolbar actions ----

        function addCategory() {
            var name = doPrompt('Category name:');
            if (!name || !name.trim()) return;
            reloadCategoriesFromStorage();
            var newCat = { id: generateId(), name: name.trim(), entries: [] };
            categories.push(newCat);
            broadcastUpdate();
            render();
            select(newCat.id);
            toast('Category "' + newCat.name + '" created');
        }

        function saveCurrentDna() {
            var dnaText = getGenome();
            if (!dnaText || !dnaText.trim()) {
                toast('DNA editor is empty.', 'error');
                return;
            }
            if (!selectedCategoryId) {
                toast('Select a category to save', 'error');
                return;
            }
            reloadCategoriesFromStorage();
            var cat = categories.find(function (c) { return c.id === selectedCategoryId; });
            if (!cat) return;
            var name = doPrompt('Name for this DNA snapshot:', 'DNA ' + new Date().toLocaleTimeString());
            if (!name || !name.trim()) return;
            cat.entries.push({ id: generateId(), name: name.trim(), dnaText: dnaText });
            broadcastUpdate();
            render();
            toast('DNA "' + name.trim() + '" saved');
        }

        function exportLibrary() {
            var jsonStr = JSON.stringify(categories, null, 2);
            var blob = new Blob([jsonStr], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'dna_library.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast('DNA Library exported!');
        }

        function importLibrary() {
            importInput.click();
        }

        function onImportFileChange(e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    var imported = JSON.parse(ev.target.result);
                    if (!Array.isArray(imported)) throw new Error('Invalid format');
                    reloadCategoriesFromStorage();
                    imported.forEach(function (cat) {
                        if (!cat.name || typeof cat.name !== 'string') throw new Error('Invalid category');
                        var newCatId = generateId();
                        var entries = Array.isArray(cat.entries) ? cat.entries : [];
                        var newEntries = entries.map(function (entry) {
                            return { id: generateId(), name: entry.name || 'Unnamed DNA', dnaText: entry.dnaText || '' };
                        });
                        categories.push({ id: newCatId, name: cat.name, entries: newEntries });
                    });
                    broadcastUpdate();
                    render();
                    toast('Imported ' + imported.length + ' categories');
                } catch (err) {
                    toast('Invalid import file', 'error');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        }

        if (addCategoryBtn) addCategoryBtn.addEventListener('click', addCategory);
        if (saveBtn) saveBtn.addEventListener('click', saveCurrentDna);
        if (exportBtn) exportBtn.addEventListener('click', exportLibrary);
        if (importBtn) importBtn.addEventListener('click', importLibrary);
        importInput.addEventListener('change', onImportFileChange);
        if (searchInput) {
            searchInput.addEventListener('input', onSearchInput);
            searchInput.addEventListener('keydown', onSearchKeydown);
        }
        if (searchClear) searchClear.addEventListener('click', onSearchClear);

        function destroy() {
            destroyed = true;
            if (syncChannel) {
                try { syncChannel.onmessage = null; syncChannel.close(); } catch (e) { /* ignore */ }
            }
            if (addCategoryBtn) addCategoryBtn.removeEventListener('click', addCategory);
            if (saveBtn) saveBtn.removeEventListener('click', saveCurrentDna);
            if (exportBtn) exportBtn.removeEventListener('click', exportLibrary);
            if (importBtn) importBtn.removeEventListener('click', importLibrary);
            importInput.removeEventListener('change', onImportFileChange);
            if (searchInput) {
                searchInput.removeEventListener('input', onSearchInput);
                searchInput.removeEventListener('keydown', onSearchKeydown);
            }
            if (searchClear) searchClear.removeEventListener('click', onSearchClear);
            if (createdImportInput && importInput.parentNode) {
                importInput.parentNode.removeChild(importInput);
            }
            if (listEl) listEl.innerHTML = '';
        }

        updateSaveButton();

        return {
            render: render,
            refresh: refresh,
            destroy: destroy,
            getCategories: function () { return deepCopy(categories); },
            getSelectedId: function () { return selectedCategoryId; },
            select: select,
            setQuery: setQuery,
            getQuery: getQuery
        };
    }

    window.DnaLibrary = { create: create };
})();
