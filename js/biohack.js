// ====== BioHacker Optimizer – Main Logic ======
// All original functionality preserved, now as an external file.

document.addEventListener('DOMContentLoaded', () => {
	

  // ====== Embedded bio.csv (r column) ======
  const bioCSV = `Chromosome,Pair,Gene Name,r
0,1,BONES,GCA
0,2,BONES2,TGC
0,3,OSTODERM,GAC
0,4,OSTO_SIZE,TACG
0,5,GIANT_DWARF,GAC
0,6,TAIL_BOTTOM,GT
0,7,LEG_STRETCH2,ATC
0,8,ARM_STRETCH2,TCA
0,9,HEAD_THICK_SKULL,TG
0,10,NECK_STIFF,CA
1,1,GUT,TGA
1,2,GUT_IS_UDDER,ACT
1,3,DERRIERE,CTGA
1,4,LEG_IS_CIRCLE,AT
1,5,FOOT_IS_CIRCLE,GA
1,6,TONGUE,CGA
1,7,TONGUE_SEGS,ACG
1,8,BELLY_ALT,TAC
1,9,PAT_BELLY,ACTG
1,10,LITTER_SIZE,CTAG
1,11,OLD_AGE,TCG
1,12,OMNIVORE,CA
1,13,LIMP,AGC
2,1,MUSCLE_USE,CTA
2,2,TAIL_STIFF,AT
2,3,LEG_FLEXIBILITY,GTCA
2,4,LEG_FLEX_BIAS,CGAT
2,5,TAIL_FLEXIBILITY,GTAC
2,6,TAIL_SPEED,GCT
2,7,LEG_AND_ARM_LIMP,TC
2,8,ARM_STRENGTH,ATCG
2,9,ARM_FLEXIBILITY,ACT
2,10,ARM_FLEX_BIAS,GCTA
2,11,NECK_FLEXIBILITY,GTCA
2,12,NECK_FLEX_BIAS,GATC
2,13,BRAIN_SPASTIC,TGA
3,1,SPLAY,ACTG
3,2,LEG_IN,CGA
3,3,LEG_IN2,CGT
3,4,TAIL_ANGLE,GCAT
3,5,TAIL_JOINT_TYPE,AT
3,6,LEG_JOINT_TYPE,AGT
3,7,HAS_KNEE,TC
3,8,KNEE_MIN,CGA
3,9,KNEE_MAX,TAG
3,10,ARM_JOINT_TYPE,GCT
3,11,HAS_ELBOW,CA
3,12,ELBOW_RANGE,CTA
3,13,NECK_JOINT_TYPE,TGC
3,14,HEAD_JOINTED,CA
3,15,STIFF_JOINTS,CGA
4,1,LEG_TAG,ATGC
4,2,LEG_HAS_FOOT,GC
4,3,LEG_COUNT,CTA
4,4,LEG_THRUST_BACK,GCA
4,5,ARM_TAG,GTAC
4,6,ARM_HAS_HAND,CG
4,7,NECK_TAG,AGTC
4,8,NECK_SLOUCH,CTG
4,9,NECK_ONTOP,GTCA
4,10,BREAK_FORCE,GAC
4,11,EAR_X,TAG
5,1,QUADRUPED,CG
5,2,BIPED,TA
5,3,UPARM_TAG,ATCG
5,4,UPARM_Y,CTG
5,5,UPARM_GOOFY,ACGT
5,6,ARM_FORWARD,CTGA
5,7,UPARM_ANGLE,GCAT
5,8,WHITE_IS_LETHAL,AG
6,1,SIZE,ATGC
6,2,ASPECT,GCAT
6,3,SKINNY,GAT
6,4,CHEST_BIG,ATC
6,5,CHEST_SMALL,GCTA
6,6,NECK_TYPE,TCG
6,7,NECK_LENGTH,ATGC
6,8,NECK_GIRAFFE,TCAG
6,9,NECK_THICKNESS,CGTA
6,10,NECK_ANGLE,TACG
6,11,NECK_COCK,CGAT
7,1,TAIL_TAG,TAGC
7,2,TAIL_EXISTS,GCT
7,3,TAIL_SIZE,GCAT
7,4,TAIL_SHORT,CAG
7,5,TAIL_ASPECT,AGC
7,6,TAIL_SHAPE,AGTC
7,7,TAIL_SEGMENTS,GTA
7,8,TAIL_WAG,CT
8,1,LEG_TYPE,TAC
8,2,LEG_LENGTH,CATG
8,3,LEG_STRETCH,GAC
8,4,LEG_SKEW,TCG
8,5,LEG_STRENGTH,GCTA
8,6,LEG_PENCIL,AT
8,7,ARM_TYPE,CGA
8,8,ARM_LENGTH,ATCG
8,9,ARM_STRETCH,GAC
8,10,ARM_SKEW,TCG
8,11,ARM_NODE_SCALE,CTG
9,1,HAS_FOOT,TA
9,2,FOOT_SIZE,GTAC
9,3,FOOT_CLOWN,GT
9,4,FOOT_THICKNESS,TCAG
9,5,FOOT_TOE,AGC
9,6,FOOT_BACKWARDS,AGT
9,7,HAS_HAND,CG
9,8,HAND_WIDTH,GAC
9,9,HAND_LENGTH,CGA
9,10,HAND_FINGER,CTA
9,11,SKIN_HANDS,GCT
10,1,HEAD_SIZE,GCTA
10,2,HEAD_X_GROWTH,ACGT
10,3,HEAD_Y_GROWTH,TAC
10,4,HEAD_ASPECT,TCAG
10,5,HEAD_SQUARE,CTA
10,6,HEAD_HAS_BACK,GTA
10,7,HEAD_GIANT,CTA
10,8,HEAD_SHRUNK,CAT
10,9,HEAD_CHIMERA,AT
10,10,EYEBOX_X,AGCT
10,11,EYEBOX_Y,CGTA
10,12,EYEBOX_SIZE,ATGC
10,13,SKIN_HEAD,GCT
11,1,EYE_STYLE,CAG
11,2,BUGEYE,GAT
11,3,EYE_SIZE,ACT
11,4,PUPIL_SIZE,CAG
11,5,HAS_PUPIL,AT
11,6,BROW_SIZE,GAT
11,7,BROW_SLANT,GTA
11,8,EYE_HUE,GCTA
11,9,EAR_STYLE,TGC
11,10,EAR_SHAPE,CGA
11,11,EAR_SIZE,TCGA
11,12,EAR_ASPECT,ATC
11,13,EAR_SLANT,GACT
11,14,EAR_INTERIOR,TA
11,15,EAR_FLOP,CTAG
12,1,TEETH_SHAPE,TCGA
12,2,HAS_MOUTH,TG
12,3,MOUTH_Y,CGAT
12,4,MOUTH_SIZE,CTGA
12,5,JAW,CAGT
12,6,TEETH_UPPER,GA
12,7,TEETH_UPPER2,CA
12,8,NOSE_STYLE,GTCA
12,9,NOSE_INNY,GC
12,10,NOSE_Y,CTA
12,11,NOSE_SIZE,AGCT
12,12,NOSE_INTERIOR,ATG
12,13,FLU_IMMUNITY,CG
13,1,HAS_ANTLERS,CT
13,2,ANTLER_X,TGA
13,3,ANTLER_W,TAC
13,4,ANTLER_H,TACG
13,5,ANTLER_TAPER,CGA
13,6,ANTLER_POM,CTGA
13,7,ANTLER_COLOR,ACGT
13,8,POM_COLOR,GCTA
13,9,POM_USECOLOR,GT
13,10,HAT_POM,TGA
13,11,HAT_POM_IS_LID,TA
14,1,ANTLER_REC,TAGC
14,2,ANTLER_REC2,CTGA
14,3,ANTLER_FLIP,TA
14,4,ANTLER_MOD,TCA
14,5,ANTLER_SCALEH,GCT
14,6,ANTLER_SCALEW,TCG
14,7,ANTLER_ANGLE,GATC
14,8,ANTLER_ANGLE2,ACTG
14,9,ANTLER_ANGLE_RAND,GTAC
14,10,ANTLER_T1,CGAT
14,11,ANTLER_T2,ATGC
15,1,HAT_EXISTS,AC
15,2,HAT_SIZE,CATG
15,3,HAT_RAKE,AGT
15,4,HAT_ASPECT,ATG
15,5,HAT_TAPER,TGC
15,6,HAT_CLONE,CGT
15,7,HAT_BACK_SCALE,TAG
15,8,HAT_FRONT_SCALE,CGT
15,9,HAT_BACK_ANGLE,ACGT
15,10,HAT_FRONT_ANGLE,CGAT
15,11,HAT_ANGLE_RAND,TCG
15,12,HAT_FLIP,TA
15,13,HAT_T,GTA
16,1,BASE_BROWN,ATC
16,2,BASE_BLACK,TG
16,3,BASE_RED,GTCA
16,4,BASE_GREEN,TCAG
16,5,GREEN_KNOCKOUT,CA
16,6,BASE_CREAM,AG
16,7,ALT_BLUE,TAGC
16,8,SPOT_YELLOW,TG
16,9,SKIN_HUE,CGAT
16,10,SKIN_HUE2,TAGC
16,11,SWAP_BASE_SPOT,AT
16,12,SWAP_ALT_SPOT,TG
16,13,WHITE,TA
16,14,NOSE_HUE,GACT
16,15,HOOF_COLOR,CTA
17,1,AGOUTI,AT
17,2,FOOT_IS_HOOF,GA
17,3,COON_EYE,GCA
17,4,EAR_COMP,GCA
17,5,TAIL_ALT,CGT
17,6,PAT_SPLIT,CGA
17,7,PAT_STRIPE,CTA
17,8,PAT_SPOT,ACG
17,9,PAT_PERLIN,TCA
17,10,PAT_PERLIN2,GTC
17,11,PAT_PERLIN_SIZE,GAC
18,1,NARCOLEPSY,TG
18,2,SPEED_FACTOR,GCAT
18,3,NECK_SPEED,AGCT
18,4,RAMPAGE,GC
18,5,SPINAL_LOCO,CTA
18,6,HIGH_INTELLECT,CT
18,7,L_LEG_SIGNAL,GA
18,8,L_ARM_SIGNAL,CT
18,9,L_TAIL_SIGNAL,ACTG
18,10,L_NECK_SIGNAL,TGAC
18,11,LOCO_SYNC,CT
19,1,L_LEG_FTOB_REACT,TCG
19,2,L_LEG_FTOB_EVENT,GATC
19,3,L_LEG_BTOF_REACT,ACT
19,4,L_LEG_BTOF_EVENT,TGAC
19,5,L_ARM_FTOB_REACT,ACT
19,6,L_ARM_FTOB_EVENT,TGAC
19,7,L_ARM_BTOF_REACT,GAC
19,8,L_ARM_BTOF_EVENT,CATG
19,9,L_TAIL_FTOB_REACT,CGAT
19,10,L_TAIL_FTOB_EVENT,TCGA
19,11,L_TAIL_BTOF_REACT,GTCA
19,12,L_TAIL_BTOF_EVENT,ATCG
19,13,L_NECK_FTOB_REACT,GTAC
19,14,L_NECK_FTOB_EVENT,CATG
19,15,L_NECK_BTOF_REACT,TCAG
19,16,L_NECK_BTOF_EVENT,TCAG`;

  const FIXED_LENGTHS = [10, 13, 13, 15, 11, 8, 11, 8, 11, 11, 13, 15, 13, 11, 11, 13, 15, 11, 11, 16];

  // ====== Parse bioCSV for r column ======
  function parseBioCSV(csv) {
    const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    const map = new Map();
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length < 4) continue;
      const chromosome = parseInt(cols[0], 10);
      const pairOneBased = parseInt(cols[1], 10);
      const name = cols[2].trim();
      const r = cols[3].trim();
      const pairZeroBased = pairOneBased - 1;
      map.set(`${chromosome}:${pairZeroBased}`, { name, r });
    }
    return map;
  }

  const bioMap = parseBioCSV(bioCSV);


  // ====== Default presets ======
  const DEFAULT_PRESETS = [
    {
      "name": "Horse",
      "genes": {
        "1:12": ["A"],
        "2:0": ["C","A"],
        "2:2": ["G","T","C","A"],
        "2:3": ["C","G","A","T"],
        "2:6": ["T"],
        "2:8": ["A","C","T"],
        "2:9": ["G","C","T","A"],
        "2:12": ["T"],
        "3:0": ["A","C","T","G"],
        "3:1": ["C","G","A"],
        "3:2": ["C","G","T"],
        "3:6": ["T"],
        "3:14": ["C","G","A"],
        "4:0": ["A"],
        "4:2": ["C"],
        "4:3": ["G","C","A"],
        "4:4": ["G"],
        "4:9": ["G"],
        "5:0": ["C"],
        "5:1": ["T"],
        "5:5": ["C","T","G","A"],
        "5:7": ["A"],
        "6:0": ["A","T","G","C"],
        "8:3": ["T","C","G"],
        "8:10": ["C"],
        "11:10": ["T","C","A"],
        "18:0": ["T"],
        "18:1": ["G","T"],
        "18:4": ["C"],
        "18:5": ["C"],
        "18:6": ["G","A"],
        "18:7": ["C","T"],
        "18:10": ["C","T"],
        "19:0": ["T","C"],
        "19:1": ["G","A"],
        "19:2": ["A","C"],
        "19:3": ["T","A","C"],
        "19:4": ["A","C"],
        "19:5": ["T","G"],
        "19:6": ["G","A"],
        "19:7": ["C","T","G"]
      }
    },
    {
      "name": "Car",
      "genes": { "1:3": ["T"], "1:4": ["G"], "1:12": ["A"], "2:0": ["C"], "2:6": ["T"], "2:12": ["T"],
        "3:1": ["C","G","A"], "3:2": ["C","G","T"], "3:5": ["G"], "3:9": ["C"], "4:1": ["C"],
        "4:9": ["G"], "5:7": ["A"], "8:0": ["T","A"], "8:1": ["C","A","T","G"], "8:2": ["G","A","C"],
        "8:4": ["G","C","T","A"], "8:5": ["T","A"], "8:10": ["C","T","G"], "9:0": ["A"],
        "11:10": ["T","C","A"], "18:0": ["T"], "18:1": ["T"], "18:4": ["T","A"], "18:5": ["C"],
        "18:6": ["G","A"], "18:7": ["C","T"], "18:10": ["C","T"], "19:0": ["T","C","G"], "19:1": ["G","A","T","C"],
        "19:2": ["A","C","T"], "19:3": ["T","G","A","C"], "19:4": ["A","C","T"], "19:5": ["T","G","A","C"],
        "19:6": ["G","A","C"], "19:7": ["C","A","T","G"] }
    }
  ];

  // ====== State ======
  let geneStates = new Map();

  // ====== Load gene data (XML with fallback) ======


  function initGenes() {
    geneStates.clear();
	//console.log(bioMap);
    bioMap.forEach((g,key) => {
		//console.log(g.key);
		//console.log(bioMap[g.key]);
	   //console.log(bioMap[g.key]);
      geneStates.set(key, {
        state: 'source',
		selectedBases: new Set()
        //selectedBases: new Set(g.r)
      });
	  
    });
	//console.log(geneStates);
  }

  // ====== Parse source DNA ======
  function parseSourceDNA(text) {
    const map = new Map();
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const helixMap = new Map();
    for (const line of lines) {
      const match = line.match(/^(\d+):(.*)$/);
      if (!match) continue;
      const helix = parseInt(match[1], 10);
      const seq = match[2].trim().toUpperCase();
      if (!helixMap.has(helix)) helixMap.set(helix, []);
      const arr = helixMap.get(helix);
      if (arr.length < 2) arr.push(seq);
    }
    for (const [helix, seqs] of helixMap) {
      if (seqs.length !== 2) continue;
      const [s1, s2] = seqs;
      const maxLen = Math.max(s1.length, s2.length);
      for (let i = 0; i < maxLen; i++) {
        const a1 = i < s1.length ? s1[i] : null;
        const a2 = i < s2.length ? s2[i] : null;
        map.set(`${helix}:${i}`, { allele1: a1, allele2: a2 });
      }
    }
    return map;
  }

  function updateSourceGeneBases() {
    const raw = document.getElementById('sourceDNA').value;
    const sourceMap = parseSourceDNA(raw);
    geneStates.forEach((stateObj, key) => {
      if (stateObj.state === 'source') {
        const alleles = sourceMap.get(key);
		/*
		const keyA = key.split(":");
		const h = keyA[0];
		const p = keyA[1];
		const gene = arrayHp[h][p];
		*/
		const gene = bioMap.get(key);
        //const gene = geneList.find(g => g.key === key);
		
        if (alleles && alleles.allele1 && alleles.allele2 && 'ACGT'.includes(alleles.allele1) && 'ACGT'.includes(alleles.allele2)) {
          stateObj.selectedBases = new Set([alleles.allele1, alleles.allele2]);
        } else {
			stateObj.selectedBases = new Set(gene ? [gene.r[0]] : ['A']);
          //stateObj.selectedBases = new Set(gene ? gene.r : ['A']);
        }
      }
    });
  }

  // ====== Flask generation ======
  function generateFlasks() {
    const flask1Lines = [];
    const flask2Lines = [];
    for (let h = 0; h < 20; h++) {
      const len = HELIX_LENGTHS[h];
      let f1_line1 = '', f1_line2 = '', f2_line1 = '', f2_line2 = '';
      for (let p = 0; p < len; p++) {
        const key = `${h}:${p}`;
        //const gene = geneList.find(g => g.key === key);
		const gene = arrayHp[h][p];		
        const stateObj = geneStates.get(key);
        if (!gene || !stateObj) {
          f1_line1 += '?'; f1_line2 += '?'; f2_line1 += '?'; f2_line2 += '?';
          continue;
        }
        const ordered = gene.priorityOrder.filter(b => stateObj.selectedBases.has(b));
        if (ordered.length === 0) {
          f1_line1 += 'A'; f1_line2 += 'A'; f2_line1 += 'A'; f2_line2 += 'A';
          continue;
        }
        const f1a1 = ordered[0];
        const f1a2 = ordered.length > 1 ? ordered[1] : ordered[0];
        const f2a1 = ordered.length > 2 ? ordered[2] : (ordered.length > 1 ? ordered[1] : ordered[0]);
        const f2a2 = ordered.length > 3 ? ordered[3] : (ordered.length > 2 ? ordered[2] : (ordered.length > 1 ? ordered[1] : ordered[0]));
        f1_line1 += f1a1;
        f1_line2 += f1a2;
        f2_line1 += f2a1;
        f2_line2 += f2a2;
      }
      const hh = String(h).padStart(2, '0');
      flask1Lines.push(`${hh}:${f1_line1}`, `${hh}:${f1_line2}`);
      flask2Lines.push(`${hh}:${f2_line1}`, `${hh}:${f2_line2}`);
    }
    document.getElementById('flask1Output').value = flask1Lines.join('\n');
    document.getElementById('flask2Output').value = flask2Lines.join('\n');
  }

  // ====== Render gene table ======
  let currentFilter = '';

  function renderTable() {
    const tbody = document.getElementById('geneTableBody');
    let html = '';
    const filterWords = currentFilter.toLowerCase().trim().split(/\s+/);
    allEntries.forEach(gene => {		
      const stateObj = geneStates.get(gene.key);
      const state = stateObj.state;
      const selected = stateObj.selectedBases;
      const toggleIcon = state === 'source' ? '🧪' : '🧬';
      const toggleClass = state === 'source' ? 'source' : 'random';
/*
	let filtered = currentGenePairs.filter(p => 
	  filterWords.some(word => p.desc.toLowerCase().includes(word))
	);

*/	
	  
      //const nameMatch = gene.desc.toLowerCase().includes(filterLower);
	  const nameMatch =  filterWords.some(word => gene.desc.toLowerCase().includes(word));
      const rowStyle = nameMatch ? '' : 'style="display:none;"';
      const sourceClass = state === 'source' ? ' source-mode' : '';
      const baseButtons = gene.priorityOrder.map((base, idx) => {
        const sel = selected.has(base);
        const cls = sel ? `base-btn selected ${base}` : 'base-btn';
        const val = gene.g[idx] !== undefined ? gene.g[idx] : '?';
        return `<button class="${cls}" data-action="base" data-base="${base}">${base}<span class="base-val">${val}</span></button>`;
      }).join('');
      html += `<tr data-key="${gene.key}" class="${sourceClass}" ${rowStyle}>
        <td><button class="toggle-btn ${toggleClass}" data-action="toggle">${toggleIcon}</button></td>
        <td class="gene-loc">${gene.key}</td>
        <td class="gene-name" title="${gene.desc}">${gene.desc}</td>
        <td style="font-weight:bold;">${gene.m}</td>
        <td><div class="base-btns">${baseButtons}</div></td>
      </tr>`;
    });
    tbody.innerHTML = html;
  }

  // ====== Event delegation ======
  document.getElementById('geneTableBody').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const row = btn.closest('tr');
    if (!row) return;
    const key = row.dataset.key;
    const stateObj = geneStates.get(key);
    //const gene = geneList.find(g => g.key === key);
	const gene = bioMap.get(key);
	/*
		const keyA = key.split(":");
		const h = keyA[0];
		const p = keyA[1];
		const gene = arrayHp[h][p];	
	*/
    if (!stateObj || !gene) return;

    if (btn.dataset.action === 'toggle') {
      if (stateObj.state === 'source') {
        stateObj.state = 'random';
        stateObj.selectedBases = new Set(gene.r);
      } else {
        stateObj.state = 'source';
        updateSourceGeneBases();
      }
      renderTable();
      generateFlasks();
    } else if (btn.dataset.action === 'base') {
      const base = btn.dataset.base;
      if (stateObj.state === 'source') {
        stateObj.state = 'random';
        if (stateObj.selectedBases.has(base)) {
          if (stateObj.selectedBases.size > 1) {
            stateObj.selectedBases.delete(base);
          } else {
            showToast('At least one base must be selected', 1500);
            return;
          }
        } else {
          stateObj.selectedBases.add(base);
        }
      } else {
        if (stateObj.selectedBases.has(base)) {
          if (stateObj.selectedBases.size > 1) {
            stateObj.selectedBases.delete(base);
          } else {
            showToast('At least one base must be selected', 1500);
            return;
          }
        } else {
          stateObj.selectedBases.add(base);
        }
      }
      renderTable();
      generateFlasks();
    }
  });

  // ====== Global buttons ======
  document.getElementById('allSourceBtn').addEventListener('click', () => {
    geneStates.forEach((obj, key) => {
      obj.state = 'source';
    });
    updateSourceGeneBases();
    renderTable();
    generateFlasks();
    showToast('All genes set to Source');
  });

  document.getElementById('allRandomBtn').addEventListener('click', () => {
    geneStates.forEach((obj, key) => {
      obj.state = 'random';
		const gene = bioMap.get(key);	  
      //const gene = geneList.find(g => g.key === key);
      if (gene) obj.selectedBases = new Set(gene.r);
    });
    renderTable();
    generateFlasks();
    showToast('All genes set to Randomize (full r)');
  });

  // ====== Source textarea events ======
  const sourceTextarea = document.getElementById('sourceDNA');
  sourceTextarea.addEventListener('input', () => {
    updateSourceGeneBases();
    renderTable();
    generateFlasks();
  });

  document.getElementById('pasteSourceBtn').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      sourceTextarea.value = text;
      updateSourceGeneBases();
      renderTable();
      generateFlasks();
      showToast('✅ Pasted from clipboard');
    } catch {
      showToast('Clipboard read failed', 1500);
    }
  });

  document.getElementById('clearSourceBtn').addEventListener('click', () => {
    sourceTextarea.value = '';
    updateSourceGeneBases();
    renderTable();
    generateFlasks();
    showToast('Source DNA cleared');
  });

  // ====== Flask copy ======
  document.getElementById('copyFlask1Btn').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('flask1Output').value)
      .then(() => showToast('✅ Flask 1 copied'))
      .catch(() => showToast('Copy failed'));
  });
  document.getElementById('copyFlask2Btn').addEventListener('click', () => {
    navigator.clipboard.writeText(document.getElementById('flask2Output').value)
      .then(() => showToast('✅ Flask 2 copied'))
      .catch(() => showToast('Copy failed'));
  });

  // ====== Filter ======
  const filterInput = document.getElementById('filterInput');
  filterInput.addEventListener('input', (e) => {
    currentFilter = e.target.value;
    renderTable();
  });
  document.getElementById('clearFilterBtn').addEventListener('click', () => {
    filterInput.value = '';
    currentFilter = '';
    renderTable();
  });

  // ====== Presets with BroadcastChannel sync ======
  const PRESETS_KEY = 'gene_flask_presets_v2';
  const syncChannel = new BroadcastChannel('gene-flask-presets-sync');

  syncChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'presets-updated') {
      renderPresetList();
    }
  };

  function broadcastPresetUpdate() {
    syncChannel.postMessage({ type: 'presets-updated' });
  }

  function loadPresetsFromStorage() {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    savePresetsToStorageSilent(DEFAULT_PRESETS);
    return JSON.parse(JSON.stringify(DEFAULT_PRESETS));
  }

  function savePresetsToStorage(presets) {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    broadcastPresetUpdate();
  }

  function savePresetsToStorageSilent(presets) {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  }

  function renderPresetList() {
    const presets = loadPresetsFromStorage();
    const list = document.getElementById('presetList');
    if (presets.length === 0) {
      list.innerHTML = '<div class="empty-message">No presets saved yet.</div>';
      return;
    }
    let html = '';
    presets.forEach((preset, idx) => {
      html += `<li class="preset-item">
        <span>${escHtml(preset.name)}</span>
        <button class="success" data-action="loadPreset" data-index="${idx}" style="padding:2px 8px; font-size:0.7rem;">Load</button>
        <button class="danger" data-action="deletePreset" data-index="${idx}" style="padding:2px 8px; font-size:0.7rem;">Del</button>
      </li>`;
    });
    list.innerHTML = html;
  }

  function escHtml(str) {
    return String(str).replace(/[&<>"]/g, function(m) {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      if (m === '"') return '&quot;';
      return m;
    });
  }

  document.getElementById('presetList').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    const index = parseInt(btn.dataset.index, 10);
    if (isNaN(index)) return;
    let presets = loadPresetsFromStorage();
    if (action === 'loadPreset') {
      const preset = presets[index];
      if (!preset) return;
      const savedGenes = preset.genes;
      geneStates.forEach((obj, key) => {
        if (savedGenes.hasOwnProperty(key)) {
          obj.state = 'random';
          obj.selectedBases = new Set(savedGenes[key]);
        } else {
          obj.state = 'source';
        }
      });
      updateSourceGeneBases();
      renderTable();
      generateFlasks();
      showToast(`Preset "${preset.name}" loaded`);
    } else if (action === 'deletePreset') {
      if (confirm(`Delete preset "${presets[index].name}"?`)) {
        presets.splice(index, 1);
        savePresetsToStorage(presets);
        renderPresetList();
        showToast('Preset deleted');
      }
    }
  });

  document.getElementById('savePresetBtn').addEventListener('click', () => {
    const name = prompt('Preset name:');
    if (!name || !name.trim()) return;
    const genesToSave = {};
    geneStates.forEach((obj, key) => {
      if (obj.state === 'random') {
        genesToSave[key] = Array.from(obj.selectedBases);
      }
    });
    if (Object.keys(genesToSave).length === 0) {
      showToast('No random genes to save. Set some genes to Randomize first.', 2000);
      return;
    }
    const presets = loadPresetsFromStorage();
    presets.push({ name: name.trim(), genes: genesToSave });
    savePresetsToStorage(presets);
    renderPresetList();
    showToast(`Preset "${name.trim()}" saved`);
  });

  // ====== Export / Import Presets ======
  document.getElementById('exportPresetsBtn').addEventListener('click', () => {
    const presets = loadPresetsFromStorage();
    if (presets.length === 0) {
      showToast('No presets to export', 1500);
      return;
    }
    const jsonStr = JSON.stringify(presets, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gene_flask_presets.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${presets.length} preset(s)`);
  });

  document.getElementById('importPresetsBtn').addEventListener('click', () => {
    document.getElementById('importPresetsFile').click();
  });

  document.getElementById('importPresetsFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported)) throw new Error('Invalid format');
        const currentPresets = loadPresetsFromStorage();
        let addedCount = 0;
        imported.forEach(preset => {
          if (preset.name && typeof preset.name === 'string' && preset.genes && typeof preset.genes === 'object') {
            currentPresets.push({ name: preset.name, genes: preset.genes });
            addedCount++;
          }
        });
        if (addedCount === 0) {
          showToast('No valid presets found in file', 1500);
          return;
        }
        savePresetsToStorage(currentPresets);
        renderPresetList();
        showToast(`Imported ${addedCount} preset(s)`);
      } catch (err) {
        showToast('Invalid import file', 1500);
      }
    };
    reader.readAsText(file);
    this.value = '';
  });

  // ====== XML Export ======
  function generateXmlString() {
    let xml = '<pops>\n  <pop name="custom">\n';
    allEntries.forEach(gene => {
      const stateObj = geneStates.get(gene.key);
      if (!stateObj) return;
      const selected = stateObj.selectedBases;
      if (selected.size === 0) return;
      const priority = gene.priorityOrder;
      const attrs = [];
      priority.forEach((base, idx) => {
        if (selected.has(base)) {
          attrs.push(`p${idx}="1"`);
        }
      });
      if (attrs.length > 0) {
        xml += `    <gene name="${gene.desc}" ${attrs.join(' ')}/>\n`;
      }
    });
    xml += '  </pop>\n</pops>';
    return xml;
  }

  document.getElementById('downloadXmlBtn').addEventListener('click', () => {
    const xmlStr = generateXmlString();
    const blob = new Blob([xmlStr], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'custom.xml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✅ XML downloaded as custom.xml');
  });

  // ====== Toast ======
  function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // ====== Initialization ======
  async function init() {
	await loadGeneDataFromXml();
    const loadingMsg = document.getElementById('loadingMessage');
    if (loadingMsg) loadingMsg.style.display = 'block';
	
	
	
    initGenes();
	    updateSourceGeneBases();
	    renderTable();
	    generateFlasks();
    renderPresetList();
    if (loadingMsg) loadingMsg.style.display = 'none';
    const geneTable = document.getElementById('geneTable');
    if (geneTable) geneTable.style.display = 'table';
  }

  init();
});