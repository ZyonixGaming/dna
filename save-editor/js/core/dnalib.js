'use strict';
(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        global.DnaLib = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const STORAGE_KEY = 'dna_shortener_categories';
    const CHANNEL_NAME = 'dna-shortener-sync';
    const EXPORT_FILENAME = 'dna_library.json';
    const LEGACY_SIMPR_KEY = 'horsey_saved_dna';
    const LEGACY_STUDIO_KEY = 'gn_dna_library';
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }
    let memory = null;      
    const listeners = new Set();
    let channel = null;
    function store() {
        try {
            if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
        } catch (e) {   }
        return null;
    }
    function readRaw(key) {
        const s = store();
        if (!s) return (memory && key === STORAGE_KEY) ? memory : null;
        try { return s.getItem(key); } catch (e) { return null; }
    }
    function writeRaw(key, value) {
        const s = store();
        if (!s) { if (key === STORAGE_KEY) memory = value; return; }
        try { s.setItem(key, value); } catch (e) { memory = value; }
    }
    function dropRaw(key) {
        const s = store();
        if (!s) return;
        try { s.removeItem(key); } catch (e) {   }
    }
    function normalizeCategory(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const name = typeof raw.name === 'string' ? raw.name : '';
        if (!name) return null;
        const entries = Array.isArray(raw.entries) ? raw.entries : [];
        return {
            id: (typeof raw.id === 'string' && raw.id) || generateId(),
            name,
            entries: entries.filter((e) => e && typeof e === 'object').map((e) => ({
                id: (typeof e.id === 'string' && e.id) || generateId(),
                name: typeof e.name === 'string' && e.name ? e.name : 'Unnamed DNA',
                dnaText: typeof e.dnaText === 'string' ? e.dnaText : ''
            }))
        };
    }
    function parseCategories(raw) {
        if (!raw) return null;
        let parsed;
        try { parsed = JSON.parse(raw); } catch (e) { return null; }
        if (!Array.isArray(parsed) || !parsed.length) return null;
        const clean = parsed.map(normalizeCategory).filter(Boolean);
        return clean.length ? clean : null;
    }
    function read() {
        const existing = parseCategories(readRaw(STORAGE_KEY));
        if (existing) return existing;
        const migrated = { id: generateId(), name: 'Default', entries: [] };
        let didMigrate = false;
        const oldSimpr = readRaw(LEGACY_SIMPR_KEY);
        if (oldSimpr) {
            try {
                const list = JSON.parse(oldSimpr);
                if (Array.isArray(list)) {
                    for (const item of list) {
                        migrated.entries.push({
                            id: generateId(),
                            name: (item && item.name) || 'Unnamed',
                            dnaText: (item && item.rawText) || ''
                        });
                    }
                    didMigrate = true;
                }
            } catch (e) {   }
        }
        const oldStudio = readRaw(LEGACY_STUDIO_KEY);
        const studioCat = { id: generateId(), name: 'Saved in Horsey Studio', entries: [] };
        if (oldStudio) {
            try {
                const list = JSON.parse(oldStudio);
                if (Array.isArray(list)) {
                    for (const item of list) {
                        if (!item || typeof item.text !== 'string') continue;
                        studioCat.entries.push({
                            id: generateId(),
                            name: (typeof item.name === 'string' && item.name) || 'Saved genome',
                            dnaText: item.text
                        });
                    }
                    if (studioCat.entries.length) didMigrate = true;
                }
            } catch (e) {   }
        }
        const out = studioCat.entries.length ? [migrated, studioCat] : [migrated];
        if (didMigrate) {
            writeRaw(STORAGE_KEY, JSON.stringify(out));
            if (oldSimpr) dropRaw(LEGACY_SIMPR_KEY);
            if (studioCat.entries.length) dropRaw(LEGACY_STUDIO_KEY);
        }
        return out;
    }
    function write(categories) {
        writeRaw(STORAGE_KEY, JSON.stringify(categories));
    }
    function ensureChannel() {
        if (channel || typeof BroadcastChannel === 'undefined') return channel;
        try {
            channel = new BroadcastChannel(CHANNEL_NAME);
            channel.onmessage = (event) => {
                const data = event && event.data;
                if (!data || data.type !== 'update') return;
                const next = Array.isArray(data.categories)
                    ? data.categories.map(normalizeCategory).filter(Boolean)
                    : read();
                emit(next.length ? next : read(), 'remote');
            };
        } catch (e) { channel = null; }
        return channel;
    }
    function emit(categories, origin) {
        for (const fn of listeners) {
            try { fn(categories, origin); } catch (e) {   }
        }
    }
    function commit(categories) {
        write(categories);
        const ch = ensureChannel();
        if (ch) {
            try {
                ch.postMessage({ type: 'update', categories: JSON.parse(JSON.stringify(categories)) });
            } catch (e) {   }
        }
        emit(categories, 'local');
        return categories;
    }
    function mutate(fn) {
        const categories = read();
        const result = fn(categories);
        if (result === false) return null;
        commit(categories);
        return result;
    }
    function all() { return read(); }
    function getCategory(id) {
        return read().find((c) => c.id === id) || null;
    }
    function findEntry(entryId) {
        for (const cat of read()) {
            const entry = cat.entries.find((e) => e.id === entryId);
            if (entry) return { category: cat, entry };
        }
        return null;
    }
    function counts() {
        const cats = read();
        return { categories: cats.length, entries: cats.reduce((n, c) => n + c.entries.length, 0) };
    }
    function search(query) {
        const q = String(query || '').trim().toLowerCase();
        const cats = read();
        if (!q) return cats.map((c) => ({ category: c, entries: c.entries }));
        const out = [];
        for (const cat of cats) {
            if (cat.name.toLowerCase().indexOf(q) !== -1) {
                out.push({ category: cat, entries: cat.entries });
                continue;
            }
            const entries = cat.entries.filter((e) => e.name.toLowerCase().indexOf(q) !== -1);
            if (entries.length) out.push({ category: cat, entries });
        }
        return out;
    }
    function addCategory(name) {
        const clean = String(name || '').trim();
        if (!clean) throw new Error('A category needs a name.');
        const cat = { id: generateId(), name: clean, entries: [] };
        mutate((cats) => { cats.push(cat); return cat; });
        return cat;
    }
    function renameCategory(id, name) {
        const clean = String(name || '').trim();
        if (!clean) throw new Error('A category needs a name.');
        return mutate((cats) => {
            const cat = cats.find((c) => c.id === id);
            if (!cat) return false;
            const was = cat.name;
            cat.name = clean;
            return { id, from: was, to: clean };
        });
    }
    function removeCategory(id) {
        return mutate((cats) => {
            const at = cats.findIndex((c) => c.id === id);
            if (at === -1) return false;
            const [gone] = cats.splice(at, 1);
            return { id, name: gone.name, entries: gone.entries.length };
        });
    }
    function moveCategory(draggedId, targetId) {
        if (!draggedId || draggedId === targetId) return null;
        return mutate((cats) => {
            const from = cats.findIndex((c) => c.id === draggedId);
            if (from === -1) return false;
            const [moved] = cats.splice(from, 1);
            const to = cats.findIndex((c) => c.id === targetId);
            if (to === -1) cats.splice(from, 0, moved);   
            else cats.splice(to, 0, moved);
            return { id: draggedId, name: moved.name };
        });
    }
    function addEntry(categoryId, name, dnaText) {
        const clean = String(name || '').trim();
        if (!clean) throw new Error('A saved genome needs a name.');
        if (!String(dnaText || '').trim()) throw new Error('There is no DNA to save.');
        const entry = { id: generateId(), name: clean, dnaText: String(dnaText) };
        const ok = mutate((cats) => {
            const cat = cats.find((c) => c.id === categoryId);
            if (!cat) return false;
            cat.entries.push(entry);
            return entry;
        });
        if (!ok) throw new Error('That category no longer exists.');
        return entry;
    }
    function addEntries(categoryId, items) {
        if (!Array.isArray(items) || !items.length) return [];
        const clean = items.map((it) => {
            const name = String((it && it.name) || '').trim();
            const dnaText = String((it && it.dnaText) || '');
            if (!name) throw new Error('A saved genome needs a name.');
            if (!dnaText.trim()) throw new Error('There is no DNA to save.');
            return { id: generateId(), name, dnaText };
        });
        const ok = mutate((cats) => {
            const cat = cats.find((c) => c.id === categoryId);
            if (!cat) return false;
            for (const e of clean) cat.entries.push(e);
            return clean;
        });
        if (!ok) throw new Error('That category no longer exists.');
        return ok;
    }
    function renameEntry(categoryId, entryId, name) {
        const clean = String(name || '').trim();
        if (!clean) throw new Error('A saved genome needs a name.');
        return mutate((cats) => {
            const cat = cats.find((c) => c.id === categoryId);
            const entry = cat && cat.entries.find((e) => e.id === entryId);
            if (!entry) return false;
            const was = entry.name;
            entry.name = clean;
            return { id: entryId, from: was, to: clean };
        });
    }
    function removeEntry(categoryId, entryId) {
        return mutate((cats) => {
            const cat = cats.find((c) => c.id === categoryId);
            if (!cat) return false;
            const at = cat.entries.findIndex((e) => e.id === entryId);
            if (at === -1) return false;
            const [gone] = cat.entries.splice(at, 1);
            return { id: entryId, name: gone.name, category: cat.name };
        });
    }
    function moveEntryToCategory(entryId, fromCategoryId, toCategoryId) {
        return mutate((cats) => {
            const src = cats.find((c) => c.id === fromCategoryId);
            const dst = cats.find((c) => c.id === toCategoryId);
            if (!src || !dst) return false;
            const at = src.entries.findIndex((e) => e.id === entryId);
            if (at === -1) return false;
            const [moved] = src.entries.splice(at, 1);
            dst.entries.push(moved);
            return { id: entryId, name: moved.name, to: dst.name, sameCategory: src === dst };
        });
    }
    function moveEntryBefore(entryId, fromCategoryId, toCategoryId, targetEntryId) {
        if (!entryId || entryId === targetEntryId) return null;
        return mutate((cats) => {
            const src = cats.find((c) => c.id === fromCategoryId);
            const dst = cats.find((c) => c.id === toCategoryId);
            if (!src || !dst) return false;
            const from = src.entries.findIndex((e) => e.id === entryId);
            if (from === -1) return false;
            const [moved] = src.entries.splice(from, 1);
            const to = dst.entries.findIndex((e) => e.id === targetEntryId);
            if (to === -1) dst.entries.push(moved);
            else dst.entries.splice(to, 0, moved);
            return { id: entryId, name: moved.name, to: dst.name, sameCategory: src === dst };
        });
    }
    function exportJson() {
        return JSON.stringify(read(), null, 2);
    }
    function importJson(text) {
        let parsed;
        try { parsed = JSON.parse(text); } catch (e) { throw new Error('That is not valid JSON.'); }
        if (!Array.isArray(parsed)) {
            throw new Error('A DNA Library file is a JSON array of categories.');
        }
        const incoming = parsed.map((cat) => {
            const norm = normalizeCategory(cat);
            if (!norm) throw new Error('One of the categories has no name.');
            return {
                id: generateId(),
                name: norm.name,
                entries: norm.entries.map((e) => ({ id: generateId(), name: e.name, dnaText: e.dnaText }))
            };
        });
        mutate((cats) => { for (const cat of incoming) cats.push(cat); return incoming.length; });
        return {
            categories: incoming.length,
            entries: incoming.reduce((n, c) => n + c.entries.length, 0)
        };
    }
    function replaceAll(categories) {
        const clean = (Array.isArray(categories) ? categories : []).map(normalizeCategory).filter(Boolean);
        return commit(clean.length ? clean : [{ id: generateId(), name: 'Default', entries: [] }]);
    }
    function onChange(fn) {
        listeners.add(fn);
        ensureChannel();
        return () => listeners.delete(fn);
    }
    function close() {
        if (channel) { try { channel.close(); } catch (e) {   } channel = null; }
        listeners.clear();
    }
    return {
        STORAGE_KEY, CHANNEL_NAME, EXPORT_FILENAME,
        LEGACY_SIMPR_KEY, LEGACY_STUDIO_KEY,
        generateId,
        all, getCategory, findEntry, counts, search,
        addCategory, renameCategory, removeCategory, moveCategory,
        addEntry, addEntries, renameEntry, removeEntry, moveEntryToCategory, moveEntryBefore,
        exportJson, importJson, replaceAll,
        onChange, close
    };
});
