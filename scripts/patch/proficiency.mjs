import { getModuleId, HOOKS_NAMESPACE } from "../module-support.mjs";

const PROFICIENCY_FLAG_PATH = "proficiencyTier";
const TIER_VALUES = Object.freeze([0, 0.5, 1, 2, 3, 4, 5]);
const WEAPON_TIER_VALUES = Object.freeze([0, 0.5, 1]);
const MASTERY_TIERS = Object.freeze(new Set([3, 4, 5]));
const REROLL_TIERS = Object.freeze(new Set([4, 5]));

/** SW5E-owned proficiency tier metadata (not dnd5e-facing display config). */
export const EXPANDED_PROFICIENCY_TIERS = Object.freeze({
	0: { label: "DND5E.NotProficient", mult: 0, mastery: false, rerolls: 0 },
	0.5: { label: "DND5E.HalfProficient", mult: 0.5, mastery: false, rerolls: 0 },
	1: { label: "DND5E.Proficient", mult: 1, mastery: false, rerolls: 0 },
	2: { label: "DND5E.Expertise", mult: 2, mastery: false, rerolls: 0 },
	3: { label: "SW5E.Mastery", mult: 2, mastery: true, rerolls: 0 },
	4: { label: "SW5E.HighMastery", mult: 2, mastery: true, rerolls: 1 },
	5: { label: "SW5E.GrandMastery", mult: 2, mastery: true, rerolls: 2 }
});

const TIER_LABEL_KEYS = Object.freeze(
	Object.fromEntries(Object.entries(EXPANDED_PROFICIENCY_TIERS).map(([tier, entry]) => [tier, entry.label]))
);

function localize(key, fallback, data) {
	const i18n = game?.i18n;
	if (!i18n) return fallback;
	if (data) {
		if (!i18n.has?.(key)) return fallback.replace(/\{(\w+)\}/g, (_, k) => data[k] ?? "");
		return i18n.format(key, data);
	}
	const value = i18n.localize(key);
	return value === key ? fallback : value;
}

function getTierLabel(tier) {
	const key = getExpandedProficiencyLabelKey(tier);
	return key ? localize(key, String(tier)) : String(tier);
}

/** @param {number} tier */
export function getExpandedProficiencyMultiplier(tier) {
	const numeric = toFiniteNumber(tier, NaN);
	if ( !Number.isFinite(numeric) ) return 0;
	const entry = EXPANDED_PROFICIENCY_TIERS[numeric];
	if ( entry ) return entry.mult;
	if ( numeric >= 3 ) return 2;
	return numeric;
}

/** @param {number} tier */
export function getExpandedProficiencyLabelKey(tier) {
	const numeric = toFiniteNumber(tier, 0);
	return EXPANDED_PROFICIENCY_TIERS[numeric]?.label ?? TIER_LABEL_KEYS[numeric] ?? String(tier);
}

/** @param {number} tier */
export function getExpandedProficiencyRerollCount(tier) {
	return EXPANDED_PROFICIENCY_TIERS[toFiniteNumber(tier, 0)]?.rerolls ?? 0;
}

/** @param {number} tier */
export function isExpandedProficiencyMasteryTier(tier) {
	return EXPANDED_PROFICIENCY_TIERS[toFiniteNumber(tier, 0)]?.mastery === true;
}

/** Localized hover/tooltip label for a proficiency tier value. */
export function getExpandedProficiencyHoverLabel(tier) {
	const display = CONFIG?.DND5E?.proficiencyLevels?.[tier];
	if ( typeof display === "string" ) return display;
	return localize(getExpandedProficiencyLabelKey(tier), String(tier));
}

function getProficiencyOptions(values = TIER_VALUES) {
	return values.map(value => ({ value, label: TIER_LABEL_KEYS[value] ?? String(value) }));
}

function toFiniteNumber(value, fallback = 0) {
	const number = Number(value);
	return Number.isFinite(number) ? number : fallback;
}

