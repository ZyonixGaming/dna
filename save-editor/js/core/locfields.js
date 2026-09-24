'use strict';
(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        global.LocFields = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    const DEFAULT_URL = './data/location-fields.json';
    const TYPES = new Set(['u32', 'i32', 'f32', 'u8', 'bool']);
    const SIZES = { u32: 4, i32: 4, f32: 4, u8: 1, bool: 4 };
    const NO_OWNER_FLAG = new Set([0, 13]);
    const STABLE_MIN = 1, STABLE_MAX = 12;
    let cache = null;
    function extraStartDelta(index, ownerFlag) {
        if (index === null || index === undefined) return null;
        if (NO_OWNER_FLAG.has(index)) return null;
        if (ownerFlag !== 1) return 4;
        return 4 + ((index >= STABLE_MIN && index <= STABLE_MAX) ? 480 : 240);
    }
    function normalizeField(raw, where) {
        if (!raw || typeof raw !== 'object') return null;
        const type = TYPES.has(raw.type) ? raw.type : 'u32';
        const offset = Number(raw.offset);
        if (!Number.isInteger(offset) || offset < 0) {
            throw new Error(where + ': a field has no usable `offset`.');
        }
        if (!raw.label) throw new Error(where + ' +' + offset + ': a field has no `label`.');
        return {
            offset, type, size: SIZES[type],
            anchor: raw.anchor === 'tail' ? 'tail' : 'extra',
            label: String(raw.label),
            note: raw.note ? String(raw.note) : '',
            min: raw.min === undefined ? null : Number(raw.min),
            max: raw.max === undefined ? null : Number(raw.max),
            readOnly: !!raw.readOnly,
            confirmed: raw.confirmed === true
        };
    }
    function fromJson(doc) {
        const ranges = [];
        const singles = new Map();
        const src = (doc && doc.locations) || {};
        for (const key of Object.keys(src)) {
            const entry = src[key];
            const fields = (entry && Array.isArray(entry.fields) ? entry.fields : [])
                .map((f) => normalizeField(f, 'location ' + key))
                .filter(Boolean)
                .sort((a, b) => a.offset - b.offset);
            const m = /^(\d+)\s*-\s*(\d+)$/.exec(key);
            if (m) { ranges.push({ lo: Number(m[1]), hi: Number(m[2]), fields }); continue; }
            const idx = Number(key);
            if (!Number.isInteger(idx)) throw new Error('location-fields.json: bad key "' + key + '".');
            singles.set(idx, fields);
        }
        const out = new Map();
        for (const r of ranges) for (let i = r.lo; i <= r.hi; i++) out.set(i, r.fields);
        for (const [i, f] of singles) out.set(i, f);
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
                .then((d) => { cache = fromJson(d); return cache; });
        }
        const fs = require('fs');
        const path = require('path');
        const file = url || path.join(__dirname, '..', '..', 'data', 'location-fields.json');
        cache = fromJson(JSON.parse(fs.readFileSync(file, 'utf8')));
        return Promise.resolve(cache);
    }
    function loaded() { return !!cache; }
    function forIndex(index) { return (cache && cache.get(index)) || []; }
    function resolve(loc) {
        if (!loc || loc.tailStart === null || loc.tailStart === undefined) return [];
        const fields = forIndex(loc.index);
        if (!fields.length) return [];
        const delta = extraStartDelta(loc.index, loc.ownerFlag);
        const tailEnd = (loc.tailEnd === null || loc.tailEnd === undefined) ? Infinity : loc.tailEnd;
        const out = [];
        for (const f of fields) {
            let base;
            if (f.anchor === 'tail') base = loc.tailStart;
            else if (delta === null) continue;
            else base = loc.tailStart + delta;
            const offsetAbs = base + f.offset;
            if (offsetAbs < loc.tailStart || offsetAbs + f.size > tailEnd) continue;
            out.push(Object.assign({}, f, { offsetAbs }));
        }
        return out;
    }
    function read(field, readByte) {
        const buf = new ArrayBuffer(4);
        const u8 = new Uint8Array(buf);
        for (let i = 0; i < field.size; i++) u8[i] = readByte(field.offsetAbs + i) & 0xFF;
        const dv = new DataView(buf);
        switch (field.type) {
            case 'u8': return u8[0];
            case 'i32': return dv.getInt32(0, true);
            case 'f32': return dv.getFloat32(0, true);
            case 'bool': return dv.getUint32(0, true) !== 0;
            default: return dv.getUint32(0, true);
        }
    }
    function encode(field, value) {
        const buf = new ArrayBuffer(4);
        const dv = new DataView(buf);
        if (field.type === 'bool') {
            dv.setUint32(0, value ? 1 : 0, true);
        } else if (field.type === 'f32') {
            let v = Number(value);
            if (!Number.isFinite(v)) v = 0;
            if (field.min !== null) v = Math.max(field.min, v);
            if (field.max !== null) v = Math.min(field.max, v);
            dv.setFloat32(0, v, true);
        } else {
            let v = Math.round(Number(value));
            if (!Number.isFinite(v)) v = 0;
            if (field.min !== null) v = Math.max(field.min, v);
            if (field.max !== null) v = Math.min(field.max, v);
            if (field.type === 'i32') dv.setInt32(0, v | 0, true);
            else if (field.type === 'u8') dv.setUint8(0, v & 0xFF);
            else dv.setUint32(0, v >>> 0, true);
        }
        return new Uint8Array(buf, 0, field.size);
    }
    return { load, loaded, fromJson, forIndex, resolve, read, encode, extraStartDelta, TYPES, SIZES };
});
