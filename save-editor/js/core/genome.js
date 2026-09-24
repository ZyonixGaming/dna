'use strict';
(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('./savefile.js'), require('./genedata.js'));
    } else {
        global.Genome = factory(global.SaveFile, global.GeneData);
    }
})(typeof window !== 'undefined' ? window : globalThis, function (SaveFile, GeneData) {
    const { CODESET, GENOME_LEN } = SaveFile;
    const { GENE_MAP, HELIX_LENGTHS, HELIX_COUNT, HELIX_MAP } = GeneData;
    function pairToByte(gene, pair) {
        if (!gene || !gene.n || !pair || pair.length !== 2) return null;
        const n1 = gene.n.indexOf(pair[0]) + 1;
        const n2 = gene.n.indexOf(pair[1]) + 1;
        if (n1 <= 0 || n2 <= 0) return null;
        return n2 * 8 + n1;
    }
    function byteToPair(gene, byte) {
        if (!gene || !gene.n || !CODESET.has(byte)) return null;
        const n1 = byte % 8;
        const n2 = (byte - n1) / 8;
        return gene.n[n1 - 1] + gene.n[n2 - 1];
    }
    function byteToValue(gene, byte) {
        if (!gene || !CODESET.has(byte)) return null;
        const n1 = byte % 8;
        const n2 = (byte - n1) / 8;
        return gene.valueMatrix[n1 - 1][n2 - 1];
    }
    function decodeGenome(geneTable, genomeBytes) {
        if (genomeBytes.length !== GENOME_LEN) throw new Error('genome must be exactly ' + GENOME_LEN + ' bytes, got ' + genomeBytes.length);
        const genome = new Array(HELIX_COUNT);
        for (let h = 0; h < HELIX_COUNT; h++) {
            const row = GENE_MAP[h];
            let s1 = '', s2 = '';
            for (let p = 0; p < row.length; p++) {
                const rawIndex = row[p];
                const gene = geneTable.get(rawIndex);
                const pair = byteToPair(gene, genomeBytes[rawIndex]);
                s1 += pair ? pair[0] : '?';
                s2 += pair ? pair[1] : '?';
            }
            genome[h] = [s1, s2];
        }
        return genome;
    }
    function encodeGenome(geneTable, genome, baseBytes) {
        const out = baseBytes ? Uint8Array.from(baseBytes) : new Uint8Array(GENOME_LEN);
        for (let h = 0; h < HELIX_COUNT; h++) {
            const row = GENE_MAP[h];
            const [s1, s2] = genome[h] || ['', ''];
            for (let p = 0; p < row.length; p++) {
                const rawIndex = row[p];
                const gene = geneTable.get(rawIndex);
                const pair = (s1[p] || '') + (s2[p] || '');
                const byte = pairToByte(gene, pair);
                if (byte !== null) out[rawIndex] = byte;
            }
        }
        return out;
    }
    function describeGenome(geneTable, genomeBytes) {
        const out = new Array(GENOME_LEN);
        for (let id = 0; id < GENOME_LEN; id++) {
            const gene = geneTable.get(id);
            const byte = genomeBytes[id];
            out[id] = {
                id, h: gene.h, p: gene.p, desc: gene.desc,
                byte, pair: byteToPair(gene, byte), value: byteToValue(gene, byte)
            };
        }
        return out;
    }
    const VALID_BASE_RE = /[^ATCG]/g;
    function sanitizeSequence(value) {
        return String(value || '').toUpperCase().replace(VALID_BASE_RE, '');
    }
    function normalizeGenome(genome) {
        return genome.map(([s1 = '', s2 = '']) => [sanitizeSequence(s1), sanitizeSequence(s2)]);
    }
    function parseGenomeText(text) {
        const genome = [...Array(HELIX_COUNT)].map(() => Array(2));
        const lines = String(text || '').trim().split('\n').map((l) => l.trim()).filter(Boolean);
        const labelMap = new Map();
        let nextAuto = 0;
        const getHelixIndex = (raw) => {
            const label = String(raw).toUpperCase();
            if (/^\d{1,2}$/.test(label)) {
                const i = Number.parseInt(label, 10);
                return i >= 0 && i < HELIX_COUNT ? i : -1;
            }
            if (!labelMap.has(label)) {
                if (nextAuto >= HELIX_COUNT) return -1;
                labelMap.set(label, nextAuto++);
            }
            return labelMap.get(label);
        };
        const patterns = {
            newFormat: /^([A-Za-z0-9]+)\s*:\s*([atcg]+)$/i,
            numbered: /^(\d{1,2})\s*:\s*([atcg]+)$/i,
            verboseBoth: /^helix\s*([A-Za-z0-9]+)[^:)]*[:)]\s*([atcg]+)\s*:\s*(?:second\s*strand|strand\s*2)[^:]*:\s*([atcg]+)$/i,
            verboseFirst: /^helix\s*([A-Za-z0-9]+)[^:)]*[:)]\s*([atcg]+)$/i,
            verboseSecond: /^(?:second\s*strand|strand\s*2)[^:]*:\s*([atcg]+)$/i,
            bareStrand: /^[atcg]+$/i
        };
        function assign(i, seq) {
            if (i < 0 || i >= HELIX_COUNT) return;
            if (!genome[i][0]) genome[i][0] = seq; else genome[i][1] = seq;
        }
        let current = -1;
        for (const line of lines) {
            let m = line.match(patterns.newFormat);
            if (m) { assign(getHelixIndex(m[1]), m[2].toUpperCase()); continue; }
            m = line.match(patterns.numbered);
            if (m) { assign(Number.parseInt(m[1], 10), m[2].toUpperCase()); continue; }
            m = line.match(patterns.verboseBoth);
            if (m) {
                current = getHelixIndex(m[1]);
                if (current >= 0) { genome[current][0] = m[2].toUpperCase(); genome[current][1] = m[3].toUpperCase(); }
                continue;
            }
            m = line.match(patterns.verboseFirst);
            if (m) { current = getHelixIndex(m[1]); if (current >= 0) genome[current][0] = m[2].toUpperCase(); continue; }
            m = line.match(patterns.verboseSecond);
            if (m && current >= 0) { genome[current][1] = m[1].toUpperCase(); continue; }
            if (current >= 0 && !genome[current][1] && patterns.bareStrand.test(line)) genome[current][1] = line.toUpperCase();
        }
        return normalizeGenome(genome);
    }
    function formatGenomeText(genome) {
        const lines = [];
        genome.forEach(([s1, s2], i) => {
            const label = String(i).padStart(2, '0');
            if (s1) lines.push(label + ':' + s1);
            if (s2) lines.push(label + ':' + s2);
        });
        return lines.join('\n');
    }
    const BASE_TO_BITS = { A: 0, C: 1, G: 2, T: 3 };
    const BITS_TO_BASE = ['A', 'C', 'G', 'T'];
    const SHIFT = [6, 4, 2, 0];
    function uint8ToBase64url(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = (typeof btoa !== 'undefined' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64'));
        return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    function base64urlToUint8(str) {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        if (str.length % 4 === 1) throw new Error('Invalid DNA code length');
        while (str.length % 4) str += '=';
        const binary = (typeof atob !== 'undefined' ? atob(str) : Buffer.from(str, 'base64').toString('binary'));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
    function encodeGenomeUrl(genome) {
        let totalBases = 0;
        for (const [s1, s2] of genome) totalBases += s1.length + s2.length;
        const bytesNeeded = Math.ceil(totalBases * 2 / 8);
        const buffer = new Uint8Array(bytesNeeded);
        let bytePos = 0, bitPos = 0;
        const packBase = (ch) => {
            const bits = BASE_TO_BITS[ch];
            if (bits === undefined) throw new Error("Invalid base '" + ch + "'");
            buffer[bytePos] |= (bits << SHIFT[bitPos]);
            bitPos++;
            if (bitPos === 4) { bitPos = 0; bytePos++; }
        };
        for (const [s1, s2] of genome) {
            for (const ch of s1) packBase(ch);
            for (const ch of s2) packBase(ch);
        }
        return uint8ToBase64url(buffer);
    }
    function decodeGenomeUrl(token) {
        const bytes = base64urlToUint8(token);
        const GENE_COUNT = HELIX_LENGTHS.reduce((a, n) => a + n, 0);
        const requiredBytes = Math.ceil(GENE_COUNT * 4 / 8);
        if (bytes.length < requiredBytes) throw new Error('Encoded data too short for the expected genome length');
        const genome = new Array(HELIX_COUNT);
        let byteIdx = 0, bitIdx = 0;
        const nextBase = () => {
            const bits = (bytes[byteIdx] >> SHIFT[bitIdx]) & 0b11;
            bitIdx++;
            if (bitIdx === 4) { bitIdx = 0; byteIdx++; }
            return BITS_TO_BASE[bits];
        };
        for (let h = 0; h < HELIX_COUNT; h++) {
            const len = HELIX_LENGTHS[h];
            let s1 = '', s2 = '';
            for (let j = 0; j < len; j++) s1 += nextBase();
            for (let j = 0; j < len; j++) s2 += nextBase();
            genome[h] = [s1, s2];
        }
        return genome;
    }
    function encodeDnaCode(genome) {
        if (!Array.isArray(genome) || genome.length !== HELIX_COUNT) throw new Error('Exactly ' + HELIX_COUNT + ' helices are required.');
        for (let h = 0; h < HELIX_COUNT; h++) {
            const pair = genome[h] || [];
            for (let s = 0; s < 2; s++) {
                const seq = pair[s] || '';
                if (seq.length !== HELIX_LENGTHS[h]) throw new Error('Helix ' + pad2(h) + ' strand ' + (s + 1) + ' must have length ' + HELIX_LENGTHS[h] + ', got ' + seq.length);
            }
        }
        return encodeGenomeUrl(genome);
    }
    function decodeDnaCode(code) {
        return decodeGenomeUrl(String(code == null ? '' : code).trim());
    }
    function looksLikeDnaCode(text) {
        return /^[A-Za-z0-9_-]{100,}$/.test(String(text == null ? '' : text).trim());
    }
    function extractDnaParam(text) {
        const t = String(text == null ? '' : text).trim();
        const m = /[?&]dna=([A-Za-z0-9_-]+)/.exec(t) || /^dna=([A-Za-z0-9_-]+)/.exec(t);
        return m ? m[1] : null;
    }
    const pad2 = (h) => (h < 10 ? '0' : '') + h;
    const DEFAULT_ORDER = 'GATC';   
    function baseToModel(base, geneTable) {
        if (!base) return null;
        if (Array.isArray(base) && base.length === HELIX_COUNT && Array.isArray(base[0])) return base;
        if (base.length === GENOME_LEN && geneTable && typeof base[0] === 'number') return decodeGenome(geneTable, base);
        return null;
    }
    function normalizeGenomeInput(text, opts) {
        opts = opts || {};
        const geneTable = opts.geneTable || null;
        const raw = String(text == null ? '' : text);
        const repairs = [], warnings = [], errors = [];
        const baseModel = (() => { try { return baseToModel(opts.base, geneTable); } catch (e) { return null; } })();
        const baseBytes = opts.base && !Array.isArray(opts.base) && opts.base.length === GENOME_LEN ? opts.base : null;
        const finish = (genome, source) => {
            if (!genome) return { ok: false, source, genome: null, lines: null, text: null, bytes: null, repairs, warnings, errors };
            const lines = [];
            for (let h = 0; h < HELIX_COUNT; h++) lines.push(pad2(h) + ':' + genome[h][0], pad2(h) + ':' + genome[h][1]);
            let bytes = null;
            if (geneTable) { try { bytes = encodeGenome(geneTable, genome, baseBytes || undefined); } catch (e) { bytes = null; } }
            return { ok: true, source, genome, lines, text: lines.join('\n'), bytes, repairs, warnings, errors };
        };
        const repair = (helix, strand, kind, detail) => { repairs.push({ helix, strand, kind, detail }); warnings.push(detail); };
        const linkCode = extractDnaParam(raw);
        const code = linkCode || (looksLikeDnaCode(raw) ? raw.trim() : null);
        const codeSource = linkCode ? 'link' : 'code';
        if (code) {
            try { return finish(decodeDnaCode(code), codeSource); }
            catch (e) {
                if (!/[0-9]{1,2}\s*:/.test(raw)) {
                    errors.push('Could not decode the DNA code: ' + e.message);
                    return finish(null, codeSource);
                }
            }
        }
        const random = opts.random || Math.random;
        const strict = opts.fill === false;
        const geneN = (h, p) => {
            const g = geneTable && geneTable.get(GENE_MAP[h][p]);
            return g && g.n ? g.n : 'ACGT';
        };
        let strands = HELIX_LENGTHS.map(() => []);      
        let ignored = 0, extra = 0, found = 0;
        if (/^\s*(?:helix\s*[A-Za-z0-9]|second\s*strand|strand\s*2)/im.test(raw)) {
            let legacy = null;
            try { legacy = parseGenomeText(raw); } catch (e) { legacy = null; }
            const n = legacy ? legacy.reduce((k, [a, b]) => k + (a ? 1 : 0) + (b ? 1 : 0), 0) : 0;
            if (n) {
                strands = legacy.map(([a, b]) => (a ? (b ? [a, b] : [a]) : (b ? ['', b] : [])));
                found = n;
                repair(null, null, 'verbose-format', 'Read as the verbose "helix N: …" format.');
            }
        }
        if (!found) {
            const tokens = raw.toUpperCase().replace(/\s*:\s*/g, ':').split(/[^A-Z0-9:]+/).filter(Boolean);
            for (const tok of tokens) {
                const m = /^(\d{1,2}):([A-Z0-9]*)$/.exec(tok);
                if (!m) { ignored++; continue; }
                const h = parseInt(m[1], 10);
                if (h >= HELIX_COUNT) { ignored++; continue; }
                if (strands[h].length < 2) strands[h].push(m[2]);
                else extra++;
            }
            found = strands.reduce((n, s) => n + s.length, 0);
        }
        if (!found) {
            errors.push(raw.trim() ? 'No "HH:SEQUENCE" genome lines found.' : 'Genome is empty.');
            return finish(null, 'text');
        }
        if (ignored) repair(null, null, 'ignored-tokens', ignored + ' token' + (ignored === 1 ? '' : 's') + ' that are not genome lines were ignored.');
        if (extra) repair(null, null, 'extra-lines', extra + ' extra line' + (extra === 1 ? '' : 's') + ' beyond two per helix were ignored.');
        const fillFrom = baseModel ? 'the previous genome' : 'random bases';
        const fillBase = (h, s, p) => {
            if (baseModel) {
                const b = ((baseModel[h] || [])[s] || '').charAt(p);
                if ('ACGT'.indexOf(b) >= 0) return b;
            }
            return geneN(h, p).charAt(Math.floor(random() * 4));
        };
        let mapped = 0, odd = 0;
        const genome = new Array(HELIX_COUNT);
        for (let h = 0; h < HELIX_COUNT; h++) {
            const len = HELIX_LENGTHS[h];
            const given = strands[h];
            if (strict && given.length < 2) {
                errors.push(given.length === 0
                    ? 'Helix ' + pad2(h) + ' is missing (needs 2 lines).'
                    : 'Helix ' + pad2(h) + ' has only 1 line; it needs 2, one per strand.');
                continue;
            }
            if (given.length === 0) repair(h, null, 'missing-helix', 'Helix ' + pad2(h) + ' missing; taken from ' + fillFrom + '.');
            else if (given.length === 1) repair(h, 2, 'missing-strand', 'Helix ' + pad2(h) + ' has one strand; the second is taken from ' + fillFrom + '.');
            const pair = ['', ''];
            for (let s = 0; s < 2; s++) {
                const seq = given[s];
                let out = '';
                if (seq === undefined) {
                    for (let p = 0; p < len; p++) out += fillBase(h, s, p);
                } else {
                    const n = Math.min(seq.length, len);
                    for (let p = 0; p < n; p++) {
                        const c = seq.charAt(p);
                        if ('ACGT'.indexOf(c) >= 0) out += c;
                        else if (c >= '0' && c <= '3') { out += geneN(h, p).charAt(+c); mapped++; }
                        else { out += DEFAULT_ORDER.charAt(c.charCodeAt(0) % 4); odd++; }
                    }
                    if (seq.length !== len && strict) {
                        errors.push('Helix ' + pad2(h) + ' strand ' + (s + 1) + ' needs ' + len + ' bases, got ' + seq.length + '.');
                    } else if (seq.length < len) {
                        for (let p = seq.length; p < len; p++) out += fillBase(h, s, p);
                        const k = len - seq.length;
                        repair(h, s + 1, 'short-strand', 'Helix ' + pad2(h) + ' strand ' + (s + 1) + ' is ' + k +
                            ' base' + (k === 1 ? '' : 's') + ' short; filled from ' + fillFrom + '.');
                    } else if (seq.length > len) {
                        const k = seq.length - len;
                        repair(h, s + 1, 'long-strand', 'Helix ' + pad2(h) + ' strand ' + (s + 1) + ' is ' + k +
                            ' base' + (k === 1 ? '' : 's') + ' too long; truncated.');
                    }
                }
                pair[s] = out;
            }
            genome[h] = pair;
        }
        if (mapped) repair(null, null, 'digit-alleles', mapped + ' digit allele' + (mapped === 1 ? '' : 's') + ' (0-3) converted to bases.');
        if (odd) repair(null, null, 'odd-chars', odd + ' unexpected character' + (odd === 1 ? '' : 's') + ' mapped to bases.');
        if (errors.length) return finish(null, 'text');
        return finish(genome, 'text');
    }
    return {
        pairToByte, byteToPair, byteToValue,
        decodeGenome, encodeGenome, describeGenome,
        sanitizeSequence, normalizeGenome, parseGenomeText, formatGenomeText,
        encodeGenomeUrl, decodeGenomeUrl,
        encodeDnaCode, decodeDnaCode, looksLikeDnaCode, extractDnaParam, normalizeGenomeInput,
        HELIX_MAP, GENE_MAP, HELIX_LENGTHS, HELIX_COUNT
    };
});
