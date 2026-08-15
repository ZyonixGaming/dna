


// ---- DNA Library (categories, entries, local storage) ----
const STORAGE_KEY_LIBRARY = 'dna_shortener_categories';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

const syncChannel = new BroadcastChannel('dna-shortener-sync');



syncChannel.onmessage = (event) => {
    if (event.data && event.data.type === 'update') {
		if(event.data && event.data.categories){
			categories = event.data.categories;
		}
		else{
			categories = loadCategories();
		}
		if (selectedCategoryId && !categories.find(c => c.id === selectedCategoryId)) {
		  selectedCategoryId = null;
		}
        
        renderLibrary();
        updateSaveButton();
    }
};

function reloadCategoriesFromStorage() {
  categories = loadCategories();
  if (selectedCategoryId && !categories.find(c => c.id === selectedCategoryId)) {
    selectedCategoryId = null;
  }
}

function broadcastUpdate() {
    saveCategories();
    syncChannel.postMessage({
        type: 'update', 
        categories: JSON.parse(JSON.stringify(categories))
    });
}

function loadCategories() {
  const raw = localStorage.getItem(STORAGE_KEY_LIBRARY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  const defaultCat = { id: generateId(), name: 'Default', entries: [] };
  const oldDna = localStorage.getItem('horsey_saved_dna');
  if (oldDna) {
    try {
      const oldList = JSON.parse(oldDna);
      if (Array.isArray(oldList)) {
        oldList.forEach(item => {
          defaultCat.entries.push({ id: generateId(), name: item.name || 'Unnamed', dnaText: item.rawText || '' });
        });
      }
      broadcastUpdate();
      localStorage.removeItem('horsey_saved_dna');
    } catch (e) {}
  }
  return [defaultCat];
}

function saveCategories() {
  localStorage.setItem(STORAGE_KEY_LIBRARY, JSON.stringify(categories));
}

let categories = loadCategories();
let selectedCategoryId = null;

const categoryList = document.getElementById('categoryList');
const saveBtnText = document.getElementById('saveBtnText');
const dnaShortenerLink = document.getElementById('dnaShortenerLink');

function renderLibrary() {
  categoryList.innerHTML = '';
  categories.forEach(cat => {
    const li = document.createElement('li');
    li.className = 'category-item';
    if (cat.id === selectedCategoryId) li.classList.add('selected');
    li.draggable = true;
    li.dataset.categoryId = cat.id;

    li.addEventListener('dragstart', handleCategoryDragStart);
    li.addEventListener('dragover', handleCategoryDragOver);
    li.addEventListener('drop', handleCategoryDropUnified);
    li.addEventListener('dragend', handleDragEnd);

    const header = document.createElement('div');
    header.className = 'category-header';

    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '⋮⋮';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'category-name';
    nameSpan.textContent = cat.name;
    nameSpan.addEventListener('click', (e) => {
      e.stopPropagation();
      selectCategory(cat.id);
    });

    const actions = document.createElement('div');
    actions.className = 'category-actions';

    const renameBtn = document.createElement('button');
    renameBtn.innerHTML = '✏️';
    renameBtn.title = 'Rename category';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newName = prompt('New category name:', cat.name);
      if (newName && newName.trim()) {
        reloadCategoriesFromStorage();
        const targetCat = categories.find(c => c.id === cat.id);
        if (targetCat) {
          targetCat.name = newName.trim();
          broadcastUpdate();
          renderLibrary();
          showToast(`Category renamed to "${cat.name}"`);
        }
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete category';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`Delete category "${cat.name}" and all its DNA?`)) {
        reloadCategoriesFromStorage();
        categories = categories.filter(c => c.id !== cat.id);
        if (selectedCategoryId === cat.id) selectedCategoryId = null;
        broadcastUpdate();
        renderLibrary();
        updateSaveButton();
        showToast(`Category "${cat.name}" deleted`, 'error');
      }
    });

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);
    header.appendChild(dragHandle);
    header.appendChild(nameSpan);
    header.appendChild(actions);
    li.appendChild(header);

    if (cat.id === selectedCategoryId) {
      const entryList = document.createElement('ul');
      entryList.className = 'entry-list';
      cat.entries.forEach(entry => {
        const entryLi = document.createElement('li');
        entryLi.className = 'entry-item';
        entryLi.draggable = true;
        entryLi.dataset.entryId = entry.id;
        entryLi.dataset.categoryId = cat.id;

        entryLi.addEventListener('dragstart', handleEntryDragStart);
        entryLi.addEventListener('dragover', handleEntryDragOver);
        entryLi.addEventListener('drop', handleEntryDrop);
        entryLi.addEventListener('dragend', handleDragEnd);

        const entryDragHandle = document.createElement('span');
        entryDragHandle.className = 'drag-handle';
        entryDragHandle.innerHTML = '⋮';
        const entryName = document.createElement('span');
        entryName.className = 'entry-name';
        entryName.textContent = entry.name;
        entryLi.addEventListener('click', () => loadEntry(entry));

        const entryActions = document.createElement('div');
        entryActions.className = 'entry-actions';

        const entryRename = document.createElement('button');
        entryRename.innerHTML = '✏️';
        entryRename.title = 'Rename DNA';
        entryRename.addEventListener('click', (e) => {
          e.stopPropagation();
          const newName = prompt('New name:', entry.name);
          if (newName && newName.trim()) {
            reloadCategoriesFromStorage();
            const targetCat = categories.find(c => c.id === cat.id);
            if (targetCat) {
              const targetEntry = targetCat.entries.find(e => e.id === entry.id);
              if (targetEntry) {
                targetEntry.name = newName.trim();
                broadcastUpdate();
                renderLibrary();
                showToast(`DNA renamed to "${entry.name}"`);
              }
            }
          }
        });

        const entryCompare = document.createElement('button');
        entryCompare.innerHTML = '⚖️';
        entryCompare.title = 'Load into compare';
        entryCompare.addEventListener('click', (e) => {
          e.stopPropagation();
          if (!compareModeActive) toggleCompareMode();
          document.getElementById('compareGeneInput').value = entry.dnaText;
          updateReferenceMapFromText();
          renderTable();
          showToast(`"${entry.name}" loaded for comparison`);
        });

        const entryDelete = document.createElement('button');
        entryDelete.innerHTML = '🗑️';
        entryDelete.title = 'Delete DNA';
        entryDelete.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm(`Delete DNA "${entry.name}"?`)) {
            reloadCategoriesFromStorage();
            const targetCat = categories.find(c => c.id === cat.id);
            if (targetCat) {
              targetCat.entries = targetCat.entries.filter(e => e.id !== entry.id);
              broadcastUpdate();
              renderLibrary();
              showToast(`DNA "${entry.name}" deleted`, 'error');
            }
          }
        });

        entryActions.appendChild(entryCompare);
        entryActions.appendChild(entryRename);
        entryActions.appendChild(entryDelete);
        entryLi.appendChild(entryDragHandle);
        entryLi.appendChild(entryName);
        entryLi.appendChild(entryActions);
        entryList.appendChild(entryLi);
      });
      li.appendChild(entryList);
    }
    categoryList.appendChild(li);
  });
}

