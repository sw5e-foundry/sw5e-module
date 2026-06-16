#!/usr/bin/env node
/**
 * Offline tests for chassis modification candidate filtering and inference eligibility.
 */
import {
	CHASSIS_MOD_SOURCE_PACK_NAMES,
	ENHANCEDITEMS_ITEM_MODIFICATIONS_FOLDER_ID,
	chassisModInferenceAllowed,
	isChassisModCompendiumIndexEntry,
	isEnhancedItemsModificationItemLike,
	resolveChassisModMetaForInstall
} from "../scripts/chassis.mjs";

function assert(cond, msg) {
	if ( !cond ) throw new Error(msg);
}

const channelingAmplifierLike = {
	name: "Channeling Amplifier (Dueling)",
	type: "loot",
	folder: ENHANCEDITEMS_ITEM_MODIFICATIONS_FOLDER_ID,
	flags: {
		"sw5e-importer": {
			uid: "EnhancedItem.name-channeling_amplifier_dueling.subtype-focus_generator"
		}
	},
	system: {
		source: { custom: "Modification" },
		type: { value: "focusgenerator" },
		description: {
			value: "<h4>Item Modification (Focus Generator)</h4><p>While using this item as your focus...</p>"
		},
		rarity: "prototype"
	}
};

const wristpadLike = {
	name: "Some Wristpad",
	type: "equipment",
	folder: "other-folder-id",
	system: {
		source: { custom: "Enhanced Item" },
		description: { value: "<p>A wristpad focus item.</p>" }
	}
};

const mockEnhancedPack = { metadata: { name: "enhanceditems", id: "sw5e-module.enhanceditems" } };
const mockModsPack = { metadata: { name: "modifications", id: "sw5e-module.modifications" } };

assert(CHASSIS_MOD_SOURCE_PACK_NAMES.includes("enhanceditems"), "enhanceditems pack should be a mod source");
assert(isEnhancedItemsModificationItemLike(channelingAmplifierLike), "channeling amplifier should match modification heuristics");
assert(!isEnhancedItemsModificationItemLike(wristpadLike), "non-mod enhanced item should not match");

assert(
	isChassisModCompendiumIndexEntry(channelingAmplifierLike, mockEnhancedPack),
	"channeling amplifier index row should be listed"
);
assert(
	!isChassisModCompendiumIndexEntry(wristpadLike, mockEnhancedPack),
	"wristpad index row should be excluded from enhanceditems browser"
);
assert(
	isChassisModCompendiumIndexEntry({ name: "Legacy Mod" }, mockModsPack),
	"legacy modifications pack rows should all be listed"
);

assert(
	chassisModInferenceAllowed(channelingAmplifierLike),
	"inference should be allowed for modification-shaped items"
);
assert(
	!chassisModInferenceAllowed({ flags: { sw5e: { chassisMod: { slotCost: 1 } } } }),
	"native chassisMod should not use inference path"
);

const meta = resolveChassisModMetaForInstall(channelingAmplifierLike, { allowModificationsPackInference: true });
assert(meta, "channeling amplifier should resolve inferred chassis metadata");
assert(meta.compatibleChassisTypes?.includes("equipment"), "focus generator mod should map to equipment chassis");
assert(meta.inferenceConfidence === "inferred-strong", "subtype mapping should be strong inference");

console.log("test-chassis-install-candidates: all tests passed");
