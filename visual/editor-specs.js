// editor-specs.js — control specifications.
// Dropdowns use ALLELE INDICES as the source of truth (0-3). Labels are cosmetic.
// Sliders auto-range from the gene's achievable values (min on the left, max on the right).
// Controls with `advanced: true` are rendered in a collapsible Advanced subsection.
'use strict';
(function(root){
  var D = root.HorseyData;
  var C = root.EditorCore;
  if (!D || !C) { console.error('Editor core not loaded'); return; }

  // ---------- color distance for reverse mapping ----------
  function colorDistance(hex1, hex2) {
    var r1 = parseInt(hex1.slice(1,3),16), g1 = parseInt(hex1.slice(3,5),16), b1 = parseInt(hex1.slice(5,7),16);
    var r2 = parseInt(hex2.slice(1,3),16), g2 = parseInt(hex2.slice(3,5),16), b2 = parseInt(hex2.slice(5,7),16);
    var rMean = (r1+r2)/2;
    return Math.sqrt((2+rMean/256)*Math.pow(r1-r2,2) + 4*Math.pow(g1-g2,2) + (2+(255-rMean)/256)*Math.pow(b1-b2,2));
  }

  function findClosestColor(targetHex, table) {
    var best = null, bestDist = Infinity;
    for (var i = 0; i < table.length; i++) {
      var d = colorDistance(table[i].hex, targetHex);
      if (d < bestDist) { bestDist = d; best = table[i]; }
    }
    return best;
  }

  // ---------- base color lookup table ----------
  // Maps (GREEN, RED, BROWN, CREAM) -> hex color
  // CREAM: 0=dark, 1=mid, 2=base (light)
  // WHITE gene must be set to 1 (off) for base color to show through
  // WHITE allele 0 = white coat enabled, allele 1/2/3 = white disabled
  var BASE_COLOR_TABLE = [
    // Browns (GREEN=0, RED=0)
    { hex: '#d6922c', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 0, BASE_BROWN: 0, BASE_CREAM: 2 }},
    { hex: '#d6a660', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 0, BASE_BROWN: 0, BASE_CREAM: 1 }},
    { hex: '#7a3f00', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 0, BASE_BROWN: 1, BASE_CREAM: 2 }},
    { hex: '#d6922c', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 0, BASE_BROWN: 1, BASE_CREAM: 1 }},
    { hex: '#47310f', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 0, BASE_BROWN: 2, BASE_CREAM: 2 }},
    { hex: '#7a3f00', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 0, BASE_BROWN: 2, BASE_CREAM: 1 }},
    { hex: '#d6922c', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 0, BASE_BROWN: 2, BASE_CREAM: 0 }},
    // Reds (GREEN=0, RED=1)
    { hex: '#e83a57', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 1, BASE_BROWN: 0, BASE_CREAM: 0 }},
    { hex: '#ffa799', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 1, BASE_BROWN: 0, BASE_CREAM: 2 }},
    // Magentas (GREEN=0, RED=2)
    { hex: '#db30a2', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 2, BASE_BROWN: 0, BASE_CREAM: 0 }},
    { hex: '#c142db', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 2, BASE_BROWN: 0, BASE_CREAM: 2 }},
    // Crimson (GREEN=0, RED=3)
    { hex: '#c93c59', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 3, BASE_BROWN: 0, BASE_CREAM: 0 }},
    { hex: '#d67c6d', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 3, BASE_BROWN: 0, BASE_CREAM: 1 }},
    { hex: '#ffa799', genes: { WHITE: 1, BASE_GREEN: 0, BASE_RED: 3, BASE_BROWN: 0, BASE_CREAM: 2 }},
    // Yellow-greens (GREEN=1)
    { hex: '#b0a207', genes: { WHITE: 1, BASE_GREEN: 1, BASE_RED: 0, BASE_BROWN: 0, BASE_CREAM: 0 }},
    { hex: '#d8db30', genes: { WHITE: 1, BASE_GREEN: 1, BASE_RED: 0, BASE_BROWN: 0, BASE_CREAM: 1 }},
    { hex: '#fdff7d', genes: { WHITE: 1, BASE_GREEN: 1, BASE_RED: 0, BASE_BROWN: 0, BASE_CREAM: 2 }},
    { hex: '#db7830', genes: { WHITE: 1, BASE_GREEN: 1, BASE_RED: 2, BASE_BROWN: 0, BASE_CREAM: 0 }},
    { hex: '#ffc768', genes: { WHITE: 1, BASE_GREEN: 1, BASE_RED: 2, BASE_BROWN: 0, BASE_CREAM: 2 }},
    // Greens (GREEN=2)
    { hex: '#36e345', genes: { WHITE: 1, BASE_GREEN: 2, BASE_RED: 0, BASE_BROWN: 0, BASE_CREAM: 0 }},
    { hex: '#7dff88', genes: { WHITE: 1, BASE_GREEN: 2, BASE_RED: 0, BASE_BROWN: 0, BASE_CREAM: 2 }},
    { hex: '#a2db30', genes: { WHITE: 1, BASE_GREEN: 2, BASE_RED: 2, BASE_BROWN: 0, BASE_CREAM: 0 }},
    // Dark greens (GREEN=3)
    { hex: '#1c570b', genes: { WHITE: 1, BASE_GREEN: 3, BASE_RED: 0, BASE_BROWN: 0, BASE_CREAM: 0 }},
    { hex: '#36e345', genes: { WHITE: 1, BASE_GREEN: 3, BASE_RED: 0, BASE_BROWN: 0, BASE_CREAM: 1 }},
    { hex: '#7dff88', genes: { WHITE: 1, BASE_GREEN: 3, BASE_RED: 0, BASE_BROWN: 0, BASE_CREAM: 2 }},
    // White (keep WHITE=0)
    { hex: '#dcdcdc', genes: { WHITE: 0 }}
  ];

  // ALT color table
  var ALT_COLOR_TABLE = [
    { hex: '#110b03', genes: { ALT_BLUE: 0 }},
    { hex: '#30a2db', genes: { ALT_BLUE: 2 }},
    { hex: '#36e345', genes: { ALT_BLUE: 3 }}
  ];

  // ---------- palette (for color swatches) ----------
  var PALETTE = [
    '#110b03','#8a8a8a','#adafb3','#c3c6c9','#eeeeee','#ffffff',
    '#d6922c','#7a3f00','#d6a660','#d6cbbc','#47310f','#8f3636',
    '#632626','#c93c59','#ffaf40','#e83a57','#db7830','#d8db30',
    '#a2db30','#36e345','#30dbbe','#30a2db','#4661e8','#2200b9',
    '#7542db','#2c1852','#c142db','#db30a2','#f0e3a1','#1c570b',
    '#ffa799','#ffc768','#fdff7d','#b1ff7d','#7dff88','#26ad97',
    '#95c9bc','#82d7ff','#d67c6d','#b0a207'
  ];

  // ---------- factories ----------

  function autoSlider(name, label, adv) {
    var vals = C.getGeneValues(name) || [{v:0}];
    var min = vals[0].v;
    var max = vals[vals.length - 1].v;
    if (min === max) { min -= 1; max += 1; }
    var span = max - min;
    var minGap = Infinity;
    for (var i = 1; i < vals.length; i++) {
      var d = vals[i].v - vals[i-1].v;
      if (d > 0 && d < minGap) minGap = d;
    }
    var step = span / 400;
    if (isFinite(minGap) && minGap > 0 && step > minGap / 3) step = minGap / 3;
    if (step <= 0) step = 0.0001;
    var spec = {
      id: 's-' + name,
      label: label,
      type: 'slider',
      gene: name,
      min: min, max: max, step: step,
      read: function (ctx) { return ctx.gt.f(name); },
      write: function (ctx, v) { C.writeGeneValue(ctx.lines, name, v); }
    };
    if (adv) spec.advanced = true;
    return spec;
  }

  function toggle(name, label, onAllele, offAllele, adv) {
    var gene = D.genes[D.byName[name]];
    if (!gene) throw new Error('Unknown gene in toggle: ' + name);
    var g = gene.g;

    if (onAllele === undefined || offAllele === undefined) {
      var hi = 0, lo = 0;
      for (var i = 1; i < 4; i++) {
        if (g[i] > g[hi]) hi = i;
        if (g[i] < g[lo]) lo = i;
      }
      if (onAllele  === undefined) onAllele  = hi;
      if (offAllele === undefined) offAllele = lo;
    }

    var onValue  = g[onAllele];
    var offValue = g[offAllele];
    var mid = (onValue + offValue) / 2;

    var spec = {
      id: 't-' + name,
      label: label,
      type: 'toggle',
      gene: name,
      onAllele: onAllele,
      offAllele: offAllele,
      read: function (ctx) {
        var raw = ctx.gt.raw(name);
        if (onValue === offValue) return false;
        return raw > mid;
      },
      write: function (ctx, v) {
        var a = v ? onAllele : offAllele;
        C.writeGenePair(ctx.lines, name, a, a);
      }
    };
    if (adv) spec.advanced = true;
    return spec;
  }

  // Toggle that activates when either strand has the target allele
  function alleleToggle(name, label, targetAllele, adv) {
    var spec = {
      id: 'at-' + name,
      label: label,
      type: 'toggle',
      gene: name,
      read: function(ctx) { return ctx.gt.hasAllele(name, targetAllele); },
      write: function(ctx, v) {
        var a = v ? targetAllele : 0;
        C.writeGenePair(ctx.lines, name, a, a);
      }
    };
    if (adv) spec.advanced = true;
    return spec;
  }

  // Toggle that activates when the higher allele (pair[1]) equals target
  function higherAlleleToggle(name, label, targetAllele, adv) {
    var spec = {
      id: 'hat-' + name,
      label: label,
      type: 'toggle',
      gene: name,
      read: function(ctx) { return ctx.gt.pair(name)[1] === targetAllele; },
      write: function(ctx, v) {
        var a = v ? targetAllele : 0;
        C.writeGenePair(ctx.lines, name, a, a);
      }
    };
    if (adv) spec.advanced = true;
    return spec;
  }

  function enumGene(name, label, labelsByAllele, adv) {
    var mapping = labelsByAllele;
    var seen = Object.create(null);
    var options = [];
    for (var i = 0; i < 4; i++) {
      var l = mapping[i];
      if (l == null) continue;
      if (seen[l]) continue;
      seen[l] = 1;
      options.push({ label: l, value: i });
    }
    var spec = {
      id: 'dd-' + name,
      label: label,
      type: 'dropdown',
      gene: name,
      options: options,
      read: function (ctx) {
        var pair = ctx.gt.pair(name);
        var idx = pair[0];
        for (var k = 0; k < options.length; k++) {
          if (options[k].value === idx) return idx;
        }
        var lbl = mapping[idx];
        for (var k2 = 0; k2 < options.length; k2++) {
          if (options[k2].label === lbl) return options[k2].value;
        }
        return options[0].value;
      },
      write: function (ctx, val) {
        var allele = Number(val);
        if (!isFinite(allele) || allele < 0 || allele > 3) return;
        C.writeGenePair(ctx.lines, name, allele, allele);
      }
    };
    if (adv) spec.advanced = true;
    return spec;
  }

  // Color dropdown: like enumGene but options carry a `color` hex.
  // `colorsByAllele` is [{label, color}, ...] indexed by allele (null to skip).
  // `color` can be a hex string or a function(ctx) returning hex.
  function colorEnum(name, label, colorsByAllele, adv) {
    var mapping = colorsByAllele;
    var seen = Object.create(null);
    var options = [];
    for (var i = 0; i < 4; i++) {
      var entry = mapping[i];
      if (entry == null) continue;
      if (seen[entry.label]) continue;
      seen[entry.label] = 1;
      options.push({ label: entry.label, value: i, color: entry.color });
    }
    var spec = {
      id: 'cd-' + name,
      label: label,
      type: 'colorDropdown',
      gene: name,
      options: options,
      read: function (ctx) {
        var pair = ctx.gt.pair(name);
        var idx = pair[0];
        for (var k = 0; k < options.length; k++) {
          if (options[k].value === idx) return idx;
        }
        var lbl = mapping[idx] ? mapping[idx].label : null;
        for (var k2 = 0; k2 < options.length; k2++) {
          if (options[k2].label === lbl) return options[k2].value;
        }
        return options[0].value;
      },
      write: function (ctx, val) {
        var allele = Number(val);
        if (!isFinite(allele) || allele < 0 || allele > 3) return;
        C.writeGenePair(ctx.lines, name, allele, allele);
      }
    };
    if (adv) spec.advanced = true;
    return spec;
  }

  // Helper: get achievable [min, max] for a gene
  function getRange(name) {
    var vals = C.getGeneValues(name);
    return [vals[0].v, vals[vals.length - 1].v];
  }

  // Resolve target across multiplicative genes via cascade.
  // target = constant * gene[0] * gene[1] * ...
  // Tries each gene in order; if one saturates, passes remainder to next.
  function cascadeResolve(ctx, target, genes, constant) {
    constant = constant || 1;
    if (constant === 0) return [];
    var remaining = target / constant;
    var writes = [];
    for (var i = 0; i < genes.length; i++) {
      var r = getRange(genes[i]);
      if (i === genes.length - 1) {
        writes.push({ gene: genes[i], value: remaining });
        break;
      }
      var restProduct = 1;
      for (var j = i + 1; j < genes.length; j++) restProduct *= ctx.gt.f(genes[j]);
      if (restProduct === 0) {
        writes.push({ gene: genes[i], value: ctx.gt.f(genes[i]) });
        continue;
      }
      var needed = remaining / restProduct;
      if (needed >= r[0] && needed <= r[1]) {
        writes.push({ gene: genes[i], value: needed });
        break;
      }
      var clamped = Math.max(r[0], Math.min(r[1], needed));
      writes.push({ gene: genes[i], value: clamped });
      var snapped = C.snapGeneValue(genes[i], clamped);
      var actual = snapped ? snapped.v : clamped;
      if (actual === 0) break;
      remaining = remaining / actual;
    }
    return writes;
  }

  function combined(id, label, opts, adv) {
    var spec = {
      id: 'c-' + id,
      label: label,
      type: 'slider',
      combined: true,
      min: opts.min, max: opts.max, step: opts.step || 0.01,
      hint: opts.hint,
      autoRange: opts.autoRange,
      read: opts.target,
      write: function (ctx, v) {
        var r = opts.resolve(ctx, v);
        if (!r) return;
        if (!Array.isArray(r)) r = [r];
        for (var i = 0; i < r.length; i++) {
          if (r[i]) C.writeGeneValue(ctx.lines, r[i].gene, r[i].value);
        }
      }
    };
    if (adv) spec.advanced = true;
    return spec;
  }

  // Group wrapper: visually groups related controls with a header and swatch
  // children is an array of control specs that belong to the group
  function group(id, label, children, opts) {
    opts = opts || {};
    return {
      id: 'g-' + id,
      label: label,
      type: 'group',
      children: children,
      collapsed: opts.collapsed || false,
      swatch: opts.swatch
    };
  }

  // Helper: static color option
  function co(label, color) { return { label: label, color: color }; }
  // Helper: dynamic color option (resolved from ctx.colors at sync time)
  function coDyn(label, resolver) { return { label: label, color: resolver }; }

  // Color picker control - shows palette grid and HTML color input
  function colorPicker(id, label, colorRole, palette) {
    return {
      id: 'cp-' + id,
      label: label,
      type: 'colorPicker',
      colorRole: colorRole,
      palette: palette,
      read: function (ctx) {
        return ctx.colors && ctx.colors.hex ? ctx.colors.hex[colorRole] : '#888888';
      },
      write: function (ctx, targetHex) {
        var match = findClosestColor(targetHex, palette);
        if (match && match.genes) {
          for (var gene in match.genes) {
            var val = match.genes[gene];
            // Handle CREAM specially - need to map 0/1/2 to actual allele values
            if (gene === 'BASE_CREAM') {
              // CREAM: 0=dark (<0.33), 1=mid (0.33-0.66), 2=base (>0.66)
              // Gene values produce: allele 0=low, allele 1=high, allele 2=mid-ish
              var creamAllele = val === 0 ? 0 : (val === 2 ? 1 : 2);
              C.writeGenePair(ctx.lines, gene, creamAllele, creamAllele);
            } else {
              C.writeGenePair(ctx.lines, gene, val, val);
            }
          }
        }
      }
    };
  }

  // ---------- SKIN color grid (16 entries, SKIN_HUE2 * 4 + SKIN_HUE) ----------
  var SKIN_COLORS = [
    '#ffa799','#d6cbbc','#d6a660','#ffc768',
    '#d67c6d','#8a8a8a','#d8db30','#ffaf40',
    '#8f3636','#47310f','#b0a207','#7a3f00',
    '#2c1852','#95c9bc','#ffffff','#82d7ff'
  ];

  function skinPicker(id, label) {
    return {
      id: 'sp-' + id,
      label: label,
      type: 'skinPicker',
      palette: SKIN_COLORS,
      read: function (ctx) {
        return ctx.colors && ctx.colors.hex ? ctx.colors.hex.SKIN : '#888888';
      },
      write: function (ctx, idx) {
        var hue = idx % 4;
        var hue2 = Math.floor(idx / 4);
        C.writeGenePair(ctx.lines, 'SKIN_HUE', hue, hue);
        C.writeGenePair(ctx.lines, 'SKIN_HUE2', hue2, hue2);
      }
    };
  }

  // ---------- controls ----------

  var CONTROLS = {};

  // ==== POSTURE ====
  CONTROLS.posture = [
    {
      id: 'posture', label: 'Posture', type: 'dropdown',
      options: [
        { label: 'Rabbit',    value: 'rabbit' },
        { label: 'Biped',     value: 'biped' },
        { label: 'Centaur',   value: 'centaur' },
        { label: 'Quadruped', value: 'quadruped' }
      ],
      read: function (ctx) { return ctx.ph.posture; },
      write: function (ctx, v) {
        // BIPED: g=[0,1,0,1] → allele 0/2 gives 0, allele 1/3 gives 1
        // QUADRUPED: g=[1,0,1,0] → allele 0/2 gives 1, allele 1/3 gives 0
        var wantBiped = (v === 'biped' || v === 'centaur') ? 1 : 0;
        var wantQuad  = (v === 'quadruped' || v === 'centaur') ? 1 : 0;
        var bipedAllele = wantBiped === 1 ? 1 : 0;  // 1→allele1, 0→allele0
        var quadAllele  = wantQuad === 1 ? 0 : 1;   // 1→allele0, 0→allele1
        C.writeGenePair(ctx.lines, 'BIPED', bipedAllele, bipedAllele);
        C.writeGenePair(ctx.lines, 'QUADRUPED', quadAllele, quadAllele);
      }
    },

    // Leg/arm angles (moved from legs/arms)
    autoSlider('SPLAY', 'Splay'),
    autoSlider('ARM_FORWARD', 'Arm Forward'),
    enumGene('LEG_THRUST_BACK', 'Thrust Back', ['None', 'Back', 'None', 'Extreme']),

    // Tail position (moved from tail)
    autoSlider('TAIL_ANGLE', 'Tail Angle'),
    toggle('TAIL_BOTTOM', 'Tail Bottom'),

    // Neck angle (moved from neck)
    combined('neckAngle', 'Neck Angle',
      { min: 0, max: 120, step: 1,
        hint: 'NECK_ANGLE + NECK_COCK',
        autoRange: function () {
          var naR = getRange('NECK_ANGLE'), ncR = getRange('NECK_COCK');
          return [naR[0] + ncR[0], naR[1] + ncR[1]];
        },
        target:  function (ctx) { return ctx.ph.neckAngle; },
        resolve: function (ctx, target) {
          var naR = getRange('NECK_ANGLE');
          var needed = target - ctx.gt.f('NECK_COCK');
          if (needed >= naR[0] && needed <= naR[1]) {
            return { gene: 'NECK_ANGLE', value: needed };
          }
          var clamped = Math.max(naR[0], Math.min(naR[1], needed));
          return [
            { gene: 'NECK_ANGLE', value: clamped },
            { gene: 'NECK_COCK', value: target - clamped }
          ];
        }
      }),
    autoSlider('NECK_SLOUCH', 'Neck Slouch'),
    autoSlider('NECK_ONTOP', 'Neck on Top'),

    // Upper arm positioning (moved from arms)
    autoSlider('UPARM_Y', 'Up-Arm Y'),
    autoSlider('UPARM_ANGLE', 'Up-Arm Angle'),
    enumGene('UPARM_GOOFY', 'Up-Arm Goofy', ['Both', 'Both (offset)', 'Back only', 'Front only']),

    // Part tags — what spawns in each socket
    enumGene('LEG_TAG', 'Leg Part Tag', ['Leg', 'Hand', 'Neck/Head', 'Tail']),
    enumGene('ARM_TAG', 'Arm Part Tag', ['Leg', 'Hand', 'Neck/Head', 'Tail']),
    enumGene('UPARM_TAG', 'Up-Arm Part Tag', ['None', 'Hand', 'Leg', 'Neck/Head']),
    enumGene('TAIL_TAG', 'Tail Part Tag', ['Tail', 'Neck/Head', 'Hand', 'Leg']),
    enumGene('NECK_TAG', 'Neck Part Tag', ['Neck/Head', 'Tail', 'Leg', 'Hand']),

    // Joint types (advanced) — affect position, not part shape
    enumGene('LEG_JOINT_TYPE', 'Leg Joint',
      ['Joint 0', 'Joint 1', 'Joint 2', 'Joint 0'], true),
    enumGene('ARM_JOINT_TYPE', 'Arm Joint',
      ['Joint 0', 'Joint 1', 'Joint 2', 'Joint 0'], true),
    enumGene('NECK_JOINT_TYPE', 'Neck Joint',
      ['Joint 1', 'Joint 0', 'Joint 2', 'Joint 0'], true),
    enumGene('TAIL_JOINT_TYPE', 'Tail Joint',
      ['Joint 0', 'Joint 1', 'Joint 0', 'Joint 0'], true),

    // NECK_COCK, speed genes (advanced)
    autoSlider('NECK_COCK', 'Neck Cock', true),
    autoSlider('TAIL_SPEED', 'Tail Speed', true),
    autoSlider('NECK_SPEED', 'Neck Speed', true)
  ];

  // ==== BODY ====
  CONTROLS.body = [
    combined('bodyArea', 'Body Area',
      { min: 0.05, max: 8, step: 0.02,
        hint: 'SIZE x 2 x bones x CHEST_BIG x CHEST_SMALL x GIANT_DWARF',
        autoRange: function () {
          var sR = getRange('SIZE'), cbR = getRange('CHEST_BIG');
          var csR = getRange('CHEST_SMALL'), gdR = getRange('GIANT_DWARF');
          var bLo = getRange('BONES')[0] + getRange('BONES2')[0] + 1;
          var bHi = getRange('BONES')[1] + getRange('BONES2')[1] + 1;
          return [sR[0]*2*bLo*cbR[0]*csR[0]*gdR[0], sR[1]*2*bHi*cbR[1]*csR[1]*gdR[1]];
        },
        target:  function (ctx) { return ctx.ph.bodyArea; },
        resolve: function (ctx, target) {
          var boneFactor = ctx.gt.f('BONES') + ctx.gt.f('BONES2') + 1.0;
          var writes = cascadeResolve(ctx, target, ['SIZE', 'CHEST_BIG', 'CHEST_SMALL', 'GIANT_DWARF'], 2 * boneFactor);
          // Check if multiplicative genes were enough
          var achieved = 2 * boneFactor;
          for (var i = 0; i < writes.length; i++) {
            var s = C.snapGeneValue(writes[i].gene, writes[i].value);
            achieved *= s ? s.v : writes[i].value;
          }
          if (target > 0 && achieved > 0 && Math.abs(achieved / target - 1) > 0.1) {
            var mulProd = achieved / (2 * boneFactor);
            if (mulProd > 0) {
              var need = target / (2 * mulProd) - 1;
              var bR = getRange('BONES'), b2R = getRange('BONES2');
              var half = need / 2;
              writes.push({ gene: 'BONES', value: Math.max(bR[0], Math.min(bR[1], half)) });
              writes.push({ gene: 'BONES2', value: Math.max(b2R[0], Math.min(b2R[1], half)) });
            }
          }
          return writes;
        }
      }),
    combined('bodyShape', 'Body Shape',
      { min: 0.3, max: 8, step: 0.02,
        hint: '(CHEST_SMALL x SKINNY x ASPECT) / CHEST_BIG',
        autoRange: function () {
          var aR = getRange('ASPECT'), sR = getRange('SKINNY');
          var csR = getRange('CHEST_SMALL'), cbR = getRange('CHEST_BIG');
          if (cbR[0] <= 0) return [0.3, 8];
          return [aR[0]*sR[0]*csR[0]/cbR[1], aR[1]*sR[1]*csR[1]/cbR[0]];
        },
        target:  function (ctx) { return ctx.ph.bodyAspect; },
        resolve: function (ctx, target) {
          // target = ASPECT * SKINNY * CHEST_SMALL / CHEST_BIG
          var cb = ctx.gt.f('CHEST_BIG');
          if (cb <= 0) return null;
          return cascadeResolve(ctx, target * cb, ['ASPECT', 'SKINNY', 'CHEST_SMALL'], 1);
        }
      }),
    autoSlider('GUT', 'Gut'),
    enumGene('GUT_IS_UDDER', 'Gut is Udder', ['No', 'Udder', 'No', 'Arc']),
    autoSlider('DERRIERE', 'Derriere'),
    enumGene('OSTODERM', 'Osteoderm', ['Spikes', 'None', 'Spikes', 'Big']),
    higherAlleleToggle('OSTO_SIZE', 'Rounded Spikes', 3),
    alleleToggle('CHEST_SMALL', 'Sloped Chest', 3),
    autoSlider('OSTO_SIZE', 'Osteo Size'),

    // Advanced sub-components
    autoSlider('SIZE', 'Size (raw)', true),
    autoSlider('ASPECT', 'Aspect', true),
    autoSlider('SKINNY', 'Skinny', true),
    autoSlider('BONES', 'Bones', true),
    autoSlider('BONES2', 'Bones 2', true),
    autoSlider('CHEST_BIG', 'Chest Big', true),
    autoSlider('CHEST_SMALL', 'Chest Small', true),
    autoSlider('GIANT_DWARF', 'Giant / Dwarf', true),
    autoSlider('MUSCLE_USE', 'Muscle Use', true)
  ];

  // ==== LEGS ====
  CONTROLS.legs = [
    enumGene('LEG_TYPE', 'Leg Type', ['Normal', 'Stub', 'None', 'Normal']),
    enumGene('LEG_COUNT', 'Leg Count', ['1', '1', '2', '7']),
    combined('legLength', 'Leg Length',
      { min: 0.2, max: 2.5, step: 0.01,
        hint: 'LEG_LENGTH x (LEG_STRETCH + LEG_STRETCH2 + 1)',
        autoRange: function () {
          var llR = getRange('LEG_LENGTH');
          var sfLo = getRange('LEG_STRETCH')[0] + getRange('LEG_STRETCH2')[0] + 1;
          var sfHi = getRange('LEG_STRETCH')[1] + getRange('LEG_STRETCH2')[1] + 1;
          return [llR[0] * sfLo, llR[1] * sfHi];
        },
        target:  function (ctx) { return ctx.ph.legLength; },
        resolve: function (ctx, target) {
          var sf = ctx.gt.f('LEG_STRETCH') + ctx.gt.f('LEG_STRETCH2') + 1.0;
          var llR = getRange('LEG_LENGTH');
          var needed = sf > 0 ? target / sf : target;
          if (needed >= llR[0] && needed <= llR[1]) {
            return { gene: 'LEG_LENGTH', value: needed };
          }
          // Primary saturated; adjust stretch genes too
          var clamped = Math.max(llR[0], Math.min(llR[1], needed));
          var snapped = C.snapGeneValue('LEG_LENGTH', clamped);
          var actual = snapped ? snapped.v : clamped;
          var writes = [{ gene: 'LEG_LENGTH', value: clamped }];
          if (actual > 0) {
            var neededSF = target / actual;
            var need = neededSF - 1;
            var sR = getRange('LEG_STRETCH'), s2R = getRange('LEG_STRETCH2');
            var half = need / 2;
            writes.push({ gene: 'LEG_STRETCH', value: Math.max(sR[0], Math.min(sR[1], half)) });
            writes.push({ gene: 'LEG_STRETCH2', value: Math.max(s2R[0], Math.min(s2R[1], half)) });
          }
          return writes;
        }
      }),
    autoSlider('LEG_STRENGTH', 'Leg Thickness'),
    autoSlider('LEG_SKEW', 'Skew'),
    toggle('LEG_IS_CIRCLE', 'Circle Legs'),
    toggle('LEG_HAS_FOOT', 'Has Feet'),
    toggle('HAS_KNEE', 'Has Knees'),
    autoSlider('KNEE_MIN', 'Knee Min'),
    autoSlider('KNEE_MAX', 'Knee Max'),

    // Advanced
    autoSlider('LEG_LENGTH', 'Leg Length (raw)', true),
    autoSlider('LEG_STRETCH', 'Leg Stretch', true),
    autoSlider('LEG_STRETCH2', 'Leg Stretch 2', true),
    autoSlider('LEG_PENCIL', 'Pencil', true),
    autoSlider('LEG_IN', 'Leg In', true),
    autoSlider('LEG_IN2', 'Leg In 2', true),
    autoSlider('LEG_FLEXIBILITY', 'Leg Flexibility', true),
    autoSlider('LEG_FLEX_BIAS', 'Leg Flex Bias', true)
  ];

  // ==== ARMS ====
  CONTROLS.arms = [
    enumGene('ARM_TYPE', 'Arm Type', ['Normal', 'Stub', 'None', 'None']),
    combined('armLength', 'Arm Length',
      { min: 0.2, max: 2.0, step: 0.01,
        hint: 'ARM_LENGTH x (LEG_STRETCH + LEG_STRETCH2 + 1) x armTypeMod',
        autoRange: function (ctx) {
          var alR = getRange('ARM_LENGTH');
          var sfLo = getRange('LEG_STRETCH')[0] + getRange('LEG_STRETCH2')[0] + 1;
          var sfHi = getRange('LEG_STRETCH')[1] + getRange('LEG_STRETCH2')[1] + 1;
          var mod = ctx.ph.armType === 2 ? 0.5 : 1.0;
          return [alR[0] * sfLo * mod, alR[1] * sfHi * mod];
        },
        target:  function (ctx) { return ctx.ph.armLength; },
        resolve: function (ctx, target) {
          var sf = ctx.gt.f('LEG_STRETCH') + ctx.gt.f('LEG_STRETCH2') + 1.0;
          var mod = ctx.ph.armType === 2 ? 0.5 : 1.0;
          if (sf * mod <= 0) return null;
          var alR = getRange('ARM_LENGTH');
          var needed = target / (sf * mod);
          if (needed >= alR[0] && needed <= alR[1]) {
            return { gene: 'ARM_LENGTH', value: needed };
          }
          var clamped = Math.max(alR[0], Math.min(alR[1], needed));
          var snapped = C.snapGeneValue('ARM_LENGTH', clamped);
          var actual = snapped ? snapped.v : clamped;
          var writes = [{ gene: 'ARM_LENGTH', value: clamped }];
          if (actual * mod > 0) {
            var neededSF = target / (actual * mod);
            var need = neededSF - 1;
            var sR = getRange('LEG_STRETCH'), s2R = getRange('LEG_STRETCH2');
            var half = need / 2;
            writes.push({ gene: 'LEG_STRETCH', value: Math.max(sR[0], Math.min(sR[1], half)) });
            writes.push({ gene: 'LEG_STRETCH2', value: Math.max(s2R[0], Math.min(s2R[1], half)) });
          }
          return writes;
        }
      }),
    autoSlider('ARM_STRENGTH', 'Arm Thickness'),
    autoSlider('ARM_NODE_SCALE', 'Arm Node Scale'),
    toggle('ARM_HAS_HAND', 'Arm Has Hand'),
    toggle('HAS_HAND', 'Has Hands'),
    toggle('HAS_ELBOW', 'Has Elbows'),
    autoSlider('ELBOW_RANGE', 'Elbow Range'),
    autoSlider('HAND_WIDTH', 'Hand Width'),
    autoSlider('HAND_LENGTH', 'Hand Length'),
    autoSlider('HAND_FINGER', 'Fingers'),

    // Advanced
    autoSlider('ARM_LENGTH', 'Arm Length (raw)', true),
    autoSlider('ARM_SKEW', 'Arm Skew', true),
    autoSlider('ARM_STRETCH', 'Arm Stretch (unused)', true),
    autoSlider('ARM_STRETCH2', 'Arm Stretch 2 (unused)', true),
    autoSlider('ARM_FLEXIBILITY', 'Arm Flexibility', true),
    autoSlider('ARM_FLEX_BIAS', 'Arm Flex Bias', true)
  ];

  // ==== FEET ====
  CONTROLS.feet = [
    autoSlider('FOOT_SIZE', 'Foot Size'),
    autoSlider('FOOT_CLOWN', 'Clown Foot'),
    autoSlider('FOOT_THICKNESS', 'Foot Thickness'),
    autoSlider('FOOT_TOE', 'Foot Toe'),
    toggle('FOOT_IS_CIRCLE', 'Circle Foot'),
    toggle('FOOT_IS_HOOF', 'Hoof'),
    enumGene('FOOT_BACKWARDS', 'Foot Direction', ['Forward', 'Backward', 'Forward', 'Alt']),

    // Advanced
    toggle('HAS_FOOT', 'Has Foot (global)', undefined, undefined, true)
  ];

  // ==== TAIL ====
  CONTROLS.tail = [
    enumGene('TAIL_EXISTS', 'Tail Exists', ['Single', 'None', 'Single', 'Double']),
    enumGene('TAIL_SHAPE', 'Tail Shape', ['Tritail', 'Normal', 'Short', 'Chromosome']),
    combined('tailBaseLength', 'Tail Length',
      { min: 0.05, max: 1.4, step: 0.005,
        hint: 'TAIL_SHORT x TAIL_SIZE',
        autoRange: function () {
          var tsR = getRange('TAIL_SHORT'), tzR = getRange('TAIL_SIZE');
          return [tsR[0] * tzR[0], tsR[1] * tzR[1]];
        },
        target:  function (ctx) { return ctx.gt.f('TAIL_SHORT') * ctx.gt.f('TAIL_SIZE'); },
        resolve: function (ctx, target) {
          return cascadeResolve(ctx, target, ['TAIL_SHORT', 'TAIL_SIZE'], 1);
        }
      }),
    autoSlider('TAIL_ASPECT', 'Tail Base'),
    autoSlider('TAIL_SEGMENTS', 'Tail Segments'),
    colorEnum('TAIL_ALT', 'Tail Color', [
      coDyn('Inherit', function(ctx) { return ctx.colors ? ctx.colors.hex.BASE : '#d6922c'; }),
      coDyn('Spot', function(ctx) { return ctx.colors ? ctx.colors.hex.SPOT : '#d6cbbc'; }),
      coDyn('Alt', function(ctx) { return ctx.colors ? ctx.colors.hex.ALT : '#110b03'; }),
      coDyn('Inherit', function(ctx) { return ctx.colors ? ctx.colors.hex.BASE : '#d6922c'; })
    ]),

    // Advanced
    autoSlider('TAIL_SHORT', 'Tail Short (raw)', true),
    autoSlider('TAIL_SIZE', 'Tail Size', true),
    autoSlider('TAIL_FLEXIBILITY', 'Tail Flexibility', true),
    autoSlider('TAIL_STIFF', 'Tail Stiff', true)
  ];

  // ==== NECK & HEAD ====
  CONTROLS.neck = [
    enumGene('NECK_TYPE', 'Neck Type', ['Neck', 'Neck', 'Headless', 'Head only']),
    combined('neckLength', 'Neck Length',
      { min: 0, max: 3, step: 0.01,
        hint: 'NECK_LENGTH x bodyMaxDim/2 + NECK_GIRAFFE',
        autoRange: function (ctx) {
          if (ctx.gt.i('NECK_TYPE') === 2) return [0, 0.01];
          var nlR = getRange('NECK_LENGTH'), ngR = getRange('NECK_GIRAFFE');
          var half = ctx.ph.bodyMaxDim * 0.5;
          return [nlR[0] * half + ngR[0], nlR[1] * half + ngR[1]];
        },
        target:  function (ctx) { return ctx.ph.neckLength; },
        resolve: function (ctx, target) {
          if (ctx.gt.i('NECK_TYPE') === 2) return null;
          var half = ctx.ph.bodyMaxDim * 0.5;
          if (half <= 0) return null;
          var giraffe = ctx.gt.f('NECK_GIRAFFE');
          var nlR = getRange('NECK_LENGTH');
          var needed = (target - giraffe) / half;
          if (needed >= nlR[0] && needed <= nlR[1]) {
            return { gene: 'NECK_LENGTH', value: needed };
          }
          var clamped = Math.max(nlR[0], Math.min(nlR[1], needed));
          var snapped = C.snapGeneValue('NECK_LENGTH', clamped);
          var actual = snapped ? snapped.v : clamped;
          return [
            { gene: 'NECK_LENGTH', value: clamped },
            { gene: 'NECK_GIRAFFE', value: target - actual * half }
          ];
        }
      }),
    autoSlider('NECK_THICKNESS', 'Neck Thickness'),
    combined('headArea', 'Head Size',
      { min: 0.05, max: 3, step: 0.01,
        hint: '(HEAD_SIZE + HEAD_THICK_SKULL) x 0.33 x bones x HEAD_GIANT x HEAD_SHRUNK',
        autoRange: function () {
          var hsR = getRange('HEAD_SIZE'), htR = getRange('HEAD_THICK_SKULL');
          var bLo = getRange('BONES')[0] + getRange('BONES2')[0] + 1;
          var bHi = getRange('BONES')[1] + getRange('BONES2')[1] + 1;
          var hgR = getRange('HEAD_GIANT'), hsrR = getRange('HEAD_SHRUNK');
          return [
            (hsR[0]+htR[0]) * 0.33 * bLo * hgR[0] * hsrR[0],
            (hsR[1]+htR[1]) * 0.33 * bHi * hgR[1] * hsrR[1]
          ];
        },
        target:  function (ctx) { return ctx.ph.headArea; },
        resolve: function (ctx, target) {
          var bones = ctx.gt.f('BONES') + ctx.gt.f('BONES2') + 1.0;
          var f = 0.33 * bones * ctx.gt.f('HEAD_GIANT') * ctx.gt.f('HEAD_SHRUNK');
          if (f <= 0) return null;
          var thick = ctx.gt.f('HEAD_THICK_SKULL');
          var hsR = getRange('HEAD_SIZE');
          var needed = target / f - thick;
          if (needed >= hsR[0] && needed <= hsR[1]) {
            return { gene: 'HEAD_SIZE', value: needed };
          }
          // Primary saturated; adjust HEAD_GIANT and HEAD_SHRUNK
          var clamped = Math.max(hsR[0], Math.min(hsR[1], needed));
          var snapped = C.snapGeneValue('HEAD_SIZE', clamped);
          var headSum = (snapped ? snapped.v : clamped) + thick;
          if (headSum <= 0) return [{ gene: 'HEAD_SIZE', value: clamped }];
          var neededF = target / headSum;
          return [
            { gene: 'HEAD_SIZE', value: clamped },
            { gene: 'HEAD_GIANT', value: neededF / (0.33 * bones * ctx.gt.f('HEAD_SHRUNK')) },
            { gene: 'HEAD_SHRUNK', value: ctx.gt.f('HEAD_SHRUNK') }
          ];
        }
      }),
    autoSlider('HEAD_ASPECT', 'Head Aspect'),
    autoSlider('HEAD_SQUARE', 'Head Square'),
    enumGene('HEAD_HAS_BACK', 'Head Back', ['Yes (11)', 'No', 'No', 'Yes']),

    // Advanced
    autoSlider('NECK_LENGTH', 'Neck Length (raw)', true),
    autoSlider('NECK_GIRAFFE', 'Giraffe', true),
    autoSlider('HEAD_SIZE', 'Head Size (raw)', true),
    autoSlider('HEAD_THICK_SKULL', 'Thick Skull', true),
    autoSlider('HEAD_X_GROWTH', 'Head X Growth', true),
    autoSlider('HEAD_Y_GROWTH', 'Head Y Growth', true),
    autoSlider('HEAD_GIANT', 'Head Giant', true),
    autoSlider('HEAD_SHRUNK', 'Head Shrunk', true),
    toggle('HEAD_JOINTED', 'Head Jointed', undefined, undefined, true),
    toggle('HEAD_CHIMERA', 'Head Chimera', undefined, undefined, true)
  ];

  // ==== FACE ====
  CONTROLS.face = [
    enumGene('EYE_STYLE', 'Eye Style', ['Style 1', 'Style 2', 'Style 1', 'None']),
    enumGene('BUGEYE', 'Bugeye', ['Normal', 'Out', 'Normal', 'In']),
    autoSlider('EYEBOX_SIZE', 'Eye Box Size'),
    autoSlider('EYE_SIZE', 'Eye Size'),
    autoSlider('PUPIL_SIZE', 'Pupil Size'),
    toggle('HAS_PUPIL', 'Has Pupil'),
    colorEnum('EYE_HUE', 'Eye Color', [
      co('Amber', '#d6ab6b'),
      co('Blue', '#6b70d6'),
      co('Green', '#6bd6a6'),
      co('Cyan', '#6bb6d6')
    ]),
    colorEnum('RACCOON_EYE', 'Raccoon Eye', [
      co('None', null),
      coDyn('Spot', function(ctx) { return ctx.colors ? ctx.colors.hex.SPOT : '#d6cbbc'; }),
      coDyn('Alt', function(ctx) { return ctx.colors ? ctx.colors.hex.ALT : '#110b03'; }),
      co('None', null)
    ]),

    // Ears
    enumGene('EAR_STYLE', 'Ear Style', ['Up', 'Down', 'None', 'None']),
    enumGene('EAR_SHAPE', 'Ear Shape', ['Triangle', 'Rectangle', 'None', 'Triangle']),
    autoSlider('EAR_SIZE', 'Ear Size'),
    autoSlider('EAR_ASPECT', 'Ear Aspect'),
    colorEnum('EAR_COMP', 'Ear Color', [
      co('None', null),
      co('None', null),
      coDyn('Alt', function(ctx) { return ctx.colors ? ctx.colors.hex.ALT : '#110b03'; }),
      coDyn('Spot', function(ctx) { return ctx.colors ? ctx.colors.hex.SPOT : '#d6cbbc'; })
    ]),

    // Mouth / teeth
    enumGene('TEETH_SHAPE', 'Teeth Shape', ['None', 'Flat', 'Fangs', 'Carnivore']),
    toggle('HAS_MOUTH', 'Has Mouth'),
    autoSlider('MOUTH_Y', 'Mouth Y'),
    autoSlider('MOUTH_SIZE', 'Mouth Size'),
    autoSlider('JAW', 'Jaw'),
    autoSlider('TONGUE', 'Tongue'),

    // Nose
    enumGene('NOSE_STYLE', 'Nose Style', ['Rect', 'Triangle', 'Circle', 'None']),
    toggle('NOSE_INNY', 'Nose Inny'),
    autoSlider('NOSE_SIZE', 'Nose Size'),
    autoSlider('NOSE_INTERIOR', 'Nose Interior'),
    colorEnum('NOSE_HUE', 'Nose Color', [
      co('Black', '#110b03'),
      coDyn('Skin', function(ctx) { return ctx.colors ? ctx.colors.hex.SKIN : '#c3c6c9'; }),
      coDyn('Alt', function(ctx) { return ctx.colors ? ctx.colors.hex.ALT : '#110b03'; }),
      coDyn('Base', function(ctx) { return ctx.colors ? ctx.colors.hex.BASE : '#d6922c'; })
    ]),

    // Advanced
    autoSlider('EYEBOX_X', 'Eye Box X', true),
    autoSlider('EYEBOX_Y', 'Eye Box Y', true),
    autoSlider('BROW_SIZE', 'Brow Size', true),
    autoSlider('BROW_SLANT', 'Brow Slant', true),
    autoSlider('EAR_X', 'Ear X', true),
    autoSlider('EAR_SLANT', 'Ear Slant', true),
    autoSlider('EAR_FLOP', 'Ear Flop', true),
    autoSlider('EAR_INTERIOR', 'Ear Interior', true),
    autoSlider('NOSE_Y', 'Nose Y', true),
    toggle('TEETH_UPPER', 'Teeth Upper', undefined, undefined, true),
    toggle('TEETH_UPPER2', 'Teeth Upper 2', undefined, undefined, true),
    enumGene('TONGUE_SEGS', 'Tongue Segments', ['0', '1', '2', '0'], true)
  ];

  // ==== COLORS ====
  CONTROLS.colors = [
    // Color pickers with reverse mapping
    colorPicker('base', 'Pick Base Color', 'BASE', BASE_COLOR_TABLE),
    colorPicker('alt', 'Pick Alt Color', 'ALT', ALT_COLOR_TABLE),
    skinPicker('skin', 'Pick Skin Color'),

    // Base color group — these genes combine to determine the coat BASE color
    group('baseColor', 'Base Color (genes)', [
      colorEnum('BASE_RED', 'Red', [
        co('None', '#d6922c'),
        co('Red', '#e83a57'),
        co('Magenta', '#db30a2'),
        co('Crimson', '#c93c59')
      ]),
      colorEnum('BASE_GREEN', 'Green', [
        co('None', '#d6922c'),
        co('Yellow-Green', '#b0a207'),
        co('Green', '#36e345'),
        co('Dark Green', '#1c570b')
      ]),
      colorEnum('BASE_BROWN', 'Brown', [
        co('Default', '#d6922c'),
        co('Warm Brown', '#7a3f00'),
        co('Dark Brown', '#47310f'),
        co('Default', '#d6922c')
      ]),
      autoSlider('BASE_CREAM', 'Cream'),
      toggle('GREEN_KNOCKOUT', 'Green Knockout')
    ], {
      collapsed: true,
      swatch: function(ctx) { return ctx.colors ? ctx.colors.hex.BASE : '#d6922c'; }
    }),
    toggle('BASE_BLACK', 'Base Black'),
    toggle('AGOUTI', 'Agouti'),
    toggle('WHITE', 'White Coat'),
    toggle('WHITE_IS_LETHAL', 'White is Lethal'),
    toggle('SPOT_YELLOW', 'Spot Yellow'),
    colorEnum('ALT_BLUE', 'Alt Blue', [
      co('Black', '#110b03'),
      co('Black', '#110b03'),
      co('Blue', '#30a2db'),
      co('Green', '#36e345')
    ]),
    colorEnum('SKIN_HUE', 'Skin Hue', [
      co('0', '#c3c6c9'),
      co('1', '#ffa799'),
      co('2', '#8f3636'),
      co('3', '#82d7ff')
    ]),
    colorEnum('SKIN_HUE2', 'Skin Hue 2', [
      co('0', '#c3c6c9'),
      co('1', '#ffa799'),
      co('2', '#8f3636'),
      co('3', '#82d7ff')
    ]),
    colorEnum('HOOF_COLOR', 'Hoof Color', [
      co('Brown', '#47310f'),
      co('Brown', '#47310f'),
      co('Black', '#110b03'),
      co('Blue', '#4661e8')
    ]),
    colorEnum('SKIN_HEAD', 'Skin Head', [
      co('None', null),
      coDyn('Ears', function(ctx) { return ctx.colors ? ctx.colors.hex.SKIN : '#c3c6c9'; }),
      co('None', null),
      coDyn('Full', function(ctx) { return ctx.colors ? ctx.colors.hex.SKIN : '#c3c6c9'; })
    ]),
    colorEnum('SKIN_HANDS', 'Skin Hands', [
      co('None', null),
      coDyn('Hands', function(ctx) { return ctx.colors ? ctx.colors.hex.SKIN : '#c3c6c9'; }),
      co('None', null),
      coDyn('Limbs', function(ctx) { return ctx.colors ? ctx.colors.hex.SKIN : '#c3c6c9'; })
    ]),
    colorEnum('BELLY_ALT', 'Belly Alt', [
      co('None', null),
      coDyn('Alt', function(ctx) { return ctx.colors ? ctx.colors.hex.ALT : '#110b03'; }),
      coDyn('Spot', function(ctx) { return ctx.colors ? ctx.colors.hex.SPOT : '#d6cbbc'; }),
      coDyn('Alt', function(ctx) { return ctx.colors ? ctx.colors.hex.ALT : '#110b03'; })
    ]),
    toggle('SWAP_BASE_SPOT', 'Swap Base / Spot'),
    toggle('SWAP_ALT_SPOT', 'Swap Alt / Spot')
  ];

  // ==== PATTERNS ====
  CONTROLS.patterns = [
    autoSlider('PAT_SPLIT', 'Pattern Split'),
    autoSlider('PAT_BELLY', 'Pattern Belly'),
    autoSlider('PAT_STRIPE', 'Stripe'),
    autoSlider('PAT_SPOT', 'Spot'),
    autoSlider('PAT_PERLIN', 'Perlin'),
    autoSlider('PAT_PERLIN2', 'Perlin 2'),
    autoSlider('PAT_PERLIN_SIZE', 'Perlin Size')
  ];

  // ==== ANTLERS / HAT ====
  CONTROLS.antlers = [
    toggle('HAS_ANTLERS', 'Has Antlers'),
    enumGene('ANTLER_X', 'Antler X Position', ['Center', 'Left', 'Right', 'Center']),
    autoSlider('ANTLER_W', 'Antler Width'),
    autoSlider('ANTLER_H', 'Antler Height'),
    autoSlider('ANTLER_TAPER', 'Antler Taper'),
    autoSlider('ANTLER_POM', 'Antler Pom'),
    enumGene('ANTLER_MOD', 'Antler Mod', ['3', '2', '1', '3']),
    autoSlider('ANTLER_REC', 'Antler Rec'),
    autoSlider('ANTLER_REC2', 'Antler Rec 2'),
    toggle('ANTLER_FLIP', 'Antler Flip'),
    autoSlider('ANTLER_ANGLE', 'Antler Angle'),
    autoSlider('ANTLER_ANGLE2', 'Antler Angle 2'),
    autoSlider('ANTLER_ANGLE_RAND', 'Angle Randomness'),
    autoSlider('ANTLER_SCALEH', 'Antler Scale H'),
    autoSlider('ANTLER_SCALEW', 'Antler Scale W'),
    colorEnum('ANTLER_COLOR', 'Antler Color', [
      co('Light Grey', '#adafb3'),
      co('Gold', '#d6a660'),
      co('Grey', '#8a8a8a'),
      co('Silver', '#c3c6c9')
    ]),
    colorEnum('POM_COLOR', 'Pom Color', [
      co('Light Grey', '#adafb3'),
      co('Black', '#110b03'),
      co('Grey', '#8a8a8a'),
      co('Yellow', '#d8db30')
    ]),
    toggle('POM_USECOLOR', 'Pom Use Color'),

    // Hat
    toggle('HAT_EXISTS', 'Has Hat'),
    autoSlider('HAT_SIZE', 'Hat Size'),
    autoSlider('HAT_RAKE', 'Hat Rake'),
    autoSlider('HAT_ASPECT', 'Hat Aspect'),
    autoSlider('HAT_TAPER', 'Hat Taper'),
    autoSlider('HAT_POM', 'Hat Pom'),
    toggle('HAT_POM_IS_LID', 'Pom is Lid'),
    autoSlider('HAT_CLONE', 'Hat Clone'),
    toggle('HAT_FLIP', 'Hat Flip'),

    // Advanced
    autoSlider('ANTLER_T1', 'Antler T1', true),
    autoSlider('ANTLER_T2', 'Antler T2', true),
    autoSlider('HAT_BACK_SCALE', 'Hat Back Scale', true),
    autoSlider('HAT_FRONT_SCALE', 'Hat Front Scale', true),
    autoSlider('HAT_BACK_ANGLE', 'Hat Back Angle', true),
    autoSlider('HAT_FRONT_ANGLE', 'Hat Front Angle', true),
    autoSlider('HAT_ANGLE_RAND', 'Hat Angle Rand', true),
    autoSlider('HAT_T', 'Hat T', true)
  ];

  // ==== BEHAVIOR ====
  CONTROLS.behavior = [
    autoSlider('SPEED_FACTOR', 'Speed Factor'),
    autoSlider('LITTER_SIZE', 'Litter Size'),
    toggle('OMNIVORE', 'Omnivore'),
    toggle('HIGH_INTELLECT', 'High Intellect'),
    toggle('RAMPAGE', 'Rampage'),
    toggle('SPINAL_LOCO', 'Spinal Loco'),
    toggle('BRAIN_SPASTIC', 'Brain Spastic'),
    toggle('NARCOLEPSY', 'Narcolepsy'),
    toggle('LIMP', 'Limp'),
    autoSlider('STIFF_JOINTS', 'Stiff Joints'),

    // Advanced — physics, health, misc
    autoSlider('BREAK_FORCE', 'Break Force', true),
    autoSlider('OLD_AGE', 'Old Age', true),
    toggle('FLU_IMMUNITY', 'Flu Immunity', undefined, undefined, true),
    toggle('TAIL_WAG', 'Tail Wag', undefined, undefined, true),
    toggle('LEG_AND_ARM_LIMP', 'Leg & Arm Limp', undefined, undefined, true),
    toggle('NECK_STIFF', 'Neck Stiff', undefined, undefined, true),
    autoSlider('NECK_FLEXIBILITY', 'Neck Flexibility', true),
    autoSlider('NECK_FLEX_BIAS', 'Neck Flex Bias', true),

    // Advanced — locomotion signals
    autoSlider('L_LEG_SIGNAL', 'Leg Signal', true),
    autoSlider('L_LEG_FTOB_REACT', 'Leg FtoB React', true),
    autoSlider('L_LEG_FTOB_EVENT', 'Leg FtoB Event', true),
    autoSlider('L_LEG_BTOF_REACT', 'Leg BtoF React', true),
    autoSlider('L_LEG_BTOF_EVENT', 'Leg BtoF Event', true),
    autoSlider('L_ARM_SIGNAL', 'Arm Signal', true),
    autoSlider('L_ARM_FTOB_REACT', 'Arm FtoB React', true),
    autoSlider('L_ARM_FTOB_EVENT', 'Arm FtoB Event', true),
    autoSlider('L_ARM_BTOF_REACT', 'Arm BtoF React', true),
    autoSlider('L_ARM_BTOF_EVENT', 'Arm BtoF Event', true),
    autoSlider('L_TAIL_SIGNAL', 'Tail Signal', true),
    autoSlider('L_TAIL_FTOB_REACT', 'Tail FtoB React', true),
    autoSlider('L_TAIL_FTOB_EVENT', 'Tail FtoB Event', true),
    autoSlider('L_TAIL_BTOF_REACT', 'Tail BtoF React', true),
    autoSlider('L_TAIL_BTOF_EVENT', 'Tail BtoF Event', true),
    autoSlider('L_NECK_SIGNAL', 'Neck Signal', true),
    autoSlider('L_NECK_FTOB_REACT', 'Neck FtoB React', true),
    autoSlider('L_NECK_FTOB_EVENT', 'Neck FtoB Event', true),
    autoSlider('L_NECK_BTOF_REACT', 'Neck BtoF React', true),
    autoSlider('L_NECK_BTOF_EVENT', 'Neck BtoF Event', true),
    toggle('LOCO_SYNC', 'Loco Sync', undefined, undefined, true)
  ];

  var SECTIONS = [
    { key: 'posture',  label: 'Posture' },
    { key: 'body',     label: 'Body' },
    { key: 'legs',     label: 'Legs' },
    { key: 'arms',     label: 'Arms & Hands' },
    { key: 'feet',     label: 'Feet' },
    { key: 'tail',     label: 'Tail' },
    { key: 'neck',     label: 'Neck & Head' },
    { key: 'face',     label: 'Face' },
    { key: 'colors',   label: 'Colors' },
    { key: 'patterns', label: 'Patterns' },
    { key: 'antlers',  label: 'Antlers & Hat' },
    { key: 'behavior', label: 'Behavior' }
  ];

  function findSpec(id) {
    for (var sk in CONTROLS) {
      var arr = CONTROLS[sk];
      for (var i = 0; i < arr.length; i++) {
        if (arr[i].id === id) return arr[i];
      }
    }
    return null;
  }

  // ---------- preconditions (gene -> reason when inactive) ----------
  var noMouth = function(ctx) { return !ctx.ph.hasMouth ? 'Requires Has Mouth' : null; };
  var noAntlers = function(ctx) { return ctx.gt.i('HAS_ANTLERS') === 0 ? 'Requires Has Antlers' : null; };
  var noLegs = function(ctx) { return ctx.gt.i('LEG_TYPE') === 0 ? 'No legs' : null; };
  var noArms = function(ctx) { return ctx.gt.i('ARM_TYPE') === 0 ? 'No arms' : null; };
  var uparmBlocked = function(ctx) {
    return ctx.ph.tailExists > 0 && !ctx.ph.tailBottom &&
      ctx.ph.posture !== 'biped' && ctx.ph.posture !== 'centaur'
      ? 'Blocked by tail position' : null;
  };

  var PRECONDITIONS = {
    PAT_SPOT: function(ctx) { return ctx.gt.f('PAT_STRIPE') === 0 ? 'Requires Stripe > 0' : null; },
    FOOT_IS_CIRCLE: function(ctx) { return ctx.gt.i('LEG_IS_CIRCLE') !== 1 ? 'Requires Circle Legs' : null; },
    AGOUTI: function(ctx) { return ctx.gt.i('BASE_BLACK') !== 1 ? 'Requires Base Black' : null; },
    MOUTH_Y: noMouth, MOUTH_SIZE: noMouth, JAW: noMouth,
    TEETH_SHAPE: noMouth, TONGUE: noMouth, TONGUE_SEGS: noMouth,
    TEETH_UPPER: noMouth, TEETH_UPPER2: noMouth,
    RACCOON_EYE: function(ctx) { return ctx.gt.i('SKIN_HEAD') >= 1 ? 'Overridden by Skin Head' : null; },
    HAS_KNEE: noLegs, KNEE_MIN: noLegs, KNEE_MAX: noLegs,
    HAS_ELBOW: noArms, ELBOW_RANGE: noArms,
    NECK_ONTOP: function(ctx) { return ctx.ph.posture === 'centaur' ? 'Skipped for centaur' : null; },
    NECK_SLOUCH: function(ctx) { return ctx.ph.posture === 'centaur' ? 'Skipped for centaur' : null; },
    TAIL_BOTTOM: function(ctx) {
      var p = ctx.ph.posture;
      return p !== 'quadruped' && p !== 'centaur' ? 'Quadruped only' : null;
    },
    UPARM_Y: uparmBlocked, UPARM_ANGLE: uparmBlocked, UPARM_GOOFY: uparmBlocked, UPARM_TAG: uparmBlocked,
    ANTLER_X: noAntlers, ANTLER_W: noAntlers, ANTLER_H: noAntlers,
    ANTLER_TAPER: noAntlers, ANTLER_POM: noAntlers, ANTLER_REC: noAntlers,
    ANTLER_REC2: noAntlers, ANTLER_FLIP: noAntlers, ANTLER_MOD: noAntlers,
    ANTLER_SCALEH: noAntlers, ANTLER_SCALEW: noAntlers,
    ANTLER_ANGLE: noAntlers, ANTLER_ANGLE2: noAntlers, ANTLER_ANGLE_RAND: noAntlers,
    ANTLER_COLOR: noAntlers, POM_COLOR: noAntlers, POM_USECOLOR: noAntlers,
    ANTLER_T1: noAntlers, ANTLER_T2: noAntlers,
    HAT_EXISTS: noAntlers, HAT_SIZE: noAntlers, HAT_RAKE: noAntlers,
    HAT_ASPECT: noAntlers, HAT_TAPER: noAntlers, HAT_POM: noAntlers,
    HAT_POM_IS_LID: noAntlers, HAT_CLONE: noAntlers,
    HAT_BACK_SCALE: noAntlers, HAT_FRONT_SCALE: noAntlers,
    HAT_BACK_ANGLE: noAntlers, HAT_FRONT_ANGLE: noAntlers,
    HAT_ANGLE_RAND: noAntlers, HAT_FLIP: noAntlers, HAT_T: noAntlers
  };

  // ---------- allele-driven annotations ----------
  var ANNOTATIONS = {
    CHEST_SMALL: function(ctx) {
      return ctx.gt.hasAllele('CHEST_SMALL', 3) ? 'Sloped Chest' : null;
    },
    OSTO_SIZE: function(ctx) {
      var p = ctx.gt.pair('OSTO_SIZE');
      var notes = [];
      if (p[1] === 3) notes.push('Rounded');
      if (p[0] === 3) notes.push('Forces Ostoderm=2');
      return notes.length ? notes.join(', ') : null;
    },
    LEG_IN2: function(ctx) {
      return ctx.gt.pair('LEG_IN2')[0] === 3 ? 'Bug: back leg +0.2' : null;
    },
    LEG_IS_CIRCLE: function(ctx) {
      if (ctx.gt.i('LEG_IS_CIRCLE') !== 1) return null;
      return !ctx.ph.legHasFoot || !ctx.ph.footIsCircle ? 'Wheel mode' : 'Foot circle mode';
    },
    BASE_BLACK: function(ctx) {
      if (ctx.gt.i('BASE_BLACK') !== 1) return null;
      return ctx.gt.i('AGOUTI') === 1 ? 'Bay (with Agouti)' : 'Full black points';
    },
    WHITE: function(ctx) {
      if (ctx.gt.i('WHITE') !== 1) return null;
      return ctx.gt.i('WHITE_IS_LETHAL') === 1 ? 'White + Lethal' : 'White coat';
    }
  };

  // ---------- apply preconditions & annotations to all controls ----------
  function applyMeta(specs) {
    for (var i = 0; i < specs.length; i++) {
      var s = specs[i];
      if (s.gene) {
        if (PRECONDITIONS[s.gene]) s.disabledWhen = PRECONDITIONS[s.gene];
        if (ANNOTATIONS[s.gene]) s.annotation = ANNOTATIONS[s.gene];
      }
      if (s.children) applyMeta(s.children);
    }
  }
  Object.keys(CONTROLS).forEach(function(key) { applyMeta(CONTROLS[key]); });

  root.EditorSpecs = {
    CONTROLS: CONTROLS,
    SECTIONS: SECTIONS,
    PALETTE: PALETTE,
    SKIN_COLORS: SKIN_COLORS,
    findSpec: findSpec,
    autoSlider: autoSlider,
    toggle: toggle,
    enumGene: enumGene,
    colorEnum: colorEnum,
    combined: combined
  };
})(typeof window !== 'undefined' ? window : this);
