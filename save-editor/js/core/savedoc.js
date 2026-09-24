'use strict';
(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('./savefile.js'), require('./export.js'), require('./history.js'), require('./bus.js'), require('./loctemplates.js'));
    } else {
        global.SaveDoc = factory(global.SaveFile, global.SaveExport, global.History, global.Bus, global.LocTemplates);
    }
})(typeof window !== 'undefined' ? window : globalThis, function (SaveFile, SaveExport, History, Bus, LocTemplates) {
    const INTENT_FIELDS = [
        'patches',
        'movedWorldItems',
        'deletedWorldItems',
        'renamedRecords',
        'changedHorseItems',
        'locationEdits',
        'deletedStabledHorses',
        'deletedLocations',
        'deletedInteriorItems'
    ];
    const WORLD_ITEM_NOUN = { 0: 'a horse', 1: 'the Truck', 2: 'a location marker', 3: 'a ground item', 4: 'a hole' };
    function worldItemLabel(state, start) {
        const it = (state.items || []).find((x) => x.start === start);
        return (it && WORLD_ITEM_NOUN[it.type]) || 'a map object';
    }
    function locationSuffix(state, li, prep) {
        const loc = (li === null || li === undefined) ? null : (state.locations || [])[li];
        if (!loc) return '';
        prep = ' ' + (prep || 'in') + ' ';
        if (loc.name === LocTemplates.TRUCK_CONTAINER_NAME) return prep + 'the Truck';
        return prep + LocTemplates.displayName(loc.index, loc.name);
    }
    function createSaveDoc(bytes, fileName, fileHandle) {
        const state = SaveFile.parse(bytes);
        const bus = Bus.createBus();
        const history = History.createHistory(() => bus.emit('history:changed', doc.historyInfo));
        const doc = {
            state,
            fileName: fileName || 'save.dat',
            fileHandle: fileHandle || null,
            bus,
            history,
            grid: state.grid.clone(),
            buriedItems: state.buriedItems.map((it) => ({ ...it })),
            _gridEditDepth: 0,
            _buriedEditDepth: 0,
            get gridDirty() { return this._gridEditDepth > 0; },
            set gridDirty(v) { this._gridEditDepth = v ? Math.max(1, this._gridEditDepth) : 0; },
            get buriedDirty() { return this._buriedEditDepth > 0; },
            set buriedDirty(v) { this._buriedEditDepth = v ? Math.max(1, this._buriedEditDepth) : 0; },
            touchGrid(delta) { this._gridEditDepth = Math.max(0, this._gridEditDepth + delta); },
            touchBuried(delta) { this._buriedEditDepth = Math.max(0, this._buriedEditDepth + delta); },
            patches: new Map(),
            movedWorldItems: new Map(),
            deletedWorldItems: new Set(),
            renamedRecords: new Map(),
            changedHorseItems: new Map(),
            locationEdits: new Map(),
            deletedStabledHorses: new Set(),
            deletedLocations: new Set(),
            deletedInteriorItems: new Set(),
            _originState: state,
            _rebaseDepth: 0,
            _addedHorseCount: 0,
            get rebased() { return this._rebaseDepth > 0; },
            get dirty() {
                return INTENT_FIELDS.some((k) => this[k].size > 0) ||
                    this.gridDirty || this.buriedDirty || this._rebaseDepth > 0;
            },
            get editCount() {
                return INTENT_FIELDS.reduce((n, k) => n + this[k].size, 0) +
                    (this.gridDirty ? 1 : 0) + (this.buriedDirty ? 1 : 0) + this._rebaseDepth;
            },
            get changeCount() { return history.editCount; },
            get addedHorseCount() { return this._addedHorseCount; },
            get historyInfo() {
                return { canUndo: history.canUndo, canRedo: history.canRedo, editCount: history.editCount };
            },
            pendingChanges() {
                return history.entries().map((e, i) => ({ label: e.label, index: i })).reverse();
            },
            locationDeleted(loc) {
                return !!loc && loc.index !== null && this.deletedLocations.has(loc.index);
            },
            horseDeleted(h) {
                if (!h) return false;
                if (h.container === 'map') return this.deletedWorldItems.has(h.worldItemStart);
                if (this.locationDeleted(this.state.locations[h.locationIndex])) return true;
                return h.container === 'stabled' && this.deletedStabledHorses.has(h.genomeOff);
            },
            itemDeleted(item) {
                if (!item) return false;
                if (item.container === 'map') return this.deletedWorldItems.has(item.start);
                return this.deletedInteriorItems.has(item.start) ||
                    this.locationDeleted(this.state.locations[item.locationIndex]);
            },
            liveHorses() { return this.state.horses.filter((h) => !this.horseDeleted(h)); },
            liveLocations() { return this.state.locations.filter((l) => !this.locationDeleted(l)); },
            setByte(offset, value) {
                value = value & 0xFF;
                const had = this.patches.has(offset);
                const prev = had ? this.patches.get(offset) : undefined;
                const origByte = this.state.bytes[offset];
                const apply = (v) => { if (v === origByte) this.patches.delete(offset); else this.patches.set(offset, v); this._touched(); };
                apply(value);
                history.push({
                    label: 'Edited a byte at ' + offset,
                    undo: () => apply(had ? prev : origByte),
                    redo: () => apply(value)
                });
            },
            setU32(offset, value) {
                value = value >>> 0;
                for (let i = 0; i < 4; i++) this.setByte(offset + i, (value >>> (8 * i)) & 0xFF);
            },
            _patchBatch(offset, values, label) {
                const NONE = Symbol('no-patch');
                const targets = [];
                for (let i = 0; i < values.length; i++) {
                    const off = offset + i;
                    targets.push({
                        off,
                        next: values[i] & 0xFF,
                        prev: this.patches.has(off) ? this.patches.get(off) : NONE,
                        orig: this.state.bytes[off]
                    });
                }
                const apply = (pick) => {
                    for (const t of targets) {
                        const v = pick(t);
                        if (v === NONE || v === t.orig) this.patches.delete(t.off);
                        else this.patches.set(t.off, v);
                    }
                    this._touched();
                };
                apply((t) => t.next);
                history.push({
                    label: label || ('Edited ' + targets.length + ' bytes at ' + offset),
                    undo: () => apply((t) => t.prev),
                    redo: () => apply((t) => t.next)
                });
            },
            setGenomeBytes(genomeOff, bytes, label) {
                if (!bytes || bytes.length !== SaveFile.GENOME_LEN) {
                    throw new Error('A genome is exactly ' + SaveFile.GENOME_LEN + ' bytes, got ' +
                        (bytes ? bytes.length : 0) + '.');
                }
                for (let i = 0; i < bytes.length; i++) {
                    if (!SaveFile.CODESET.has(bytes[i])) {
                        throw new Error('Byte ' + i + ' (' + bytes[i] + ') is not a legal genome value.');
                    }
                }
                this._patchBatch(genomeOff, bytes, label || 'Replaced a horse’s genome');
            },
            setStabledPosition(xoff, yoff, x, y) {
                const buf = new ArrayBuffer(8);
                const dv = new DataView(buf);
                dv.setFloat32(0, x, true);
                dv.setFloat32(4, y, true);
                if (yoff !== xoff + 4) throw new Error('setStabledPosition: x/y are not adjacent.');
                this._patchBatch(xoff, new Uint8Array(buf), 'setStabledPosition@' + xoff);
            },
            moveWorldItem(start, x, y) {
                const had = this.movedWorldItems.has(start);
                const prev = had ? this.movedWorldItems.get(start) : null;
                const apply = (pos) => { if (pos) this.movedWorldItems.set(start, pos); else this.movedWorldItems.delete(start); this._touched(); };
                apply({ x, y });
                history.push({
                    label: 'Moved ' + worldItemLabel(this.state, start) + ' to ' + Math.round(x) + ', ' + Math.round(y),
                    undo: () => apply(prev), redo: () => apply({ x, y })
                });
            },
            setLocationCoords(marker, x, y) {
                const key = marker.offset;
                const had = this.locationEdits.has(key);
                const prev = had ? this.locationEdits.get(key) : null;
                const next = { xoff: marker.xoff, yoff: marker.yoff, xoff2: marker.xoff2, yoff2: marker.yoff2, x, y };
                const apply = (v) => { if (v) this.locationEdits.set(key, v); else this.locationEdits.delete(key); this._touched(); };
                apply(next);
                history.push({
                    label: 'Moved ' + (marker.value || 'a location') + ' to ' + Math.round(x) + ', ' + Math.round(y),
                    undo: () => apply(prev), redo: () => apply(next)
                });
            },
            deleteWorldItem(start) {
                const it = this.state.items.find((x) => x.start === start);
                if (!it) throw new Error('deleteWorldItem: no item at offset ' + start);
                if (it.type === 1 || it.type === 2) throw new Error('Cannot delete world item type ' + it.type + ' (Truck or location).');
                const already = this.deletedWorldItems.has(start);
                const next = !already;
                const apply = (on) => { if (on) this.deletedWorldItems.add(start); else this.deletedWorldItems.delete(start); this._touched(); };
                apply(next);
                history.push({
                    label: (next ? 'Deleted ' : 'Restored ') + worldItemLabel(this.state, start),
                    undo: () => apply(already), redo: () => apply(next)
                });
            },
            _snapshot() {
                const snap = {
                    state: this.state,
                    grid: this.grid,
                    buriedItems: this.buriedItems,
                    gridDepth: this._gridEditDepth,
                    buriedDepth: this._buriedEditDepth,
                    rebaseDepth: this._rebaseDepth,
                    addedHorseCount: this._addedHorseCount
                };
                for (const k of INTENT_FIELDS) snap[k] = new (this[k].constructor)(this[k]);
                return snap;
            },
            _restore(s) {
                this.state = s.state;
                this.grid = s.grid;
                this.buriedItems = s.buriedItems;
                for (const k of INTENT_FIELDS) this[k] = s[k];
                this._gridEditDepth = s.gridDepth;
                this._buriedEditDepth = s.buriedDepth;
                this._rebaseDepth = s.rebaseDepth;
                this._addedHorseCount = s.addedHorseCount;
                bus.emit('doc:rebased', doc);
                this._touched();
            },
            _commitStructural(label, extraEdits, pick, horseDelta) {
                const edits = { ...this._buildEdits(), ...extraEdits };
                const check = SaveExport.validateForExport(this.state, edits);
                if (!check.ok) throw new Error(label + ' failed:\n' + check.errors.join('\n'));
                const before = this._snapshot();
                const rebuilt = SaveExport.rebuild(this.state, edits);
                const nextState = SaveFile.parse(rebuilt);
                const result = pick ? pick(nextState) : undefined;
                const apply = () => {
                    this.state = nextState;
                    this.grid = nextState.grid.clone();
                    this.buriedItems = nextState.buriedItems.map((it) => ({ ...it }));
                    this.patches = new Map();
                    this.movedWorldItems = new Map();
                    this.deletedWorldItems = new Set();
                    this.renamedRecords = new Map();
                    this.changedHorseItems = new Map();
                    this.locationEdits = new Map();
                    this.deletedStabledHorses = new Set();
                    this.deletedLocations = new Set();
                    this.deletedInteriorItems = new Set();
                    this._gridEditDepth = 0;
                    this._buriedEditDepth = 0;
                    this._rebaseDepth = before.rebaseDepth + 1;
                    this._addedHorseCount = before.addedHorseCount + (horseDelta || 0);
                    bus.emit('doc:rebased', doc);
                    this._touched();
                };
                apply();
                history.push({ label, undo: () => this._restore(before), redo: () => apply() });
                return result;
            },
            addHorses(specs) {
                if (!Array.isArray(specs) || !specs.length) throw new Error('addHorses: nothing to add.');
                const base = this.state.records.length;
                const addedRecords = [];
                const added = specs.map((spec) => {
                    let recordIndex = null;
                    if (spec.recordName !== undefined && spec.recordName !== null) {
                        recordIndex = base + addedRecords.length;
                        addedRecords.push({
                            bytes: SaveFile.buildRecordEntry({ name: String(spec.recordName) })
                        });
                    }
                    return {
                        afterStart: this.state.worldItemEndOffset,
                        bytes: SaveFile.buildHorseRecord(this.state, { ...spec, recordIndex })
                    };
                });
                return this._commitStructural(
                    'Added ' + (specs.length === 1 ? 'a horse' : specs.length + ' horses') + ' to the map',
                    addedRecords.length ? { addedWorldItems: added, addedRecords }
                        : { addedWorldItems: added },
                    (next) => next.items.filter((it) => it.type === 0).slice(-specs.length).map((it) => it.start),
                    specs.length
                );
            },
            addStabledHorses(locationNameOffset, specs) {
                if (!Array.isArray(specs) || !specs.length) throw new Error('addStabledHorses: nothing to add.');
                const loc = this.state.locations.find((l) => l.nameOffset === locationNameOffset);
                if (!loc) throw new Error('addStabledHorses: no location record at offset ' + locationNameOffset + '.');
                const base = this.state.records.length;
                const addedRecords = [];
                const added = specs.map((spec, k) => {
                    const donor = SaveFile.findStabledDonor(this.state, spec.donorGenomeOff);
                    if (!donor) throw new Error('No minimal-shape stabled horse in this file to clone from.');
                    const donorRec = SaveFile.recordForDetailOff(
                        this.state, donor.genomeOff + SaveFile.GENOME_LEN + SaveFile.DETAIL_GAP);
                    var name = '';
					const fixed = donorRec
						? this.state.bytes.slice(donorRec.fixedOffset, donorRec.fixedOffset + SaveFile.RECORD_FIXED_LEN)
						: SaveFile.RECORD_FIXED_BLANK.slice();
					var isOwner=false;
					if(loc.index==null||loc.index==0){
						isOwner=true;
						fixed[1] = 0; fixed[5] = 0;
						name = 'Horse';
					}
					else if(loc.index<=12){
						fixed[1] = loc.index; fixed[5] = loc.index;
						fixed[0] = 1;
						name = 'Horse';
					}else if (loc.index==18){
						fixed[1] = 3; fixed[5] = 3;
						name = 'Car';
					}else{
						fixed[1] = 0; fixed[5] = 0;
						name = 'Horse';
					}
                    addedRecords.push({
                        bytes: SaveFile.buildRecordEntry({
                            name,
                            fixed:fixed
                        })
                    });
                    return {
                        locationNameOffset,
                        bytes: SaveFile.buildStabledHorseRecord(
                            this.state, { ...spec, donor, recordIndex: base + k, isOwner: isOwner })
                    };
                });
                const key = loc.index;
                const name = loc.name;
                return this._commitStructural(
                    'Added ' + (specs.length === 1 ? 'a horse' : specs.length + ' horses') +
                        locationSuffix(this.state, this.state.locations.indexOf(loc), 'to'),
                    { addedStabledHorses: added, addedRecords },
                    (next) => {
                        const nl = (key !== null)
                            ? next.locations.find((l) => l.index === key)
                            : next.locations.find((l) => l.name === name);
                        return nl ? nl.horses.slice(-specs.length) : [];
                    },
                    specs.length
                );
            },
            deleteStabledHorse(genomeOff) {
                let found = null;
                for (const loc of this.state.locations) {
                    for (const blk of (loc.horseBlocks || [])) {
                        if (blk.genomeOff === genomeOff) { found = { loc, blk }; break; }
                    }
                    if (found) break;
                }
                if (!found) throw new Error('deleteStabledHorse: no stabled horse at offset ' + genomeOff + '.');
                const already = this.deletedStabledHorses.has(genomeOff);
                const next = !already;
                const apply = (on) => {
                    if (on) this.deletedStabledHorses.add(genomeOff); else this.deletedStabledHorses.delete(genomeOff);
                    this._touched();
                };
                apply(next);
                history.push({
                    label: (next ? 'Deleted ' : 'Restored ') + 'a stabled horse' +
                        locationSuffix(this.state, this.state.locations.indexOf(found.loc)),
                    undo: () => apply(already), redo: () => apply(next)
                });
            },
            replaceGrid(nextGrid, label) {
                const prev = this.grid;
                const apply = (g, delta) => {
                    this.grid = g;
                    this.touchGrid(delta);
                    bus.emit('doc:rebased', doc);
                    this._touched();
                };
                apply(nextGrid, +1);
                history.push({
                    label: label || 'Replaced the whole map',
                    undo: () => apply(prev, -1),
                    redo: () => apply(nextGrid, +1)
                });
            },
            setItemId(item, id) {
                if (!(id >= 0 && id <= 255)) throw new Error('An item id is 0-255.');
                this.setByte(item.fields.idOff, id);
            },
            setItemPosition(item, x, y) {
                const buf = new ArrayBuffer(8);
                const dv = new DataView(buf);
                dv.setFloat32(0, x, true);
                dv.setFloat32(4, y, true);
                if (item.fields.yOff !== item.fields.xOff + 4) {
                    throw new Error('setItemPosition: x/y are not adjacent.');
                }
                this._patchBatch(item.fields.xOff, new Uint8Array(buf), 'Move item @' + item.start);
            },
            setItemDna(item, on, genome) {
                if (!!item.hasDna === !!on) return null;
                let payload = null;
                if (on) {
                    payload = genome || null;
                    if (!payload) throw new Error('Turning DNA on needs a 240-byte genome.');
                    if (payload.length !== SaveFile.GENOME_LEN) {
                        throw new Error('A genome is exactly ' + SaveFile.GENOME_LEN + ' bytes, got ' + payload.length + '.');
                    }
                    for (let i = 0; i < payload.length; i++) {
                        if (!SaveFile.CODESET.has(payload[i])) {
                            throw new Error('Genome byte ' + i + ' (' + payload[i] + ') is not a legal value.');
                        }
                    }
                }
                const start = item.start;
                return this._commitStructural(
                    (on ? 'Added DNA to' : 'Removed DNA from') + ' an item on the map',
                    { itemDnaEdits: [{ start, on: !!on, genome: payload }] },
                    (next) => {
                        const found = SaveFile.buildItemIndex(next).find((i) => i.start === start);
                        if (!found) throw new Error('The item is no longer readable after that change. The save was not changed.');
                        if (!!found.hasDna !== !!on) {
                            throw new Error('The DNA flag did not take. The save was not changed.');
                        }
                        return found;
                    },
                    0
                );
            },
            deleteItem(item) {
                if (!item || typeof item.start !== 'number' || !item.container) {
                    throw new Error('deleteItem: expected an item index entry with {container, start}.');
                }
                const set = item.container === 'map' ? this.deletedWorldItems : this.deletedInteriorItems;
                const key = item.start;
                const already = set.has(key);
                const next = !already;
                const apply = (on) => { if (on) set.add(key); else set.delete(key); this._touched(); };
                apply(next);
                history.push({
                    label: (next ? 'Deleted ' : 'Restored ') + 'an item' +
                        (item.container === 'map' ? ' on the map' : locationSuffix(this.state, item.locationIndex)),
                    undo: () => apply(already), redo: () => apply(next)
                });
            },
            addGroundItem(opts) {
                opts = opts || {};
                const bytes = SaveFile.buildItemRecord(this.state, opts);
                const before = this.state.items.length;
                return this._commitStructural(
                    'Added an item to the map',
                    { addedWorldItems: [{ afterStart: this.state.worldItemEndOffset, bytes }] },
                    (next) => {
                        if (next.items.length !== before + 1) {
                            throw new Error('Placing the item changed the world-item count by ' +
                                (next.items.length - before) + ', expected 1. The save was not changed.');
                        }
                        const last = next.items[next.items.length - 1];
                        if (last.type !== 3) throw new Error('The new record is not an item. The save was not changed.');
                        const found = SaveFile.buildItemIndex(next).find((i) => i.start === last.start);
                        if (!found) throw new Error('The new item is not readable. The save was not changed.');
                        if (opts.itemId !== undefined && found.itemId !== opts.itemId) {
                            throw new Error('The new item reads as id ' + found.itemId + ', expected ' +
                                opts.itemId + '. The save was not changed.');
                        }
                        return found;
                    },
                    0
                );
            },
            addInteriorItem(locationNameOffset, opts) {
                const loc = this.state.locations.find((l) => l.nameOffset === locationNameOffset);
                if (!loc) throw new Error('addInteriorItem: no location record at offset ' + locationNameOffset + '.');
                opts = Object.assign({}, opts || {});
                opts.x = SaveFile.clampRoomCoord(opts.x);
                opts.y = SaveFile.clampRoomCoord(opts.y);
                const bytes = SaveFile.buildItemRecord(this.state, opts);
                const key = loc.index;
                const name = loc.name;
                const want = loc.interiorCount + 1;
                return this._commitStructural(
                    'Added an item' + locationSuffix(this.state, this.state.locations.indexOf(loc), 'to'),
                    { addedInteriorItems: [{ locationNameOffset, bytes }] },
                    (next) => {
                        const nl = (key !== null)
                            ? next.locations.find((l) => l.index === key)
                            : next.locations.find((l) => l.name === name);
                        if (!nl) throw new Error('The location is no longer readable. The save was not changed.');
                        if (nl.interiorCount !== want) {
                            throw new Error('Interior count is ' + nl.interiorCount + ', expected ' + want +
                                '. The save was not changed.');
                        }
                        if (nl.interiorItems.length !== want) {
                            throw new Error('The interior list walks to ' + nl.interiorItems.length +
                                ' items but its count says ' + want + '. The save was not changed.');
                        }
                        return nl.interiorItems[nl.interiorItems.length - 1];
                    },
                    0
                );
            },
            addableLocations() {
                if (!this.state.locationWalkOk || !LocTemplates.loaded()) return [];
                const queued = new Set(this.deletedLocations);
                const indices = SaveFile.addableLocationIndices(this.state);
                for (const idx of queued) if (!indices.includes(idx)) indices.push(idx);
                indices.sort((a, b) => a - b);
                return indices
                    .map((index) => {
                        const t = LocTemplates.get(index);
                        return t ? {
                            index, name: t.name, label: t.label,
                            unstaffed: t.unstaffed, queuedForDeletion: queued.has(index),
                            template: t
                        } : null;
                    })
                    .filter(Boolean);
            },
            addLocation(opts) {
                const index = opts.index;
                const template = LocTemplates.get(index);
                if (!template) {
                    throw new Error('No template for location index ' + index + '. Indices 19 and 32-35 ' +
                        'are unused by the game and appear in no save, so none could be harvested.');
                }
                const name = (opts.name === undefined || opts.name === null || opts.name === '')
                    ? template.name : String(opts.name);
                const shown = name || template.label || ('location ' + index);
                const wantCrowd = (opts.crowd === undefined || opts.crowd === null)
                    ? template.minCrowd : Math.max(0, opts.crowd | 0);
                const recordBase = this.state.records.length;
                const addedRecords = [];
                const crowdBlocks = [];
                const fromTemplate = Math.min(template.crowd, wantCrowd);
                if (fromTemplate > 0) {
                    const spans = SaveFile.walkStabledBlocks(template.crowdBytes, template.crowd);
                    for (let k = 0; k < fromTemplate; k++) {
                        const cr = template.crowdRecords[k] || { name: '', fixed: null };
                        const ri = recordBase + addedRecords.length;
                        addedRecords.push({
                            bytes: SaveFile.buildRecordEntry({ name: cr.name, fixed: cr.fixed })
                        });
                        const blk = template.crowdBytes.slice(spans[k].start, spans[k].start + spans[k].length);
                        crowdBlocks.push(SaveFile.retargetStabledBlocks(blk, 1, [ri]));
                    }
                }
                for (let k = fromTemplate; k < wantCrowd; k++) {
                    const donor = SaveFile.findStabledDonor(this.state);
                    if (!donor) {
                        throw new Error('“' + shown + '” needs ' + wantCrowd + ' horses in its crowd, and ' +
                            'its template only ships ' + template.crowd + ' — but this file has no stabled ' +
                            'horse to clone the rest from.');
                    }
                    const donorRec = SaveFile.recordForDetailOff(
                        this.state, donor.genomeOff + SaveFile.GENOME_LEN + SaveFile.DETAIL_GAP);
                    const ri = recordBase + addedRecords.length;
                    addedRecords.push({
                        bytes: SaveFile.buildRecordEntry({
                            name: donorRec ? donorRec.name : '',
                            fixed: donorRec
                                ? this.state.bytes.slice(donorRec.fixedOffset,
                                    donorRec.fixedOffset + SaveFile.RECORD_FIXED_LEN)
                                : null
                        })
                    });
                    crowdBlocks.push(SaveFile.buildStabledHorseRecord(
                        this.state, { donor, recordIndex: ri }));
                }
                const iv = template.interior;
                const useInterior = !!iv && iv.hdr === this.state.HDR;
                const recordBytes = SaveFile.buildLocationRecord({
                    name, x: opts.x, y: opts.y, templateBody: template.body,
                    crowd: wantCrowd,
                    crowdBytes: crowdBlocks.length ? SaveFile.concatBytes(crowdBlocks) : null,
                    interiorCount: useInterior ? iv.count : 0,
                    interiorBytes: useInterior ? iv.bytes : null
                });
                const markerBytes = SaveFile.buildLocationMarker(this.state, {
                    index, x: opts.x, y: opts.y, donorStart: opts.donorStart
                });
                return this._commitStructural(
                    'Added ' + LocTemplates.displayName(index, name),
                    {
                        addedLocations: [{ index, recordBytes, markerBytes, attestedForms: template.attestedForms }],
                        addedRecords
                    },
                    (next) => {
                        if (!next.locationWalkOk) {
                            throw new Error('Adding "' + shown + '" left the location block unwalkable: ' +
                                next.locationWalkError + '\nThe save was not changed.');
                        }
                        const added = next.locations.find((l) => l.index === index);
                        if (!added) throw new Error('Adding "' + shown + '" did not produce a readable record. The save was not changed.');
                        if (added.crowd !== wantCrowd || added.horseBlocks.length !== wantCrowd) {
                            throw new Error('Adding "' + shown + '" produced a crowd of ' + added.crowd +
                                ' (walk found ' + added.horseBlocks.length + '), expected ' + wantCrowd +
                                '. The save was not changed.');
                        }
                        const wantInterior = useInterior ? iv.count : 0;
                        if (added.interiorCount !== wantInterior) {
                            throw new Error('Adding "' + shown + '" produced ' + added.interiorCount +
                                ' interior items, expected ' + wantInterior + '. The save was not changed.');
                        }
                        if (!next.locationList.some((m) => m.index === index)) {
                            throw new Error('Adding "' + shown + '" did not produce a readable map marker. The save was not changed.');
                        }
                        if (next.locationSlotCount !== this.state.locationSlotCount) {
                            throw new Error('Adding "' + shown + '" changed the location slot count from ' +
                                this.state.locationSlotCount + ' to ' + next.locationSlotCount + '. The save was not changed.');
                        }
                        return {
                            nameOffset: added.nameOffset,
                            index,
                            label: shown,
                            crowd: wantCrowd,
                            crowdFromTemplate: fromTemplate,
                            crowdNames: template.crowdRecords.slice(0, fromTemplate).map((cr) => cr.name),
                            recordsAdded: addedRecords.length,
                            interiorCount: useInterior ? iv.count : 0,
                            interiorSkipped: !!iv && !useInterior,
                            staffedOnly: !template.unstaffed,
                            replaced: this.deletedLocations.has(index)
                        };
                    },
                    0
                );
            },
            locationDeletionScope(index) {
                if (!this.state.locationWalkOk) return null;
                const loc = this.state.locations.find((l) => l.index === index);
                if (!loc) return null;
                const marker = this.state.locationList.find((m) => m.index === index);
                if (!marker) return null;
                return {
                    index,
                    name: LocTemplates.label(index, loc.name) || loc.name,
                    storedName: loc.name,
                    stabled: loc.horseBlocks.length,
                    owner: loc.ownerGenome !== null,
                    champion: loc.championGenome !== null,
                    lostHorse: loc.lostHorse !== null,
                    bookies: loc.bookies.length,
                    interiorItems: loc.interiorCount,
                    bytes: (loc.tailEnd - loc.nameOffset) + (marker.end - marker.start)
                };
            },
            deleteLocation(index) {
                if (!this.state.locationWalkOk) {
                    throw new Error('This file\'s location block could not be walked structurally, ' +
                        'so locations cannot be deleted from it.');
                }
                const loc = this.state.locations.find((l) => l.index === index);
                if (!loc) throw new Error('deleteLocation: no location with index ' + index + '.');
                if (!this.state.locationList.some((m) => m.index === index)) {
                    throw new Error('deleteLocation: "' + loc.name + '" has no type-2 marker to remove.');
                }
                if (this.state.locationSlots[index] === undefined) {
                    throw new Error('deleteLocation: no present-flag slot for index ' + index + '.');
                }
                const already = this.deletedLocations.has(index);
                const next = !already;
                const apply = (on) => {
                    if (on) this.deletedLocations.add(index); else this.deletedLocations.delete(index);
                    this._touched();
                };
                apply(next);
                history.push({
                    label: (next ? 'Deleted ' : 'Restored ') + (loc.name || ('location ' + index)),
                    undo: () => apply(already), redo: () => apply(next)
                });
            },
            renameRecord(recordIndex, newName) {
                const rec = this.state.records[recordIndex];
                if (!rec) throw new Error('renameRecord: no record at index ' + recordIndex);
                const had = this.renamedRecords.has(recordIndex);
                const prev = had ? this.renamedRecords.get(recordIndex) : undefined;
                const apply = (name) => {
                    if (name === undefined || name === rec.name) this.renamedRecords.delete(recordIndex);
                    else this.renamedRecords.set(recordIndex, name);
                    this._touched();
                };
                apply(newName);
                history.push({
                    label: 'Renamed ' + (rec.name ? '\u201C' + rec.name + '\u201D' : 'a horse') + ' to \u201C' + newName + '\u201D',
                    undo: () => apply(prev), redo: () => apply(newName)
                });
            },
            setHorseItems(detailOff, items) {
                const had = this.changedHorseItems.has(detailOff);
                const prev = had ? this.changedHorseItems.get(detailOff) : null;
                const apply = (v) => { if (v) this.changedHorseItems.set(detailOff, v); else this.changedHorseItems.delete(detailOff); this._touched(); };
                apply(items.slice());
                history.push({
                    label: items.length ? ('Gave a horse ' + items.length + (items.length === 1 ? ' item' : ' items'))
                        : 'Took every item off a horse',
                    undo: () => apply(prev), redo: () => apply(items.slice())
                });
            },
            setTile(x, y, rec) {
                const prev = this.grid.get(x, y);
                const apply = (r, delta) => { this.grid.set(x, y, r); this.touchGrid(delta); this._touched(); };
                apply(rec, +1);
                history.push({
                    label: 'Painted tile ' + x + ', ' + y,
                    undo: () => apply(prev, -1), redo: () => apply(rec, +1)
                });
            },
            setBuriedItems(next, label) {
                const prev = this.buriedItems;
                const nextCopy = next.map((it) => ({ ...it }));
                const apply = (v, delta) => { this.buriedItems = v; this.touchBuried(delta); this._touched(); };
                apply(nextCopy, +1);
                history.push({
                    label: label || ('Changed the buried items (' + nextCopy.length + ' buried)'),
                    undo: () => apply(prev, -1), redo: () => apply(nextCopy, +1)
                });
                return this.buriedItems;
            },
            undo() { return history.undo(); },
            redo() { return history.redo(); },
            revertAll() {
                for (const k of INTENT_FIELDS) this[k].clear();
                const wasRebased = this._rebaseDepth > 0;
                this.state = this._originState;
                this._rebaseDepth = 0;
                this._addedHorseCount = 0;
                if (wasRebased) bus.emit('doc:rebased', doc);
                this.grid = this.state.grid.clone();
                this.buriedItems = this.state.buriedItems.map((it) => ({ ...it }));
                this._gridEditDepth = 0;
                this._buriedEditDepth = 0;
                history.clear();
                this._touched();
            },
            _touched() { bus.emit('doc:changed', doc); },
            _buildEdits() {
                const edits = {};
                if (this.patches.size) edits.patches = this.patches;
                if (this.movedWorldItems.size) edits.movedWorldItems = this.movedWorldItems;
                if (this.deletedWorldItems.size) edits.deletedWorldItems = this.deletedWorldItems;
                if (this.renamedRecords.size) edits.renamedRecords = this.renamedRecords;
                if (this.changedHorseItems.size) edits.changedHorseItems = this.changedHorseItems;
                if (this.locationEdits.size) edits.locations = [...this.locationEdits.values()];
                if (this.deletedStabledHorses.size) edits.deletedStabledHorses = this.deletedStabledHorses;
                if (this.deletedLocations.size) edits.deletedLocations = this.deletedLocations;
                if (this.deletedInteriorItems.size) edits.deletedInteriorItems = this.deletedInteriorItems;
                if (this.gridDirty) edits.grid = this.grid;
                if (this.buriedDirty) edits.buriedItems = this.buriedItems;
                return edits;
            },
            validate() {
                return SaveExport.validateForExport(this.state, this._buildEdits());
            },
            crowdShortfalls() {
                const out = [];
                for (const loc of this.state.locations) {
                    if (!loc || loc.index === null) continue;
                    if (this.deletedLocations.has(loc.index)) continue;
                    const tpl = (typeof LocTemplates !== 'undefined') ? LocTemplates.get(loc.index) : null;
                    const min = tpl ? tpl.minCrowd : 0;
                    if (!min) continue;
                    const now = (loc.horseBlocks || [])
                        .filter((b) => !this.deletedStabledHorses.has(b.genomeOff)).length;
                    if (now < min) {
                        out.push({ name: LocTemplates.label(loc.index, loc.name) || loc.name, now, min });
                    }
                }
                return out.sort((a, b) => (a.min - a.now) - (b.min - b.now)).reverse();
            },
            problems() {
                const out = [];
                const tileBad = SaveFile.findTileFamilyMismatches(this.grid, 4);
                if (tileBad.total) {
                    out.push({ severity: 'crash',
                        text: tileBad.total + (tileBad.total === 1 ? ' tile has' : ' tiles have') +
                            ' a family and id that disagree about growth, which the game cannot decode: ' +
                            tileBad.tiles.map((t) => '(' + t.x + ',' + t.y + ')').join(', ') +
                            (tileBad.total > tileBad.tiles.length ? ', …' : '') +
                            '. Repaint them, or this save will not load.' });
                }
                for (const e of this.validate().errors) {
                    if (e.startsWith('Illegal tiles (')) continue;
                    out.push({ severity: 'blocker', text: e });
                }
                for (const c of SaveFile.findBadCrowdOrdinals(this.state)) {
                    out.push({ severity: 'crash',
                        text: '\u201C' + c.name + '\u201D names horse ' + c.ordinal + ' of a crowd of ' +
                            c.crowd + '. The game crashes loading this. Add a horse to it and remove it again, ' +
                            'which is what rewrites the field.' });
                }
                for (const s of this.crowdShortfalls()) {
                    out.push({ severity: 'warn',
                        text: '\u201C' + s.name + '\u201D is down to ' + s.now + (s.now === 1 ? ' horse' : ' horses') +
                            '. The game never writes it below ' + s.min + '.' });
                }
                return out;
            },
            exportBytes() {
                return SaveExport.rebuild(this.state, this._buildEdits());
            }
        };
        return doc;
    }
    return { createSaveDoc };
});
