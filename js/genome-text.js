/* ======================================================================
   genome-text.js - lenient genome text parsing + the shared ?dna= codec
   ----------------------------------------------------------------------
   One global: window.GenomeText. Pure functions; no DOM, no storage.

     GenomeText.normalize(text, { previous, geneN, random, fill })
         -> { lines: string[40] | null, warnings: string[], errors: string[],
              source: 'text' | 'encoded' }
     GenomeText.encode(lines)          -> base64url   (genes.js encodeSequences)
     GenomeText.decode(str)            -> string[40]  (genes.js decodeToLines)
     GenomeText.looksEncoded(text)     -> boolean
     GenomeText.extractDnaParam(text)  -> string | null
     GenomeText.readUrlParam(search?)  -> string | null   (?dna= of the page)

   normalize() accepts what SIMPR accepts and more:
     - tokens separated by ANY non [A-Z0-9:] run: newlines, spaces, tabs,
       commas, quotes, code fences - 40 tokens on one line is fine
     - "00: ACGT" (space after the colon; SIMPR turns that into an empty
       strand and fills it with random bases)
     - digits 0-3 as allele indices into the gene's own `n` order
     - other letters mapped to a base, as SIMPR's sanitizeNuc does
     - a bare base64url code, or a pasted URL containing ?dna=
   Missing data is filled from `previous` (the genome shown before this
   input, 40 canonical lines) - a missing helix, a missing strand, or the
   tail of a short strand. With no `previous`, filled bases are random.
   Long strands are truncated. Every repair is reported in `warnings`.
   fill: false  (e.g. the DNA Shortener, which must not invent bases) makes a
   missing helix/strand or a strand of the wrong length an ERROR instead;
   layout repairs, digit alleles and codes still work.
   Output lines are canonical "HH:SEQ" in helix order, so they are safe for
   horse-render's strict Genome.parse and for encodeSequences.

   Gene order (`n`) comes from `opts.geneN(h, p)` if given, else genes.js's
   arrayHp once loaded, else the renderer's HorseyData. Helix lengths come
   from genes.js HELIX_LENGTHS, else HorseyData.
   ====================================================================== */
