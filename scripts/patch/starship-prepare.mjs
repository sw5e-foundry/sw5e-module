import { getModuleId, HOOKS_NAMESPACE } from "../module-support.mjs";
import {
	applyDerivedStarshipMovement,
	applyDerivedStarshipTravel,
	getDerivedStarshipRuntime,
	getLegacyStarshipActorSystem,
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

export function patchStarshipPrepare() {
	try {
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
				const runtime = getDerivedStarshipRuntime({
					_source: actorSource,
					flags: actorSource.flags,
					items: { contents: actorSource.items ?? [] },
					system: {
						abilities: this.abilities ?? actorSource.system?.abilities ?? {},
						attributes: { movement: this.attributes?.movement ?? actorSource.system?.attributes?.movement ?? {} }
					}
				});
				const movement = runtime.movement ?? {};
				if ( actorSource.system && (typeof actorSource.system === "object") ) {
					applyDerivedStarshipMovement(actorSource.system, movement);
					applyDerivedStarshipTravel(actorSource.system, runtime.travel ?? {});
				}
				const legacySnapshot = actorSource.flags?.sw5e?.legacyStarshipActor?.system;
				if ( legacySnapshot && (typeof legacySnapshot === "object") ) {
					applyDerivedStarshipMovement(legacySnapshot, movement);
					applyDerivedStarshipTravel(legacySnapshot, runtime.travel ?? {});
				}
				if ( this.attributes?.movement && (typeof this.attributes.movement === "object") ) {
					this.attributes.movement.space = movement.space;
					this.attributes.movement.turn = movement.turn;
					this.attributes.movement.walk = 0;
					this.attributes.movement.fly = 0;
					if ( movement.units ) this.attributes.movement.units = movement.units;
				}
				if ( actorSource.system?.attributes?.movement && (typeof actorSource.system.attributes.movement === "object") ) {
					actorSource.system.attributes.movement.space = movement.space;
					actorSource.system.attributes.movement.turn = movement.turn;
					actorSource.system.attributes.movement.walk = 0;
					actorSource.system.attributes.movement.fly = 0;
					if ( movement.units ) actorSource.system.attributes.movement.units = movement.units;
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
	} catch ( err ) {
		console.warn(`${HOOKS_NAMESPACE.toUpperCase()} | Skipping incompatible starship prepare wrapper target.`, err);
	}
}