function selectCategory(id) {
  selectedCategoryId = id;
  renderLibrary();
  updateSaveButton();
}

function updateSaveButton() {
  const cat = categories.find(c => c.id === selectedCategoryId);
  saveBtnText.textContent = cat ? `Save to ${cat.name}` : 'Save DNA';
}

function loadEntry(entry) {
  document.getElementById('rawGeneInput').value = entry.dnaText;
  parseAndLoadFromTextarea();
  showToast(`Loaded DNA "${entry.name}"`);
}

// Drag & Drop

let draggedCategoryId = null, draggedEntryId = null, draggedFromCategoryId = null;



function handleCategoryDragStart(e) {
  draggedCategoryId = this.dataset.categoryId;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}
function handleCategoryDragOver(e) {
  e.preventDefault();
  const target = e.currentTarget;
  if (target && target.dataset.categoryId !== draggedCategoryId)
    target.style.borderTop = '2px solid #3b82f6';
}


function handleCategoryDrop(e) {
    e.preventDefault();
    const target = e.currentTarget;
    target.style.borderTop = '';
    const targetId = target.dataset.categoryId;
    if (!draggedCategoryId || targetId === draggedCategoryId) return;
    reloadCategoriesFromStorage();
    const draggedIndex = categories.findIndex(c => c.id === draggedCategoryId);
    const targetIndex = categories.findIndex(c => c.id === targetId);
    if (draggedIndex !== -1 && targetIndex !== -1) {
        const [moved] = categories.splice(draggedIndex, 1);
        categories.splice(targetIndex, 0, moved);
        broadcastUpdate();
        renderLibrary();
        showToast(`Category moved`);
    }
}

