'use strict';
(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('./savefile.js'));
    } else {
        global.SaveExport = factory(global.SaveFile);
    }
})(typeof window !== 'undefined' ? window : globalThis, function (SaveFile) {
    const { u32, i32, f32, writeU32, writeF32, concatBytes, GENOME_LEN, CODESET } = SaveFile;
    const RECORD_COUNT_OFFSET = 0x10;
    function locateHorseItemList(bytes, view, detailOff) {
        const len = bytes.length;
        const voiceStrLen = u32(view, detailOff + 23, len);
        const itemCountOff = detailOff + 31 + voiceStrLen;
        const itemCount = u32(view, itemCountOff, len);
        const itemListStart = itemCountOff + 4;
        const itemListEnd = itemListStart + itemCount * 8;
        const xCountOff = itemListEnd;
        const xCount = u32(view, xCountOff, len);
        const recordEnd = xCountOff + 4 + xCount * 4;
        return { voiceStrLen, itemCountOff, itemCount, itemListStart, itemListEnd, xCountOff, xCount, recordEnd };
    }
    function encodeItemList(items) {
        const buf = new Uint8Array(4 + items.length * 8);
        const view = new DataView(buf.buffer);
        writeU32(view, 0, items.length);
        items.forEach((it, i) => {
            writeU32(view, 4 + i * 8, it.slot >>> 0);
            writeU32(view, 4 + i * 8 + 4, it.itemId >>> 0);
        });
        return buf;
    }
    function rebuild(state, edits) {
        edits = edits || {};
        const patches = edits.patches || new Map();
        const movedWorldItems = edits.movedWorldItems || new Map();
        const locations = edits.locations || null;
        const deletedWorldItems = edits.deletedWorldItems || new Set();
        const addedWorldItems = edits.addedWorldItems || [];
        const renamedRecords = edits.renamedRecords || new Map();
        const changedHorseItems = edits.changedHorseItems || new Map();
        const addedStabledHorses = edits.addedStabledHorses || [];
        const deletedStabledHorses = edits.deletedStabledHorses || new Set();
        const deletedLocations = edits.deletedLocations || new Set();
        const addedLocations = edits.addedLocations || [];
        const addedRecords = edits.addedRecords || [];
        const itemDnaEdits = edits.itemDnaEdits || [];
        const addedInteriorItems = edits.addedInteriorItems || [];
        const deletedInteriorItems = edits.deletedInteriorItems || new Set();
        const remapGrid = ('grid' in edits) || ('buriedItems' in edits);
        const locByName = new Map((state.locations || []).map((l) => [l.nameOffset, l]));
        const deletedLocRecords = [];
        const deletedMarkerStarts = new Set();
        if (deletedLocations.size) {
            if (!state.locationWalkOk) {
                throw new Error('Locations cannot be deleted from this file: its location block ' +
                    'could not be walked structurally, so the present-flag array was never located.');
            }
            for (const idx of deletedLocations) {
                const rec = (state.locations || []).find((l) => l.index === idx);
                if (!rec) throw new Error('deletedLocations: no location record with index ' + idx + '.');
                const marker = state.locationList.find((m) => m.index === idx);
                if (!marker) throw new Error('deletedLocations: location ' + idx + ' ("' + rec.name + '") has no type-2 marker.');
                const slot = state.locationSlots[idx];
                if (slot === undefined) throw new Error('deletedLocations: no present-flag slot for index ' + idx + '.');
                deletedLocRecords.push({ idx, rec, marker, slot });
                deletedMarkerStarts.add(marker.start);
            }
        }
        const inDeletedLocation = (off) =>
            deletedLocRecords.some((d) => off >= d.rec.nameOffset && off < d.rec.tailEnd);
        if (addedLocations.length) {
            if (!state.locationWalkOk) {
                throw new Error('Locations cannot be added to this file: its location block could ' +
                    'not be walked structurally, so the present-flag array was never located.');
            }
            const taken = new Set(state.locations
                .filter((l) => l.index !== null && !deletedLocations.has(l.index))
                .map((l) => l.index));
            const seen = new Set();
            for (const add of addedLocations) {
                if (state.locationSlots[add.index] === undefined) {
                    throw new Error('addedLocations: this file has no slot for location index ' + add.index +
                        ' (its array holds ' + state.locationSlotCount + ' slots, and its length must not change).');
                }
                if (taken.has(add.index)) {
                    throw new Error('addedLocations: location index ' + add.index + ' is already present. ' +
                        'The index array holds one slot per location, so there is nowhere to put a second.');
                }
                if (seen.has(add.index)) throw new Error('addedLocations: index ' + add.index + ' added twice.');
                seen.add(add.index);
            }
        }
        for (const add of addedStabledHorses) {
            if (!locByName.has(add.locationNameOffset)) {
                throw new Error('addedStabledHorses: no location record at offset ' + add.locationNameOffset + '.');
            }
            if (inDeletedLocation(add.locationNameOffset)) {
                throw new Error('addedStabledHorses: cannot add a horse to "' +
                    locByName.get(add.locationNameOffset).name + '" — that location is also being deleted.');
            }
        }
        const blockByGenomeOff = new Map();
        for (const loc of (state.locations || [])) {
            for (const blk of (loc.horseBlocks || [])) blockByGenomeOff.set(blk.genomeOff, { loc, blk });
        }
        const liveDeletedStabled = [];
        for (const g of deletedStabledHorses) {
            if (!blockByGenomeOff.has(g)) throw new Error('deletedStabledHorses: no stabled horse at offset ' + g + '.');
            if (!inDeletedLocation(g)) liveDeletedStabled.push(g);
        }
        if (deletedWorldItems.size) {
            const undeletable = state.items.filter((it) => deletedWorldItems.has(it.start) && (it.type === 1 || it.type === 2));
            if (undeletable.length) {
                throw new Error('Cannot delete world item type ' + undeletable[0].type +
                    ' (Truck or location) — only horses (0), ground items (3), and holes (4) may be removed.');
            }
        }
        if (addedWorldItems.length) {
            const boundaries = new Set(state.items.map((it) => it.start));
            boundaries.add(state.worldItemEndOffset);
            for (const add of addedWorldItems) {
                if (!boundaries.has(add.afterStart)) {
                    throw new Error('addedWorldItems: ' + add.afterStart + ' is not a world-item boundary.');
                }
                if (deletedWorldItems.has(add.afterStart)) {
                    throw new Error('addedWorldItems: cannot insert at ' + add.afterStart +
                        ' — that record is also being deleted. Insert at the end of the block instead.');
                }
            }
        }
        const working = state.bytes.slice();
        const view = new DataView(working.buffer, working.byteOffset, working.byteLength);
        for (const [off, val] of patches) working[off] = val & 0xFF;
        if (locations) {
            for (const loc of locations) {
                if (inDeletedLocation(loc.xoff)) continue;
                if (loc.xoff >= 0 && loc.xoff + 4 <= working.length) { writeF32(view, loc.xoff, loc.x); writeF32(view, loc.yoff, loc.y); }
                if (loc.xoff2 >= 0 && loc.xoff2 + 4 <= working.length) { writeF32(view, loc.xoff2, loc.x); writeF32(view, loc.yoff2, loc.y); }
            }
        }
        if (movedWorldItems.size) {
            const S = state.HDR - 41;
            for (const it of state.items) {
                const pos = movedWorldItems.get(it.start);
                if (!pos) continue;
                const xOff = it.type === 3 ? it.fields.xOff : it.start + 25 + S;
                const yOff = it.type === 3 ? it.fields.yOff : it.start + 29 + S;
                writeF32(view, xOff, pos.x);
                writeF32(view, yOff, pos.y);
            }
        }
        for (const d of deletedLocRecords) writeU32(view, d.slot, 0);
        for (const add of addedLocations) writeU32(view, state.locationSlots[add.index], 1);
        for (const e of itemDnaEdits) writeU32(view, e.start + SaveFile.ITEM_DNA_FLAG_OFF, e.on ? 1 : 0);
        if (addedInteriorItems.length || deletedInteriorItems.size) {
            const delta = new Map();
            for (const add of addedInteriorItems) {
                delta.set(add.locationNameOffset, (delta.get(add.locationNameOffset) || 0) + 1);
            }
            for (const start of deletedInteriorItems) {
                const host = (state.locations || []).find((l) =>
                    (l.interiorItems || []).some((ii) => ii.start === start));
                if (!host) throw new Error('deletedInteriorItems: no location holds an item at ' + start + '.');
                if (inDeletedLocation(start)) continue;
                delta.set(host.nameOffset, (delta.get(host.nameOffset) || 0) - 1);
            }
            for (const [nameOffset, d] of delta) {
                const loc = locByName.get(nameOffset);
                if (!loc) throw new Error('interior items: no location record at offset ' + nameOffset + '.');
                const next = loc.interiorCount + d;
                if (next < 0) throw new Error('Interior item count for "' + loc.name + '" would go negative.');
                writeU32(view, loc.interiorCountOffset, next);
            }
        }
        if (addedRecords.length) {
            writeU32(view, RECORD_COUNT_OFFSET, state.records.length + addedRecords.length);
        }
        if (deletedWorldItems.size || addedWorldItems.length || deletedMarkerStarts.size || addedLocations.length) {
            const finalCount = state.items.length - deletedWorldItems.size -
                deletedMarkerStarts.size + addedWorldItems.length + addedLocations.length;
            writeU32(view, state.worldItemCountOffset, finalCount);
        }
        if (addedStabledHorses.length || liveDeletedStabled.length) {
            const delta = new Map();
            for (const add of addedStabledHorses) delta.set(add.locationNameOffset, (delta.get(add.locationNameOffset) || 0) + 1);
            for (const g of liveDeletedStabled) {
                const { loc } = blockByGenomeOff.get(g);
                delta.set(loc.nameOffset, (delta.get(loc.nameOffset) || 0) - 1);
            }
            for (const [nameOffset, d] of delta) {
                const loc = locByName.get(nameOffset);
                const next = loc.crowd + d;
                if (next < 0) throw new Error('Crowd count for "' + loc.name + '" would go negative.');
                writeU32(view, loc.crowdOffset, next);
                const ordinal = loc.sentinel >>> 0;
                if (ordinal !== SaveFile.CROWD_ORDINAL_NONE) {
                    const deletedSlots = liveDeletedStabled
                        .filter(g => { const { loc: dl } = blockByGenomeOff.get(g); return dl.nameOffset === nameOffset; })
                        .map(g => { const h = state.horses.find(h => h.genomeOff === g); return h ? h.crowdSlot : -1; })
                        .filter(s => s >= 0);
                    const ownDeleted = deletedSlots.includes(ordinal);
                    if (ownDeleted || ordinal >= next) {
                        writeU32(view, loc.crowdEnd, SaveFile.CROWD_ORDINAL_NONE);
                    } else {
                        const shift = deletedSlots.filter(s => s < ordinal).length;
                        if (shift > 0) writeU32(view, loc.crowdEnd, ordinal - shift);
                    }
                }
            }
        }
        const grid = remapGrid ? (edits.grid || state.grid) : state.grid;
        if (remapGrid && (grid.width !== state.width || grid.height !== state.height)) {
            writeU32(view, state.block.blockOffset, grid.width);
            writeU32(view, state.block.blockOffset + 4, grid.height);
        }
        const splices = [];
        for (const [detailOff, items] of changedHorseItems) {
            const owner = state.items.find((it) => it.detailOff === detailOff);
            if (owner && deletedWorldItems.has(owner.start)) continue;
            if (inDeletedLocation(detailOff)) continue;
            if (deletedStabledHorses.has(detailOff - GENOME_LEN - SaveFile.DETAIL_GAP)) continue;
            const loc = locateHorseItemList(working, view, detailOff);
            splices.push({ offset: loc.itemCountOff, oldLength: loc.itemListEnd - loc.itemCountOff, newBytes: encodeItemList(items) });
        }
        if (addedWorldItems.length || addedLocations.length) {
            const byOffset = new Map();
            const push = (offset, bytes) => {
                if (!byOffset.has(offset)) byOffset.set(offset, []);
                byOffset.get(offset).push(bytes);
            };
            for (const add of addedWorldItems) push(add.afterStart, add.bytes);
            for (const add of addedLocations) push(state.worldItemEndOffset, add.markerBytes);
            for (const [offset, chunks] of byOffset) {
                splices.push({ offset, oldLength: 0, newBytes: concatBytes(chunks), insert: true });
            }
        }
        for (const add of addedLocations) {
            splices.push({
                offset: state.locationSlots[add.index] + 4,
                oldLength: 0, newBytes: add.recordBytes, insert: true
            });
        }
        for (const start of deletedWorldItems) {
            const it = state.items.find((x) => x.start === start);
            if (!it) throw new Error('deletedWorldItems: no item at offset ' + start);
            splices.push({ offset: it.start, oldLength: it.end - it.start, newBytes: new Uint8Array(0) });
        }
        if (addedStabledHorses.length) {
            const byOffset = new Map();
            for (const add of addedStabledHorses) {
                const loc = locByName.get(add.locationNameOffset);
                if (!byOffset.has(loc.crowdEnd)) byOffset.set(loc.crowdEnd, []);
                byOffset.get(loc.crowdEnd).push(add.bytes);
            }
            for (const [offset, chunks] of byOffset) {
                splices.push({ offset, oldLength: 0, newBytes: concatBytes(chunks), insert: true });
            }
        }
        for (const g of liveDeletedStabled) {
            const { blk } = blockByGenomeOff.get(g);
            splices.push({ offset: blk.genomeOff, oldLength: blk.length, newBytes: new Uint8Array(0) });
        }
        for (const d of deletedLocRecords) {
            splices.push({ offset: d.marker.start, oldLength: d.marker.end - d.marker.start, newBytes: new Uint8Array(0) });
            splices.push({ offset: d.rec.nameOffset, oldLength: d.rec.tailEnd - d.rec.nameOffset, newBytes: new Uint8Array(0) });
        }
        for (const e of itemDnaEdits) {
            if (inDeletedLocation(e.start) || deletedWorldItems.has(e.start) || deletedInteriorItems.has(e.start)) continue;
            const at = e.start + SaveFile.ITEM_GENOME_OFF;
            if (e.on) splices.push({ offset: at, oldLength: 0, newBytes: e.genome, insert: true });
            else splices.push({ offset: at, oldLength: GENOME_LEN, newBytes: new Uint8Array(0) });
        }
        if (addedInteriorItems.length) {
            const byOffset = new Map();
            for (const add of addedInteriorItems) {
                const loc = locByName.get(add.locationNameOffset);
                if (!loc) throw new Error('addedInteriorItems: no location record at offset ' + add.locationNameOffset + '.');
                if (inDeletedLocation(add.locationNameOffset)) {
                    throw new Error('addedInteriorItems: cannot add to "' + loc.name + '" — it is queued for deletion.');
                }
                if (!byOffset.has(loc.xoff)) byOffset.set(loc.xoff, []);
                byOffset.get(loc.xoff).push(add.bytes);
            }
            for (const [offset, chunks] of byOffset) {
                splices.push({ offset, oldLength: 0, newBytes: concatBytes(chunks), insert: true });
            }
        }
        for (const start of deletedInteriorItems) {
            if (inDeletedLocation(start)) continue;
            let span = null;
            for (const loc of (state.locations || [])) {
                const ii = (loc.interiorItems || []).find((x) => x.start === start);
                if (ii) { span = ii; break; }
            }
            if (!span) throw new Error('deletedInteriorItems: no interior item at offset ' + start + '.');
            splices.push({ offset: span.start, oldLength: span.length, newBytes: new Uint8Array(0) });
        }
        if (addedRecords.length) {
            splices.push({
                offset: state.tableEnd, oldLength: 0, insert: true,
                newBytes: concatBytes(addedRecords.map((r) => r.bytes))
            });
        }
        for (const [recordIndex, newName] of renamedRecords) {
            const rec = state.records[recordIndex];
            if (!rec) throw new Error('renamedRecords: no record at index ' + recordIndex);
            const nameBytes = new TextEncoder().encode(newName);
            const nb = new Uint8Array(4 + nameBytes.length);
            new DataView(nb.buffer).setUint32(0, nameBytes.length, true);
            nb.set(nameBytes, 4);
            splices.push({ offset: rec.nameOffset, oldLength: (rec.fixedOffset - rec.nameOffset), newBytes: nb });
        }
        if (remapGrid) {
            const buriedItems = edits.buriedItems || state.buriedItems;
            const encodedMap = SaveFile.encodeMap(grid);
            const encodedBuried = SaveFile.encodeBuried(buriedItems, grid.width);
            splices.push({
                offset: state.mapStart, oldLength: state.buriedEnd - state.mapStart,
                newBytes: concatBytes([encodedMap, encodedBuried])
            });
        }
        splices.sort((a, b) => (a.offset - b.offset) || (a.oldLength - b.oldLength));
        for (let i = 1; i < splices.length; i++) {
            const prev = splices[i - 1], cur = splices[i];
            if (cur.offset < prev.offset + prev.oldLength) {
                throw new Error('Overlapping export splices at offset ' + cur.offset + ' (previous ends at ' + (prev.offset + prev.oldLength) + ')');
            }
        }
        let out = working;
        for (let i = splices.length - 1; i >= 0; i--) {
            const sp = splices[i];
            out = concatBytes([out.slice(0, sp.offset), sp.newBytes, out.slice(sp.offset + sp.oldLength)]);
        }
        return out;
    }
    function validateForExport(state, edits) {
        edits = edits || {};
        const errors = [];
        const grid = edits.grid || state.grid;
        if (!(grid.width > 0 && grid.width < 5000 && grid.height > 0 && grid.height < 5000)) {
            errors.push('Map dimensions out of range: ' + grid.width + 'x' + grid.height);
        }
        if (edits.grid) {
            const tileBad = SaveFile.findTileFamilyMismatches(grid, 8);
            if (tileBad.total) {
                errors.push('Illegal tiles (' + tileBad.total + '): family and id disagree about ' +
                    'growth, which the game cannot decode — ' +
                    tileBad.tiles.map((t) => '(' + t.x + ',' + t.y + ') fam ' + t.fam + ' / id ' + t.id).join(', ') +
                    (tileBad.total > tileBad.tiles.length ? ', …' : '') + '.');
            }
        }
        if (!edits.locations) {
        } else if (state.locationCountMismatch) {
            const namedMarkerCount = state.locationMarkers.filter((l) => l.value !== 'vial world' && l.value !== 'Truck').length;
            errors.push(
                'Location count mismatch: the name heuristic found ' + namedMarkerCount +
                ' named locations but the world-item walk found ' + state.locationList.length +
                ' type-2 entries. Location edits cannot be safely written back for this file.'
            );
        } else {
            const mismatched = [];
            for (const loc of state.locationMarkers) {
                if (loc.xoff2 < 0) continue;
                const x2 = f32(state.view, loc.xoff2, state.bytes.length);
                const y2 = f32(state.view, loc.yoff2, state.bytes.length);
                if (x2 !== loc.x || y2 !== loc.y) mismatched.push(loc.value);
            }
            if (mismatched.length) {
                errors.push('Location coordinate pairing looks unreliable for: ' + mismatched.join(', ') +
                    ' (their two stored coordinate copies disagree). Do not write location edits back for this file.');
            }
        }
        const buriedItems = edits.buriedItems || state.buriedItems;
        for (const it of buriedItems) {
            if (it.itemIndex < 0 || it.itemIndex > 48) errors.push('Buried item index out of range: ' + it.itemIndex);
        }
        if (edits.patches) {
            for (const off of edits.patches.keys()) {
                for (const h of state.horses) {
                    if (off >= h.genomeOff && off < h.genomeOff + GENOME_LEN) {
                        const val = edits.patches.get(off);
                        if (!CODESET.has(val)) errors.push('Genome byte at offset ' + off + ' (' + val + ') is not a legal codeSet value.');
                        break;
                    }
                }
            }
        }
        if (edits.addedWorldItems) {
            const maxX = grid.width * 32, maxY = (grid.height + 1) * 32;
            const S = state.HDR - 41;
            edits.addedWorldItems.forEach((add, n) => {
                const view2 = new DataView(add.bytes.buffer, add.bytes.byteOffset, add.bytes.byteLength);
                const type = u32(view2, 0, add.bytes.length);
                if (type === 3) {
                    const label = 'Placed item ' + (n + 1);
                    let measured;
                    try {
                        measured = SaveFile.measureItemRecord(add.bytes, state.HDR);
                    } catch (e) { errors.push(label + ': ' + e.message); return; }
                    if (measured !== add.bytes.length) {
                        errors.push(label + ': record length fields say ' + measured + ' bytes but the buffer is ' + add.bytes.length + '.');
                    }
                    const hasDna = u32(view2, SaveFile.ITEM_DNA_FLAG_OFF, add.bytes.length) > 0;
                    const off = SaveFile.itemFieldOffsets(0, hasDna, state.HDR);
                    const x = f32(view2, off.xOff, add.bytes.length), y = f32(view2, off.yOff, add.bytes.length);
                    if (!(x >= 0 && x <= maxX)) errors.push(label + ': x = ' + x + ' is outside the map (0…' + maxX + ').');
                    if (!(y >= 0 && y <= maxY)) errors.push(label + ': y = ' + y + ' is outside the map (0…' + maxY + ').');
                    return;
                }
                const label = 'Added horse ' + (n + 1);
                let measured;
                try {
                    measured = SaveFile.measureHorseRecord(add.bytes, state.HDR);
                } catch (e) {
                    errors.push(label + ': ' + e.message);
                    return;
                }
                if (measured !== add.bytes.length) {
                    errors.push(label + ': record length fields say ' + measured + ' bytes but the buffer is ' + add.bytes.length + '.');
                }
                for (let k = 0; k < GENOME_LEN; k++) {
                    if (!CODESET.has(add.bytes[state.HDR + k])) {
                        errors.push(label + ': genome byte ' + k + ' (' + add.bytes[state.HDR + k] + ') is not a legal codeSet value.');
                        break;
                    }
                }
                const x = f32(view2, 25 + S, add.bytes.length), y = f32(view2, 29 + S, add.bytes.length);
                if (!(x >= 0 && x <= maxX)) errors.push(label + ': x = ' + x + ' is outside the map (0…' + maxX + ').');
                if (!(y >= 32 && y <= maxY)) errors.push(label + ': y = ' + y + ' is outside the map (32…' + maxY + ').');
            });
        }
        if (edits.addedStabledHorses) {
            edits.addedStabledHorses.forEach((add, n) => {
                const loc = (state.locations || []).find((l) => l.nameOffset === add.locationNameOffset);
                const label = 'Added stabled horse ' + (n + 1) + (loc ? ' at "' + loc.name + '"' : '');
                if (!loc) {
                    errors.push(label + ': no location record at offset ' + add.locationNameOffset + '.');
                    return;
                }
                if (loc.index === null && !state.locationWalkOk) {
                    errors.push(label + ': this file\'s location block could not be walked structurally, ' +
                        'so its crowd counts cannot be written back safely.');
                }
                let measured;
                try {
                    measured = SaveFile.measureStabledHorseRecord(add.bytes);
                } catch (e) {
                    errors.push(label + ': ' + e.message);
                    return;
                }
                if (measured !== add.bytes.length) {
                    errors.push(label + ': block length fields say ' + measured + ' bytes but the buffer is ' + add.bytes.length + '.');
                }
                for (let k = 0; k < GENOME_LEN; k++) {
                    if (!CODESET.has(add.bytes[k])) {
                        errors.push(label + ': genome byte ' + k + ' (' + add.bytes[k] + ') is not a legal codeSet value.');
                        break;
                    }
                }
            });
        }
        if (edits.deletedStabledHorses) {
            const known = new Set();
            for (const loc of (state.locations || [])) for (const blk of (loc.horseBlocks || [])) known.add(blk.genomeOff);
            for (const g of edits.deletedStabledHorses) {
                if (!known.has(g)) errors.push('Deleted stabled horse: no crowd member at offset ' + g + '.');
            }
        }
        if (edits.addedLocations) {
            const grid2 = grid;
            for (const add of edits.addedLocations) {
                const label = 'Added location ' + add.index;
                if (!state.locationWalkOk) {
                    errors.push(label + ': this file\'s location block could not be walked structurally.');
                    continue;
                }
                if (state.locationSlots[add.index] === undefined) {
                    errors.push(label + ': this file has no slot for that index — its array holds ' +
                        state.locationSlotCount + ' slots, and its length must not change.');
                }
                const queuedForDeletion = !!(edits.deletedLocations && edits.deletedLocations.has(add.index));
                if (state.locations.some((l) => l.index === add.index) && !queuedForDeletion) {
                    errors.push(label + ': already present. One slot per location means there is nowhere to put a second.');
                }
                let measured;
                try {
                    measured = SaveFile.measureLocationRecord(add.recordBytes, state.HDR, add.index);
                } catch (e) {
                    errors.push(label + ': ' + e.message);
                    continue;
                }
                if (measured !== add.recordBytes.length) {
                    errors.push(label + ': record length fields say ' + measured + ' bytes but the buffer is ' + add.recordBytes.length + '.');
                }
                const mv = new DataView(add.markerBytes.buffer, add.markerBytes.byteOffset, add.markerBytes.byteLength);
                if (add.markerBytes.length !== state.HDR) {
                    errors.push(label + ': marker is ' + add.markerBytes.length + ' bytes, expected ' + state.HDR + '.');
                    continue;
                }
                if (u32(mv, 0, add.markerBytes.length) !== 2) errors.push(label + ': marker is not a type-2 world item.');
                if (add.markerBytes[5] !== add.index) errors.push(label + ': marker index byte is ' + add.markerBytes[5] + ', expected ' + add.index + '.');
                const S = state.HDR - 41;
                const mx = f32(mv, 25 + S, add.markerBytes.length), my = f32(mv, 29 + S, add.markerBytes.length);
                if (!(mx >= 0 && mx <= grid2.width * 32)) errors.push(label + ': x = ' + mx + ' is outside the map (0…' + (grid2.width * 32) + ').');
                if (!(my >= 0 && my <= grid2.height * 32)) errors.push(label + ': y = ' + my + ' is outside the map (0…' + (grid2.height * 32) + ').');
                const rv = new DataView(add.recordBytes.buffer, add.recordBytes.byteOffset, add.recordBytes.byteLength);
                const parsed = SaveFile.parseLocationRecord(add.recordBytes, rv, 0, state.HDR, add.index);
                if (parsed.x !== mx || parsed.y !== my) {
                    errors.push(label + ': the record says (' + parsed.x + ', ' + parsed.y + ') but the marker says (' + mx + ', ' + my + ').');
                }
                if (add.attestedForms && add.attestedForms.length) {
                    const got = {
                        ownerFlag: parsed.ownerFlag >>> 0,
                        tailLength: parsed.tailEnd - parsed.tailStart,
                        ownerState: parsed.sentinel >>> 0
                    };
                    const ok = add.attestedForms.some((f) =>
                        (f.ownerFlag >>> 0) === got.ownerFlag &&
                        f.tailLength === got.tailLength &&
                        (f.ownerState >>> 0) === got.ownerState);
                    if (!ok) {
                        errors.push(label + ': the record form (ownerFlag ' + got.ownerFlag +
                            ', tail ' + got.tailLength + ', ownerState 0x' +
                            got.ownerState.toString(16).padStart(8, '0') +
                            ') is not one the game is observed to write for this location. ' +
                            'Attested: ' + add.attestedForms.map((f) => 'ownerFlag ' + f.ownerFlag +
                                '/tail ' + f.tailLength + '/state 0x' + (f.ownerState >>> 0).toString(16).padStart(8, '0')
                            ).join('; ') + '. The template pack is probably stale — re-run ' +
                            'tools/dev/harvest_templates.py.');
                    }
                }
            }
        }
        if (edits.deletedLocations && edits.deletedLocations.size) {
            if (!state.locationWalkOk) {
                errors.push('Locations cannot be deleted from this file: its location block could not ' +
                    'be walked structurally, so the present-flag array was never located.');
            } else {
                for (const idx of edits.deletedLocations) {
                    const loc = (state.locations || []).find((l) => l.index === idx);
                    if (!loc) { errors.push('Deleted location ' + idx + ': no record with that index.'); continue; }
                    if (loc.name === 'unknown') {
                        errors.push('The "unknown" record (the vial world\'s interior) sits outside the index ' +
                            'array and cannot be deleted.');
                    }
                    if (!state.locationList.some((m) => m.index === idx)) {
                        errors.push('Deleted location "' + loc.name + '": no type-2 marker to remove alongside the record.');
                    }
                    if (state.locationSlots[idx] === undefined) {
                        errors.push('Deleted location "' + loc.name + '": no present-flag slot at index ' + idx + '.');
                    }
                }
            }
        }
        if (edits.addedRecords && edits.addedRecords.length) {
            edits.addedRecords.forEach((add, n) => {
                const label = 'Added record ' + (state.records.length + n);
                if (!(add.bytes instanceof Uint8Array) || !add.bytes.length) {
                    errors.push(label + ': no bytes.');
                    return;
                }
                let measured;
                try {
                    measured = SaveFile.measureRecordEntry(add.bytes);
                } catch (e) {
                    errors.push(label + ': ' + e.message);
                    return;
                }
                if (measured !== add.bytes.length) {
                    errors.push(label + ': length fields say ' + measured +
                        ' bytes but the buffer is ' + add.bytes.length + '.');
                }
            });
            const finalCount = state.records.length + edits.addedRecords.length;
            const checkBlock = (bytes, off, what) => {
                if (off + 4 > bytes.length) return;
                const bv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
                const ri = i32(bv, off, bytes.length);
                if (ri >= finalCount) {
                    errors.push(what + ': recordIndex ' + ri + ' is past the end of the record ' +
                        'table, which will hold ' + finalCount + ' entries.');
                }
            };
            (edits.addedStabledHorses || []).forEach((add, n) => {
                checkBlock(add.bytes, GENOME_LEN + SaveFile.DETAIL_GAP, 'Added stabled horse ' + (n + 1));
            });
            (edits.addedWorldItems || []).forEach((add, n) => {
                checkBlock(add.bytes, state.HDR + GENOME_LEN + SaveFile.DETAIL_GAP, 'Added world item ' + (n + 1));
            });
        }
        if (edits.renamedRecords) {
            for (const [idx, name] of edits.renamedRecords) {
                const reencoded = new TextDecoder('utf-8').decode(new TextEncoder().encode(name));
                if (reencoded !== name) errors.push('Record ' + idx + ': name "' + name + '" does not round-trip through UTF-8.');
            }
        }
        try {
            rebuild(state, { ...edits, __validateOnly: true });
        } catch (e) {
            errors.push('rebuild() would throw: ' + e.message);
        }
        return { ok: errors.length === 0, errors };
    }
    return { rebuild, validateForExport, locateHorseItemList, encodeItemList };
});
