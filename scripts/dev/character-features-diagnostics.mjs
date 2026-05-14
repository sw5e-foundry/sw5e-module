/**
 * GM-only diagnostics: snapshot dnd5e CharacterActorSheet Features-tab render context.
 *
 * **Temporary research helper** — safe to delete before merge if maintainers want zero shipped diagnostics.
 * **Does not** implement Deployment/Venture grouping; **does not** mutate actors/items (may call **`sheet.render(true)`** read-only UI open).
 *
 * Exposed as `globalThis.sw5e.diagnostics.captureCharacterFeatures` (registered from `module.mjs` on `ready`).
 */

/** @type {boolean} */
let captureLock = false;

/**
 * @param {unknown} input
 * @returns {import("@league/foundry").documents.Actor|null}
 */
function resolveActorInput(input) {
	if ( input == null ) return null;
	if ( typeof Actor !== "undefined" ) {
		try {
			if ( input instanceof Actor ) return /** @type {import("@league/foundry").documents.Actor} */ (input);
		}
		catch {
			return null;
		}
	}
	if ( typeof input !== "string" ) return null;
	const trimmed = input.trim();
	const actors = game?.actors;
	if ( !actors ) return null;
	const byId = actors.get(trimmed);
	if ( byId ) return byId;
	const byName = actors.getName(trimmed);
	if ( byName ) return byName;
	const byUuid = actors.find(a => a.uuid === trimmed);
	if ( byUuid ) return byUuid;
	try {
		const sync = globalThis.fromUuidSync;
		const doc = typeof sync === "function" ? sync(trimmed) : null;
		if ( doc instanceof Actor ) return doc;
	}
	catch {
		/* ignore */
	}
	return null;
}

/**
 * @param {import("@league/foundry").documents.Item} item
 */
function classifyFeat(item) {
	if ( !item || item.type !== "feat" ) return "other";
	const value = item.system?.type?.value;
	const subtype = item.system?.type?.subtype;
	if ( value === "deployment" ) return subtype === "venture" ? "venture" : "deployment";
	if ( item.flags?.sw5e?.legacyDeployment ) return "deployment_legacy";
	return "other";
}

/**
 * @param {unknown} section
 */
function columnIds(section) {
	const cols = section?.columns;
	if ( !Array.isArray(cols) ) return [];
	return cols.map(c => (typeof c === "string" ? c : c?.id)).filter(Boolean);
}

/**
 * @param {import("@league/foundry").applications.api.ApplicationV2} sheet
 * @param {Record<string, unknown>} context
 */