function handleCategoryDropUnified(e) {
    e.preventDefault();
    const target = e.currentTarget;
    target.style.borderTop = '';
    const targetCategoryId = target.dataset.categoryId;
    if (!targetCategoryId) return;

    reloadCategoriesFromStorage();

    // Case 1: Dropping a category (reorder categories)
    if (draggedCategoryId && draggedCategoryId !== targetCategoryId) {
        const draggedIndex = categories.findIndex(c => c.id === draggedCategoryId);
        const targetIndex = categories.findIndex(c => c.id === targetCategoryId);
        if (draggedIndex !== -1 && targetIndex !== -1) {
            const [moved] = categories.splice(draggedIndex, 1);
            categories.splice(targetIndex, 0, moved);
            broadcastUpdate();
            renderLibrary();
            showToast(`Category moved`);
        }
        return;
    }

    // Case 2: Dropping an entry into this category
    if (draggedEntryId && draggedFromCategoryId) {
        const sourceCat = categories.find(c => c.id === draggedFromCategoryId);
        const targetCat = categories.find(c => c.id === targetCategoryId);
        if (!sourceCat || !targetCat) return;

        const entryIndex = sourceCat.entries.findIndex(ent => ent.id === draggedEntryId);
        if (entryIndex === -1) return;

        const [movedEntry] = sourceCat.entries.splice(entryIndex, 1);
        targetCat.entries.push(movedEntry);  // append at end

        broadcastUpdate();
        renderLibrary();
        showToast(`Moved DNA to "${targetCat.name}"`);
        return;
    }
}

// ========== ENTRY DRAG & DROP (with cross‑category move) ==========


function handleEntryDragStart(e) {
    draggedEntryId = this.dataset.entryId;
    draggedFromCategoryId = this.dataset.categoryId;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
}

function handleEntryDragOver(e) {
    e.preventDefault();
    const target = e.currentTarget;
    if (target && target.dataset.entryId !== draggedEntryId && target.dataset.categoryId === draggedFromCategoryId) {
        target.style.borderTop = '2px solid #3b82f6';
    }
}

function handleEntryDrop(e) {
    e.preventDefault();
    const target = e.currentTarget;
    target.style.borderTop = '';

    if (!draggedEntryId || !draggedFromCategoryId) return;

    reloadCategoriesFromStorage();

    let targetCategoryId = null;
    let targetEntryId = null;
    let insertAfter = false;  // not needed for simple move

    // Case 1: dropped on another entry
    if (target.classList.contains('entry-item')) {
        targetCategoryId = target.dataset.categoryId;
        targetEntryId = target.dataset.entryId;
    }
    // Case 2: dropped on a category header (or category container)
    else if (target.classList.contains('category-item') || target.closest('.category-item')) {
        const catItem = target.classList.contains('category-item') ? target : target.closest('.category-item');
        if (catItem) {
            targetCategoryId = catItem.dataset.categoryId;
            targetEntryId = null; // append to end of category
        }
    }

    if (!targetCategoryId) return;

    // Find source and target categories
    const sourceCat = categories.find(c => c.id === draggedFromCategoryId);
    const targetCat = categories.find(c => c.id === targetCategoryId);
    if (!sourceCat || !targetCat) return;

    // Find the dragged entry in source category
    const entryIndex = sourceCat.entries.findIndex(ent => ent.id === draggedEntryId);
    if (entryIndex === -1) return;

    const [movedEntry] = sourceCat.entries.splice(entryIndex, 1);

    // If moving to same category, reorder relative to target entry
    if (draggedFromCategoryId === targetCategoryId && targetEntryId) {
        const targetIndex = targetCat.entries.findIndex(ent => ent.id === targetEntryId);
        if (targetIndex !== -1) {
            targetCat.entries.splice(targetIndex, 0, movedEntry);
        } else {
            targetCat.entries.push(movedEntry);
        }
    }
    // Move to different category – append at end or before target entry
    else {
        if (targetEntryId) {
            const targetIndex = targetCat.entries.findIndex(ent => ent.id === targetEntryId);
            if (targetIndex !== -1) {
                targetCat.entries.splice(targetIndex, 0, movedEntry);
            } else {
                targetCat.entries.push(movedEntry);
            }
        } else {
            targetCat.entries.push(movedEntry);
        }
    }

    broadcastUpdate();
    renderLibrary();
    showToast(`Moved DNA to "${targetCat.name}"`);
}


function handleDragEnd() {
    this.classList.remove('dragging');
    document.querySelectorAll('.category-item, .entry-item').forEach(el => el.style.borderTop = '');
    draggedCategoryId = null;
    draggedEntryId = null;
    draggedFromCategoryId = null;
}



// Add category
function addCategory() {
  const name = prompt('Category name:');
  if (!name || !name.trim()) return;
  reloadCategoriesFromStorage();
  const newCat = { id: generateId(), name: name.trim(), entries: [] };
  categories.push(newCat);
  broadcastUpdate();
  renderLibrary();
  selectCategory(newCat.id);
  showToast(`Category "${newCat.name}" created`);
}