(function (root) {
    'use strict';

    const DEFAULT_ORDER = 'GATC';   // genes.js DEFAULT_N - SIMPR's fallback mapping

    function helixLengths() {
        if (typeof HELIX_LENGTHS !== 'undefined') return HELIX_LENGTHS;     // genes.js
        if (root.HorseyData) return root.HorseyData.HELIX_LENGTHS;
        throw new Error('genome-text.js needs genes.js or horse-render.js loaded first');
    }

    function defaultGeneN(h, p) {
        if (typeof arrayHp !== 'undefined' && arrayHp[h] && arrayHp[h][p]) return arrayHp[h][p].n;
        const D = root.HorseyData;
        if (D && D.GENE_MAP[h] && D.GENE_MAP[h][p] !== undefined) return D.genes[D.GENE_MAP[h][p]].n;
        return 'ACGT';
    }

    const pad2 = h => (h < 10 ? '0' : '') + h;

    // ---------------------------------------------------------------------
    //  Codec
    // ---------------------------------------------------------------------

    function encode(lines) {
        if (typeof root.encodeSequences !== 'function') throw new Error('genes.js is not loaded');
        return root.encodeSequences(lines);
    }

    function decode(str) {
        if (typeof root.decodeToLines !== 'function') throw new Error('genes.js is not loaded');
        return root.decodeToLines(String(str).trim());
    }

    // One token of base64url characters, long enough to be a genome
    // (480 bases -> 160 chars) and with no colon, so it cannot be HH:SEQ.
    function looksEncoded(text) {
        const t = String(text || '').trim();
        return /^[A-Za-z0-9_-]{100,}$/.test(t);
    }

    function extractDnaParam(text) {
        const m = /[?&]dna=([A-Za-z0-9_-]+)/.exec(String(text || ''));
        return m ? m[1] : null;
    }

    function readUrlParam(search) {
        try {
            const v = new URLSearchParams(search !== undefined ? search : root.location.search).get('dna');
            return v ? v.trim() : null;
        } catch (e) { return null; }
    }

    // ---------------------------------------------------------------------
    //  normalize
    // ---------------------------------------------------------------------

    function normalize(text, opts) {
        opts = opts || {};
        const warnings = [], errors = [];
        const raw = String(text == null ? '' : text);

        // A share link or a bare code decodes instead of parsing.
        const code = extractDnaParam(raw) || (looksEncoded(raw) ? raw.trim() : null);
        if (code) {
            try { return { lines: decode(code), warnings, errors, source: 'encoded' }; }
            catch (e) {
                if (!/[0-9]{1,2}\s*:/.test(raw)) {
                    errors.push('Could not decode the DNA code: ' + e.message);
                    return { lines: null, warnings, errors, source: 'encoded' };
                }
                // otherwise fall through and try it as genome text
            }
        }

        const lengths = helixLengths();
        const geneN = opts.geneN || defaultGeneN;
        const random = opts.random || Math.random;
        const previous = Array.isArray(opts.previous) && opts.previous.length === 40 ? opts.previous : null;
        const strict = opts.fill === false;

        const tokens = raw.toUpperCase()
            .replace(/\s*:\s*/g, ':')
            .split(/[^A-Z0-9:]+/)
            .filter(Boolean);

        const strands = lengths.map(() => []);      // strands[h] = [seq, seq]
        let ignored = 0, extra = 0;
        for (const tok of tokens) {
            const m = /^(\d{1,2}):([A-Z0-9]*)$/.exec(tok);
            if (!m) { ignored++; continue; }
            const h = parseInt(m[1], 10);
            if (h >= lengths.length) { ignored++; continue; }
            if (strands[h].length < 2) strands[h].push(m[2]);
            else extra++;
        }

        const found = strands.reduce((n, s) => n + s.length, 0);
        if (!found) {
            errors.push(raw.trim() ? 'No "HH:SEQUENCE" genome lines found.' : 'Genome is empty.');
            return { lines: null, warnings, errors, source: 'text' };
        }
        if (ignored) warnings.push(ignored + ' token' + (ignored === 1 ? '' : 's') + ' that are not genome lines were ignored.');
        if (extra) warnings.push(extra + ' extra line' + (extra === 1 ? '' : 's') + ' beyond two per helix were ignored.');

        const fillFrom = previous ? 'the previous genome' : 'random bases';
        const prevBase = (h, s, p) => {
            if (previous) {
                const line = previous[h * 2 + s];
                const b = line.charAt(line.indexOf(':') + 1 + p);
                if ('ACGT'.indexOf(b) >= 0) return b;
            }
            return geneN(h, p).charAt(Math.floor(random() * 4));
        };

        let mapped = 0, odd = 0;
        const lines = [];
        for (let h = 0; h < lengths.length; h++) {
            const len = lengths[h];
            const given = strands[h];
            if (strict && given.length < 2) {
                errors.push(given.length === 0
                    ? 'Helix ' + pad2(h) + ' is missing (needs 2 lines).'
                    : 'Helix ' + pad2(h) + ' has only 1 line; it needs 2, one per strand.');
                continue;
            }
            if (given.length === 0) warnings.push('Helix ' + pad2(h) + ' missing; taken from ' + fillFrom + '.');
            else if (given.length === 1) warnings.push('Helix ' + pad2(h) + ' has one strand; the second is taken from ' + fillFrom + '.');

            for (let s = 0; s < 2; s++) {
                const seq = given[s];
                let out = '';
                if (seq === undefined) {
                    for (let p = 0; p < len; p++) out += prevBase(h, s, p);
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
                        for (let p = seq.length; p < len; p++) out += prevBase(h, s, p);
                        warnings.push('Helix ' + pad2(h) + ' strand ' + (s + 1) + ' is ' + (len - seq.length) +
                            ' base' + (len - seq.length === 1 ? '' : 's') + ' short; filled from ' + fillFrom + '.');
                    } else if (seq.length > len) {
                        warnings.push('Helix ' + pad2(h) + ' strand ' + (s + 1) + ' is ' + (seq.length - len) +
                            ' base' + (seq.length - len === 1 ? '' : 's') + ' too long; truncated.');
                    }
                }
                lines.push(pad2(h) + ':' + out);
            }
        }
        if (mapped) warnings.push(mapped + ' digit allele' + (mapped === 1 ? '' : 's') + ' (0-3) converted to bases.');
        if (odd) warnings.push(odd + ' unexpected character' + (odd === 1 ? '' : 's') + ' mapped to bases.');

        if (errors.length) return { lines: null, warnings, errors, source: 'text' };
        return { lines, warnings, errors, source: 'text' };
    }

    root.GenomeText = { normalize, encode, decode, looksEncoded, extractDnaParam, readUrlParam };
})(typeof window !== 'undefined' ? window : globalThis);