function getSourceValue(actor, path) {
	const sourceValue = foundry.utils.getProperty(actor?._source, path);
	if (Number.isFinite(Number(sourceValue))) return Number(sourceValue);
	return Number(foundry.utils.getProperty(actor, path));
}

function resolveRollTier(config, type) {
	const actor = config?.subject;
	if (!actor?.system) return 0;

	if (type === "skill") {
		const skill = config.skill;
		if (!skill) return 0;
		return toFiniteNumber(getSourceValue(actor, `system.skills.${skill}.value`));
	}

	if (type === "tool") {
		const tool = config.tool;
		if (!tool) return 0;
		return toFiniteNumber(getSourceValue(actor, `system.tools.${tool}.value`));
	}

	if (type === "save") {
		const ability = config.ability;
		if (!ability) return 0;
		return toFiniteNumber(getSourceValue(actor, `system.abilities.${ability}.proficient`));
	}

	return 0;
}

function applyTierAdvantage(config) {
	config.advantage = true;
	for (const rollConfig of config.rolls ?? []) {
		rollConfig.options ??= {};
		rollConfig.options.advantage = true;
		rollConfig.options.sw5eProficiencyTier ??= config.sw5eProficiencyTier;
	}
}

function getRollLabel(config, type) {
	if (type === "skill") return CONFIG.DND5E.skills?.[config.skill]?.label ?? config.skill ?? "";
	if (type === "tool") {
		return CONFIG.DND5E.tools?.[config.tool]?.label
			?? CONFIG.DND5E.vehicleTypes?.[config.tool]?.label
			?? config.tool
			?? "";
	}
	if (type === "save") return CONFIG.DND5E.abilities?.[config.ability]?.label ?? config.ability ?? "";
	return "";
}

function buildTierMetadata(config, type, tier) {
	const label = getTierLabel(tier);
	return {
		tier,
		label,
		type,
		subjectUuid: config?.subject?.uuid ?? null,
		rollLabel: getRollLabel(config, type),
		rollIndex: 0,
		rerolls: {
			allowed: tier === 4 ? 1 : tier === 5 ? "each" : 0,
			used: {},
			dismissed: false
		}
	};
}

/** @param {number} tier */
export function isMasteryProficiencyTier(tier) {
	return isExpandedProficiencyMasteryTier(tier);
}

/** @param {number} tier */
export function isRerollProficiencyTier(tier) {
	return REROLL_TIERS.has(toFiniteNumber(tier));
}

export function getProficiencyAdvantageMode() {
	return CONFIG?.Dice?.D20Roll?.ADV_MODE?.ADVANTAGE ?? 1;
}

/**
 * Build chat flag metadata for mastery-tier rolls outside the dnd5e preRoll pipeline.
 * @param {number} tier
 * @param {{ type?: string, rollLabel?: string, subjectUuid?: string|null }} [options]
 */
export function createProficiencyTierChatFlag(tier, { type = "skill", rollLabel = "", subjectUuid = null } = {}) {
	return buildTierMetadata({ subject: { uuid: subjectUuid } }, type, toFiniteNumber(tier));
}

export function appendProficiencyTierFlavor(flavor, metadata) {
	const tierText = localize("SW5E.ProficiencyTier.Flavor", "Proficiency Tier: {tier}", { tier: metadata.label });
	if ( flavor?.includes(metadata.label) ) return flavor;
	return flavor ? `${flavor} (${tierText})` : tierText;
}

function appendTierFlavor(message, metadata) {
	const tierText = localize("SW5E.ProficiencyTier.Flavor", "Proficiency Tier: {tier}", { tier: metadata.label });
	const existing = foundry.utils.getProperty(message, "data.flavor") ?? "";
	if (existing.includes(metadata.label)) return;
	foundry.utils.setProperty(message, "data.flavor", existing ? `${existing} (${tierText})` : tierText);
}

function appendTierDialogSubtitle(dialog, metadata) {
	dialog.options ??= {};
	dialog.options.window ??= {};
	const tierText = localize("SW5E.ProficiencyTier.Flavor", "Proficiency Tier: {tier}", { tier: metadata.label });
	const existing = dialog.options.window.subtitle;
	dialog.options.window.subtitle = existing ? `${existing} - ${tierText}` : tierText;
}