// Save current DNA
function saveCurrentDna() {
  if (!selectedCategoryId) { alert('Please select a category first.'); return; }
  reloadCategoriesFromStorage();
  const cat = categories.find(c => c.id === selectedCategoryId);
  if (!cat) return;
  syncTextareaFromTable();
  const dnaText = document.getElementById('rawGeneInput').value;
  if (!dnaText.trim()) { alert('DNA editor is empty.'); return; }
  const name = prompt('Name for this DNA snapshot:', `DNA ${new Date().toLocaleTimeString()}`);
  if (!name || !name.trim()) return;
  cat.entries.push({ id: generateId(), name: name.trim(), dnaText });
  broadcastUpdate();
  renderLibrary();
  showToast(`DNA "${name.trim()}" saved`);
}

// Export / Import library
function exportLibrary() {
  const jsonStr = JSON.stringify(categories, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dna_library.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('DNA Library exported!');
}
function importLibrary() { document.getElementById('importFileInput').click(); }
document.getElementById('importFileInput').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      reloadCategoriesFromStorage();
      imported.forEach(cat => {
        if (!cat.name || typeof cat.name !== 'string') throw new Error('Invalid category');
        const newCatId = generateId();
        const entries = Array.isArray(cat.entries) ? cat.entries : [];
        const newEntries = entries.map(entry => ({
          id: generateId(), name: entry.name || 'Unnamed DNA', dnaText: entry.dnaText || ''
        }));
        categories.push({ id: newCatId, name: cat.name, entries: newEntries });
      });
      broadcastUpdate();
      renderLibrary();
      showToast(`Imported ${imported.length} categories`);
    } catch (err) { showToast('Invalid import file', 'error'); }
  };
  reader.readAsText(file);
  this.value = '';
});

// ========== Original CRISPR functions ==========
let currentGenePairs = [];
let compareModeActive = false;
let referenceMap = new Map();
let currentFilter = "";
let bookmarks = new Set();
let toastTimeout = null;

function getRandomNuc() { return ["A","C","G","T"][Math.floor(Math.random()*4)]; }
function getDominantNuc(a1,a2,priorityOrder) {
  if (a1===a2) return a1;
  const idx1=priorityOrder.indexOf(a1), idx2=priorityOrder.indexOf(a2);
  if (idx1===-1) return a2; if (idx2===-1) return a1;
  return idx1 < idx2 ? a1 : a2;
}

/*
function computeWeightedValue(entry, allele1, allele2) {
	const i1 = entry.n.indexOf(allele1);
	const i2 = entry.n.indexOf(allele2);

	const domNuc = i1 < i2 ? i1 : i2;
	const recNuc = i1 > i2 ? i1 : i2;	

	const domVal=entry.g[domNuc], recVal=entry.g[recNuc];  

	const m=entry.m;
	if (m>=100) return domVal;
	//if (m<=0) return recVal;
	return Math.floor((domVal*m + recVal*(100-m))/100);
}
*/

function computeWeightedValue(entry, allele1, allele2) {
	
  // edge case: if bases not found, fallback to old method (or return 0)
	const i1 = entry.n.indexOf(allele1);
	const i2 = entry.n.indexOf(allele2);

	return entry.valueMatrix[i1][i2];
}


function parseUserGenes(rawText) {
  const lines=rawText.split(/\r?\n/).filter(l=>l.trim());
  const helixSeqMap=new Map();
  function sanitizeNuc(h,p,c){
	  let u=c.toUpperCase();
	  if(DEFAULT_N.includes(u)){
		  return u;
	  }else if(u>=0&&u<=3){
		  return window.arrayHp[h][p].n[u];		
	  }else{
		  return DEFAULT_N[u.charCodeAt(0) % 4];
	  }
  }
  const result=new Map();
   
  for(const line of lines){
    const match=line.match(/^(\d+):(.*)$/);if(!match)continue;
    const helix=parseInt(match[1]);const seq=match[2].trim();
	
	
    if(!helixSeqMap.has(helix))helixSeqMap.set(helix,[]);
    const arr=helixSeqMap.get(helix);if(arr.length<2)arr.push(seq);
  }
 
  for(const [helix,seqs] of helixSeqMap){
	
    if(seqs.length!==2)continue;
    const left=seqs[0];
	let right;
	if(seqs.length>=2){
		right=seqs[1];
	}else{
		right=seqs[0];
	}
	
    const maxLen=Math.max(left.length,right.length);
    for(let i=0;i<maxLen;i++){
      const pos=i;const key=`${helix}:${pos}`;
      if(window.arrayHp[helix] && window.arrayHp[helix][pos]){
        const a1=i<left.length?sanitizeNuc(helix,pos,left[i]):getRandomNuc();
        const a2=i<right.length?sanitizeNuc(helix,pos,right[i]):getRandomNuc();
        result.set(key,{allele1:a1,allele2:a2});
      }
    }
  }
  return result;
}


