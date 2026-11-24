// patch/allowFeatsAndASI.mjs — DND5e v5.3.3 AdvancementFlowV2 port (P3-D / P3-E)

import { SETTINGS_NAMESPACE } from "../module-support.mjs";
import { getModuleId } from "../module-support.mjs";

/**
 * Feat and +1 ASI variant rule for DND5e AdvancementFlow V2.
 * Dead AppV1 seams (getData / _updateObject / several _on*) are not used.
 * Supported seams: allowFeat, apply, _prepareContentContext, _handleForm, _onDrop,
 * and DEFAULT_OPTIONS.actions.browse.
 */
export function patchVariantRules() {
	patchAllowFeatsAndASI();
}

/**
 * Forward dnd5e ASI apply arguments, including `options.initial`.
 * The normal path returns the native result directly. The feat-plus-ASI path
 * returns the native feat result after preserving the companion ability assignments.
 * @param {Function} wrapped
 * @param {number} level
 * @param {object} data
 * @param {object} [options]
 * @param {{ enabled: boolean, advancement: object }} context
 * @returns {Promise<*>|*}
 */
export function forwardAbilityScoreImprovementApply(wrapped, level, data, options, { enabled, advancement }) {
	if ( data?.type !== "both" || !enabled ) return wrapped(level, data, options);
	return applyFeatPlusAsi(wrapped, level, data, options, advancement);
}

/**
 * @param {Function} wrapped
 * @param {number} level
 * @param {object} data
 * @param {object} [options]
 * @param {object} advancement
 * @returns {Promise<*>}
 */
async function applyFeatPlusAsi(wrapped, level, data, options, advancement) {
	const asiResult = await wrapped(level, {
		type: "asi",
		assignments: data.assignments,
		retainedItems: data.retainedItems
	}, options);

	const uuid = data.featUuid ?? data.uuid;
	if ( !uuid ) return asiResult;

	const assignments = foundry.utils.deepClone(advancement.value.assignments ?? {});
	const originalReverse = advancement.reverse;
	advancement.reverse = function () {
		return this.value?.toObject?.() ?? {};
	};
	let featResult;
	try {
		featResult = await wrapped(level, {
			type: "feat",
			uuid,
			retainedItems: data.retainedItems
		}, options);
	} finally {
		advancement.reverse = originalReverse;
	}

	if ( !foundry.utils.isEmpty(assignments) ) {
		advancement.updateSource({
			"value.assignments": assignments,
			"value.type": "feat"
		});
	}
	return featResult;
}

