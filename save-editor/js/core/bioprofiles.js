'use strict';
(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        global.BioProfiles = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const KEY = 'horsey_studio_biohack_profiles';
    const CHANNEL = 'horsey-studio-biohack-sync';
    const EXPORT_FILENAME = 'biohack_profiles.json';
    const EVERYTHING_ID = 'everything';
    const EVERYTHING_NAME = '★ Everything';
    const GENES = 240;
    const HEX_RE = /^[0-9a-fA-F]{240}$/;
    const EVERYTHING_BASES = 'f'.repeat(GENES);
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }
    function everythingProfile() {
        return { id: EVERYTHING_ID, name: EVERYTHING_NAME, bases: EVERYTHING_BASES, builtin: true };
    }
    function isEverything(id) { return id === EVERYTHING_ID; }
    function isValidBases(bases) { return typeof bases === 'string' && HEX_RE.test(bases); }
    function cellCount(bases) {
        if (!isValidBases(bases)) return 0;
        let n = 0;
        for (let i = 0; i < GENES; i++) {
            let m = parseInt(bases[i], 16);
            while (m) { n += m & 1; m >>= 1; }
        }
        return n;
    }
    let memory = null;
    const listeners = new Set();
    let channel = null;
    let storageListener = null;
    function store() {
        try {
            if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
        } catch (e) {   }
        return null;
    }
    function readRaw() {
        const s = store();
        if (!s) return memory;
        try { return s.getItem(KEY); } catch (e) { return null; }
    }
    function writeRaw(value) {
        const s = store();
        if (!s) { memory = value; return; }
        try { s.setItem(KEY, value); } catch (e) { memory = value; }
    }
    function normalize(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const name = typeof raw.name === 'string' ? raw.name.trim() : '';
        if (!name || !isValidBases(raw.bases)) return null;
        const id = (typeof raw.id === 'string' && raw.id && !isEverything(raw.id)) ? raw.id : generateId();
        return { id, name, bases: raw.bases.toLowerCase() };
    }
    function parseList(raw) {
        if (!raw) return [];
        let parsed;
        try { parsed = JSON.parse(raw); } catch (e) { return []; }
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalize).filter(Boolean);
    }
    function readStored() { return parseList(readRaw()); }
    function withEverything(list) { return [everythingProfile()].concat(list); }
    function emit(list, origin) {
        const full = withEverything(list);
        for (const fn of listeners) {
            try { fn(full, origin); } catch (e) {   }
        }
    }
    function ensureChannel() {
        if (!channel && typeof BroadcastChannel !== 'undefined') {
            try {
                channel = new BroadcastChannel(CHANNEL);
                channel.onmessage = (event) => {
                    const data = event && event.data;
                    if (!data || data.type !== 'update') return;
                    const next = Array.isArray(data.profiles)
                        ? data.profiles.map(normalize).filter(Boolean)
                        : readStored();
                    emit(next, 'remote');
                };
            } catch (e) { channel = null; }
        }
        if (!storageListener && typeof window !== 'undefined' && window && typeof window.addEventListener === 'function') {
            storageListener = (e) => { if (e && e.key === KEY) emit(readStored(), 'remote'); };
            try { window.addEventListener('storage', storageListener); } catch (e) { storageListener = null; }
        }
        return channel;
    }
    function commit(list) {
        writeRaw(JSON.stringify(list));
        const ch = ensureChannel();
        if (ch) {
            try { ch.postMessage({ type: 'update', profiles: JSON.parse(JSON.stringify(list)) }); }
            catch (e) {   }
        }
        emit(list, 'local');
        return list;
    }
    function mutate(fn) {
        const list = readStored();
        const result = fn(list);
        if (result === false) return null;
        commit(list);
        return result;
    }
    function cleanName(name) {
        const clean = String(name == null ? '' : name).trim();
        if (!clean) throw new Error('A profile needs a name.');
        return clean;
    }
    function cleanBases(bases) {
        if (!isValidBases(bases)) throw new Error('A profile is ' + GENES + ' hex digits, one per gene.');
        return bases.toLowerCase();
    }
    function all() { return withEverything(readStored()); }
    function get(id) {
        if (isEverything(id)) return everythingProfile();
        return readStored().find((p) => p.id === id) || null;
    }
    function create(name, bases) {
        const p = { id: generateId(), name: cleanName(name), bases: cleanBases(bases) };
        mutate((list) => { list.push(p); return p; });
        return p;
    }
    function update(id, bases) {
        if (isEverything(id)) return false;
        const next = cleanBases(bases);
        return mutate((list) => {
            const p = list.find((x) => x.id === id);
            if (!p) return false;
            let changed = 0;
            for (let i = 0; i < GENES; i++) {
                let m = parseInt(p.bases[i], 16) ^ parseInt(next[i], 16);
                while (m) { changed += m & 1; m >>= 1; }
            }
            p.bases = next;
            return { id, name: p.name, changed };
        });
    }
    function rename(id, name) {
        if (isEverything(id)) return false;
        const clean = cleanName(name);
        return mutate((list) => {
            const p = list.find((x) => x.id === id);
            if (!p) return false;
            const was = p.name;
            p.name = clean;
            return { id, from: was, to: clean };
        });
    }
    function remove(id) {
        if (isEverything(id)) return false;
        return mutate((list) => {
            const at = list.findIndex((x) => x.id === id);
            if (at === -1) return false;
            const [gone] = list.splice(at, 1);
            return { id, name: gone.name };
        });
    }
    function duplicate(id, name) {
        const src = get(id);
        if (!src) return null;
        const baseName = src.name.replace(/^★\s*/, '');
        const p = {
            id: generateId(),
            name: (name != null && String(name).trim()) ? cleanName(name) : baseName + ' copy',
            bases: src.bases
        };
        const ok = mutate((list) => {
            if (isEverything(id)) { list.unshift(p); return p; }
            const at = list.findIndex((x) => x.id === id);
            if (at === -1) return false;
            list.splice(at + 1, 0, p);
            return p;
        });
        return ok;
    }
    function move(id, beforeId) {
        if (isEverything(id)) return false;
        if (!id || id === beforeId) return null;
        return mutate((list) => {
            const from = list.findIndex((x) => x.id === id);
            if (from === -1) return false;
            const [moved] = list.splice(from, 1);
            let to;
            if (beforeId === null || beforeId === undefined) to = list.length;
            else if (isEverything(beforeId)) to = 0;
            else to = list.findIndex((x) => x.id === beforeId);
            if (to === -1) list.splice(from, 0, moved);
            else list.splice(to, 0, moved);
            return { id, name: moved.name };
        });
    }
    function exportJson() { return JSON.stringify(readStored(), null, 2); }
    function importJson(text) {
        let parsed;
        try { parsed = JSON.parse(text); } catch (e) { throw new Error('That is not valid JSON.'); }
        if (!Array.isArray(parsed)) throw new Error('A profile file is a JSON array of profiles.');
        const incoming = parsed.map((raw, i) => {
            const norm = normalize(raw);
            if (!norm) throw new Error('Profile ' + (i + 1) + ' needs a name and ' + GENES + ' hex digits of bases.');
            return { id: generateId(), name: norm.name, bases: norm.bases };
        });
        mutate((list) => { for (const p of incoming) list.push(p); return incoming.length; });
        return { profiles: incoming.length };
    }
    function onChange(fn) {
        listeners.add(fn);
        ensureChannel();
        return () => listeners.delete(fn);
    }
    function close() {
        if (channel) { try { channel.close(); } catch (e) {   } channel = null; }
        if (storageListener) {
            try { window.removeEventListener('storage', storageListener); } catch (e) {   }
            storageListener = null;
        }
        listeners.clear();
    }
    return {
        KEY, CHANNEL, EXPORT_FILENAME, EVERYTHING_ID, EVERYTHING_NAME, EVERYTHING_BASES,
        generateId, isValidBases, cellCount, isEverything,
        all, get, create, update, rename, remove, duplicate, move,
        exportJson, importJson, onChange, close
    };
});