function buildFullGenePairs(userMap){
  return window.allEntries.map(entry=>{
    const key=`${entry.h}:${entry.p}`;
    const user=userMap.get(key);
    return {...entry,
      allele1:user?user.allele1:getRandomNuc(),
      allele2:user?user.allele2:getRandomNuc()
    };
  });
}
function updateReferenceMapFromText(){
  const raw=document.getElementById("compareGeneInput").value;
  const userMap=parseUserGenes(raw);
  const newMap=new Map();
  for(const entry of window.allEntries){
    const key=`${entry.h}:${entry.p}`;
    const user=userMap.get(key);
    if(user){
      const weightedVal=computeWeightedValue(entry,user.allele1,user.allele2);
      newMap.set(key,{weightedValue:weightedVal});
    }else{newMap.set(key,null);}
  }
  referenceMap=newMap;
}
function syncTextareaFromTable(){
  const helixMap=new Map();
  for(const gp of currentGenePairs){
    if(!helixMap.has(gp.h))helixMap.set(gp.h,{left:[],right:[]});
    const entry=helixMap.get(gp.h);
    entry.left.push(gp.allele1);entry.right.push(gp.allele2);
  }
  const lines=[];
  for(const [helix,seqs] of [...helixMap.entries()].sort((a,b)=>a[0]-b[0])){
    const formatted=helix.toString().padStart(2,'0');
    lines.push(`${formatted}:${seqs.left.join("")}`);
    lines.push(`${formatted}:${seqs.right.join("")}`);
  }
  document.getElementById("rawGeneInput").value=lines.join("\n");
  updateDnaUrl();
}

// ---------- UPDATED URL + link ----------
function updateDnaUrl() {
  const rawText = document.getElementById('rawGeneInput').value.trim();
  if (!rawText) {
    history.replaceState(null, '', window.location.pathname);
    dnaShortenerLink.classList.remove('visible');
    dnaShortenerLink.href = '#';
    return;
  }
  const lines = rawText.split(/\r?\n/).filter(l => l.trim() !== '');
  try {
    const encoded = encodeSequences(lines);
    const newUrl = `${window.location.pathname}?dna=${encoded}`;
    history.replaceState(null, '', newUrl);
    dnaShortenerLink.href = `https://zyonixgaming.github.io/dna/?dna=${encoded}`;
    dnaShortenerLink.classList.add('visible');
  } catch (e) {
    history.replaceState(null, '', window.location.pathname);
    dnaShortenerLink.classList.remove('visible');
    dnaShortenerLink.href = '#';
  }
}

