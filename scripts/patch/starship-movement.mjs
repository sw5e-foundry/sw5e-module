import { getModuleId } from "../module-support.mjs";

export function isSw5eStarshipActor(actor) {
	return actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

/** Starship-only movement keys registered globally; populated on starship actors only. */
export const STARSHIP_MOVEMENT_TYPE_KEYS = Object.freeze(["space", "turn"]);

/**
 * Register SW5E starship movement types on dnd5e movement config.
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
	if ( !CONFIG.DND5E.movementTypes.turn ) {
		CONFIG.DND5E.movementTypes.turn = {
			label: "SW5E.MovementTurn",
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
 * Vehicle actors need persisted `attributes.movement.space` / `.turn` for config + token ruler speed.
 */
export function addStarshipSpaceMovementSchemaField() {
	try {
		const movement = dnd5e?.dataModels?.actor?.VehicleData?.schema?.fields?.attributes?.fields?.movement;
		if ( !movement?.fields ) return;

		const FormulaField = dnd5e.dataModels.fields.FormulaField;
		if ( !movement.fields.space ) {
			movement.fields.space = new FormulaField({
				deterministic: true,
				label: "SW5E.MovementSpace",
				speed: true
			});
		}
		if ( !movement.fields.turn ) {
			movement.fields.turn = new FormulaField({
				deterministic: true,
				label: "SW5E.MovementTurn",
				speed: true
			});
		}
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not add starship movement fields to VehicleData schema.", err);
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