function patchAllowFeatsAndASI() {
	function isEnabled() {
		return game.settings.get(SETTINGS_NAMESPACE, "allowFeatsAndASI");
	}

	function isFeatMode(flow) {
		return flow?.advancement?.value?.type === "feat";
	}

	function getFeatUuid(flow) {
		const feat = flow?.feat;
		if ( feat?.uuid ) return feat.uuid;
		const [uuid] = Object.values(flow?.advancement?.value?.feat ?? {});
		return uuid || null;
	}

	// Document class: allow feat picker when SW5e variant is enabled on class Items
	libWrapper.register(
		getModuleId(),
		"CONFIG.DND5E.advancementTypes.AbilityScoreImprovement.documentClass.prototype.allowFeat",
		function (wrapped) {
			return wrapped() || (this.item.type === "class" && isEnabled());
		},
		"WRAPPER"
	);

	// Document class: type "both" grants 1 ASI + feat without FlowV2 reverse wiping the ASI
	libWrapper.register(
		getModuleId(),
		"CONFIG.DND5E.advancementTypes.AbilityScoreImprovement.documentClass.prototype.apply",
		function (wrapped, level, data, options) {
			return forwardAbilityScoreImprovementApply(wrapped, level, data, options, {
				enabled: isEnabled(),
				advancement: this
			});
		},
		"WRAPPER"
	);

	// Reverse must undo both the feat grant and any SW5e companion ASI assignments.
	libWrapper.register(
		getModuleId(),
		"CONFIG.DND5E.advancementTypes.AbilityScoreImprovement.documentClass.prototype.reverse",
		function (wrapped, level, options={}) {
			if ( !isEnabled() ) return wrapped(level, options);
			const hasFeat = !!Object.keys(this.value?.feat ?? {}).length;
			const hasAssignments = !foundry.utils.isEmpty(this.value?.assignments ?? {});
			if ( !(hasFeat && hasAssignments) ) return wrapped(level, options);

			const source = this.value.toObject();
			const updates = {};
			for ( const [key, change] of Object.entries(this.value.assignments ?? {}) ) {
				const ability = this.actor.system.toObject().abilities[key];
				if ( !ability || !this.canImprove(key) ) continue;
				updates[`system.abilities.${key}.value`] = ability.value - change;
			}
			this.actor.updateSource(updates);

			const [id, uuid] = Object.entries(this.value.feat ?? {})[0] ?? [];
			const item = this.actor.items.get(id);
			if ( item ) source.retainedItems = { [uuid]: item.toObject() };
			if ( id ) {
				this.actor.items.delete(id);
				this.actor.reset();
			}
			this.updateSource({ value: { assignments: null, feat: null, type: null } });
			return source;
		},
		"MIXED"
	);

	const Flow = globalThis.dnd5e?.applications?.advancement?.AbilityScoreImprovementFlow;
	if ( !Flow?.prototype ) {
		console.warn("SW5E | AbilityScoreImprovementFlow unavailable; Feat+ASI FlowV2 port skipped.");
		return;
	}

	// --- P3-D / P3-E: FlowV2 context (replaces AppV1 getData) ---
	const originalPrepareContentContext = Flow.prototype._prepareContentContext;
	Flow.prototype._prepareContentContext = async function (context, options) {
		context = await originalPrepareContentContext.call(this, context, options);
		if ( !isEnabled() ) return context;

		const featMode = isFeatMode(this);

		if ( featMode ) {
			const assigned = Number(context.points?.assigned) || 0;
			context.points = {
				...(context.points ?? {}),
				total: 1,
				available: Math.max(0, 1 - assigned),
				cap: context.points?.cap ?? Infinity,
				assigned
			};
			context.lockImprovement = false;
			context.showImprovement = true;

			for ( const ability of Object.values(context.abilities ?? {}) ) {
				ability.isDisabled = false;
				ability.canIncrease = ability.value < ability.max
					&& context.points.available > 0
					&& (ability.value - ability.initial) < (context.points.cap ?? Infinity);
				ability.canDecrease = ability.value > ability.initial;
			}

			const pluralRules = new Intl.PluralRules(game.i18n.lang);
			context.pointsRemaining = game.i18n.format(
				`DND5E.ADVANCEMENT.AbilityScoreImprovement.PointsRemaining.${pluralRules.select(context.points.available)}`,
				{ points: context.points.available }
			);
		}

		// Always expose ASI controls + feat toggle while the variant is enabled
		context.showImprovement = true;
		context.showASIFeat = this.advancement.allowFeat;
		context.lockImprovement = false;
		return context;
	};

	// --- P3-D / P3-E: FlowV2 form submit (replaces AppV1 _updateObject) ---
	const originalHandleForm = Flow.prototype._handleForm;
	Flow.prototype._handleForm = async function (event, form, formData) {
		if ( !isEnabled() ) return originalHandleForm.call(this, event, form, formData);

		const targetName = event?.target?.name;
		if ( targetName === "asi-selected" || targetName === "recommendation-selected" ) {
			return originalHandleForm.call(this, event, form, formData);
		}

		if ( isFeatMode(this) ) {
			const abilities = this.advancement.actor.system._source.abilities ?? {};
			const { cap } = this.points;
			const pointsTotal = 1;
			const pointsAvailable = Math.max(0, pointsTotal - (Object.keys(CONFIG.DND5E.abilities).reduce((assigned, key) => {
				if ( !this.advancement.canImprove(key) || this.advancement.configuration.locked.has(key) ) return assigned;
				const fixed = this.advancement.configuration.fixed[key] ?? 0;
				return assigned + Math.max(0, (this.advancement.value.assignments?.[key] ?? 0) - fixed);
			}, 0)));

			const assignments = Object.keys(CONFIG.DND5E.abilities).reduce((obj, key) => {
				const value = formData.object[`abilities.${key}`];
				if ( (value === undefined) || this.advancement.configuration.locked.has(key) ) return obj;
				const abilityMax = Math.max(abilities[key]?.max ?? 20, this.advancement.configuration.max ?? -Infinity);
				const current = abilities[key]?.value ?? 0;
				const initial = current - (this.advancement.value.assignments?.[key] ?? 0);
				if ( initial > abilityMax ) return obj;
				const fixed = this.advancement.configuration.fixed[key] ?? 0;
				const locked = this.advancement.configuration.locked.has(key);
				const min = Math.min(initial + fixed, abilityMax);
				const max = Math.max(
					Math.min(
						current + pointsAvailable,
						initial + fixed + (locked ? 0 : Math.min(cap ?? Infinity, pointsTotal)),
						abilityMax
					),
					min
				);
				const delta = Math.min(Math.clamp(value, min, max) - current, pointsAvailable);
				if ( delta ) obj[key] = delta;
				return obj;
			}, {});

			const featUuid = getFeatUuid(this);
			if ( !foundry.utils.isEmpty(assignments) && featUuid ) {
				await this.advancement.apply(this.level, {
					type: "both",
					assignments,
					featUuid,
					retainedItems: this.retainedData?.retainedItems
				});
				return;
			}
		}

		return originalHandleForm.call(this, event, form, formData);
	};


	// When the variant is enabled, allow selecting a feat even after ASI points were chosen
	// by reversing the ASI-only state first (FlowV2 XOR), then applying the feat.
	async function prepareFeatSelection(flow) {
		if ( !isEnabled() ) return;
		if ( flow.advancement?.value?.type === "asi" ) {
			await flow.advancement.reverse(flow.level);
		}
	}

	const originalOnDrop = Flow.prototype._onDrop;
	Flow.prototype._onDrop = async function (event) {
		await prepareFeatSelection(this);
		return originalOnDrop.call(this, event);
	};

	const originalBrowse = Flow.DEFAULT_OPTIONS?.actions?.browse;
	if ( typeof originalBrowse === "function" ) {
		Flow.DEFAULT_OPTIONS.actions.browse = async function (event, target) {
			await prepareFeatSelection(this);
			return originalBrowse.call(this, event, target);
		};
	}
}

