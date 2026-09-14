export function isSw5eStarshipActor(actor) {
	return actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

/** Starship-only movement keys registered globally; populated on starship actors only. */
export const STARSHIP_MOVEMENT_TYPE_KEYS = Object.freeze(["space", "turn"]);

/**
 * Inject starship space movement into token actions before CONFIG.Token.movement.actions is frozen.
 * Movement type labels live in {@link applySw5eStarshipMovementTypes} (config.mjs) for dnd5e pre-localization.
 */
export function ensureStarshipTokenMovementActionConfig() {
	const actions = CONFIG.Token?.movement?.actions;
	const fly = actions?.fly;
	if ( actions && fly && !actions.space ) {
		actions.space = foundry.utils.mergeObject(foundry.utils.deepClone(fly), {
			label: "SW5E.MovementSpace",
			icon: "fa-solid fa-shuttle-space",
			img: "icons/svg/wing.svg",
			order: 1.25
		});
	}
}

function wireStarshipSpaceMovementActionHandlers() {
	const type = "space";
	const actionConfig = CONFIG.Token?.movement?.actions?.[type];
	const TokenDocument5e = dnd5e?.documents?.TokenDocument5e;
	if ( !actionConfig || !TokenDocument5e?.getMovementActionCostFunction ) return;

	actionConfig.getAnimationOptions = token => {
		const speeds = token?.actor?.system.attributes?.movement?.speeds ?? {};
		if ( !(type in speeds) || speeds[type] ) return {};
		return { movementSpeed: CONFIG.Token.movement.defaultSpeed / 2 };
	};
	actionConfig.getCostFunction = (...args) => TokenDocument5e.getMovementActionCostFunction(type, ...args);
}

/**
 * Foundry v14.365: `foundry.utils.deepFreeze` is non-configurable, so libWrapper cannot
 * register a WRAPPER on it (LibWrapperPackageError). Starship `space` token movement is
 * injected instead by {@link ensureStarshipTokenMovementActionConfig} during module `init`,
 * which runs before `Game#initializeConfig` freezes `CONFIG.Token.movement.actions`.
 *
 * Retained as a no-op entry point so call sites stay stable.
 */
export function initializeStarshipMovementWrappers() {
	// Intentionally empty on Foundry v14 — see ensureStarshipTokenMovementActionConfig.
}

/**
 * Vehicle actors persist Space/Turn under dnd5e 6.0 `attributes.movement.speeds`.
 * CONFIG.DND5E.movementTypes.space/turn is registered at init; ensure the Vehicle
 * MappingField initialKeys include those types. Do not inject sibling FormulaFields.
 */
export function addStarshipSpaceMovementSchemaField() {
	try {
		const movement = dnd5e?.dataModels?.actor?.VehicleData?.schema?.fields?.attributes?.fields?.movement;
		if ( !movement?.fields ) return;
		const speedsField = movement.fields.speeds;
		if ( !speedsField ) return;
		const keys = speedsField.initialKeys;
		for ( const key of STARSHIP_MOVEMENT_TYPE_KEYS ) {
			if ( Array.isArray(keys) ) {
				if ( !keys.includes(key) ) keys.push(key);
			} else if ( keys && typeof keys === "object" && !(key in keys) ) {
				keys[key] = {
					label: key === "space" ? "SW5E.MovementSpace" : "SW5E.MovementTurn"
				};
			}
		}
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not add starship movement speeds to VehicleData schema.", err);
	}
}

async function ensureStarshipTokenMovementAction(actor) {
	if ( !isSw5eStarshipActor(actor) || !CONFIG.Token.movement.actions.space ) return;
	for ( const token of actor.getActiveTokens() ) {
		if ( token.document.movementAction === "space" ) continue;
		try {
			await token.document.update({ movementAction: "space" });
		} catch {
			/* Token may be locked or user may lack permission. */
		}
	}
}

export function registerStarshipMovementReadyHooks() {
	initializeStarshipMovementWrappers();
	addStarshipSpaceMovementSchemaField();
	ensureStarshipTokenMovementActionConfig();
	wireStarshipSpaceMovementActionHandlers();

	Hooks.on("preCreateToken", (doc, data) => {
		const actor = doc.actor ?? (data.actorId ? game.actors.get(data.actorId) : null);
		if ( isSw5eStarshipActor(actor) && CONFIG.Token.movement.actions.space ) {
			data.movementAction ??= "space";
		}
	});

	Hooks.on("updateActor", actor => {
		void ensureStarshipTokenMovementAction(actor);
	});

	Hooks.once("ready", () => {
		for ( const actor of game.actors ) {
			if ( !isSw5eStarshipActor(actor) ) continue;
			void ensureStarshipTokenMovementAction(actor);
		}
	});
}
