(function (global, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        global.Items = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    const ENUM_NAMES = [
        "ItemHay", "ItemBale", "ItemApple", "ItemBeer", "ItemHotsauce",
        "ItemPlutonium", "ItemBones", "ItemCarcass", "ItemDung", "ItemTrophy",
        "ItemChampTrophy", "ItemVipCard", "ItemVial", "ItemDiskette", "ItemBriefcase",
        "ItemChest", "ItemCactus", "ItemVase", "ItemTM", "ItemG",
        "ItemA", "ItemT", "ItemC", "ItemStripe", "ItemLift",
        "ItemRambar", "ItemSneakers", "ItemBowTie", "ItemCravat", "ItemTopHat",
        "ItemToque", "ItemGlasses", "ItemSunglasses", "ItemBallAndChain", "ItemJetEngine",
        "ItemBalloon", "ItemRollerblades", "ItemStilts", "ItemClownNose", "ItemCowboyBoots1",
        "ItemCowboyBoots2", "ItemCowboyBoots3", "ItemCowboyBoots4", "ItemRibbon1", "ItemRibbon2",
        "ItemRibbon3", "ItemRibbon4", "ItemFenceBox", "ItemMemory", "ItemCrown",
        "ItemMeat", "ItemPlutonium2", "LetterG", "LetterA", "LetterT",
        "LetterC", "DecoToque", "DecoSpikedBall", "DecoSunglasses", "DecoSneakers",
        "DecoSneakers2", "DecoJetEngine", "DecoJetEngineV", "DecoRollerblades", "DecoGlasses",
        "BriefcaseOpen", "ChestOpen", "VialBubble", "VialBubble2", "VialBubble3",
        "VialEmpty", "InvTab", "InvTab2", "InvTab3", "InvTab4",
        "InvTrumpet", "InvLasso", "InvShovel", "InvGun", "InvFence",
        "InvBalloon", "InvSTrumpet", "InvSLasso", "InvSShovel", "InvSGun",
        "InvSFence", "InvSBalloon", "TinyGoldenShovel", "PowStripe", "PowLift",
        "PowRambar", "PowStopwatch", "DisStripe", "DisLift", "DisRambar",
        "DisStopwatch"
    ];
    const EQUIP_INFO = {
        26: { displayName: "Sneakers", equipSlot: 5 },
        27: { displayName: "Bow Tie", equipSlot: 4 },
        28: { displayName: "Neck Tie", equipSlot: 4 },
        29: { displayName: "Top Hat", equipSlot: 7 },
        30: { displayName: "Beanie", equipSlot: 7 },
        31: { displayName: "Glasses", equipSlot: 9 },
        32: { displayName: "Sunglasses", equipSlot: 9 },
        33: { displayName: "Ball And Chain", equipSlot: 1 },
        34: { displayName: "Rocket", equipSlot: 3 },
        35: { displayName: "Balloon", equipSlot: 0 },
        36: { displayName: "Rollerblades", equipSlot: 5 },
        37: { displayName: "Stilts", equipSlot: 5 },
        38: { displayName: "Clown Nose", equipSlot: 12 },
        39: { displayName: "Cowboy Boots (beige)", equipSlot: 5 },
        40: { displayName: "Cowboy Boots (tan)", equipSlot: 5 },
        41: { displayName: "Great Cowboy Boots (purple)", equipSlot: 5 },
        42: { displayName: "Great Cowboy Boots (black)", equipSlot: 5 },
        43: { displayName: "Ribbon (pink)", equipSlot: 17 },
        44: { displayName: "Ribbon (yellow)", equipSlot: 18 },
        45: { displayName: "Ribbon (orange)", equipSlot: 19 },
        46: { displayName: "Ribbon (green)", equipSlot: 20 }
    };
    const BURIED_ITEM_MAX_INDEX = 48;
    const DISPLAY_OVERRIDES = {
        18: 'Treasure Map'
    };
    const ITEM_LIST = ENUM_NAMES.map((name, id) => {
        const eq = EQUIP_INFO[id];
        return {
            id, name,
            displayName: eq ? eq.displayName : (DISPLAY_OVERRIDES[id] || name.replace(/^Item/, '')),
            equipSlot: eq ? eq.equipSlot : null
        };
    });
    function groupBySlot() {
        const bySlot = new Map();
        for (const it of ITEM_LIST) {
            if (it.equipSlot === null) continue;
            if (!bySlot.has(it.equipSlot)) bySlot.set(it.equipSlot, []);
            bySlot.get(it.equipSlot).push(it);
        }
        return bySlot;
    }
    return { ITEM_LIST, BURIED_ITEM_MAX_INDEX, DISPLAY_OVERRIDES, groupBySlot };
});
