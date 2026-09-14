import { getModuleId, HOOKS_NAMESPACE } from "../module-support.mjs";
import {
	applyStarshipTravelFromUnslowedCombatBase,
	getDerivedStarshipRuntime,
	getLegacyStarshipActorSystem,
	getStarshipEffectiveTier,
	isStarshipFlagVehicle,
	mergeVehicleAbilityValues
} from "../starship-data.mjs";

function getActorSource(model) {
	const candidates = [
		model?.parent,
		model?.parent?.document,
		model?.parent?.parent,
		model?.parent?.parent?.document
	];

	for ( const candidate of candidates ) {
		if ( candidate?._source ) return candidate._source;
	}

	return null;
}

/** Live Actor document from a dnd5e data model (needed for ActiveEffect reads during prepare). */
function getLiveActorFromModel(model) {
	const candidates = [
		model?.parent,
		model?.parent?.document,
		model?.parent?.parent,
		model?.parent?.parent?.document
	];

	for ( const candidate of candidates ) {
		if ( candidate?.documentName === "Actor" && candidate?.effects ) return candidate;
	}

	return null;
}

/**
 * Ensure rollData.details exists without replacing an existing details object, then set details.tier.
 * @param {object} rollData
 * @param {number} tier
 */
function injectStarshipDetailsTier(rollData, tier) {
	if ( !rollData || (typeof rollData !== "object") ) return rollData;
	if ( rollData.details == null || typeof rollData.details !== "object" || Array.isArray(rollData.details) ) {
		rollData.details = {};
	}
	rollData.details.tier = tier;
	return rollData;
}

export function patchStarshipPrepare() {
	try {
		libWrapper.register(getModuleId(), "dnd5e.documents.Actor5e.prototype.getRollData", function(wrapped, ...args) {
			const rollData = wrapped(...args);
			if ( !isStarshipFlagVehicle(this) ) return rollData;
			return injectStarshipDetailsTier(rollData, getStarshipEffectiveTier(this));
		}, "WRAPPER");

		libWrapper.register(getModuleId(), "dnd5e.dataModels.actor.VehicleData.prototype.prepareAbilities", function(wrapped, ...args) {
			const actorSource = getActorSource(this);
			const isStarship = actorSource?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
			if ( isStarship ) {
				const starshipSystem = getLegacyStarshipActorSystem({
					_source: actorSource,
					flags: actorSource.flags,
					system: actorSource.system
				});
				const legacyAbilities = starshipSystem.abilities ?? actorSource.system?.abilities;
				const mergedAbilities = mergeVehicleAbilityValues(this.abilities, legacyAbilities);
				if ( mergedAbilities ) {
					this.abilities = mergedAbilities;
				}
			}

			const result = wrapped(...args);
			if ( isStarship ) {
				const liveActor = getLiveActorFromModel(this);
				const runtime = getDerivedStarshipRuntime(
					liveActor ?? {
						_source: actorSource,
						flags: actorSource.flags,
						items: { contents: actorSource.items ?? [] },
						system: {
							abilities: this.abilities ?? actorSource.system?.abilities ?? {},
							attributes: { movement: this.attributes?.movement ?? actorSource.system?.attributes?.movement ?? {} }
						}
					},
					liveActor ? {
						liveAbilities: this.abilities ?? actorSource.system?.abilities ?? {},
						liveMovement: this.attributes?.movement ?? actorSource.system?.attributes?.movement ?? {}
					} : {}
				);
				const movement = runtime.movement ?? {};
				if ( this.attributes?.movement && (typeof this.attributes.movement === "object") ) {
					// Live values only: Role AE / underlying base → routing → Slowed.
					// Do not persist routing or Slowed into Actor underlying movement.
					const speeds = (this.attributes.movement.speeds && typeof this.attributes.movement.speeds === "object")
						? this.attributes.movement.speeds
						: (this.attributes.movement.speeds = {});
					speeds.space = movement.space;
					speeds.turn = movement.turn;
					speeds.walk = 0;
					speeds.fly = 0;
					if ( movement.units ) this.attributes.movement.units = movement.units;
				}
				if ( liveActor && Array.isArray(movement.roleWarnings) && movement.roleWarnings.length ) {
					liveActor._preparationWarnings ??= [];
					for ( const warning of movement.roleWarnings ) {
						const message = warning?.message ?? String(warning);
						if ( message && !liveActor._preparationWarnings.includes(message) ) {
							liveActor._preparationWarnings.push(message);
						}
					}
				}
				// Ensure vehicle type is always "space" — existing world actors may have "air" stored
				// from before buildVehicleSystem set details.type correctly.
				if ( this.details && (typeof this.details === "object") ) this.details.type = "space";
				if ( actorSource.system?.details && (typeof actorSource.system.details === "object") ) {
					actorSource.system.details.type = "space";
				}
			}

			return result;
		}, "WRAPPER");

		// prepareArmorClass runs after prepareAbilities in VehicleData.prepareDerivedData;
		// apply flat+bonus here so it is not overwritten by the flat early-return.
		libWrapper.register(getModuleId(), "dnd5e.dataModels.actor.VehicleData.prototype.prepareDerivedData", function(wrapped, ...args) {
			const result = wrapped(...args);
			const actorSource = getActorSource(this);
			const isStarship = actorSource?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
			if ( !isStarship ) return result;
			applyStarshipFlatArmorClassBonus(this.attributes?.ac);
			if ( this.attributes?.ac?.value ) {
				this.attributes.ac.motionless = this.attributes.ac.value
					- Math.max(0, this.abilities?.dex?.mod ?? 0);
			}
			// Travel from unslowed combat Space — never from Slowed prepared Space/Turn.
			const liveActor = getLiveActorFromModel(this);
			const runtime = getDerivedStarshipRuntime(
				liveActor ?? {
					_source: actorSource,
					flags: actorSource.flags,
					items: { contents: actorSource.items ?? [] },
					system: {
						abilities: this.abilities ?? actorSource.system?.abilities ?? {},
						attributes: { movement: this.attributes?.movement ?? {} }
					}
				}
			);
			applyStarshipTravelFromUnslowedCombatBase(this, liveActor, runtime.movement ?? {});
			return result;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn(`${HOOKS_NAMESPACE.toUpperCase()} | Skipping incompatible starship prepare wrapper target.`, err);
	}
}

/**
 * dnd5e flat AC sets `value = flat` and returns before adding `bonus`.
 * Only patch when `calc === "flat"` (homebrew Flat override). SotG `starship` / `default`
 * calcs already include `ac.bonus` via stock prepareArmorClass — do not double-add.
 * @param {object|null|undefined} ac
 */
function applyStarshipFlatArmorClassBonus(ac) {
	if ( !ac || (typeof ac !== "object") ) return;
	if ( ac.calc !== "flat" ) return;
	const flat = Number(ac.flat);
	if ( !Number.isFinite(flat) ) return;
	const bonus = Number(ac.bonus) || 0;
	ac.value = flat + bonus;
}
