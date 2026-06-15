import { getModuleId } from "../module-support.mjs";

export function isSw5eStarshipActor(actor) {
	return actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

/**
 * Register SW5E starship `space` on dnd5e movement config.
 * {@link CONFIG.Token.movement.actions} is sealed during dnd5e `init`; inject `space` in a `deepFreeze` wrapper.
 */
export function ensureStarshipSpaceMovementConfig() {
	CONFIG.DND5E.movementTypes ??= {};
	if ( !CONFIG.DND5E.movementTypes.space ) {
		CONFIG.DND5E.movementTypes.space = {
			label: "SW5E.MovementSpace",
			travel: "air"
		};
	}

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
		const actorMovement = token?.actor?.system.attributes?.movement ?? {};
		if ( !(type in actorMovement) || actorMovement[type] ) return {};
		return { movementSpeed: CONFIG.Token.movement.defaultSpeed / 2 };
	};
	actionConfig.getCostFunction = (...args) => TokenDocument5e.getMovementActionCostFunction(type, ...args);
}

function registerStarshipSpaceMovementInitWrapper() {
	try {
		libWrapper.register(
			getModuleId(),
			"foundry.utils.deepFreeze",
			function(wrapped, obj) {
				if ( obj === CONFIG.Token?.movement?.actions ) ensureStarshipSpaceMovementConfig();
				return wrapped(obj);
			},
			"WRAPPER"
		);
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap foundry.utils.deepFreeze for starship space movement.", err);
	}
}

/**
 * Vehicle actors need a persisted `attributes.movement.space` field for token ruler speed + cost.
 */
export function addStarshipSpaceMovementSchemaField() {
	try {
		const movement = dnd5e?.dataModels?.actor?.VehicleData?.schema?.fields?.attributes?.fields?.movement;
		if ( !movement?.fields || movement.fields.space ) return;

		const FormulaField = dnd5e.dataModels.fields.FormulaField;
		movement.fields.space = new FormulaField({
			deterministic: true,
			label: "SW5E.MovementSpace",
			speed: true
		});
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not add space movement field to VehicleData schema.", err);
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
	addStarshipSpaceMovementSchemaField();
	ensureStarshipSpaceMovementConfig();
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
			actor.prepareData();
			void ensureStarshipTokenMovementAction(actor);
		}
	});
}

registerStarshipSpaceMovementInitWrapper();
