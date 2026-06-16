import { getModuleId } from "../module-support.mjs";

const EQUIPPABLE_ITEM_MODELS = [
	"EquipmentData",
	"WeaponData",
	"ConsumableData",
	"ContainerData"
];

/**
 * dnd5e v5.2 clears `system.attunement` and hides the Details-tab control unless the item has the `mgc`
 * property. Many SW5E compendium items declare `attunement: required` without `mgc` in `properties`.
 *
 * @param {object} item
 * @returns {boolean}
 */
function shouldTreatDeclaredAttunementAsMagical(item) {
	const declared = item?._source?.attunement ?? item?.attunement;
	if ( declared !== "required" && declared !== "optional" ) return false;
	if ( !item?.validProperties?.has?.("mgc") ) return false;
	return !item.properties?.has?.("mgc");
}

/**
 * Ensure declared attunement survives dnd5e equippable preparation and unlocks stock attunement UI.
 */
export function patchEquippableAttunement() {
	for ( const modelName of EQUIPPABLE_ITEM_MODELS ) {
		const proto = globalThis.dnd5e?.dataModels?.item?.[modelName]?.prototype;
		if ( !proto?.prepareFinalEquippableData ) continue;

		const target = `dnd5e.dataModels.item.${modelName}.prototype.prepareFinalEquippableData`;
		try {
			libWrapper.register(getModuleId(), target, function (wrapped, ...args) {
				if ( shouldTreatDeclaredAttunementAsMagical(this) ) this.properties.add("mgc");
				return wrapped.call(this, ...args);
			}, "WRAPPER");
		} catch ( err ) {
			console.warn("SW5E | Skipping equippable attunement wrapper", target, err);
		}
	}
}
