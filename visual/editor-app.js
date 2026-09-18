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

  // ---- tooltip element ----
  var tooltipEl = document.createElement('div');
  tooltipEl.className = 'gene-tooltip';
  tooltipEl.style.display = 'none';
  document.body.appendChild(tooltipEl);

  // ---- DOM ----
  var editorPanel = document.getElementById('editorPanel');
  var canvas      = document.getElementById('preview');
  var dimsEl      = document.getElementById('dims');
  var tagsEl      = document.getElementById('tagsPanel');
  var rawEl       = document.getElementById('rawGenome');
  var rawStatus   = document.getElementById('rawStatus');

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

  // ---- render preview ----
  function renderPreview() {
    if (!parts || !canvas) return;
    try {
      var info = root.Render.render(canvas, parts, ph, colors, hash, {
        zoom: 4, background: null
      });
      if (dimsEl) dimsEl.textContent = info.width + '×' + info.height +
        ' @1×  ·  shown 4×  ·  ' + parts.length + ' parts';
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

  // ---- tooltip functions ----
  function showTooltip(spec, e) {
    if (!spec.gene) return;
    var gene = D.genes[D.byName[spec.gene]];
    if (!gene) return;
    var pair = gt.strands(spec.gene);
    tooltipEl.innerHTML = '<div class="gene-name">' + spec.gene + '</div>' +
      '<div>Dominance: ' + gene.m + (gene.m >= 100 ? ' (dominant)' : ' (blended)') + '</div>' +
      '<div>Alleles: [' + pair[0] + ', ' + pair[1] + ']</div>' +
      '<div class="gene-values">g[] = [' + gene.g.join(', ') + ']</div>' +
      '<div>Scale: ' + gene.s + '</div>';
    tooltipEl.style.display = 'block';
    positionTooltip(e);
  }
  function positionTooltip(e) {
    var x = e.clientX + 12, y = e.clientY + 12;
    var rect = tooltipEl.getBoundingClientRect();
    if (x + 280 > window.innerWidth) x = e.clientX - 280 - 12;
    if (y + 100 > window.innerHeight) y = e.clientY - 100 - 12;
    tooltipEl.style.left = x + 'px';
    tooltipEl.style.top = y + 'px';
  }
  function hideTooltip() { tooltipEl.style.display = 'none'; }

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
      // Color dropdown with swatch
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
      // Color picker with palette grid and HTML color input
      var pickerWrap = document.createElement('div');
      pickerWrap.className = 'color-picker-wrap';

      // Palette grid
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

      // HTML color input for any color
      input = document.createElement('input');
      input.type = 'color';
      input.className = 'color-any';
      input.addEventListener('change', function () {
        if (updating) return;
        applyControl(spec.id, input.value);
      });
      pickerWrap.appendChild(input);

      inputWrap.appendChild(pickerWrap);

      // Current color swatch (shown in value area)
      swatch = document.createElement('span');
      swatch.className = 'color-swatch current-color';
      row.appendChild(swatch);

    } else if (spec.type === 'group') {
      // Group is handled separately by buildGroup, return null
      return null;
    }

    if (spec.hint) {
      var hint = document.createElement('div');
      hint.className = 'control-hint';
      hint.textContent = spec.hint;
      row.appendChild(hint);
    }

    // Tooltip on hover
    (function(s) {
      row.addEventListener('mouseenter', function (e) { showTooltip(s, e); });
      row.addEventListener('mousemove', positionTooltip);
      row.addEventListener('mouseleave', hideTooltip);
    })(spec);

    controlRefs[spec.id] = { el: row, spec: spec, input: input, valueEl: valueEl, swatch: swatch };
    return row;
  }

  // Build a group control (contains child controls with a visual wrapper)
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

  // Collect all gene names from a list of control specs (recursively)
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
    if (!refreshState()) return;
    if (rawEl) rawEl.value = lines.join('\n');
    renderPreview();
    renderTags();
    syncControls();
  }

  function buildSections() {
    editorPanel.innerHTML = '';
    var sections = S.SECTIONS;
    for (var i = 0; i < sections.length; i++) {
      var sdef = sections[i];
      var arr = S.CONTROLS[sdef.key] || [];
      if (!arr.length) continue;

      // Split into main and advanced
      var mainSpecs = [];
      var advSpecs = [];
      for (var k = 0; k < arr.length; k++) {
        if (arr[k].advanced) {
          advSpecs.push(arr[k]);
        } else {
          mainSpecs.push(arr[k]);
        }
      }

      var details = document.createElement('details');
      details.className = 'section';
      details.open = true;
      var summary = document.createElement('summary');

      var labelSpan = document.createElement('span');
      labelSpan.textContent = sdef.label;
      summary.appendChild(labelSpan);

      // Per-section randomize button (right-aligned)
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

      // Build main controls
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

      // Build advanced subsection if there are advanced controls
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
        // Update swatch color
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
        // Update HTML color input and current swatch
        var hexVal = v || '#888888';
        if (ref.input) ref.input.value = hexVal;
        if (ref.swatch) {
          ref.swatch.style.backgroundColor = hexVal;
          ref.swatch.style.display = 'inline-block';
        }
        if (ref.valueEl) ref.valueEl.textContent = hexVal;
      }

      // Handle group swatch sync
      if (ref.isGroup && ref.swatch && spec.swatch) {
        var groupSwatchColor = resolveSwatchColor(spec.swatch, ctx);
        if (groupSwatchColor) {
          ref.swatch.style.backgroundColor = groupSwatchColor;
          ref.swatch.style.display = 'inline-block';
        } else {
          ref.swatch.style.display = 'none';
        }
      }
    }
    updating = false;
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
    if (!refreshState()) return;
    if (rawEl) rawEl.value = lines.join('\n');
    renderPreview();
    renderTags();
    syncControls();
  }

  // ---- raw genome ----
  function setLinesFromText(text) {
    var parsed = root.Genome.parse(text);
    if (!parsed.ok) {
      rawStatus.textContent = parsed.errors[0] || 'Parse error';
      rawStatus.className = 'status error';
      return false;
    }
    lines = root.Genome.format(parsed.alleles, 0).split(/\r?\n/);
    if (!refreshState()) return false;
    if (rawEl) rawEl.value = lines.join('\n');
    rawStatus.textContent = 'OK';
    rawStatus.className = 'status';
    renderPreview();
    renderTags();
    syncControls();
    return true;
  }

  function applyRawText() {
    if (!rawEl) return;
    setLinesFromText(rawEl.value);
  }

  // ---- header buttons ----
  function bindHeader() {
    var rnd = document.getElementById('btnRandomize');
    if (rnd) rnd.addEventListener('click', function () {
      lines = C.randomizeLines();
      refreshState();
      if (rawEl) rawEl.value = lines.join('\n');
      renderPreview();
      renderTags();
      syncControls();
    });
    var rst = document.getElementById('btnReset');
    if (rst) rst.addEventListener('click', function () {
      lines = C.makeWildtypeLines();
      refreshState();
      if (rawEl) rawEl.value = lines.join('\n');
      renderPreview();
      renderTags();
      syncControls();
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

    // Paste DNA
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

    // Expand / Collapse All
    var expandAll = document.getElementById('btnExpandAll');
    var collapseAll = document.getElementById('btnCollapseAll');
    if (expandAll) expandAll.addEventListener('click', function () {
      editorPanel.querySelectorAll('details.section').forEach(function (d) { d.open = true; });
    });
    if (collapseAll) collapseAll.addEventListener('click', function () {
      editorPanel.querySelectorAll('details.section').forEach(function (d) { d.open = false; });
    });

    // Export PNG
    var exp = document.getElementById('btnExport');
    if (exp) exp.addEventListener('click', exportPNG);

    // Search / Filter
    var searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.addEventListener('input', function () {
      filterControls(this.value);
    });
  }

  // ---- boot ----
  function boot() {
    var params = new URLSearchParams(location.search);
    var dna = params.get('dna');
    if (dna) {
      try {
        lines = root.HorseyDnaCodec.decodeToLines(dna);
      } catch (e) {
        console.warn('Could not decode ?dna= parameter:', e.message);
      }
    }

    refreshState();
    buildSections();
    if (rawEl) rawEl.value = lines.join('\n');
    renderPreview();
    renderTags();
    syncControls();
    bindHeader();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : this);