function parseAndLoadFromTextarea(){
  const raw=document.getElementById("rawGeneInput").value;
  const userMap=parseUserGenes(raw);
  currentGenePairs=buildFullGenePairs(userMap);
  renderTable();renderBookmarksList();
  updateDnaUrl();
}
function renderTable(){
	const filterWords = currentFilter.toLowerCase().trim().split(/\s+/);

	let filtered = currentGenePairs.filter(p => 
	  filterWords.some(word => p.desc.toLowerCase().includes(word))
	);
  const hasCompare=compareModeActive;
  const thead=document.getElementById("dynamicThead");
  thead.innerHTML=`<th style="width:45px;">⭐</th><th>Helix</th><th>Position</th><th>m</th><th>Description <a href="https://horseygame.miraheze.org/wiki/Genome" target="_blank">(?)</a></th><th colspan="2">Pair 1</th><th colspan="2">Pair 2</th><th>Value <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=3704208519" target="_blank">(?)</a></th>${hasCompare?"<th>Compare</th>":""}`;
  let html="";
  for(let idx=0;idx<filtered.length;idx++){
    const p=filtered[idx];
    const origIdx=currentGenePairs.findIndex(gp=>gp.h===p.h&&gp.p===p.p);
    const weightedVal=computeWeightedValue(p,p.allele1,p.allele2);
    const rowClass=p.h%2===0?"helix-even":"helix-odd";
    const isBookmarked=bookmarks.has(`${p.h}:${p.p}`);

	const createOptions = currentNuc => {
	  const parts = [];
	  for (let i = 0; i <= 3; i++) {
		const nuc = p.n[i];
		const gVal = p.g[i];
		const selected = currentNuc === nuc ? " selected" : "";
		parts.push(`<option value="${nuc}"${selected}>${nuc} (${gVal})</option>`);
	  }
	  return parts.join('');
	};


/*
	const createOptions = currentNuc => p.priorityOrder.map((nuc, idx) =>
  `<option value="${nuc}"${currentNuc === nuc ? " selected" : ""}>${nuc} (${p.g[idx]})</option>`
).join("");
*/

    let refCell="",diffClass="";
    if(hasCompare){
      const refData=referenceMap.get(`${p.h}:${p.p}`);
      let refVal=null;
      if(refData)refVal=refData.weightedValue;
      if(refVal!==null&&weightedVal!==refVal)diffClass="diff-highlight";
      refCell=`<td class="compare-cell ${diffClass}"><span class="final-value-badge">${refVal!==null?refVal:"—"}</span>`;
    }
    html+=`<tr class="${rowClass}" data-helix="${p.h}" data-pair="${p.p}">
      <td class="bookmark-col"><span class="bookmark-star${isBookmarked?" bookmarked":""}" onclick="toggleBookmarkFromTable(${p.h},${p.p})">★</span></td>
      <td class="helix-col">${p.h}<td class="pair-col">${p.p}<td class="desc-td">${p.m}
      <td class="desc-td" title="${p.desc}">${p.desc}
      <td colspan="2"><select class="nuc-select" data-idx="${origIdx}" data-side="1">${createOptions(p.allele1)}</select>
      <td colspan="2"><select class="nuc-select" data-idx="${origIdx}" data-side="2">${createOptions(p.allele2)}</select>
      <td class="value-cell ${diffClass}"><span class="final-value-badge">${weightedVal}</span>
      ${hasCompare?refCell:""}</tr>`;
  }
  document.getElementById("tableBody").innerHTML=html;attachSelectEvents();
}
function attachSelectEvents(){
  document.querySelectorAll(".nuc-select").forEach(sel=>{
    const updateClass=()=>{sel.classList.remove("A-selected","C-selected","G-selected","T-selected");if(sel.value==="A")sel.classList.add("A-selected");else if(sel.value==="C")sel.classList.add("C-selected");else if(sel.value==="G")sel.classList.add("G-selected");else if(sel.value==="T")sel.classList.add("T-selected");};
    updateClass();sel.addEventListener("change",e=>{
      const idx=parseInt(sel.dataset.idx),side=parseInt(sel.dataset.side);
      if(!isNaN(idx)&&idx<currentGenePairs.length){
        if(side===1)currentGenePairs[idx].allele1=sel.value;else currentGenePairs[idx].allele2=sel.value;
        syncTextareaFromTable();renderTable();renderBookmarksList();
      }
    });
  });
}
const filterInput=document.getElementById("filterInput");
filterInput.addEventListener("input",e=>{currentFilter=e.target.value;renderTable();});
document.getElementById("clearFilterBtn").addEventListener("click",()=>{filterInput.value="";currentFilter="";renderTable();});
function setupHelixNav(){
  const container=document.getElementById("helixNavButtons");
  const helixes=[...new Set(window.allEntries.map(e=>e.h))].sort((a,b)=>a-b);
  helixes.forEach(h=>{const btn=document.createElement("button");btn.textContent=h;btn.classList.add("helix-btn");btn.addEventListener("click",()=>{const firstRow=document.querySelector(`tr[data-helix="${h}"]`);if(firstRow){firstRow.scrollIntoView({behavior:"instant",block:"start"});highlightHelixRows(h);}});container.appendChild(btn);});
}
function highlightHelixRows(helix){document.querySelectorAll(`tr[data-helix="${helix}"]`).forEach(row=>row.classList.add("helix-highlight"));setTimeout(()=>document.querySelectorAll(`tr[data-helix="${helix}"]`).forEach(row=>row.classList.remove("helix-highlight")),1000);}
function toggleCompareMode(){
  compareModeActive=!compareModeActive;const btn=document.getElementById("toggleCompareBtn"),area=document.getElementById("compareArea");
  if(compareModeActive){btn.textContent="⚖️ COMPARE MODE (ON)";btn.classList.add("active");area.style.display="block";updateReferenceMapFromText();}
  else{btn.textContent="⚖️ COMPARE MODE (OFF)";btn.classList.remove("active");area.style.display="none";referenceMap.clear();}
  renderTable();
}
function onCompareInput(){if(compareModeActive){updateReferenceMapFromText();renderTable();}}
function loadBookmarks(){const saved=localStorage.getItem("horsey_bookmarks");if(saved)bookmarks=new Set(JSON.parse(saved));renderBookmarksList();}
function saveBookmarks(){localStorage.setItem("horsey_bookmarks",JSON.stringify([...bookmarks]));renderBookmarksList();renderTable();}
window.toggleBookmarkFromTable=function(h,p){const key=`${h}:${p}`;if(bookmarks.has(key))bookmarks.delete(key);else bookmarks.add(key);saveBookmarks();};
function renderBookmarksList(){
  const container=document.getElementById("bookmarksList");
  if(bookmarks.size===0){container.innerHTML='<div class="empty-bookmarks">No bookmarks yet.<br>Click ★ a row to add.</div>';return;}
  let html="";
  for(const key of [...bookmarks].sort()){
	  const [h,p]=key.split(":").map(Number);	  	 
	  const entry=window.arrayHp[h][p];
	  const desc=entry?entry.desc:"Unknown";
	  const pairData=currentGenePairs.find(gp=>gp.h===h&&gp.p===p);
	  let valBadge="";if(pairData&&entry){const w=computeWeightedValue(entry,pairData.allele1,pairData.allele2);
	  valBadge=`<span class="bookmark-value-badge" style="margin-left:6px;">${w}</span>`;}html+=`<div class="bookmark-item"><div class="bookmark-info" onclick="scrollToPair(${h},${p})"><strong>H${h}P${p}:</strong>  ${desc.substring(0,25)}</div><div style="display:flex;gap:5px;">${valBadge}<button class="remove-bookmark" onclick="event.stopPropagation();removeBookmark('${key}')">✖</button></div></div>`;
  }
  container.innerHTML=html;
}
window.scrollToPair=function(h,p){const row=document.querySelector(`tr[data-helix="${h}"][data-pair="${p}"]`);if(row){row.scrollIntoView({behavior:"instant",block:"start"});row.classList.add("helix-highlight");setTimeout(()=>row.classList.remove("helix-highlight"),1000);}};
window.removeBookmark=function(key){bookmarks.delete(key);saveBookmarks();};
function showToast(message,duration=2000){const toast=document.getElementById("toast");toast.textContent=message;toast.classList.add("show");if(toastTimeout)clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{toast.classList.remove("show");toastTimeout=null;},duration);}
function pasteClipboard(){navigator.clipboard.readText().then(text=>{document.getElementById("rawGeneInput").value=text;parseAndLoadFromTextarea();showToast("✅ Pasted from clipboard.");}).catch(()=>showToast("Clipboard read failed",1500));}
function exportData(){syncTextareaFromTable();const txt=document.getElementById("rawGeneInput").value;navigator.clipboard.writeText(txt).then(()=>showToast(`✅ Copied to clipboard`));}
function clearRaw(){document.getElementById("rawGeneInput").value="";parseAndLoadFromTextarea();showToast("Raw DNA cleared.");}
function clearCompare(){document.getElementById("compareGeneInput").value="";if(compareModeActive)updateReferenceMapFromText();renderTable();showToast("Compare DNA cleared.");}