function buildFeaturesSnapshot(sheet, context) {
	const actor = sheet.actor;
	const feats = context.itemCategories?.features ?? [];

	const featSummaries = feats.map(it => ({
		id: it.id,
		name: it.name,
		type: it.type,
		"system.type.value": it.system?.type?.value ?? null,
		"system.type.subtype": it.system?.type?.subtype ?? null,
		"flags.sw5e.legacyDeployment": it.flags?.sw5e?.legacyDeployment ?? null,
		"flags.dnd5e.advancementOrigin": it.getFlag?.("dnd5e", "advancementOrigin") ?? null,
		"flags.dnd5e.advancementRoot": it.getFlag?.("dnd5e", "advancementRoot") ?? null,
		classification: classifyFeat(it)
	}));

	const itemContextForFeatures = {};
	for ( const it of feats ) {
		const ctx = context.itemContext?.[it.id];
		if ( !ctx ) continue;
		itemContextForFeatures[it.id] = {
			name: it.name,
			groups: foundry.utils.deepClone(ctx.groups ?? {}),
			dataset: foundry.utils.deepClone(ctx.dataset ?? {}),
			isExpanded: ctx.isExpanded ?? undefined,
			clickAction: ctx.clickAction ?? undefined
		};
	}

	const sections = (context.sections ?? []).map(s => ({
		id: s.id,
		label: s.label,
		order: s.order,
		groups: foundry.utils.deepClone(s.groups ?? {}),
		dataset: foundry.utils.deepClone(s.dataset ?? {}),
		columnIds: columnIds(s),
		itemCount: Array.isArray(s.items) ? s.items.length : 0,
		firstItemNames: (Array.isArray(s.items) ? s.items.slice(0, 5).map(i => i?.name) : [])
	}));

	const lc = context.listControls ?? {};
	const groupingModes = Array.isArray(lc.grouping)
		? lc.grouping.map(g => ({ key: g.key, label: g.label, dataset: foundry.utils.deepClone(g.dataset ?? {}) }))
		: [];

	return {
		capturedAt: new Date().toISOString(),
		sheet: {
			className: sheet.constructor?.name ?? "unknown",
			tabPrimaryAtCapture: sheet.tabGroups?.primary ?? null,
			rendered: !!sheet.rendered
		},
		actor: {
			name: actor?.name ?? null,
			id: actor?.id ?? null,
			uuid: actor?.uuid ?? null,
			type: actor?.type ?? null
		},
		itemCategoriesFeaturesCount: feats.length,
		itemCategoriesFeatures: featSummaries,
		itemContextForFeatures,
		sections,
		listControls: {
			label: lc.label ?? null,
			list: lc.list ?? null,
			filters: Array.isArray(lc.filters) ? lc.filters.map(f => ({ key: f.key, label: f.label })) : [],
			sorting: Array.isArray(lc.sorting) ? lc.sorting.map(s => ({ key: s.key, label: s.label })) : [],
			grouping: groupingModes
		},
		notes: [
			"Client-side ItemListControlsElement prefs may change effective grouping after DOM render — not fully represented here.",
			"Stock dnd5e may bulk-seed section[0].items; per-section itemCount may be low until grouping runs in-browser."
		]
	};
}

/**
 * Fallback: ephemeral `_prepareFeaturesContext` wrap + forced render on Features tab.
 * Restores prototype in `finally`.
 *
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {object} sheet  CharacterActorSheet instance
 * @param {{ restoreTab?: boolean }} options
 */
async function captureViaEphemeralWrap(actor, sheet, options = {}) {
	const CLS = game.dnd5e?.applications?.actor?.CharacterActorSheet;
	if ( !CLS?.prototype?._prepareFeaturesContext ) {
		return { error: "CharacterActorSheet.prototype._prepareFeaturesContext unavailable for fallback path." };
	}

	const proto = CLS.prototype;
	const original = proto._prepareFeaturesContext;
	/** @type {{ snapshot?: Record<string, unknown> }} */
	const holder = {};

	const patched = async function patchedPrepareFeaturesContext(context, opts) {
		await original.call(this, context, opts);
		if ( this.actor?.id === actor.id && !holder.snapshot ) {
			try {
				holder.snapshot = buildFeaturesSnapshot(this, context);
			}
			catch ( err ) {
				holder.snapshot = { captureError: String(err?.message ?? err), stack: err?.stack };
			}
		}
		return context;
	};

	const restoreTab = options.restoreTab !== false;
	const prevPrimary = sheet.tabGroups?.primary ?? null;

	proto._prepareFeaturesContext = patched;
	try {
		if ( sheet.tabGroups ) sheet.tabGroups.primary = "features";
		await sheet.render(true);
		if ( restoreTab && prevPrimary != null && sheet.tabGroups ) {
			sheet.tabGroups.primary = prevPrimary;
			await sheet.render(true);
		}
		return holder.snapshot ?? {
			error: "Ephemeral wrapper ran but no snapshot was captured.",
			actorId: actor.id
		};
	}
	finally {
		proto._prepareFeaturesContext = original;
	}
}

