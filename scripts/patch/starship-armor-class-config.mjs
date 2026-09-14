import { getModuleId } from "../module-support.mjs";
import { isSw5eStarshipActor } from "./starship-movement.mjs";

/** AC calcs kept on starship Armor Class config (homebrew Flat/Custom/Equipped still allowed). */
const STARSHIP_AC_CALC_VALUES = new Set(["flat", "natural", "default", "starship", "custom"]);

/**
 * Rebuild calculation option list with stock rule separators (after natural, before custom).
 * @param {Array<{value?: string, label?: string, rule?: boolean}>} entries
 * @returns {Array<{value?: string, label?: string, rule?: boolean}>}
 */
function withArmorClassCalcRules(entries) {
	const out = [];
	for ( const entry of entries ) {
		if ( !entry || entry.rule ) continue;
		if ( entry.value === "custom" ) out.push({ rule: true });
		out.push(entry);
		if ( entry.value === "natural" ) out.push({ rule: true });
	}
	return out;
}

/**
 * @param {Array<{value?: string, label?: string, rule?: boolean}>} options
 * @param {boolean} isStarship
 * @returns {Array<{value?: string, label?: string, rule?: boolean}>}
 */
export function filterArmorClassCalculationOptions(options, isStarship) {
	if ( !Array.isArray(options) ) return options;
	const kept = [];
	for ( const entry of options ) {
		if ( !entry || entry.rule ) continue;
		if ( isStarship ) {
			if ( !STARSHIP_AC_CALC_VALUES.has(entry.value) ) continue;
		} else if ( entry.value === "starship" ) {
			continue;
		}
		kept.push(entry);
	}
	return withArmorClassCalcRules(kept);
}

/**
 * Filter ArmorClassConfig calculation dropdown for starship vs non-starship actors.
 */
export function patchStarshipArmorClassConfig() {
	const target = "dnd5e.applications.actor.ArmorClassConfig.prototype._preparePartContext";
	try {
		libWrapper.register(getModuleId(), target, async function(wrapped, partId, context, options) {
			context = await wrapped(partId, context, options);
			if ( !Array.isArray(context?.formulaOptions) ) return context;
			const isStarship = isSw5eStarshipActor(this.document);
			context.formulaOptions = filterArmorClassCalculationOptions(
				context.formulaOptions,
				isStarship
			);
			return context;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap ArmorClassConfig._preparePartContext.", err);
	}
}
