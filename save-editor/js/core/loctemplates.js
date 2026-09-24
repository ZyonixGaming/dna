(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        global.LocTemplates = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    const DEFAULT_URL = './data/location-templates.json';
    let cache = null;
    const UI_LABELS = { 38: 'Secret Cave' };
    const TRUCK_CONTAINER_NAME = 'unknown';
    function labelFor(index, storedName) {
        if (storedName) return storedName;
        return UI_LABELS[index] || '';
    }
    function displayName(index, storedName) {
        if (storedName === TRUCK_CONTAINER_NAME) return 'In Truck';
        return labelFor(index, storedName) || '(unnamed location)';
    }
    function decodeBase64(b64) {
        if (typeof Buffer !== 'undefined') {
            const buf = Buffer.from(b64, 'base64');
            return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        }
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function fromJson(doc) {
        const out = new Map();
        for (const key of Object.keys(doc.templates || {})) {
            const t = doc.templates[key];
            out.set(Number(key), {
                index: t.index,
                name: t.name,
                label: labelFor(t.index, t.name),
                body: decodeBase64(t.body),
                tailLength: t.tailLength,
                ownerState: t.ownerState >>> 0,
                hasOwner: !!t.hasOwner,
                hasChampion: !!t.hasChampion,
                bookies: t.bookies | 0,
                unstaffed: !!t.unstaffed,
                attestedForms: t.attestedForms || [],
                minCrowd: t.minCrowd | 0,
                maxCrowd: t.maxCrowd | 0,
                crowd: t.crowd | 0,
                crowdBytes: t.crowdBytes ? decodeBase64(t.crowdBytes) : new Uint8Array(0),
                crowdRecords: (t.crowdRecords || []).map((cr) => ({
                    name: cr.name || '',
                    fixed: decodeBase64(cr.fixed)
                })),
                interior: t.interior ? {
                    count: t.interior.count | 0,
                    hdr: t.interior.hdr | 0,
                    bytes: decodeBase64(t.interior.bytes),
                    withDna: t.interior.withDna | 0,
                    source: t.interior.source
                } : null,
                source: t.source
            });
        }
        return out;
    }
    function load(url) {
        if (cache) return Promise.resolve(cache);
        const target = url || DEFAULT_URL;
        if (typeof fetch === 'function' && typeof window !== 'undefined') {
            return fetch(target)
                .then((r) => {
                    if (!r.ok) throw new Error('Could not load ' + target + ' (HTTP ' + r.status + ')');
                    return r.json();
                })
                .then((doc) => { cache = fromJson(doc); return cache; });
        }
        const fs = require('fs');
        const path = require('path');
        const file = url || path.join(__dirname, '..', '..', 'data', 'location-templates.json');
        cache = fromJson(JSON.parse(fs.readFileSync(file, 'utf8')));
        return Promise.resolve(cache);
    }
    function get(index) {
        return (cache && cache.get(index)) || null;
    }
    function loaded() { return !!cache; }
    function label(index, storedName) { return labelFor(index, storedName); }
    function all() { return cache ? [...cache.values()] : []; }
    return { load, get, loaded, all, fromJson, label, displayName, UI_LABELS, TRUCK_CONTAINER_NAME };
});