function removeDiversity(){
	let modified=0;
	currentGenePairs.forEach(gp=>{
		const idx1=gp.n.indexOf(gp.allele1);
		const idx2=gp.n.indexOf(gp.allele2);
		const domIdx = idx1<idx2 ? idx1 : idx2;
		const recIdx = idx1>idx2 ? idx1 : idx2;
		if(gp.m==100||(gp.g[domIdx]==gp.g[recIdx])){						
			if(recIdx==3&&(gp.desc=="CHEST_SMALL"||gp.desc=="OSTO_SIZE")){
				if(gp.g[domIdx]==gp.g[recIdx]){
					gp.allele1=gp.n[recIdx];
					gp.allele2=gp.allele1;
					modified++;					
				}
			}else{
				gp.allele1=gp.n[domIdx];
				gp.allele2=gp.allele1;
				modified++;				
			}
		}
		
	});
	if(modified){
		syncTextareaFromTable();
		renderTable();
		renderBookmarksList();
	}
}

function fixDna(){
	let modified=0;
	currentGenePairs.forEach(gp=>{
		const idx1=gp.n.indexOf(gp.allele1);
		const idx2=gp.n.indexOf(gp.allele2);
		const domIdx = idx1<idx2 ? idx1 : idx2;
		const recIdx = idx1>idx2 ? idx1 : idx2;
		
		const domBase = gp.n[domIdx];
		let recBase;
		//consider checking dom value instead of just dom base to minimize changes.
		if (domBase=="A") recBase = "T";
		if (domBase=="T") recBase = "A";
		if (domBase=="G") recBase = "C";
		if (domBase=="C") recBase = "G";
		
		if(idx1==domIdx){
			gp.allele1=domBase;
			gp.allele2=recBase;
		}else{
			gp.allele2=domBase;
			gp.allele1=recBase;		
		}
		modified++;				
		
	});
	if(modified){
		syncTextareaFromTable();
		renderTable();
		renderBookmarksList();
	}
}

