'use strict';
(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('./savefile.js'));
    } else {
        global.BioVat = factory(global.SaveFile);
    }
})(typeof window !== 'undefined' ? window : globalThis, function (SaveFile) {
    const { VAT_COUNT_OFFSET, VAT_MATRIX_OFFSET, VAT_GENES, VAT_BASES, CODESET } = SaveFile;
    const DOOR_OFFSET = VAT_COUNT_OFFSET + 4;
    const CELLS = VAT_GENES * VAT_BASES;
    const TAIL_LENGTH = VAT_MATRIX_OFFSET + 4 * CELLS;
    const BIOHACKER_INDEX = 31;
    const FULL = 0xF;
    const LETTER_BIT = { A: 1, C: 2, G: 4, T: 8 };
    const BIT_LETTER = ['A', 'C', 'G', 'T'];
    function popcount4(m) { return (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1); }
    function empty() { return new Uint8Array(VAT_GENES); }
    function everything() { return new Uint8Array(VAT_GENES).fill(FULL); }
    function clone(vat) { return Uint8Array.from(check(vat)); }
    function check(vat) {
        if (!vat || vat.length !== VAT_GENES) {
            throw new Error('A vat is ' + VAT_GENES + ' gene masks, got ' + (vat ? vat.length : 0) + '.');
        }
        for (let i = 0; i < VAT_GENES; i++) {
            const m = vat[i];
            if (!Number.isInteger(m) || m < 0 || m > FULL) {
                throw new Error('Gene ' + i + ' has mask ' + m + '; a vat mask is 0..15.');
            }
        }
        return vat;
    }
    function equals(a, b) {
        check(a); check(b);
        for (let i = 0; i < VAT_GENES; i++) if (a[i] !== b[i]) return false;
        return true;
    }
    function diffCount(a, b) {
        check(a); check(b);
        let n = 0;
        for (let i = 0; i < VAT_GENES; i++) n += popcount4(a[i] ^ b[i]);
        return n;
    }
    function cellCount(vat) {
        check(vat);
        let n = 0;
        for (let i = 0; i < VAT_GENES; i++) n += popcount4(vat[i]);
        return n;
    }
    function effByte(doc, off) {
        const p = doc.patches;
        return (p && p.has(off)) ? p.get(off) : doc.state.bytes[off];
    }
    function effU32(doc, off) {
        return (effByte(doc, off) | (effByte(doc, off + 1) << 8) |
            (effByte(doc, off + 2) << 16) | (effByte(doc, off + 3) << 24)) >>> 0;
    }
    function unavailableReason(doc) {
        const st = doc && doc.state;
        if (!st || !st.locations) return 'No save is loaded.';
        const loc = st.locations.find((l) => l && l.index === BIOHACKER_INDEX);
        if (!loc) return 'This save has no Bio-Hacker.';
        if (typeof doc.locationDeleted === 'function' ? doc.locationDeleted(loc)
            : (doc.deletedLocations && doc.deletedLocations.has(BIOHACKER_INDEX))) {
            return 'The Bio-Hacker is queued for deletion.';
        }
        if (loc.tailStart + TAIL_LENGTH > st.bytes.length) return 'The Bio-Hacker record is truncated.';
        const owner = effU32(doc, loc.tailStart);
        if (owner !== 1) return 'The Bio-Hacker has owner flag ' + owner + ', a layout this editor does not know.';
        return null;
    }
    function findLocation(doc) {
        if (unavailableReason(doc) !== null) return null;
        return doc.state.locations.find((l) => l && l.index === BIOHACKER_INDEX);
    }
    function read(doc) {
        const loc = findLocation(doc);
        if (!loc) return null;
        const base = loc.tailStart + VAT_MATRIX_OFFSET;
        const vat = new Uint8Array(VAT_GENES);
        for (let g = 0; g < VAT_GENES; g++) {
            let m = 0;
            for (let k = 0; k < VAT_BASES; k++) {
                if (effU32(doc, base + 4 * (g * VAT_BASES + k)) !== 0) m |= (1 << k);
            }
            vat[g] = m;
        }
        return vat;
    }
    function readCount(doc) {
        const loc = findLocation(doc);
        return loc ? effU32(doc, loc.tailStart + VAT_COUNT_OFFSET) : null;
    }
    function readDoor(doc) {
        const loc = findLocation(doc);
        return loc ? effU32(doc, loc.tailStart + DOOR_OFFSET) : null;
    }
    function putU32(out, at, v) {
        out[at] = v & 0xFF; out[at + 1] = (v >>> 8) & 0xFF;
        out[at + 2] = (v >>> 16) & 0xFF; out[at + 3] = (v >>> 24) & 0xFF;
    }
    function planWrite(doc, vat) {
        check(vat);
        const loc = findLocation(doc);
        if (!loc) throw new Error(unavailableReason(doc) || 'This save has no Bio-Hacker.');
        const cur = read(doc);
        let last = -1, changedCells = 0;
        for (let g = 0; g < VAT_GENES; g++) {
            const x = cur[g] ^ vat[g];
            if (!x) continue;
            changedCells += popcount4(x);
            for (let k = VAT_BASES - 1; k >= 0; k--) {
                if (x & (1 << k)) { last = Math.max(last, g * VAT_BASES + k); break; }
            }
        }
        if (last < 0) return null;
        const t = loc.tailStart;
        const offset = t + VAT_COUNT_OFFSET;
        const length = (VAT_MATRIX_OFFSET - VAT_COUNT_OFFSET) + 4 * (last + 1);
        const out = new Uint8Array(length);
        const count = cellCount(vat);
        putU32(out, 0, count);
        for (let i = 4; i < VAT_MATRIX_OFFSET - VAT_COUNT_OFFSET; i++) out[i] = effByte(doc, offset + i);
        for (let c = 0; c <= last; c++) {
            const g = (c / VAT_BASES) | 0, k = c % VAT_BASES;
            const at = (VAT_MATRIX_OFFSET - VAT_COUNT_OFFSET) + 4 * c;
            const want = (vat[g] >> k) & 1, had = (cur[g] >> k) & 1;
            if (want === had) {
                for (let b = 0; b < 4; b++) out[at + b] = effByte(doc, offset + at + b);
            } else {
                putU32(out, at, want);
            }
        }
        return { offset, bytes: out, count, changedCells };
    }
    function writeBatch(doc, vat, label) {
        const plan = planWrite(doc, vat);
        if (!plan) return { changed: false, count: readCount(doc), changedCells: 0, offset: null, length: 0 };
        doc._patchBatch(plan.offset, plan.bytes, label || ('Edited the Bio-Hacker vat (' + plan.count + ' of ' + CELLS + ' cells)'));
        return { changed: true, count: plan.count, changedCells: plan.changedCells, offset: plan.offset, length: plan.bytes.length };
    }
    function byteMask(byte) {
        if (!CODESET.has(byte)) return 0;
        const n1 = byte % 8, n2 = (byte - n1) / 8;
        return (1 << (n1 - 1)) | (1 << (n2 - 1));
    }
    function checkGenome(bytes) {
        if (!bytes || bytes.length !== VAT_GENES) {
            throw new Error('A genome is ' + VAT_GENES + ' bytes, got ' + (bytes ? bytes.length : 0) + '.');
        }
    }
    function addGenome(vat, geneTable, genomeBytes) {
        const out = clone(vat);
        checkGenome(genomeBytes);
        for (let g = 0; g < VAT_GENES; g++) out[g] |= byteMask(genomeBytes[g]);
        return out;
    }
    function fromGenome(geneTable, genomeBytes) { return addGenome(empty(), geneTable, genomeBytes); }
    function removeGenome(vat, geneTable, genomeBytes) {
        const out = clone(vat);
        checkGenome(genomeBytes);
        for (let g = 0; g < VAT_GENES; g++) out[g] &= ~byteMask(genomeBytes[g]) & FULL;
        return out;
    }
    function popWeights(config, gene) {
        const w = config && Object.prototype.hasOwnProperty.call(config, gene.desc) ? config[gene.desc] : null;
        return (w && w.some((v) => v > 0)) ? w : [1, 0, 0, 0];
    }
    function addPopulation(vat, geneTable, popTable, popName) {
        const out = clone(vat);
        if (!popTable || !popTable.has(popName)) throw new Error('No population named "' + popName + '".');
        const config = popTable.get(popName);
        for (let g = 0; g < VAT_GENES; g++) {
            const w = popWeights(config, geneTable.get(g));
            for (let k = 0; k < VAT_BASES; k++) if (w[k] > 0) out[g] |= (1 << k);
        }
        return out;
    }
    function populationLacks(vat, geneTable, popTable, popName) {
        check(vat);
        const config = popTable && popTable.get(popName);
        if (!config) return null;
        let n = 0;
        for (let g = 0; g < VAT_GENES; g++) {
            const w = popWeights(config, geneTable.get(g));
            let need = 0;
            for (let k = 0; k < VAT_BASES; k++) if (w[k] > 0) need |= (1 << k);
            if (need & ~vat[g]) n++;
        }
        return n;
    }
    function sample(vat, geneTable, opts) {
        check(vat);
        opts = opts || {};
        const rng = opts.rng || Math.random;
        const base = opts.base || null;
        if (base) checkGenome(base);
        const bytes = new Uint8Array(VAT_GENES);
        const emptyIds = [];
        for (let g = 0; g < VAT_GENES; g++) {
            const m = vat[g];
            if (!m) {
                emptyIds.push(g);
                bytes[g] = base ? base[g] : 9;
                continue;
            }
            const cols = [];
            for (let k = 0; k < VAT_BASES; k++) if (m & (1 << k)) cols.push(k);
            const s1 = cols[Math.floor(rng() * cols.length)];
            const s2 = cols[Math.floor(rng() * cols.length)];
            bytes[g] = (s2 + 1) * 8 + (s1 + 1);
        }
        return { bytes, emptyGenes: emptyIds.length, emptyIds };
    }
    function stats(vat, opts) {
        check(vat);
        const genes = [0, 0, 0, 0, 0];
        let cells = 0;
        for (let g = 0; g < VAT_GENES; g++) { const c = popcount4(vat[g]); genes[c]++; cells += c; }
        const out = {
            cells, total: CELLS, genes,
            emptyGenes: genes[0],
            isEmpty: genes[0] === VAT_GENES,
            isFull: cells === CELLS,
            isPartial: genes[0] > 0 && genes[0] < VAT_GENES
        };
        if (opts && opts.popTable && opts.popName) {
            out.popLacks = populationLacks(vat, opts.geneTable, opts.popTable, opts.popName);
        }
        return out;
    }
    function isPartial(vat) {
        check(vat);
        let zero = 0;
        for (let g = 0; g < VAT_GENES; g++) if (!vat[g]) zero++;
        return zero > 0 && zero < VAT_GENES;
    }
    function fillEmpty(vat) {
        const out = clone(vat);
        for (let g = 0; g < VAT_GENES; g++) if (!out[g]) out[g] = 1;
        return out;
    }
    const HEX_RE = /^[0-9a-fA-F]{240}$/;
    function isLetterString(str) { return typeof str === 'string' && HEX_RE.test(str); }
    function toLetters(vat, geneTable) {
        check(vat);
        let s = '';
        for (let g = 0; g < VAT_GENES; g++) {
            const n = geneTable.get(g).n;
            let m = 0;
            for (let k = 0; k < VAT_BASES; k++) {
                if (vat[g] & (1 << k)) m |= LETTER_BIT[n[k]] || 0;
            }
            s += m.toString(16);
        }
        return s;
    }
    function fromLetters(str, geneTable) {
        if (!isLetterString(str)) throw new Error('A vat profile is ' + VAT_GENES + ' hex digits.');
        const vat = new Uint8Array(VAT_GENES);
        for (let g = 0; g < VAT_GENES; g++) {
            const lm = parseInt(str[g], 16);
            const n = geneTable.get(g).n;
            let m = 0;
            for (let b = 0; b < 4; b++) {
                if (!(lm & (1 << b))) continue;
                const k = n.indexOf(BIT_LETTER[b]);
                if (k >= 0 && k < VAT_BASES) m |= (1 << k);
            }
            vat[g] = m;
        }
        return vat;
    }
    function lettersAt(vat, geneTable, geneId) {
        const n = geneTable.get(geneId).n;
        let s = '';
        for (let k = 0; k < VAT_BASES; k++) if (vat[geneId] & (1 << k)) s += n[k];
        return s;
    }
    return {
        BIOHACKER_INDEX, CELLS, TAIL_LENGTH, DOOR_OFFSET, LETTER_BIT,
        empty, everything, clone, equals, diffCount, cellCount,
        unavailableReason, findLocation, read, readCount, readDoor, planWrite, writeBatch,
        byteMask, addGenome, fromGenome, removeGenome, addPopulation, populationLacks,
        sample, stats, isPartial, fillEmpty,
        isLetterString, toLetters, fromLetters, lettersAt
    };
});