/**
 * GM-only: capture Features-tab preparation context for a PC actor.
 *
 * @param {string | import("@league/foundry").documents.Actor} actorInput  Actor document, id, uuid, or exact name
 * @param {{
 *   renderSheet?: boolean,
 *   restoreTab?: boolean,
 *   logPretty?: boolean
 * }} [options]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function captureCharacterFeatures(actorInput, options = {}) {
	if ( !game?.user?.isGM ) return { error: "GM only" };

	const CharacterActorSheet = game.dnd5e?.applications?.actor?.CharacterActorSheet;
	if ( !CharacterActorSheet ) return { error: "dnd5e CharacterActorSheet not available (wrong system or load order)." };

	const actor = resolveActorInput(actorInput);
	if ( !actor ) return { error: "Actor not found", input: typeof actorInput === "string" ? actorInput : "[non-string]" };
	if ( actor.type !== "character" ) return { error: "Actor is not a player character", actorType: actor.type };

	if ( captureLock ) return { error: "Capture already in progress — wait and retry." };
	captureLock = true;

	try {
		const sheet = actor.sheet;
		if ( !(sheet instanceof CharacterActorSheet) ) {
			return {
				error: "Actor sheet is not CharacterActorSheet",
				sheetClass: sheet?.constructor?.name ?? null
			};
		}

		if ( !sheet.rendered ) {
			try {
				await sheet.render(true);
			}
			catch ( err ) {
				return { error: "Failed to render actor sheet", detail: String(err?.message ?? err) };
			}
		}

		const renderSheet = !!options.renderSheet;
		const restoreTab = options.restoreTab !== false;
		const prevPrimary = sheet.tabGroups?.primary ?? null;

		if ( renderSheet ) {
			if ( sheet.tabGroups ) sheet.tabGroups.primary = "features";
			await sheet.render(true);
			if ( restoreTab && prevPrimary != null && sheet.tabGroups ) {
				sheet.tabGroups.primary = prevPrimary;
				await sheet.render(true);
			}
		}

		const renderOptions = {};

		try {
			let context = await sheet._prepareContext(renderOptions);
			context = await sheet._preparePartContext("features", context, renderOptions);
			const snapshot = buildFeaturesSnapshot(sheet, context);
			const result = {
				...snapshot,
				meta: {
					method: "_prepareContext → _preparePartContext(features)",
					renderSheetPrimed: renderSheet,
					fallbackUsed: false
				}
			};
			globalThis.__SW5E_FEATURES_PHASE0 = result;
			if ( options.logPretty !== false ) {
				console.warn("SW5e diagnostics | captureCharacterFeatures | see return value and window.__SW5E_FEATURES_PHASE0");
				console.log(JSON.stringify(result, null, 2));
			}
			return result;
		}
		catch ( err ) {
			console.warn("SW5e diagnostics | direct prepare failed — ephemeral wrapper fallback", err);
			const fallback = await captureViaEphemeralWrap(actor, sheet, { restoreTab });
			const merged = {
				...(typeof fallback === "object" && fallback ? fallback : { fallback }),
				meta: {
					method: "fallback: ephemeral _prepareFeaturesContext wrap + render",
					renderSheetPrimed: true,
					fallbackUsed: true,
					directError: String(err?.message ?? err)
				}
			};
			globalThis.__SW5E_FEATURES_PHASE0 = merged;
			if ( options.logPretty !== false ) {
				console.warn("SW5e diagnostics | captureCharacterFeatures (fallback) | window.__SW5E_FEATURES_PHASE0 set");
				console.log(JSON.stringify(merged, null, 2));
			}
			return merged;
		}
	}
	catch ( err ) {
		const fail = { error: String(err?.message ?? err), stack: err?.stack };
		globalThis.__SW5E_FEATURES_PHASE0 = fail;
		return fail;
	}
	finally {
		captureLock = false;
	}
}

/**
 * @param {Record<string, unknown>} sw5eRoot  `globalThis.sw5e`
 */
export function registerCharacterFeaturesDiagnostics(sw5eRoot) {
	if ( !sw5eRoot || typeof sw5eRoot !== "object" ) return;
	sw5eRoot.diagnostics ??= {};
	sw5eRoot.diagnostics.captureCharacterFeatures = captureCharacterFeatures;
}
