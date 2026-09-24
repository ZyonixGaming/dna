(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('./genedata.js'), require('./genome.js'));
    } else {
        global.PopData = factory(global.GeneData, global.Genome);
    }
})(typeof window !== 'undefined' ? window : globalThis, function (GeneData, Genome) {
    'use strict';
    const DEFAULT_WEIGHTS = Object.freeze([1, 0, 0, 0]);
    function parsePopTree(xmlText) {
        const tokenRe = /<pop\s+name="([^"]*)"\s*>|<\/pop>|<gene\b([^>]*)\/>/g;
        const attrRe = /(\w+)="([^"]*)"/g;
        const root = { name: null, ownGenes: {}, children: [] };
        const stack = [root];
        let m;
        while ((m = tokenRe.exec(xmlText))) {
            if (m[0].startsWith('<pop')) {
                const node = { name: m[1], ownGenes: {}, children: [] };
                stack[stack.length - 1].children.push(node);
                stack.push(node);
            } else if (m[0] === '</pop>') {
                if (stack.length > 1) stack.pop();
            } else {
                const attrs = {};
                attrRe.lastIndex = 0;
                let am;
                while ((am = attrRe.exec(m[2]))) attrs[am[1]] = am[2];
                if (!attrs.name) continue;
                const p = [0, 1, 2, 3].map((k) => parseInt(attrs['p' + k], 10) || 0);
                const weights = p.every((v) => v === 0) ? DEFAULT_WEIGHTS.slice() : p;
                stack[stack.length - 1].ownGenes[attrs.name] = weights;
            }
        }
        return root;
    }
    function flattenPopTree(root) {
        const flat = new Map();
        function walk(node, parentGenes) {
            const current = node.name !== null ? { ...parentGenes, ...node.ownGenes } : { ...parentGenes };
            if (node.name !== null) flat.set(node.name, current);
            for (const child of node.children) walk(child, current);
        }
        walk(root, {});
        return flat;
    }
    function parsePopXml(xmlText) {
        return flattenPopTree(parsePopTree(xmlText));
    }
    function weightedRandom(weights, rng) {
        rng = rng || Math.random;
        const inverse = weights.map((w) => (w === 0 ? 0 : 1 / w));
        const sum = inverse.reduce((a, b) => a + b, 0);
        if (sum === 0) return 0;
        let r = rng() * sum;
        for (let i = 0; i < inverse.length; i++) {
            r -= inverse[i];
            if (r <= 0) return i;
        }
        return inverse.length - 1;
    }
    function popWeightsFor(popTable, popName, gene) {
        const config = popTable.get(popName) || {};
        return config[gene.desc] || DEFAULT_WEIGHTS;
    }
    function makePopSampler(popTable, popName, rng) {
        return (gene) => gene.n[weightedRandom(popWeightsFor(popTable, popName, gene), rng)];
    }
    function sampleGenome(geneTable, popTable, popName, rng) {
        const sample = makePopSampler(popTable, popName, rng);
        const genome = new Array(GeneData.HELIX_COUNT);
        for (let h = 0; h < GeneData.HELIX_COUNT; h++) {
            const row = GeneData.GENE_MAP[h];
            let s1 = '', s2 = '';
            for (let p = 0; p < row.length; p++) {
                const gene = geneTable.get(row[p]);
                s1 += sample(gene);
                s2 += sample(gene);
            }
            genome[h] = [s1, s2];
        }
        return genome;
    }
    function isBaseLegal(weights, gene, base) {
        const idx = gene.n.indexOf(base);
        return idx !== -1 && weights[idx] > 0;
    }
    function firstIllegalGene(popTable, popName, genePairs) {
        const config = popTable.get(popName) || {};
        for (const gp of genePairs) {
            const listed = Object.prototype.hasOwnProperty.call(config, gp.desc);
            const weights = listed ? config[gp.desc] : DEFAULT_WEIGHTS;
            for (const base of [gp.allele1, gp.allele2]) {
                if (!isBaseLegal(weights, gp, base)) {
                    return { desc: gp.desc, base, listed, lockedTo: listed ? null : gp.n[0] };
                }
            }
        }
        return null;
    }
    function weightsToProbabilities(weights) {
        const inv = weights.map((w) => (w > 0 ? 1 / w : 0));
        const sum = inv.reduce((a, b) => a + b, 0);
        return sum ? inv.map((x) => x / sum) : [0, 0, 0, 0];
    }
    function alleleProbabilities(popTable, popName, gene) {
        return weightsToProbabilities(popWeightsFor(popTable, popName, gene));
    }
    function pairProbability(popTable, popName, gene, pair) {
        if (!gene || !gene.n || typeof pair !== 'string' || pair.length !== 2) return 0;
        const p = alleleProbabilities(popTable, popName, gene);
        const i1 = gene.n.indexOf(pair[0]);
        const i2 = gene.n.indexOf(pair[1]);
        if (i1 === -1 || i2 === -1) return 0;
        return i1 === i2 ? p[i1] * p[i1] : 2 * p[i1] * p[i2];
    }
    function genomeLog10Probability(geneTable, popTable, popName, genomeBytes) {
        let ordered = 0, unordered = 0, impossible = 0, heterozygous = 0;
        for (let id = 0; id < genomeBytes.length; id++) {
            const gene = geneTable.get(id);
            const pair = Genome.byteToPair(gene, genomeBytes[id]);
            if (!pair) { impossible++; continue; }
            const p = alleleProbabilities(popTable, popName, gene);
            const i1 = gene.n.indexOf(pair[0]), i2 = gene.n.indexOf(pair[1]);
            if (i1 === -1 || i2 === -1 || !(p[i1] > 0) || !(p[i2] > 0)) { impossible++; continue; }
            const lp = Math.log10(p[i1]) + Math.log10(p[i2]);
            ordered += lp;
            unordered += lp;
            if (i1 !== i2) { heterozygous++; unordered += Math.LOG10E * Math.LN2; }
        }
        if (impossible) { ordered = -Infinity; unordered = -Infinity; }
        return { ordered, unordered, impossible, heterozygous };
    }
    function impossibleGenes(geneTable, popTable, popName, genomeBytes) {
        const out = [];
        for (let id = 0; id < genomeBytes.length; id++) {
            const gene = geneTable.get(id);
            const pair = Genome.byteToPair(gene, genomeBytes[id]);
            if (!pair) { out.push({ id, desc: gene ? gene.desc : null, pair: null, bases: ['?'] }); continue; }
            if (pairProbability(popTable, popName, gene, pair) > 0) continue;
            const w = popWeightsFor(popTable, popName, gene);
            const bases = [...new Set([pair[0], pair[1]].filter((b) => !isBaseLegal(w, gene, b)))];
            out.push({ id, desc: gene.desc, pair, bases });
        }
        return out;
    }
    function legalize(popTable, popName, genePairs) {
        const config = popTable.get(popName) || {};
        let changed = 0;
        for (const gp of genePairs) {
            const listed = Object.prototype.hasOwnProperty.call(config, gp.desc);
            const weights = listed ? config[gp.desc] : DEFAULT_WEIGHTS;
            const legal = [0, 1, 2, 3].filter((idx) => weights[idx] > 0);
            if (!legal.length) continue;
            const preferred = legal.reduce((a, b) => (weights[a] <= weights[b] ? a : b));
            for (const side of ['allele1', 'allele2']) {
                const idx = gp.n.indexOf(gp[side]);
                if (idx === -1 || weights[idx] === 0) {
                    gp[side] = gp.n[preferred];
                    changed++;
                }
            }
        }
        return changed;
    }
    function genePairsFromBytes(geneTable, genomeBytes) {
        const out = new Array(genomeBytes.length);
        for (let id = 0; id < genomeBytes.length; id++) {
            const gene = geneTable.get(id);
            const pair = Genome.byteToPair(gene, genomeBytes[id]);
            out[id] = { id, desc: gene.desc, n: gene.n, allele1: pair ? pair[0] : '?', allele2: pair ? pair[1] : '?' };
        }
        return out;
    }
    function genePairsToBytes(geneTable, genePairs, baseBytes) {
        const out = baseBytes ? Uint8Array.from(baseBytes) : new Uint8Array(genePairs.length);
        for (let i = 0; i < genePairs.length; i++) {
            const gp = genePairs[i];
            const id = gp.id !== undefined ? gp.id : i;
            const byte = Genome.pairToByte(geneTable.get(id), gp.allele1 + gp.allele2);
            if (byte !== null) out[id] = byte;
        }
        return out;
    }
    function legalizeBytes(geneTable, popTable, popName, genomeBytes) {
        const pairs = genePairsFromBytes(geneTable, genomeBytes);
        const changed = legalize(popTable, popName, pairs);
        return { bytes: changed ? genePairsToBytes(geneTable, pairs, genomeBytes) : Uint8Array.from(genomeBytes), changed };
    }
    return {
        DEFAULT_WEIGHTS, parsePopTree, flattenPopTree, parsePopXml,
        weightedRandom, popWeightsFor, makePopSampler, sampleGenome,
        isBaseLegal, firstIllegalGene,
        weightsToProbabilities, alleleProbabilities, pairProbability,
        genomeLog10Probability, impossibleGenes, legalize,
        genePairsFromBytes, genePairsToBytes, legalizeBytes
    };
});
