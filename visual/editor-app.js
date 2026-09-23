// editor-app.js — main application loop and UI construction.
'use strict';
(function(root){
  var D = root.HorseyData;
  var C = root.EditorCore;
  var S = root.EditorSpecs;
  if (!D || !C || !S) { console.error('Editor dependencies missing'); return; }

  // ---- state ----
  var lines = C.makeWildtypeLines();
  var gt = null, ph = null, colors = null, parts = null, hash = 0;
  var updating = false;
  var controlRefs = Object.create(null); // id → { el, spec, input, valueEl, swatch? }
  var previewZoom = 4;
  var previewBg = null;
  // False until a genome has really been loaded (paste, Apply, ?dna=, Pop, library). The
  // wildtype shown at boot is a placeholder, so partial input then is filled randomly
  // rather than from it - see GenomeText.normalize's `previous`.
  var hasLoadedGenome = false;
  var pop = null, library = null, customData = null;
  var UI_KEY_PREFIX = 'visual_';   // per-tool UI state; never synced with the other tools

  // ---- DOM ----
  var editorPanel = document.getElementById('editorPanel');
  var canvas      = document.getElementById('preview');
  var dimsEl      = document.getElementById('dims');
  var tagsEl      = document.getElementById('tagsPanel');
  var rawEl       = document.getElementById('rawGenome');
  var rawStatus   = document.getElementById('rawStatus');
  var sectionNav  = document.getElementById('sectionNav');

  // ---- parsing / state ----
  function refreshState() {
    var text = lines.join('\n');
    var parsed = root.Genome.parse(text);
    if (!parsed.ok) return false;
    gt = new root.Genome.Genotype(parsed.alleles);
    hash = root.Genome.hash(parsed.alleles);
    ph = root.Phenotype.build(gt);
    colors = root.Colors.build(gt, hash);
    parts = root.Rig.build(ph, colors, hash);
    return true;
  }

  function buildContext() {
    return { gt: gt, ph: ph, colors: colors, lines: lines };
  }

  // ---- genome changed: one path for every source ----
  // Everything that shows the genome is refreshed here: raw text, preview, tags, controls,
  // the DNA code / links, the URL and the Pop validity dots.
  function afterGenomeChange() {
    if (rawEl) rawEl.value = lines.join('\n');
    renderPreview();
    renderTags();
    syncControls();
    updateCode();
    if (pop) pop.genomeChanged();
  }

  // Re-derive state from `lines` and refresh everything.
  function commit() {
    if (!refreshState()) return false;
    afterGenomeChange();
    return true;
  }

  // ---- toast ----
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function toast(msg, kind, ms) {
    if (!toastEl) { console.log(msg); return; }
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (kind ? ' ' + kind : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.className = 'toast'; }, ms || 2200);
  }

  function uiGet(key, dflt) {
    try { var v = localStorage.getItem(UI_KEY_PREFIX + key); return v === null ? dflt : v; }
    catch (e) { return dflt; }
  }
  function uiSet(key, v) { try { localStorage.setItem(UI_KEY_PREFIX + key, v); } catch (e) {} }

  // Side-panel <details> remember whether they were open (per tool, not synced).
  function persistPanels() {
    document.querySelectorAll('.side-panel details.section[data-panel]').forEach(function (d) {
      var key = d.getAttribute('data-panel') + '_open';
      var v = uiGet(key, null);
      if (v !== null) d.open = v === '1';
      d.addEventListener('toggle', function () { uiSet(key, d.open ? '1' : '0'); });
    });
  }

  // ---- resizable editor | side panel split ----
  // ../js/splitter.js (shared with SIMPR): drag the divider, or focus it and use arrow keys;
  // double-click resets. Clamped so neither panel collapses; remembered per tool.
  var SIDE_DEFAULT = 520, SIDE_MIN = 320, EDITOR_MIN = 360;

  function initSplitter() {
    var mainEl = document.querySelector('main');
    var splitter = document.getElementById('splitter');
    if (!mainEl || !splitter || !root.Splitter) return;
    root.Splitter.attach({
      handle: splitter, container: mainEl, cssVar: '--side-w', side: 'right',
      min: SIDE_MIN, defaultWidth: SIDE_DEFAULT, storageKey: UI_KEY_PREFIX + 'side_w',
      max: function () { return mainEl.clientWidth - EDITOR_MIN - splitter.offsetWidth; }
    });
  }

  // ---- DNA code, links, ?dna= ----
  var codeEl = document.getElementById('dnaCode');
  var currentCode = '';
  var urlTimer = null;

  function updateCode() {
    try { currentCode = root.GenomeText.encode(lines); }
    catch (e) { currentCode = ''; }
    if (codeEl && document.activeElement !== codeEl) codeEl.value = currentCode;
    var q = currentCode ? '?dna=' + currentCode : '';
    var s1 = document.getElementById('lnkSimpr');
    var s2 = document.getElementById('lnkShortener');
    if (s1) s1.href = '../simpr.html' + q;
    if (s2) s2.href = '../index.html' + q;
    // history.replaceState is rate-limited (Safari throws past ~100 calls / 30 s) and slider
    // drags fire continuously, so the URL is written on a trailing edge.
    if (urlTimer) clearTimeout(urlTimer);
    urlTimer = setTimeout(function () {
      try { history.replaceState(null, '', location.pathname + q); } catch (e) {}
    }, 300);
  }

  function shareLink() {
    return location.origin + location.pathname + '?dna=' + currentCode;
  }

  function copyText(text, btn, label) {
    if (!navigator.clipboard) { toast('Clipboard not available', 'error'); return; }
    navigator.clipboard.writeText(text).then(function () {
      if (btn) {
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = label; }, 1200);
      }
    }, function () { toast('Clipboard access denied', 'error'); });
  }

  // Allele pairs in the shape PopPresets' validity dots want. Needs genes.js loaded.
  function genePairs() {
    if (typeof arrayHp === 'undefined' || !arrayHp[0] || !arrayHp[0][0]) return [];
    var out = [];
    for (var h = 0; h < 20; h++) {
      var a = lines[h * 2], b = lines[h * 2 + 1];
      var sa = a.substring(a.indexOf(':') + 1), sb = b.substring(b.indexOf(':') + 1);
      for (var p = 0; p < arrayHp[h].length; p++) {
        var e = arrayHp[h][p];
        out.push({ desc: e.desc, n: e.n, allele1: sa.charAt(p), allele2: sb.charAt(p) });
      }
    }
    return out;
  }

  // ---- render preview ----
  function renderPreview() {
    if (!parts || !canvas) return;
    try {
      var info = root.Render.render(canvas, parts, ph, colors, hash, {
        zoom: previewZoom, background: previewBg
      });
      if (dimsEl) dimsEl.textContent = info.width + '×' + info.height +
        ' @1×  ·  shown ' + previewZoom + '×  ·  ' + parts.length + ' parts' +
        (C.customGenes.active ? '  ·  custom genes.xml' : '');
    } catch (e) {
      console.error(e);
    }
  }

  // ---- tags ----
  function buildTags() {
    if (!parts || !ph) return [];
    var set = Object.create(null);
    function add(t) { if (t) set[t] = 1; }
    for (var i = 0; i < parts.length; i++) if (parts[i].tag) add(parts[i].tag);
    add(ph.posture);
    if (ph.legWheel)   add('wheeled');
    if (ph.footIsHoof) add('hoofed');
    if (ph.antler && ph.antler.w > 0) add('antlers');
    if (ph.hat && ph.hat.w > 0)       add('hat');
    if (ph.tailExists > 0)            add('tail');
    if (ph.tailDouble)                add('double-tail');
    if (ph.hasHead)     add('head');
    if (ph.hasNeck)     add('neck');
    if (ph.hasMouth)    add('mouth');
    if (ph.hasPupil)    add('pupil');
    if (ph.armHasHand)  add('hands');
    if (ph.hasFoot)     add('feet');
    if (ph.legJointed)  add('knees');
    if (ph.armJointed)  add('elbows');
    if (ph.carnivore)   add('carnivore');
    if (ph.omnivore)    add('omnivore');
    if (ph.highIntellect) add('smart');
    if (ph.legType === 0) add('legless');
    if (ph.armType === 0) add('armless');
    return Object.keys(set).sort();
  }

  function renderTags() {
    if (!tagsEl) return;
    var tags = buildTags();
    tagsEl.innerHTML = tags.map(function (t) {
      return '<span class="tag">' + t + '</span>';
    }).join('');
  }

  // ---- resolve color for swatch ----
  function resolveSwatchColor(colorDef, ctx) {
    if (!colorDef) return null;
    if (typeof colorDef === 'function') {
      return colorDef(ctx);
    }
    return colorDef;
  }

  // ---- export PNG ----
  function exportPNG() {
    if (!canvas) return;
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'horsey-' + hash.toString(16).padStart(8, '0') + '.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  }

  // ---- search/filter ----
  function filterControls(query) {
    query = query.toLowerCase().trim();
    var sections = editorPanel.querySelectorAll('.section');
    sections.forEach(function (section) {
      var hasVisible = false;
      var controls = section.querySelectorAll('.control, .control-group');
      controls.forEach(function (el) {
        var id = el.getAttribute('data-control-id') || el.getAttribute('data-group-id');
        var ref = controlRefs[id];
        var spec = ref ? ref.spec : null;
        var matches = !query;
        if (spec && query) {
          if (spec.label && spec.label.toLowerCase().indexOf(query) >= 0) matches = true;
          if (spec.gene && spec.gene.toLowerCase().indexOf(query) >= 0) matches = true;
          if (spec.hint && spec.hint.toLowerCase().indexOf(query) >= 0) matches = true;
          if (spec.children) {
            spec.children.forEach(function (c) {
              if (c.gene && c.gene.toLowerCase().indexOf(query) >= 0) matches = true;
              if (c.label && c.label.toLowerCase().indexOf(query) >= 0) matches = true;
            });
          }
        }
        el.classList.toggle('hidden', !matches);
        if (matches) hasVisible = true;
      });
      section.classList.toggle('no-matches', !hasVisible && query);
    });
  }

  // ---- control building ----
  function buildControl(spec) {
    var row = document.createElement('div');
    row.className = 'control';
    row.setAttribute('data-control-id', spec.id);

    var label = document.createElement('div');
    label.className = 'control-label' + (spec.combined ? ' combined' : '');
    label.textContent = spec.label;
    if (spec.combined) {
      var b = document.createElement('span');
      b.className = 'badge';
      b.textContent = 'GROUP';
      label.appendChild(b);
    }
    if (spec.hint) label.title = spec.hint;
    row.appendChild(label);

    var inputWrap = document.createElement('div');
    inputWrap.className = 'control-input';
    row.appendChild(inputWrap);

    var valueEl = document.createElement('div');
    valueEl.className = 'control-value';
    row.appendChild(valueEl);

    var input = null;
    var swatch = null;

    if (spec.type === 'slider') {
      input = document.createElement('input');
      input.type = 'range';

      var rng = null;
      if (typeof spec.autoRange === 'function') {
        try {
          var ctx0 = buildContext();
          rng = spec.autoRange(ctx0);
        } catch (e) { rng = null; }
      }
      if (rng && isFinite(rng[0]) && isFinite(rng[1]) && rng[1] > rng[0]) {
        input.min = rng[0];
        input.max = rng[1];
        input.step = spec.step && spec.step > 0
                   ? spec.step
                   : (rng[1] - rng[0]) / 500;
      } else {
        input.min = spec.min;
        input.max = spec.max;
        input.step = spec.step || 0.01;
      }
      if (Number(input.min) === Number(input.max)) {
        input.max = Number(input.min) + 1;
      }

      input.addEventListener('input', function () {
        if (updating) return;
        applyControl(spec.id, parseFloat(input.value));
      });
      inputWrap.appendChild(input);

    } else if (spec.type === 'toggle') {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.addEventListener('change', function () {
        if (updating) return;
        applyControl(spec.id, input.checked);
      });
      inputWrap.appendChild(input);

    } else if (spec.type === 'dropdown') {
      input = document.createElement('select');
      for (var i = 0; i < spec.options.length; i++) {
        var o = document.createElement('option');
        o.value = String(spec.options[i].value);
        o.textContent = spec.options[i].label;
        input.appendChild(o);
      }
      input.addEventListener('change', function () {
        if (updating) return;
        var raw = input.value;
        var n = Number(raw);
        applyControl(spec.id, isNaN(n) ? raw : n);
      });
      inputWrap.appendChild(input);

    } else if (spec.type === 'colorDropdown') {
      var wrap = document.createElement('div');
      wrap.className = 'color-select-wrap';

      swatch = document.createElement('span');
      swatch.className = 'color-swatch';
      wrap.appendChild(swatch);

      input = document.createElement('select');
      for (var j = 0; j < spec.options.length; j++) {
        var opt = document.createElement('option');
        opt.value = String(spec.options[j].value);
        opt.textContent = spec.options[j].label;
        input.appendChild(opt);
      }
      input.addEventListener('change', function () {
        if (updating) return;
        var raw = input.value;
        var n = Number(raw);
        applyControl(spec.id, isNaN(n) ? raw : n);
      });
      wrap.appendChild(input);
      inputWrap.appendChild(wrap);

    } else if (spec.type === 'colorPicker') {
      var pickerWrap = document.createElement('div');
      pickerWrap.className = 'color-picker-wrap';

      var paletteDiv = document.createElement('div');
      paletteDiv.className = 'color-palette';
      var pal = spec.palette || [];
      for (var p = 0; p < pal.length; p++) {
        (function(entry) {
          var sw = document.createElement('button');
          sw.type = 'button';
          sw.className = 'palette-swatch';
          sw.style.backgroundColor = entry.hex;
          sw.title = entry.hex;
          sw.addEventListener('click', function () {
            if (updating) return;
            applyControl(spec.id, entry.hex);
          });
          paletteDiv.appendChild(sw);
        })(pal[p]);
      }
      pickerWrap.appendChild(paletteDiv);

      input = document.createElement('input');
      input.type = 'color';
      input.className = 'color-any';
      input.addEventListener('change', function () {
        if (updating) return;
        applyControl(spec.id, input.value);
      });
      pickerWrap.appendChild(input);

      inputWrap.appendChild(pickerWrap);

      swatch = document.createElement('span');
      swatch.className = 'color-swatch current-color';
      row.appendChild(swatch);

    } else if (spec.type === 'skinPicker') {
      var skinWrap = document.createElement('div');
      skinWrap.className = 'skin-picker-wrap';
      var skinPal = spec.palette || [];
      for (var sp = 0; sp < skinPal.length; sp++) {
        (function(idx) {
          var sw = document.createElement('button');
          sw.type = 'button';
          sw.className = 'skin-swatch';
          sw.style.backgroundColor = skinPal[idx];
          sw.title = 'HUE=' + (idx % 4) + ' HUE2=' + Math.floor(idx / 4);
          sw.addEventListener('click', function () {
            if (updating) return;
            applyControl(spec.id, idx);
          });
          skinWrap.appendChild(sw);
        })(sp);
      }
      inputWrap.appendChild(skinWrap);
      swatch = document.createElement('span');
      swatch.className = 'color-swatch current-color';
      row.appendChild(swatch);

    } else if (spec.type === 'group') {
      return null;
    }

    if (spec.hint) {
      var hint = document.createElement('div');
      hint.className = 'control-hint';
      hint.textContent = spec.hint;
      row.appendChild(hint);
    }

    // Annotation row (used for both context hints and "issue" annotations).
    var annotationEl = null;
    if (spec.annotation) {
      annotationEl = document.createElement('div');
      annotationEl.className = 'control-annotation';
      annotationEl.appendChild(document.createElement('span'));
      row.appendChild(annotationEl);
    }

    controlRefs[spec.id] = {
      el: row, spec: spec, input: input, valueEl: valueEl,
      swatch: swatch, annotationEl: annotationEl
    };
    return row;
  }

  function buildGroup(spec) {
    var groupEl = document.createElement('details');
    groupEl.className = 'control-group';
    groupEl.setAttribute('data-group-id', spec.id);
    if (!spec.collapsed) groupEl.open = true;

    var summary = document.createElement('summary');
    summary.className = 'control-group-header';

    var label = document.createElement('span');
    label.className = 'control-group-label';
    label.textContent = spec.label;
    summary.appendChild(label);

    var swatch = null;
    if (spec.swatch) {
      swatch = document.createElement('span');
      swatch.className = 'color-swatch group-swatch';
      summary.appendChild(swatch);
    }

    groupEl.appendChild(summary);

    var childWrap = document.createElement('div');
    childWrap.className = 'control-group-children';
    var children = spec.children || [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child.type === 'group') {
        var childGroup = buildGroup(child);
        if (childGroup) childWrap.appendChild(childGroup);
      } else {
        var ctrl = buildControl(child);
        if (ctrl) childWrap.appendChild(ctrl);
      }
    }
    groupEl.appendChild(childWrap);

    controlRefs[spec.id] = { el: groupEl, spec: spec, input: null, valueEl: null, swatch: swatch, isGroup: true };
    return groupEl;
  }

  function collectGenes(specs) {
    var genes = {};
    for (var i = 0; i < specs.length; i++) {
      var s = specs[i];
      if (s.gene) genes[s.gene] = true;
      if (s.children) {
        var cg = collectGenes(s.children);
        for (var g in cg) genes[g] = true;
      }
    }
    return genes;
  }

  function randomizeSection(sectionKey) {
    var specs = S.CONTROLS[sectionKey];
    if (!specs) return;
    var genes = collectGenes(specs);
    for (var name in genes) {
      var a = Math.floor(Math.random() * 4);
      var b = Math.floor(Math.random() * 4);
      C.writeGenePair(lines, name, a, b);
    }
    commit();
  }

  function buildSections() {
    editorPanel.innerHTML = '';
    var sections = S.SECTIONS;
    for (var i = 0; i < sections.length; i++) {
      var sdef = sections[i];
      var arr = S.CONTROLS[sdef.key] || [];
      if (!arr.length) continue;

      var mainSpecs = [];
      var advSpecs = [];
      for (var k = 0; k < arr.length; k++) {
        if (arr[k].advanced) advSpecs.push(arr[k]);
        else mainSpecs.push(arr[k]);
      }

      var details = document.createElement('details');
      details.className = 'section';
      details.open = true;
      details.setAttribute('data-section-key', sdef.key);
      var summary = document.createElement('summary');

      var labelSpan = document.createElement('span');
      labelSpan.textContent = sdef.label;
      summary.appendChild(labelSpan);

      (function(key) {
        var rndBtn = document.createElement('button');
        rndBtn.className = 'section-rnd ghost';
        rndBtn.textContent = 'Randomize';
        rndBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          randomizeSection(key);
        });
        summary.appendChild(rndBtn);
      })(sdef.key);

      details.appendChild(summary);

      var body = document.createElement('div');
      body.className = 'controls';

      for (var m = 0; m < mainSpecs.length; m++) {
        var mspec = mainSpecs[m];
        if (mspec.type === 'group') {
          var grp = buildGroup(mspec);
          if (grp) body.appendChild(grp);
        } else {
          var ctrl = buildControl(mspec);
          if (ctrl) body.appendChild(ctrl);
        }
      }

      if (advSpecs.length > 0) {
        var advDetails = document.createElement('details');
        advDetails.className = 'advanced-section';
        var advSummary = document.createElement('summary');
        advSummary.textContent = 'Advanced (' + advSpecs.length + ')';
        advDetails.appendChild(advSummary);

        var advBody = document.createElement('div');
        advBody.className = 'controls advanced-controls';
        for (var a = 0; a < advSpecs.length; a++) {
          advBody.appendChild(buildControl(advSpecs[a]));
        }
        advDetails.appendChild(advBody);
        body.appendChild(advDetails);
      }

      details.appendChild(body);
      editorPanel.appendChild(details);
    }
  }

  // ---- section navigation ----
  function buildSectionNav() {
    if (!sectionNav) return;
    sectionNav.innerHTML = '';
    var sections = S.SECTIONS;
    for (var i = 0; i < sections.length; i++) {
      (function (sdef) {
        var arr = S.CONTROLS[sdef.key] || [];
        if (!arr.length) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-btn';
        btn.textContent = sdef.label;
        btn.title = 'Jump to ' + sdef.label;
        btn.addEventListener('click', function () {
          var el = editorPanel.querySelector('details.section[data-section-key="' + sdef.key + '"]');
          if (!el) return;
          el.open = true;
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          el.classList.add('nav-flash');
          setTimeout(function () { el.classList.remove('nav-flash'); }, 900);
        });
        sectionNav.appendChild(btn);
      })(sections[i]);
    }
  }

  // ---- control sync ----
  function formatValue(v, spec) {
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    var step = spec.step || 0.001;
    if (step >= 1) return Math.round(v).toString();
    if (step >= 0.1) return v.toFixed(1);
    if (step >= 0.01) return v.toFixed(2);
    return v.toFixed(3);
  }

  function syncControls() {
    updating = true;
    var ctx = buildContext();
    for (var id in controlRefs) {
      var ref = controlRefs[id];
      var spec = ref.spec;
      var v;
      try { v = spec.read(ctx); } catch (e) { v = 0; }

      if (spec.type === 'slider') {
        var num = Number(v);
        if (isFinite(num)) ref.input.value = num;
        ref.valueEl.textContent = formatValue(num, spec);

      } else if (spec.type === 'toggle') {
        ref.input.checked = !!v;
        ref.valueEl.textContent = v ? 'on' : 'off';

      } else if (spec.type === 'dropdown') {
        ref.input.value = String(v);
        var opts = spec.options || [];
        for (var k = 0; k < opts.length; k++) {
          if (String(opts[k].value) === String(v)) {
            ref.valueEl.textContent = opts[k].label;
            break;
          }
        }

      } else if (spec.type === 'colorDropdown') {
        ref.input.value = String(v);
        var copts = spec.options || [];
        var foundOpt = null;
        for (var c = 0; c < copts.length; c++) {
          if (String(copts[c].value) === String(v)) {
            ref.valueEl.textContent = copts[c].label;
            foundOpt = copts[c];
            break;
          }
        }
        if (ref.swatch && foundOpt) {
          var swatchColor = resolveSwatchColor(foundOpt.color, ctx);
          if (swatchColor) {
            ref.swatch.style.backgroundColor = swatchColor;
            ref.swatch.style.display = 'inline-block';
          } else {
            ref.swatch.style.display = 'none';
          }
        } else if (ref.swatch) {
          ref.swatch.style.display = 'none';
        }

      } else if (spec.type === 'colorPicker') {
        var hexVal = v || '#888888';
        if (ref.input) ref.input.value = hexVal;
        if (ref.swatch) {
          ref.swatch.style.backgroundColor = hexVal;
          ref.swatch.style.display = 'inline-block';
        }
        if (ref.valueEl) ref.valueEl.textContent = hexVal;

      } else if (spec.type === 'skinPicker') {
        var skinHex = v || '#888888';
        if (ref.swatch) {
          ref.swatch.style.backgroundColor = skinHex;
          ref.swatch.style.display = 'inline-block';
        }
        if (ref.valueEl) ref.valueEl.textContent = skinHex;
        var skinSwatches = ref.el.querySelectorAll('.skin-swatch');
        for (var ss = 0; ss < skinSwatches.length; ss++) {
          skinSwatches[ss].classList.toggle('skin-active', skinSwatches[ss].style.backgroundColor === skinHex ||
            skinSwatches[ss].style.backgroundColor === hexToRgb(skinHex));
        }
      }

      if (ref.isGroup && ref.swatch && spec.swatch) {
        var groupSwatchColor = resolveSwatchColor(spec.swatch, ctx);
        if (groupSwatchColor) {
          ref.swatch.style.backgroundColor = groupSwatchColor;
          ref.swatch.style.display = 'inline-block';
        } else {
          ref.swatch.style.display = 'none';
        }
      }

      // Annotation row (context notes + precondition hints)
      if (spec.annotation && ref.annotationEl) {
        var note = null;
        try { note = spec.annotation(ctx); } catch (e) { note = null; }
        if (note) {
          var span = ref.annotationEl.firstChild;
          if (!span) {
            span = document.createElement('span');
            ref.annotationEl.appendChild(span);
          }
          span.textContent = note;
          ref.annotationEl.classList.add('visible');
        } else {
          ref.annotationEl.classList.remove('visible');
        }
      }
    }
    updating = false;
  }

  function hexToRgb(hex) {
    if (!hex || hex.charAt(0) !== '#') return '';
    var r = parseInt(hex.slice(1,3),16);
    var g = parseInt(hex.slice(3,5),16);
    var b = parseInt(hex.slice(5,7),16);
    return 'rgb(' + r + ', ' + g + ', ' + b + ')';
  }

  // ---- applying edits ----
  function applyControl(id, value) {
    var ref = controlRefs[id];
    if (!ref) return;
    try {
      ref.spec.write(buildContext(), value);
    } catch (e) {
      console.error('write failed for', id, e);
      return;
    }
    commit();
  }

  // ---- raw genome ----
  function setStatus(text, cls, title) {
    rawStatus.textContent = text;
    rawStatus.className = 'status' + (cls ? ' ' + cls : '');
    rawStatus.title = title || '';
  }

  // The one entry point for genome TEXT from any source: raw box, paste, DNA code, ?dna=,
  // DNA Library, Pop. GenomeText.normalize repairs what it can (any whitespace layout, digit
  // alleles, a code or ?dna= link, missing data from the previous genome) and reports it;
  // horse-render's strict Genome.parse then checks the canonical result.
  function loadGenomeText(text, source) {
    var r = root.GenomeText.normalize(text, { previous: hasLoadedGenome ? lines.slice() : null });
    if (!r.lines) {
      setStatus(r.errors[0] || 'Parse error', 'error', r.errors.join('\n'));
      return false;
    }
    var parsed = root.Genome.parse(r.lines.join('\n'));
    if (!parsed.ok) {
      setStatus(parsed.errors[0] || 'Parse error', 'error', parsed.errors.join('\n'));
      return false;
    }
    lines = r.lines;
    hasLoadedGenome = true;
    if (!commit()) return false;
    if (r.warnings.length) {
      setStatus('OK · ' + r.warnings.length + ' warning' + (r.warnings.length === 1 ? '' : 's') +
        ' (hover)', 'warn', r.warnings.join('\n'));
    } else {
      setStatus(r.source === 'encoded' ? 'OK · decoded from DNA code' : 'OK');
    }
    return true;
  }
  function setLinesFromText(text) { return loadGenomeText(text, 'raw'); }

  function applyRawText() {
    if (!rawEl) return;
    setLinesFromText(rawEl.value);
  }

  // ---- header buttons ----
  function bindHeader() {
    var rnd = document.getElementById('btnRandomize');
    if (rnd) rnd.addEventListener('click', function () {
      lines = C.randomizeLines();
      hasLoadedGenome = true;
      commit();
    });
    var rst = document.getElementById('btnReset');
    if (rst) rst.addEventListener('click', function () {
      lines = C.makeWildtypeLines();
      commit();
    });
    var cp = document.getElementById('btnCopy');
    if (cp) cp.addEventListener('click', function () {
      var text = lines.join('\n');
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function () {
          cp.textContent = 'Copied!';
          setTimeout(function () { cp.textContent = 'Copy DNA'; }, 1200);
        });
      }
    });
    var applyRaw = document.getElementById('btnApplyRaw');
    if (applyRaw) applyRaw.addEventListener('click', applyRawText);

    var paste = document.getElementById('btnPaste');
    if (paste) paste.addEventListener('click', function () {
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function (text) {
          if (setLinesFromText(text)) {
            paste.textContent = 'Pasted!';
            setTimeout(function () { paste.textContent = 'Paste DNA'; }, 1200);
          }
        }).catch(function () {
          rawStatus.textContent = 'Clipboard access denied';
          rawStatus.className = 'status error';
        });
      }
    });

    var expandAll = document.getElementById('btnExpandAll');
    var collapseAll = document.getElementById('btnCollapseAll');
    if (expandAll) expandAll.addEventListener('click', function () {
      editorPanel.querySelectorAll('details.section').forEach(function (d) { d.open = true; });
    });
    if (collapseAll) collapseAll.addEventListener('click', function () {
      editorPanel.querySelectorAll('details.section').forEach(function (d) { d.open = false; });
    });

    var exp = document.getElementById('btnExport');
    if (exp) exp.addEventListener('click', exportPNG);

    var searchInput = document.getElementById('searchInput');
    var clearSearch = document.getElementById('btnClearSearch');
    function updateSearchClear() {
      if (!searchInput) return;
      var wrap = searchInput.parentElement;
      if (wrap) wrap.classList.toggle('has-value', searchInput.value.length > 0);
      if (clearSearch) clearSearch.style.display = searchInput.value.length ? '' : 'none';
    }
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        filterControls(this.value);
        updateSearchClear();
      });
      // Show the button if the field already has a value (e.g. autofill / bfcache).
      updateSearchClear();
    }
    if (clearSearch) {
      clearSearch.addEventListener('click', function () {
        if (!searchInput) return;
        searchInput.value = '';
        filterControls('');
        updateSearchClear();
        searchInput.focus();
      });
    }

    var bgBtns = document.querySelectorAll('.bg-btn');
    bgBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        previewBg = btn.getAttribute('data-bg') || null;
        var wrap = document.querySelector('.preview-wrap');
        if (wrap) wrap.style.background = previewBg || '#a522b4';
        bgBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderPreview();
      });
    });

    var loadCode = document.getElementById('btnLoadCode');
    function loadFromCodeBox() {
      var v = codeEl ? codeEl.value.trim() : '';
      if (!v) return;
      if (v === currentCode) return;
      if (!loadGenomeText(v, 'code')) toast('That is not a valid DNA code', 'error');
      else codeEl.blur();
    }
    if (loadCode) loadCode.addEventListener('click', loadFromCodeBox);
    if (codeEl) {
      codeEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') loadFromCodeBox(); });
      codeEl.addEventListener('blur', function () { if (codeEl.value.trim() !== currentCode) codeEl.value = currentCode; });
      codeEl.addEventListener('focus', function () { codeEl.select(); });
    }
    var copyCode = document.getElementById('btnCopyCode');
    if (copyCode) copyCode.addEventListener('click', function () { copyText(currentCode, copyCode, 'Copy code'); });
    var copyLink = document.getElementById('btnCopyLink');
    if (copyLink) copyLink.addEventListener('click', function () { copyText(shareLink(), copyLink, 'Copy link'); });

    var zoomBtns = document.querySelectorAll('.zoom-btn');
    zoomBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        previewZoom = parseInt(btn.getAttribute('data-zoom'));
        zoomBtns.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        renderPreview();
      });
    });
  }

  // ---- boot ----
  // ---- custom genes.xml applied while the page is open ----
  // Slider ranges, toggles and dropdowns are computed from gene values when EditorSpecs builds
  // them, so they are rebuilt. The genome TEXT is kept (as SIMPR does); a reordered `n` then
  // reads the same bases as different alleles, which is what the game would do too.
  function onGenesChanged(xmlText) {
    var res = C.applyGenesXml(xmlText);         // renderer already has it; this clears caches
    C.customGenes.active = !!xmlText && res.ok;
    C.customGenes.errors = res.errors;
    var open = {};
    editorPanel.querySelectorAll('details.section').forEach(function (d) {
      open[d.getAttribute('data-section-key')] = d.open;
    });
    for (var k in controlRefs) delete controlRefs[k];
    S.rebuild();
    refreshState();
    buildSections();
    editorPanel.querySelectorAll('details.section').forEach(function (d) {
      var key = d.getAttribute('data-section-key');
      if (key in open) d.open = open[key];
    });
    buildSectionNav();
    var q = document.getElementById('searchInput');
    if (q && q.value) filterControls(q.value);
    afterGenomeChange();
  }

  // ---- side panel: Pop, DNA Library, Custom Data (shared modules in ../js) ----
  function initSidePanels() {
    persistPanels();

    if (root.DnaLibrary) {
      library = root.DnaLibrary.create({
        listEl: '#categoryList', addCategoryBtn: '#addCategoryBtn',
        saveBtn: '#saveDnaBtn', saveBtnText: '#saveBtnText',
        exportBtn: '#exportLibBtn', importBtn: '#importLibBtn',
        searchInput: '#librarySearch', searchClear: '#librarySearchClear',
        getGenome: function () { return lines.join('\n'); },
        loadGenome: function (text, entry) {
          if (loadGenomeText(text, 'library')) toast('Loaded DNA "' + entry.name + '"', 'ok');
          else toast('"' + entry.name + '" is not a readable genome', 'error');
        },
        // no onCompare: compare mode is off in this tool
        toast: toast
      });
      library.render();
    }

    if (root.PopPresets) {
      pop = root.PopPresets.create({
        listEl: '#popList', filterInput: '#popFilter', filterClear: '#popFilterClear',
        popXmlUrl: '../data/pop.xml',
        loadGenome: function (text) { loadGenomeText(text, 'pop'); },
        // no onCompare / onOdds: compare and % are off in this tool
        getGenePairs: genePairs,
        toast: toast
      });
    }

    if (root.CustomData) {
      customData = root.CustomData.create({
        genesInput: '#genesXmlInput', popInput: '#popXmlInput',
        statusEl: '#customDataStatus', resetBtn: '#resetCustomDataBtn',
        genesXmlUrl: '../data/genes.xml', popXmlUrl: '../data/pop.xml',
        onGenesChanged: function (xml) {
          onGenesChanged(xml);
          if (pop) pop.genomeChanged();
        },
        onPopChanged: function (xml) { if (pop) return pop.reload(xml || undefined); },
        toast: toast
      });
      // genes.js + pop.js tables (custom or bundled), then the Pop list.
      customData.init().then(function (res) {
        (res.warnings || []).forEach(function (w) { toast(w, 'warn', 6000); });
        if (pop) return pop.reload(res.popXml || undefined);
      }).catch(function (e) {
        console.error('Custom data / Pop failed to load', e);
        toast('Could not load gene / population data: ' + e.message, 'error', 6000);
      });
    } else if (pop) {
      pop.reload();
    }
  }

  function boot() {
    initSplitter();
    refreshState();
    buildSections();
    buildSectionNav();
    bindHeader();

    var dna = root.GenomeText.readUrlParam();
    if (dna) {
      if (loadGenomeText(dna, 'url')) {
        setStatus('OK · loaded from link');
      } else {
        toast('Could not decode the ?dna= link', 'error', 5000);
        commit();
      }
    } else {
      commit();
    }
    initSidePanels();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);