function addTierFlag(message, metadata) {
	foundry.utils.setProperty(message, `data.flags.sw5e.${PROFICIENCY_FLAG_PATH}`, metadata);
}

function applyProficiencyTier(config, dialog, message, type) {
	const tier = resolveRollTier(config, type);
	if (!MASTERY_TIERS.has(tier)) return;

	const metadata = buildTierMetadata(config, type, tier);
	config.sw5eProficiencyTier = metadata;
	applyTierAdvantage(config);
	addTierFlag(message, metadata);
	appendTierFlavor(message, metadata);
	appendTierDialogSubtitle(dialog, metadata);
}

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? null;
}

function getTierFlag(message) {
	return foundry.utils.getProperty(message, `flags.sw5e.${PROFICIENCY_FLAG_PATH}`);
}

function getRolls(message) {
	const rolls = message?.rolls;
	if (!rolls) return [];
	return Array.isArray(rolls) ? rolls : Array.from(rolls);
}

function getD20ResultEntries(roll) {
	return Array.from(roll?.d20?.results ?? [])
		.map((result, index) => ({ index, value: Number(result.result), active: Boolean(result.active) }))
		.filter(entry => Number.isFinite(entry.value));
}

function getUsedRerolls(tierFlag) {
	return tierFlag?.rerolls?.used ?? {};
}

function getUsedKey(index) {
	return `d${index}`;
}

function getEffectiveDieValues(entries, used) {
	return entries.map(entry => used[getUsedKey(entry.index)]?.newValue ?? entry.value);
}

function calculateTierTotal(roll, tierFlag) {
	const entries = getD20ResultEntries(roll);
	if (!entries.length) return null;

	const used = getUsedRerolls(tierFlag);
	const values = getEffectiveDieValues(entries, used);
	const activeOriginal = entries.find(entry => entry.active)?.value ?? Math.max(...entries.map(entry => entry.value));
	const staticTotal = Number(roll.total) - activeOriginal;
	const activeValue = Math.max(...values);
	const finalTotal = staticTotal + activeValue;
	return { entries, used, values, activeValue, finalTotal };
}

function isAdvantagedRoll(roll) {
	const advantage = CONFIG?.Dice?.D20Roll?.ADV_MODE?.ADVANTAGE ?? 1;
	return roll?.options?.advantageMode === advantage || roll?.hasAdvantage === true;
}

function canRenderRerolls(message, tierFlag, roll, totalData) {
	const isAuthor = message?.isAuthor ?? message?.user?.id === game?.user?.id;
	if (!isAuthor && !game?.user?.isGM) return false;
	if (tierFlag?.rerolls?.dismissed) return false;
	if (!REROLL_TIERS.has(tierFlag?.tier)) return false;
	if (!isAdvantagedRoll(roll)) return false;
	if ((totalData?.entries?.length ?? 0) < 2) return false;
	return true;
}

function getAvailableDieEntries(tierFlag, totalData) {
	const used = totalData?.used ?? {};
	if (tierFlag?.tier === 4 && Object.keys(used).length) return [];
	return totalData.entries.filter(entry => !used[getUsedKey(entry.index)]);
}

function getDiceRollElements(root) {
	const tooltipRolls = root.querySelector(".dice-tooltip .dice-rolls");
	if ( tooltipRolls ) return [...tooltipRolls.querySelectorAll("li")];
	return [...root.querySelectorAll(".dice-rolls li.roll.die, .dice-rolls li.die")];
}

function updateAdvantageDieStates(diceEls, entries, values) {
	if ( entries.length < 2 || values.length < 2 ) return;
	const maxValue = Math.max(...values);
	for ( let i = 0; i < entries.length; i++ ) {
		const entry = entries[i];
		const el = diceEls[entry.index];
		if ( !el ) continue;
		const value = values[i];
		const isKept = value >= maxValue;
		el.classList.toggle("discarded", !isKept);
		el.classList.toggle("min", !isKept);
		el.classList.toggle("max", isKept);
	}
}

