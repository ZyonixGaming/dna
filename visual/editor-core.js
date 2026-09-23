// editor-core.js — utilities for reading/writing genes in the 40-line genome.
'use strict';
(function(root){
  var D = root.HorseyData;
  if (!D) { console.error('HorseyData missing — load horse-render.js first'); return; }

  // Find (helix, position) of a gene id.
  function findGenePos(gid) {
    var map = D.GENE_MAP;
    for (var h = 0; h < map.length; h++) {
      var row = map[h];
      for (var p = 0; p < row.length; p++) {
        if (row[p] === gid) return { h: h, p: p };
      }
    }
    return null;
  }

  // Enumerate all distinct achievable values for a gene.
  // Returns sorted list of { v, a, b } where a<=b.
  function geneValues(gid) {
    var gene = D.genes[gid];
    var m = gene.m, s = gene.s, g = gene.g;
    var out = [];
    var seen = Object.create(null);
    for (var a = 0; a < 4; a++) {
      for (var b = a; b < 4; b++) {
        var raw = m >= 100 ? g[a] : (g[a]*m + g[b]*(100-m))/100;
        var v = raw / s;
        var key = v.toFixed(8);
        if (seen[key]) continue;
        seen[key] = 1;
        out.push({ v: v, a: a, b: b });
      }
    }
    out.sort(function(x,y){ return x.v - y.v; });
    return out;
  }

  var _valueCache = Object.create(null);

  // ---- custom genes.xml ----
  // Same localStorage key as SIMPR and the integrated save editor, so a modded gene table
  // uploaded in either applies here too. Applied to the renderer's own gene objects (see
  // horse-render-custom-genes.md), so the preview, Genome.parse and every slider read the
  // same values. xmlText null/'' = back to the built-in table.
  var CUSTOM_GENES_KEY = 'simpr_custom_genes_xml';

  function applyGenesXml(xmlText) {
    if (typeof D.applyGenes !== 'function') {
      return { ok: false, changed: 0, errors: ['horse-render.js is too old: no HorseyData.applyGenes'] };
    }
    var res = xmlText ? D.applyGenes(D.recordsFromXml(xmlText)) : D.resetGenes();
    _valueCache = Object.create(null);   // achievable values depend on g / m / s
    return res;
  }

  // Runs before editor-specs.js, which sizes sliders and toggles from gene values at load.
  var customGenes = { active: false, errors: [] };
  try {
    var cachedXml = root.localStorage && root.localStorage.getItem(CUSTOM_GENES_KEY);
    if (cachedXml) {
      var applied = applyGenesXml(cachedXml);
      customGenes = { active: applied.ok, errors: applied.errors };
      if (!applied.ok) console.warn('Custom genes.xml not applied:', applied.errors);
    }
  } catch (e) { /* storage blocked: use the built-in table */ }
  function getGeneValues(name) {
    if (_valueCache[name]) return _valueCache[name];
    var gid = D.byName[name];
    if (gid === undefined) return null;
    _valueCache[name] = geneValues(gid);
    return _valueCache[name];
  }

  // Nearest achievable value for a gene.
  function snapGeneValue(name, target) {
    var vals = getGeneValues(name);
    if (!vals || !vals.length) return null;
    var best = vals[0], bestD = Math.abs(vals[0].v - target);
    for (var i = 1; i < vals.length; i++) {
      var d = Math.abs(vals[i].v - target);
      if (d < bestD) { bestD = d; best = vals[i]; }
    }
    return best;
  }

  // ---- line manipulation ----
  function setBaseAt(lines, h, strand, p, base) {
    var idx = h*2 + strand;
    var line = lines[idx];
    var colon = line.indexOf(':');
    var prefix = line.substring(0, colon+1);
    var seq = line.substring(colon+1);
    lines[idx] = prefix + seq.substring(0, p) + base + seq.substring(p+1);
  }

  function getBaseAt(lines, h, strand, p) {
    var line = lines[h*2 + strand];
    var colon = line.indexOf(':');
    return line.charAt(colon + 1 + p);
  }

  function writeGenePair(lines, name, a, b) {
    var gid = D.byName[name];
    if (gid === undefined) return;
    var gene = D.genes[gid];
    var pos = findGenePos(gid);
    if (!pos) return;
    setBaseAt(lines, pos.h, 0, pos.p, gene.n[a]);
    setBaseAt(lines, pos.h, 1, pos.p, gene.n[b]);
  }

  function writeGeneValue(lines, name, target) {
    var best = snapGeneValue(name, target);
    if (!best) return;
    writeGenePair(lines, name, best.a, best.b);
  }

  function readGenePair(lines, name) {
    var gid = D.byName[name];
    if (gid === undefined) return null;
    var gene = D.genes[gid];
    var pos = findGenePos(gid);
    if (!pos) return null;
    var bA = getBaseAt(lines, pos.h, 0, pos.p);
    var bB = getBaseAt(lines, pos.h, 1, pos.p);
    return [gene.n.indexOf(bA), gene.n.indexOf(bB)];
  }

  // ---- initialization ----
  // Produce a "wildtype" 40-line genome (all alleles = 0).
  function makeWildtypeLines() {
    var out = [];
    // Create 40 lines: helix h has lines h*2 (strand 0) and h*2+1 (strand 1).
    for (var h = 0; h < 20; h++) {
      var len = D.HELIX_LENGTHS[h];
      var seq = '';
      for (var i = 0; i < len; i++) seq += 'A';
      var numStr = (h < 10 ? '0' : '') + h;
      out.push(numStr + ':' + seq);   // strand 0
      out.push(numStr + ':' + seq);   // strand 1
    }
    // Overwrite each gene's two bases with the first base of gene.n (allele 0).
    for (var h2 = 0; h2 < 20; h2++) {
      var row = D.GENE_MAP[h2];
      for (var p = 0; p < row.length; p++) {
        var gid = row[p];
        var gene = D.genes[gid];
        var base = gene.n.charAt(0);
        setBaseAt(out, h2, 0, p, base);
        setBaseAt(out, h2, 1, p, base);
      }
    }
    return out;
  }


  // Rebuild 40-line genome from a Genotype (allele indices).
  function linesFromAlleles(alleles) {
    var out = [];
    for (var h = 0; h < 20; h++) {
      var len = D.HELIX_LENGTHS[h];
      var seq = '';
      for (var i = 0; i < len; i++) seq += 'A';
      var numStr = (h < 10 ? '0' : '') + h;
      out.push(numStr + ':' + seq);   // strand 0
      out.push(numStr + ':' + seq);   // strand 1
    }
    for (var h2 = 0; h2 < 20; h2++) {
      var row = D.GENE_MAP[h2];
      for (var p = 0; p < row.length; p++) {
        var gid = row[p];
        var gene = D.genes[gid];
        var pair = alleles[gid] || [0, 0];
        setBaseAt(out, h2, 0, p, gene.n[pair[0]]);
        setBaseAt(out, h2, 1, p, gene.n[pair[1]]);
      }
    }
    return out;
  }

  function randomizeLines() {
    var out = makeWildtypeLines();
    var bases = ['A', 'C', 'G', 'T'];
    for (var h = 0; h < 20; h++) {
      var row = D.GENE_MAP[h];
      for (var p = 0; p < row.length; p++) {
        var gid = row[p];
        var gene = D.genes[gid];
        var a = Math.floor(Math.random() * 4);
        var b = Math.floor(Math.random() * 4);
        setBaseAt(out, h, 0, p, gene.n[a]);
        setBaseAt(out, h, 1, p, gene.n[b]);
      }
    }
    return out;
  }

  root.EditorCore = {
    findGenePos: findGenePos,
    geneValues: geneValues,
    getGeneValues: getGeneValues,
    snapGeneValue: snapGeneValue,
    setBaseAt: setBaseAt,
    getBaseAt: getBaseAt,
    writeGenePair: writeGenePair,
    writeGeneValue: writeGeneValue,
    readGenePair: readGenePair,
    makeWildtypeLines: makeWildtypeLines,
    linesFromAlleles: linesFromAlleles,
    randomizeLines: randomizeLines,
    applyGenesXml: applyGenesXml,
    customGenes: customGenes,
    CUSTOM_GENES_KEY: CUSTOM_GENES_KEY
  };
})(typeof window !== 'undefined' ? window : this);