function randomDiversity() {
    let modified = 0;

    for (const gp of currentGenePairs) {
        const { n, g, m, allele1, allele2, desc, valueMatrix } = gp;
        const idx1 = n.indexOf(allele1);
        const idx2 = n.indexOf(allele2);
        if (idx1 === -1 || idx2 === -1) continue;   // skip invalid bases

        const origDom = Math.min(idx1, idx2);
        const origRec = Math.max(idx1, idx2);
        const isSpecial = (desc === "CHEST_SMALL" || desc === "OSTO_SIZE");
        //const fixedRec = isSpecial ? origRec : null;

        // Original “target” value depending on dominance type
        let targetValue;
        if (m === 100) {
            targetValue = g[origDom];          // value of the dominant allele
        } else {
            targetValue = valueMatrix[idx1][idx2]; // combined value from matrix
        }

        // Collect all valid (i,j) pairs
        const candidates = [];
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                const newDom = Math.min(i, j);
                const newRec = Math.max(i, j);

                // Special trait: recessive index must stay exactly as original
                if (isSpecial && ((newRec==3)!==(origRec==3))) continue;

                // Condition based on dominance percentage
                if (m === 100) {
                    if (g[newDom] !== targetValue) continue;
                } else {
                    if (valueMatrix[i][j] !== targetValue) continue;
                }

                candidates.push([i, j]);
            }
        }

        if (candidates.length === 0) continue;

        // Prioritize pairs with two different alleles
        const diffCandidates = candidates.filter(([i, j]) => i !== j);
        const finalCandidates = diffCandidates.length ? diffCandidates : candidates;

        // Randomly pick one candidate
        const [newI, newJ] = finalCandidates[Math.floor(Math.random() * finalCandidates.length)];

        // Apply the new alleles
        gp.allele1 = n[newI];
        gp.allele2 = n[newJ];
        modified++;
    }

    if (modified) {
        syncTextareaFromTable();
        renderTable();
        renderBookmarksList();
    }
}

// Event listeners
document.getElementById("rawGeneInput").addEventListener("input",()=>parseAndLoadFromTextarea());
document.getElementById("pasteBtn").addEventListener("click",pasteClipboard);
document.getElementById("exportBtn").addEventListener("click",exportData);
document.getElementById("toggleCompareBtn").addEventListener("click",toggleCompareMode);
document.getElementById("compareGeneInput").addEventListener("input",onCompareInput);
document.getElementById("saveDnaBtn").addEventListener("click",saveCurrentDna);
document.getElementById("clearRawBtn").addEventListener("click",clearRaw);
document.getElementById("clearCompareBtn").addEventListener("click",clearCompare);
document.getElementById("removeDiversityBtn").addEventListener("click",removeDiversity);
document.getElementById("randomDiversityBtn").addEventListener("click",randomDiversity);
document.getElementById("addCategoryBtn").addEventListener("click",addCategory);
document.getElementById("exportLibBtn").addEventListener("click",exportLibrary);
document.getElementById("importLibBtn").addEventListener("click",importLibrary);

document.addEventListener('keydown', function(event) {
    // Check for Ctrl + C (Copy)
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        exportData();
        
        // event.preventDefault(); // Uncomment to stop browser's default copy behavior
    }

    // Check for Ctrl + V (Paste)
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
		const myTextArea = document.getElementById('compareGeneInput');

		if (document.activeElement === myTextArea) {
			
		} else {
			pasteClipboard();
		}        
        // event.preventDefault(); // Uncomment to stop browser's default paste behavior
    }
});

// Load ?dna= on start
function loadFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const dna = params.get('dna');
  if (dna) {
    try {
      const lines = decodeToLines(dna);
      document.getElementById('rawGeneInput').value = lines.join('\n');
      parseAndLoadFromTextarea();
      showToast('DNA loaded from link');
    } catch (e) {
      showToast('Failed to decode link', 'error');
    }
  } else {
    updateDnaUrl();
  }
}

document.getElementById("rawGeneInput").value = "";



window.addEventListener('load', async () => {
	await loadGeneDataFromXml();
	loadFromUrl();
  // Default category handling
  if (!localStorage.getItem(STORAGE_KEY_LIBRARY)) {
    saveCategories();
  }
  categories = loadCategories();

  // Bookmarks, initial render, helix nav
  loadBookmarks();
  parseAndLoadFromTextarea();
  setupHelixNav();
  renderLibrary();
  if (!selectedCategoryId && categories.length > 0) {
    selectedCategoryId = categories[0].id;
    renderLibrary();
    updateSaveButton();
  }

  // Load DNA from URL parameter (if any)
  
});