function updateDisplayedDiceValues(root, entries, used, { highlightIndices = [] } = {}) {
	const diceEls = getDiceRollElements(root);
	const values = entries.map(entry => used[getUsedKey(entry.index)]?.newValue ?? entry.value);

	for ( const entry of entries ) {
		const el = diceEls[entry.index];
		if ( !el ) continue;
		const effective = used[getUsedKey(entry.index)]?.newValue ?? entry.value;
		el.textContent = String(effective);
		el.classList.toggle("sw5e-mastery-reroll-die-highlight", highlightIndices.includes(entry.index));
	}

	updateAdvantageDieStates(diceEls, entries, values);
}

function updateDisplayedRollTotal(root, total, { highlight = false } = {}) {
	if ( !Number.isFinite(total) ) return;
	const diceTotal = root.querySelector(".dice-total");
	if ( !diceTotal ) return;
	diceTotal.textContent = String(total);
	diceTotal.classList.toggle("sw5e-mastery-reroll-total-highlight", highlight);
}

function applyInlineRerollDisplay(root, totalData) {
	const used = totalData?.used ?? {};
	if ( !Object.keys(used).length ) return;

	const highlightIndices = Object.values(used).map(entry => entry.dieIndex);
	updateDisplayedDiceValues(root, totalData.entries, used, { highlightIndices });
	updateDisplayedRollTotal(root, totalData.finalTotal, { highlight: true });
}

function createRerollControls(message, tierFlag, roll, totalData) {
	const available = getAvailableDieEntries(tierFlag, totalData);
	if (!available.length) return null;

	const controls = document.createElement("div");
	controls.className = "sw5e-mastery-reroll-actions";

	for (const entry of available) {
		const button = document.createElement("button");
		button.type = "button";
		button.dataset.sw5eProficiencyReroll = String(entry.index);
		const label = localize(
			"SW5E.ProficiencyTier.RerollDie",
			"Reroll Die {die}",
			{ die: entry.index + 1 }
		);
		button.textContent = label;
		button.title = label;
		button.setAttribute("aria-label", label);
		button.addEventListener("click", event => onRerollClick(event, message, tierFlag, roll));
		controls.append(button);
	}

	return controls;
}

const MASTERY_REROLL_FORMULA = "1d20";

/**
 * Roll a replacement d20 for mastery rerolls. Reads the evaluated die result, never die.faces.
 * @returns {Promise<number|null>} 1–20, or null when evaluation fails.
 */
async function rollMasteryReplacementD20() {
	const RollClass = CONFIG.Dice?.D20Roll ?? Roll;
	const replacement = new RollClass(MASTERY_REROLL_FORMULA);
	await replacement.evaluate();

	const die = replacement.dice?.[0];
	const activeResult = die?.results?.find(result => result.active !== false) ?? die?.results?.at(-1);
	const fromDie = Number(activeResult?.result);
	const newValue = Number.isFinite(fromDie) ? fromDie : Number(replacement.total);

	if ( !Number.isFinite(newValue) || newValue < 1 || newValue > 20 ) {
		console.warn("SW5E | Invalid mastery reroll result", {
			newValue,
			formula: MASTERY_REROLL_FORMULA,
			dieFaces: die?.faces,
			replacementTotal: replacement.total
		});
		return null;
	}

	return newValue;
}

async function onRerollClick(event, message, tierFlag, roll) {
	event.preventDefault();
	const button = event.currentTarget;
	button.disabled = true;

	try {
		const totalData = calculateTierTotal(roll, tierFlag);
		if (!totalData) return;

		const available = getAvailableDieEntries(tierFlag, totalData);
		const target = button.dataset.sw5eProficiencyReroll;
		const entries = available.filter(entry => entry.index === Number(target));
		if (!entries.length) return;

		const nextFlag = foundry.utils.deepClone(tierFlag);
		nextFlag.rerolls ??= {};
		nextFlag.rerolls.used ??= {};

		for (const entry of entries) {
			const newValue = await rollMasteryReplacementD20();
			if ( newValue === null ) {
				button.disabled = false;
				return;
			}

			nextFlag.rerolls.used[getUsedKey(entry.index)] = {
				dieIndex: entry.index,
				oldValue: totalData.used[getUsedKey(entry.index)]?.newValue ?? entry.value,
				newValue,
				userId: game.user?.id ?? null,
				timestamp: Date.now()
			};
		}

		const recalculated = calculateTierTotal(roll, nextFlag);
		nextFlag.rerolls.finalTotal = recalculated?.finalTotal ?? null;
		nextFlag.rerolls.activeValue = recalculated?.activeValue ?? null;

		await message.update({ [`flags.sw5e.${PROFICIENCY_FLAG_PATH}`]: nextFlag });

		const freshMessage = game.messages.get(message.id) ?? message;
		const root = document.querySelector(`[data-message-id="${message.id}"]`);
		if ( root ) renderProficiencyTierControls(freshMessage, root);
	} catch ( err ) {
		button.disabled = false;
		throw err;
	}
}

function renderProficiencyTierControls(message, html) {
	const tierFlag = getTierFlag(message);
	if (!tierFlag?.tier || !REROLL_TIERS.has(tierFlag.tier)) return;

	const root = getHtmlRoot(html);
	if (!root) return;

	const roll = getRolls(message)[tierFlag.rollIndex ?? 0];
	const totalData = calculateTierTotal(roll, tierFlag);
	if (!roll || !totalData) return;

	const content = root.querySelector(".message-content") ?? root;
	content.querySelector(".sw5e-proficiency-tier-card")?.remove();
	content.querySelector(".sw5e-proficiency-tier-controls")?.remove();
	content.querySelector(".sw5e-mastery-reroll-actions")?.remove();

	applyInlineRerollDisplay(root, totalData);

	if (!canRenderRerolls(message, tierFlag, roll, totalData)) return;
	const controls = createRerollControls(message, tierFlag, roll, totalData);
	if (controls) content.append(controls);
}

function adjustProficiencyObject() {
	libWrapper.register(getModuleId(), 'dnd5e.documents.Proficiency.prototype.flat', function (wrapped, ...args) {
		const multiplier = this.multiplier;
		this.multiplier = Math.min(multiplier, 2);
		try {
			return wrapped(...args);
		} finally {
			this.multiplier = multiplier;
		}
	}, 'MIXED' );

	libWrapper.register(getModuleId(), 'dnd5e.documents.Proficiency.prototype.dice', function (wrapped, ...args) {
		const multiplier = this.multiplier;
		this.multiplier = Math.min(multiplier, 2);
		try {
			return wrapped(...args);
		} finally {
			this.multiplier = multiplier;
		}
	}, 'MIXED' );
}

// dataModels file changes:
// - skills and abilities max proficiency is 5 on CreatureTemplate
// - proficiency can be 0.5 on WeaponData
// - proficiency can be 0.5 and has a max of 5 on ToolData

function registerProficiencyOverride(id, handler, mode='OVERRIDE') {
	try {
		libWrapper.register(getModuleId(), id, handler, mode);
	} catch(err) {
		console.warn(`${HOOKS_NAMESPACE.toUpperCase()} | Skipping incompatible proficiency wrapper target '${id}'.`, err);
	}
}

function adjustProficiencyCycleElement() {
	const ProficiencyCycleElement = dnd5e?.applications?.components?.ProficiencyCycleElement;
	if ( !ProficiencyCycleElement ) return;

	ProficiencyCycleElement.CSS = `
		:host { display: inline-block; }
		div { --_fill: var(--proficiency-cycle-enabled-color, var(--dnd5e-color-blue)); }
		div:has(:disabled, :focus-visible) { --_fill: var(--proficiency-cycle-disabled-color, var(--dnd5e-color-gold)); }
		div:not(:has(:disabled)) { cursor: pointer; }

		div {
			position: relative;
			overflow: clip;
			width: 100%;
			aspect-ratio: 1;

			&::before {
				content: "";
				position: absolute;
				display: block;
				inset: 3px;
				border: 1px solid var(--_fill);
				border-radius: 100%;
			}

			&:has([value="1"])::before { background: var(--_fill); }

			&:has([value="0.5"], [value="2"])::after {
				content: "";
				position: absolute;
				background: var(--_fill);  
			}

			&:has([value="0.5"])::after {
				inset: 4px;
				width: 4px;
				aspect-ratio: 1 / 2;
				border-radius: 100% 0 0 100%;
			}

			&:has([value="2"]) {
				&::before {
					inset: 1px;
					border-width: 2px;
				}

				&::after {
					inset: 5px;
					border-radius: 100%;
				}
			}

			&:has([value="3"]) {
				&::before {
					inset: 1px;
					border-width: 3px;
				}

				&::after {
					inset: 5px;
					border-radius: 100%;
				}
			}

			&:has([value="4"]) {
				&::before {
					inset: 1px;
					border-width: 4px;
				}

				&::after {
					inset: 5px;
					border-radius: 100%;
				}
			}

			&:has([value="5"]) {
				&::before {
					inset: 1px;
					border-width: 5px;
				}

				&::after {
					inset: 5px;
					border-radius: 100%;
				}
			}
		}

		input {
			position: absolute;
			inset-block-start: -100px;
			width: 1px;
			height: 1px;
			opacity: 0;
		}
	`;

	registerProficiencyOverride('dnd5e.applications.components.ProficiencyCycleElement.prototype.type#set', function ( value ) {
		if ( !["ability", "skill", "tool", "weapon"].includes( value ) ) throw new Error( "Type must be 'ability', 'skill', 'tool', or 'weapon'." );
		this.setAttribute( "type", value );
		const internals = this["#internals"] ?? this.internals ?? this._internals;
		if ( internals ) {
			internals.ariaValueMin = 0;
			internals.ariaValueMax = value === "weapon" ? 1 : 5;
			internals.ariaValueStep = 0.5;
		} else {
			this.setAttribute("aria-valuemin", 0);
			this.setAttribute("aria-valuemax", value === "weapon" ? 1 : 5);
			this.setAttribute("aria-valuestep", 0.5);
		}
	});

	registerProficiencyOverride('dnd5e.applications.components.ProficiencyCycleElement.prototype.validValues', function () {
		return this.type === "weapon" ? WEAPON_TIER_VALUES : TIER_VALUES;
	});
}

function adjustProficiencyConfigSheets() {
	registerProficiencyOverride('dnd5e.applications.actor.AbilityConfig.prototype._preparePartContext', async function (wrapped, ...args) {
		const context = await wrapped(...args);
		context.proficiencyOptions = getProficiencyOptions();
		return context;
	}, 'WRAPPER');

	registerProficiencyOverride('dnd5e.applications.actor.SkillToolConfig.prototype._preparePartContext', async function (wrapped, ...args) {
		const context = await wrapped(...args);
		context.proficiencyOptions = getProficiencyOptions();
		return context;
	}, 'WRAPPER');
}

function adjustCharacterSheetProficiencyClasses() {
	const CharacterActorSheet = dnd5e?.applications?.actor?.CharacterActorSheet;
	if (!CharacterActorSheet?.PROFICIENCY_CLASSES) return;
	Object.assign(CharacterActorSheet.PROFICIENCY_CLASSES, {
		3: "mastery",
		4: "high-mastery",
		5: "grand-mastery"
	});
}

function registerProficiencyRollHooks() {
	Hooks.on("dnd5e.preRollSkill", (config, dialog, message) => applyProficiencyTier(config, dialog, message, "skill"));
	Hooks.on("renderChatMessageHTML", renderProficiencyTierControls);
}

export function patchProficiencyInit() {
	adjustProficiencyObject();
	adjustProficiencyConfigSheets();
	registerProficiencyRollHooks();
}

export function patchProficiencyReady() {
	adjustProficiencyCycleElement();
	adjustCharacterSheetProficiencyClasses();
}
