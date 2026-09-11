/**
 * Starship Core / Systems / overview HBS context builders (Phase 6 H1).
 * Move-only from scripts/patch/starship-sheet.mjs — bodies preserved.
 */

import { normalizeSwPriceDenomination } from "../currencies.mjs";
import {
	buildStarshipSaveModifierParts,
	deriveStarshipPools,
	getDerivedStarshipRuntime,
	getLegacyStarshipActorSystem,
	getStarshipAdvancedPowerContext,
	getStarshipPowerRecoverySummary,
	getStarshipSkillDisplayEntries,
	getStarshipSkillEntries,
	isStarshipFlagVehicle
} from "../starship-data.mjs";
import { getExpandedProficiencyHoverLabel } from "./proficiency.mjs";
import { escapeHtml, localizeOrFallback } from "../starship-sheet-html.mjs";
import { buildStarshipFuelReplenishCostModeContext, buildStarshipFoodReplenishCostModeContext } from "../starship-replenish-cost-mode.mjs";
import {
	buildStarshipFoodBarContext,
	formatStarshipFoodCapacityTooltip,
	readStarshipFoodResourceSnapshot
} from "../starship-food.mjs";
import {
	buildStarshipFuelBarContext,
	formatStarshipWholeNumber
} from "../starship-number-format.mjs";
import {
	getCompendiumPack,
	STARSHIP_ABILITY_KEYS,
	STOCK_CARGO_TAB_ID
} from "../starship-sheet-ids.mjs";
import {
	getPersistedStarshipAbilityValue,
	resolveValidActorSizeKey
} from "../starship-sheet-preupdate.mjs";
import {
	buildStarshipSidebarVitalsContext,
	getStarshipLiveVehicleHp
} from "./starship-sheet-sidebar.mjs";

/**
 * dnd5e pack asset — used only for on-sheet display when art is missing or fails to load (not persisted to actors).
 * @see https://github.com/foundryvtt/dnd5e — `icons/svg/actors/vehicle.svg`
 */
const DND5E_VEHICLE_ACTOR_FALLBACK_PATH = "systems/dnd5e/icons/svg/actors/vehicle.svg";

export const STARSHIP_ROUTING_KEYS = ["none", "central", "engines", "shields", "weapons"];

/** User-facing routing selector options (legacy `central` omitted; stored values normalized on read). */
export const STARSHIP_ROUTING_KEYS_VISIBLE = ["none", "engines", "shields", "weapons"];

export const STARSHIP_POWER_DIE_OPTIONS = ["d4", "d6", "d8", "d10", "d12"];

export function getEffectivePowerRouting(routing) {
	return routing === "central" ? "none" : (routing ?? "none");
}

export function buildStarshipRoutingOptionLabel(value) {
	if ( value === "none" ) return localizeOrFallback("SW5E.PowerRoutingNone", "None");
	const optionKey = `SW5E.PowerRoutingOption.${value.charAt(0).toUpperCase()}${value.slice(1)}`;
	return localizeOrFallback(optionKey, value);
}

export function buildStarshipRoutingOptionTooltip(value) {
	const key = `SW5E.StarshipSheet.PowerRoutingTooltip.${value}`;
	const fallbacks = {
		none: "No power is being routed. Space speed and weapon damage use their base derived values.",
		engines: "Route power to engines. Space speed is doubled; other routed systems run at reduced capacity.",
		shields: "Route power to shields. Tracked only — no shield boost yet; engines and weapons still run at reduced capacity.",
		weapons: "Route power to weapons. Starship weapon damage is doubled; other routed systems run at reduced capacity."
	};
	return localizeOrFallback(key, fallbacks[value] ?? "");
}

export function buildStarshipRoutingSelectionEffect(routing) {
	const effective = getEffectivePowerRouting(routing);
	if ( effective === "engines" ) {
		return localizeOrFallback(
			"SW5E.StarshipSheet.PowerRoutingEffectEngines",
			"Enforced: space speed ×2. Weapons and shields run at reduced capacity."
		);
	}
	if ( effective === "weapons" ) {
		return localizeOrFallback(
			"SW5E.StarshipSheet.PowerRoutingEffectWeapons",
			"Enforced: starship weapon damage ×2. Engines and shields run at reduced capacity."
		);
	}
	if ( effective === "shields" ) {
		return localizeOrFallback(
			"SW5E.StarshipSheet.PowerRoutingEffectShields",
			"Tracked only: shield routing is stored but does not boost shields yet. Engines and weapons still run at reduced capacity."
		);
	}
	return localizeOrFallback(
		"SW5E.StarshipSheet.PowerRoutingEffectNone",
		"No routing boost is applied to space speed or weapon damage."
	);
}

export { buildStarshipFuelBarContext };

/**
 * Context for the Systems tab core configuration section: existing actor paths only, no invented values.
 * See getLegacyStarshipActorSystem / deriveStarshipPools / getDerivedStarshipRuntime in starship-data.mjs.
 */
export function buildSystemsCoreContext(actor, { runtime, costConfigEditable=false } = {}) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const resolvedRuntime = runtime ?? getDerivedStarshipRuntime(actor);
	const pools = deriveStarshipPools(actor);
	const hp = getStarshipLiveVehicleHp(actor);
	const fuel = legacySystem.attributes?.fuel ?? {};
	const power = legacySystem.attributes?.power ?? {};
	const movement = resolvedRuntime.movement ?? {};
	const units = movement.units ?? actor.system?.attributes?.movement?.units ?? "ft";
	const routing = power.routing ?? "none";
	const effectiveRouting = getEffectivePowerRouting(routing);
	const fuelValue = Number.isFinite(Number(fuel.value)) ? Number(fuel.value) : 0;
	const fuelCap = Number.isFinite(Number(fuel.fuelCap)) ? Number(fuel.fuelCap) : 0;
	const fuelBar = buildStarshipFuelBarContext(fuelValue, fuelCap);
	const tierRaw = legacySystem.details?.tier ?? pools.tier;
	const resolvedActorSize = resolveValidActorSizeKey(actor, legacySystem);
	const starshipUi = actor?.flags?.sw5e?.starship?.ui ?? {};
	const fuelReplenishCostMode = buildStarshipFuelReplenishCostModeContext(actor, {
		costConfigEditable
	});
	const foodSnap = readStarshipFoodResourceSnapshot(actor, legacySystem.attributes?.food ?? {});
	const foodBar = buildStarshipFoodBarContext(foodSnap.value, foodSnap.capacity.effectiveCapacity);
	const foodReplenishCostMode = buildStarshipFoodReplenishCostModeContext(actor, {
		costConfigEditable
	});
	const foodCapBaseEditable = costConfigEditable && foodSnap.overrideActive;
	const foodEffectiveDisplay = foodSnap.capacity.safeInteger
		? foodSnap.capacity.effectiveCapacity
		: null;

	return {
		turningSpeedDisplay: Number.isFinite(Number(movement.turn))
			? `${Math.round(Number(movement.turn))} ${units}`
			: "—",
		turningSpeedHint: localizeOrFallback(
			"SW5E.StarshipSheet.TurningDerivedHint",
			"Recalculated when the sheet updates (size item, pilot skills, abilities, power routing, and engine routing multiplier)."
		),
		spaceSpeedDisplay: Number.isFinite(Number(movement.space))
			? `${Math.round(Number(movement.space))} ${units}`
			: "—",
		routingOptions: STARSHIP_ROUTING_KEYS_VISIBLE.map(value => ({
			value,
			label: buildStarshipRoutingOptionLabel(value),
			tooltip: buildStarshipRoutingOptionTooltip(value),
			selected: effectiveRouting === value
		})),
		routingSelectionEffect: buildStarshipRoutingSelectionEffect(routing),
		sizeOptions: Object.entries(CONFIG.DND5E?.actorSizes ?? {}).map(([value, entry]) => ({
			value,
			label: typeof entry === "string" ? entry : (entry?.label ?? value),
			selected: resolvedActorSize === value
		})),
		tierValue: Number.isFinite(Number(tierRaw)) ? Number(tierRaw) : 0,
		hullPointsValue: Number.isFinite(Number(hp.value)) ? Number(hp.value) : 0,
		hullPointsMax: Number.isFinite(Number(hp.max)) ? Number(hp.max) : 0,
		shieldPointsTemp: Number.isFinite(Number(hp.temp)) ? Number(hp.temp) : 0,
		shieldPointsTempMax: Number.isFinite(Number(hp.tempmax)) ? Number(hp.tempmax) : 0,
		fuelValue,
		fuelCap,
		fuelCost: Number.isFinite(Number(fuel.cost)) ? Number(fuel.cost) : 0,
		fuelValueFormatted: fuelBar.fuelValueFormatted,
		fuelCapFormatted: fuelBar.fuelCapFormatted,
		fuelCostFormatted: formatStarshipWholeNumber(
			Number.isFinite(Number(fuel.cost)) ? Number(fuel.cost) : 0
		),
		fuelPct: fuelBar.fuelPct,
		fuelBarLabel: fuelBar.fuelBarLabel,
		fuelHasCap: fuelBar.fuelHasCap,
		fuelReplenishCostMode,
		food: {
			value: foodSnap.value,
			valueFormatted: formatStarshipWholeNumber(foodSnap.value),
			rawBase: foodSnap.rawSizeCap,
			customBase: foodSnap.customCap,
			selectedBase: foodSnap.capacity.selectedBase,
			sourceModifier: foodSnap.sourceModifier,
			preparedModifier: foodSnap.preparedModifier,
			effectiveCapacity: foodSnap.capacity.effectiveCapacity,
			effectiveDisplay: foodEffectiveDisplay,
			effectiveCapacityFormatted: foodSnap.capacity.safeInteger
				? formatStarshipWholeNumber(foodSnap.capacity.effectiveCapacity)
				: null,
			effectiveUnavailable: !foodSnap.capacity.safeInteger,
			unclampedEffectiveCapacity: foodSnap.capacity.unclampedEffectiveCapacity,
			safeInteger: foodSnap.capacity.safeInteger,
			capacityTooltip: formatStarshipFoodCapacityTooltip({
				selectedBase: foodSnap.capacity.selectedBase,
				preparedModifier: foodSnap.preparedModifier,
				effectiveCapacity: foodSnap.capacity.effectiveCapacity,
				safeInteger: foodSnap.capacity.safeInteger
			}),
			cost: foodSnap.cost,
			costFormatted: formatStarshipWholeNumber(foodSnap.cost),
			overrideActive: foodSnap.overrideActive,
			capBaseEditable: foodCapBaseEditable,
			outsideRaw: foodSnap.capacity.outsideRaw,
			tinyPositiveCustom: foodSnap.capacity.tinyPositiveCustom,
			pct: foodBar.foodPct,
			barLabel: foodBar.foodBarLabel,
			hasCap: foodBar.foodHasCap,
			replenishCostMode: foodReplenishCostMode,
			configureCapacityLabel: localizeOrFallback(
				"SW5E.StarshipSheet.ConfigureFoodCapacity",
				"Configure Food Capacity"
			),
			sourceLabel: foodSnap.overrideActive
				? localizeOrFallback("SW5E.StarshipSheet.FoodUseCustomCapacity", "Use Custom Capacity")
				: localizeOrFallback("SW5E.StarshipSheet.FoodUseSizeCapacity", "Use Size Capacity")
		},
		configSectionLede: localizeOrFallback(
			"SW5E.StarshipSheet.SystemsConfigSectionLede",
			"Tier, size, hull, shields, and dice pools are edited from the sidebar. Power routing and fuel are on the Core tab."
		),
		sectionOperationsKicker: localizeOrFallback("SW5E.StarshipSheet.SystemsSectionOperationsKicker", "Operations"),
		sectionSupportingKicker: localizeOrFallback("SW5E.StarshipSheet.SystemsSectionSupportingKicker", "Power state & kinematics"),
		systemsLivePlayBadge: localizeOrFallback("SW5E.StarshipSheet.SystemsLivePlayBadge", "Usable in Play mode"),
		systemsSupportingSetupHint: localizeOrFallback(
			"SW5E.StarshipSheet.SystemsSupportingSetupHint",
			"Fuel fields are maintenance/setup — switch the sheet to Edit mode to change them."
		),
		labels: {
			turningSpeed: localizeOrFallback("SW5E.TurnSpeed", "Turning speed"),
			spaceSpeed: localizeOrFallback("SW5E.SpeedSpace", "Space speed"),
			powerRouting: localizeOrFallback("SW5E.PowerRouting", "Power Routing"),
			hullCurrent: localizeOrFallback("SW5E.StarshipHullFieldCurrent", "Current hull points"),
			hullMax: localizeOrFallback("SW5E.StarshipHullFieldMax", "Maximum hull points"),
			shieldCurrent: localizeOrFallback("SW5E.StarshipShieldFieldCurrent", "Current shield points"),
			shieldMax: localizeOrFallback("SW5E.StarshipShieldFieldMax", "Maximum shield points"),
			fuel: localizeOrFallback("SW5E.Fuel", "Fuel"),
			fuelAndSupplies: localizeOrFallback("SW5E.StarshipSheet.ShipsStores", "Ship’s Stores"),
			shipsStores: localizeOrFallback("SW5E.StarshipSheet.ShipsStores", "Ship’s Stores"),
			shipsStoresConfigure: localizeOrFallback(
				"SW5E.StarshipSheet.ConfigureShipsStores",
				"Configure Ship’s Stores"
			),
			fuelCurrent: localizeOrFallback("SW5E.StarshipFuelFieldCurrent", "Current fuel"),
			fuelCap: localizeOrFallback("SW5E.FuelCap", "Fuel cap"),
			fuelCost: localizeOrFallback("SW5E.FuelCost", "Regeneration cost"),
			fuelCapacity: localizeOrFallback("SW5E.FuelCapacity", "Fuel capacity"),
			burnFuel: localizeOrFallback("SW5E.BurnFuel", "Burn"),
			refuel: localizeOrFallback("SW5E.Refuel", "Refuel"),
			burnFuelTooltip: localizeOrFallback("SW5E.StarshipSheet.BurnFuelTooltip", "Burn fuel"),
			refuelTooltip: localizeOrFallback("SW5E.StarshipSheet.RefuelTooltip", "Add fuel"),
			suppliesConsume: localizeOrFallback("SW5E.StarshipSheet.SuppliesConsume", "Consume"),
			suppliesRestock: localizeOrFallback("SW5E.StarshipSheet.SuppliesRestock", "Restock"),
			suppliesConsumeTooltip: localizeOrFallback(
				"SW5E.StarshipSheet.SuppliesConsumeTooltip",
				"Consume Fuel and/or Food from Ship’s Stores"
			),
			suppliesRestockTooltip: localizeOrFallback(
				"SW5E.StarshipSheet.SuppliesRestockTooltip",
				"Restock Fuel and/or Food in Ship’s Stores"
			),
			food: localizeOrFallback("SW5E.Food", "Food"),
			foodCurrent: localizeOrFallback("SW5E.StarshipSheet.FoodCurrent", "Current"),
			foodCapacity: localizeOrFallback("SW5E.StarshipSheet.FoodCapacity", "Capacity"),
			foodCapacityModifier: localizeOrFallback("SW5E.StarshipSheet.FoodCapacityModifier", "Capacity Modifier"),
			foodEffectiveCapacity: localizeOrFallback("SW5E.StarshipSheet.FoodEffectiveCapacity", "Effective Capacity"),
			foodRestockCost: localizeOrFallback("SW5E.StarshipSheet.FoodRestockCost", "Restock Cost"),
			derived: localizeOrFallback("SW5E.Derived", "Derived")
		},
		coreCollapse: {
			crew: starshipUi.crewCollapsed === true,
			routing: starshipUi.routingCollapsed === true,
			fuel: starshipUi.fuelCollapsed === true
		},
		coreCollapseLabels: {
			crew: {
				expand: localizeOrFallback("SW5E.StarshipSheet.CoreCrewExpand", "Expand Flight Manifest"),
				collapse: localizeOrFallback("SW5E.StarshipSheet.CoreCrewCollapse", "Collapse Flight Manifest")
			},
			routing: {
				expand: localizeOrFallback("SW5E.StarshipSheet.CoreRoutingExpand", "Expand Power Routing"),
				collapse: localizeOrFallback("SW5E.StarshipSheet.CoreRoutingCollapse", "Collapse Power Routing")
			},
			fuel: {
				expand: localizeOrFallback("SW5E.StarshipSheet.CoreFuelExpand", "Expand Ship’s Stores"),
				collapse: localizeOrFallback("SW5E.StarshipSheet.CoreFuelCollapse", "Collapse Ship’s Stores")
			}
		},
		advancedPower: (() => {
			const powerCtx = getStarshipAdvancedPowerContext(actor);
			const recovery = getStarshipPowerRecoverySummary(actor);
			return {
				...powerCtx,
				canRecover: recovery.canRecover,
				title: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerTitle", "Power Die Allocation"),
				panelAria: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerPanelAria", "Power die allocation"),
				dieLabel: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerDieLabel", "Power die"),
				currentLabel: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerCurrent", "Current"),
				maxLabel: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerMax", "Max"),
				spendLabel: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerSpend", "Roll"),
				spendTooltip: localizeOrFallback(
					"SW5E.StarshipSheet.AdvancedPowerSpendTooltip",
					"Spend 1 die from this pool and roll the ship power die"
				),
				recoverLabel: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerRecover", "Recover Power"),
				recoverTooltip: localizeOrFallback(
					"SW5E.StarshipSheet.AdvancedPowerRecoverTooltip",
					"Recover power dice using the equipped reactor formula, or manual recovery when no formula is available"
				),
				setupHint: localizeOrFallback(
					"SW5E.StarshipSheet.AdvancedPowerSetupHint",
					"Pool sizes and die type are setup fields — switch the sheet to Edit mode to change them. Roll spends dice during play."
				),
				recoveryNote: localizeOrFallback(
					"SW5E.StarshipSheet.AdvancedPowerRecoveryNote",
					"Recover Power refills pools using reactor recovery when available, otherwise manual recovery. Subsystem allocation follows legacy SW5e rules."
				),
				expandTooltip: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerExpand", "Expand Power Die Allocation"),
				collapseTooltip: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerCollapse", "Collapse Power Die Allocation"),
				dieOptions: STARSHIP_POWER_DIE_OPTIONS.map(value => ({
					value,
					selected: (powerCtx.die ?? "d8") === value
				}))
			};
		})()
	};
}


export function formatSignedSkillMod(value) {
	const n = Number(value);
	if ( !Number.isFinite(n) ) return "+0";
	return n >= 0 ? `+${n}` : `${n}`;
}

export function getStarshipProficiencyIcon(level) {
	const meta = getStarshipProficiencyIconMeta(level);
	if ( meta.iconFa ) return `<i class="${meta.iconFa}"></i>`;
	if ( meta.iconCustom ) return `<span class="sw5e-starship-skill-prof-custom">${meta.iconCustom}</span>`;
	return "";
}

/**
 * Escaped / class-based proficiency glyph for templates (Phase 10C).
 * Prefer this over {@link getStarshipProficiencyIcon} HTML strings.
 * @param {number|string} level
 * @returns {{ iconFa: string, iconCustom: string }}
 */
export function getStarshipProficiencyIconMeta(level) {
	const n = Number(level);
	if ( !Number.isFinite(n) || n <= 0 ) return { iconFa: "", iconCustom: "" };
	if ( n === 1 ) return { iconFa: "fas fa-check", iconCustom: "" };
	if ( n === 2 ) return { iconFa: "fas fa-check-double", iconCustom: "" };
	return { iconFa: "", iconCustom: String(n) };
}

export function getStarshipSkillProficiencyClass(level) {
	const n = Number(level);
	if ( !Number.isFinite(n) || n <= 0 ) return "";
	if ( n === 1 ) return " proficient";
	if ( n === 2 ) return " expert proficient";
	return " custom proficient";
}

/** Resolve a short ability abbreviation for starship skill rows (mirrors Core sheet labeling). */
export function resolveStarshipSkillAbilityAbbreviation(entry) {
	const abil = CONFIG?.DND5E?.abilities?.[entry.ability];
	let abilityAbbr = entry.ability?.toUpperCase?.() ?? "";
	if ( abil?.abbreviation ) {
		const loc = game.i18n.localize(abil.abbreviation);
		abilityAbbr = loc && loc !== abil.abbreviation ? loc : abilityAbbr;
	}
	return abilityAbbr;
}

/**
 * Presentation fields for the Overview skills list (ability abbreviation, signed modifier, passive total).
 * Passive uses {@link CONFIG.DND5E.skillPassive} base (default 10) + prepared skill modifier, matching core 5e passive notation.
 */
export function enrichStarshipSkillsForSheet(actor) {
	const passiveCfg = CONFIG?.DND5E?.skillPassive;
	const passiveBase = Number.isFinite(Number(passiveCfg?.base)) ? Number(passiveCfg.base) : 10;
	return getStarshipSkillDisplayEntries(actor, game.user).map(entry => {
		const abilityAbbr = resolveStarshipSkillAbilityAbbreviation(entry);
		const passiveTotal = passiveBase + Number(entry.effectiveTotal);
		const tierLabel = formatStarshipSkillTierOptionLabel(entry.proficiencyMode);
		const modDisplay = formatSignedSkillMod(entry.effectiveTotal);
		const passiveDisplay = Number.isFinite(passiveTotal) ? String(passiveTotal) : "";
		return {
			...entry,
			value: entry.proficiencyMode,
			baseValue: entry.proficiencyMode,
			...getStarshipProficiencyIconMeta(entry.proficiencyMode),
			proficiencyClass: getStarshipSkillProficiencyClass(entry.proficiencyMode),
			abilityAbbr,
			abbreviation: abilityAbbr,
			tierLabel,
			modDisplay,
			passiveDisplay
		};
	});
}

/**
 * Render a dnd5e ApplicationV2 config sheet when possible (no console noise on failure).
 */
export async function renderDnd5eConfigApp(app) {
	if ( !app || typeof app.render !== "function" ) return false;
	try {
		const r = app.render({ force: true });
		if ( r && typeof r.then === "function" ) await r;
		return true;
	} catch {
		/* ApplicationV2 may throw during prepare when actor schema lacks expected fields (e.g. vehicles). */
	}
	try {
		const r2 = app.render(true);
		if ( r2 && typeof r2.then === "function" ) await r2;
		return true;
	} catch {
		return false;
	}
}

export function actorSchemaHasSkillsField(actor) {
	try {
		return Boolean(actor?.system?.schema?.getField?.("skills"));
	} catch {
		return false;
	}
}

export function formatStarshipSkillTierOptionLabel(value) {
	switch ( value ) {
		case 0:
			return localizeOrFallback("SW5E.Starship.SkillTier.NotProficient", "Not proficient");
		case 1:
			return localizeOrFallback("SW5E.Starship.SkillTier.ProficientlyEquipped", "Proficiently equipped");
		case 2:
			return localizeOrFallback("SW5E.Starship.SkillTier.ExpertlyEquipped", "Expertly equipped");
		default: {
			const localized = game.i18n.format("SW5E.Starship.SkillTier.Custom", { value });
			return localized === "SW5E.Starship.SkillTier.Custom" ? `Custom (${value})` : localized;
		}
	}
}

/**
 * Minimal per-skill editor for SW5E starship skills on vehicle actors.
 * dnd5e 5.2.x {@link SkillToolConfig} resolves labels from `CONFIG.DND5E.skills[key]` only; starship keys live in
 * `CONFIG.DND5E.starshipSkills`. {@link SkillsConfig} prepares trait data via `system.skills` schema fields that
 * vehicle actors typically do not define. This dialog edits ability override, ship check bonus, and the manual
 * starship skill proficiency tier stored on the vehicle actor. Rolls still use crew proficiency on `rollStarshipSkill`;
 * this dialog only controls the existing per-skill multiplier state.
 */
export async function openStarshipSkillInlineConfigDialog(actor, skillId) {
	const entry = getStarshipSkillEntries(actor).find(s => s.id === skillId);
	if ( !entry ) return;

	const legacy = getLegacyStarshipActorSystem(actor);
	const raw = legacy.skills?.[skillId] ?? {};
	const abilityVal = typeof raw.ability === "string" && raw.ability ? raw.ability : entry.ability;
	const bonusVal = typeof raw.bonuses?.check === "string" ? raw.bonuses.check : "";
	const rawTierNumber = Number(raw?.value);
	const tierVal = Number.isFinite(rawTierNumber) ? rawTierNumber : 0;
	const tierOptions = [0, 1, 2];
	if ( !tierOptions.includes(tierVal) ) tierOptions.push(tierVal);

	const abilOptions = Object.entries(CONFIG?.DND5E?.abilities ?? {}).map(([key, cfg]) => {
		const lab = typeof cfg?.label === "string" ? game.i18n.localize(cfg.label) : key;
		return `<option value="${escapeHtml(key)}"${key === abilityVal ? " selected" : ""}>${escapeHtml(lab)}</option>`;
	}).join("");
	const tierOptionsHtml = tierOptions.map(value =>
		`<option value="${escapeHtml(String(value))}"${value === tierVal ? " selected" : ""}>${escapeHtml(formatStarshipSkillTierOptionLabel(value))}</option>`
	).join("");

	const bonusLabel = game.i18n.localize("DND5E.CheckBonus");
	const tierLabel = localizeOrFallback("SW5E.Starship.SkillTier.Label", "Skill tier");
	const tierHint = localizeOrFallback(
		"SW5E.Starship.SkillTier.Hint",
		"Controls whether crew proficiency bonus contributes to this starship skill roll."
	);
	const content = `
<div class="standard-form sw5e-starship-skill-inline-config">
  <div class="form-group">
    <label>${escapeHtml(localizeOrFallback("DND5E.Ability", "Ability"))}</label>
    <select name="sw5e-starship-skill-ability">${abilOptions}</select>
  </div>
  <div class="form-group">
    <label>${escapeHtml(tierLabel)}</label>
    <select name="sw5e-starship-skill-tier">${tierOptionsHtml}</select>
    <p class="hint">${escapeHtml(tierHint)}</p>
  </div>
  <div class="form-group">
    <label>${escapeHtml(bonusLabel)}</label>
    <input type="text" name="sw5e-starship-skill-bonus" value="${escapeHtml(bonusVal)}" autocomplete="off" />
  </div>
</div>`;

	const title = `${localizeOrFallback("SW5E.SkillConfigure", "Configure skill")}: ${entry.label}`;

	await foundry.applications.api.DialogV2.wait({
		window: { title },
		content,
		position: { width: 400 },
		buttons: [
			{
				action: "save",
				label: game.i18n.localize("Save"),
				icon: "fas fa-check",
				default: true
			},
			{
				action: "cancel",
				label: game.i18n.localize("Cancel"),
				icon: "fas fa-times"
			}
		],
		// DialogV2 `submit` is `(result, dialog)` — the clicked button’s `action` (or callback return), not `(event, dialog, button)`.
		submit: async (result, dialog) => {
			if ( result !== "save" ) return;

			const form = dialog.form ?? dialog.element?.querySelector?.("form");
			if ( !form ) return;

			const fd = new FormData(form);
			const abilRaw = fd.get("sw5e-starship-skill-ability");
			const tierRaw = fd.get("sw5e-starship-skill-tier");
			const bonusRaw = fd.get("sw5e-starship-skill-bonus") ?? "";

			const abilStr = typeof abilRaw === "string" ? abilRaw : "";
			const abilKeys = Object.keys(CONFIG?.DND5E?.abilities ?? {});
			const abilFinal = abilStr && abilKeys.includes(abilStr) ? abilStr : abilityVal;
			const tierStr = typeof tierRaw === "string" ? tierRaw.trim() : "";
			const tierNumber = Number(tierStr);
			const tierFinal = Number.isFinite(tierNumber) ? tierNumber : tierVal;

			const bonusStr = String(bonusRaw).trim();

			try {
				// Authoritative store for starship vehicle actors is `flags.sw5e.legacyStarshipActor.system.skills`
				// (same snapshot `normalizeLegacyStarshipActorData` maintains). `system.skills` is mirrored when the
				// system accepts it so exports / tooling stay aligned; vehicle data models may drop unknown skill paths.
				const updateData = {
					[`flags.sw5e.legacyStarshipActor.system.skills.${skillId}.ability`]: abilFinal,
					[`flags.sw5e.legacyStarshipActor.system.skills.${skillId}.bonuses.check`]: bonusStr,
					[`system.skills.${skillId}.ability`]: abilFinal,
					[`system.skills.${skillId}.bonuses.check`]: bonusStr
				};
				if ( tierFinal !== tierVal ) {
					updateData[`flags.sw5e.legacyStarshipActor.system.skills.${skillId}.value`] = tierFinal;
					updateData[`system.skills.${skillId}.value`] = tierFinal;
				}
				await actor.update(updateData);
			} catch ( err ) {
				ui.notifications?.error(localizeOrFallback(
					"SW5E.StarshipSheet.SkillConfigUpdateFailed",
					"Could not save skill changes. Check console for details."
				));
				console.error("SW5E MODULE | Starship skill inline config update failed.", err);
			}
		}
	});
}

/**
 * Starship skill cog: use core dialogs only when they match this actor's schema and skill key; otherwise inline config.
 */
/**
 * Starship ability cog: stock dnd5e AbilityConfig when the actor schema supports it.
 */
export async function openStarshipAbilityConfiguration(actor, abilityKey) {
	if ( !abilityKey ) return;
	const AbilityConfig = globalThis.dnd5e?.applications?.actor?.AbilityConfig;
	if ( AbilityConfig ) {
		try {
			const inst = new AbilityConfig({ document: actor, key: abilityKey });
			if ( await renderDnd5eConfigApp(inst) ) return;
		} catch {
			/* prepare/render failure */
		}
	}
	ui.notifications?.warn(localizeOrFallback(
		"SW5E.StarshipSheet.AbilityConfigOpenFailed",
		"Could not open ability configuration for this starship."
	));
}

export async function openStarshipSkillConfiguration(actor, skillId) {
	const apps = globalThis.dnd5e?.applications?.actor ?? globalThis.game?.dnd5e?.applications?.actor;

	const coreSkillDef = CONFIG?.DND5E?.skills?.[skillId];
	const SkillToolConfig = apps?.SkillToolConfig;
	if ( SkillToolConfig && coreSkillDef ) {
		try {
			const inst = new SkillToolConfig({ document: actor, trait: "skills", key: skillId });
			if ( await renderDnd5eConfigApp(inst) ) return;
		} catch {
			/* prepare/render failure — fall through */
		}
	}

	const SkillsConfig = apps?.SkillsConfig;
	if ( SkillsConfig && actorSchemaHasSkillsField(actor) ) {
		try {
			const inst = new SkillsConfig({ document: actor });
			if ( await renderDnd5eConfigApp(inst) ) {
				ui.notifications?.info(localizeOrFallback(
					"SW5E.StarshipSheet.SkillsConfigOpened",
					"Opened the actor’s skills configuration."
				));
				return;
			}
		} catch {
			/* vehicle / schema mismatch */
		}
	}

	await openStarshipSkillInlineConfigDialog(actor, skillId);
}



export function getFoundryResolvedAssetUrl(relativePath) {
	if ( typeof relativePath !== "string" || !relativePath ) return "";
	// Absolute URLs (user / compendium art): never run through getRoute.
	if ( /^https?:\/\//i.test(relativePath) ) return relativePath;
	if ( typeof foundry?.utils?.getRoute === "function" ) {
		try {
			return foundry.utils.getRoute(relativePath);
		} catch {
			/* fall through */
		}
	}
	const p = relativePath.replace(/^\/+/, "");
	if ( typeof globalThis.RoutePrefix === "string" && globalThis.RoutePrefix && globalThis.RoutePrefix !== "/" )
		return `${globalThis.RoutePrefix.replace(/\/$/, "")}/${p}`;
	return `/${p}`;
}

export function getStarshipSheetFallbackImageUrl() {
	return getFoundryResolvedAssetUrl(DND5E_VEHICLE_ACTOR_FALLBACK_PATH);
}

/**
 * Sheet template `src` only — never written to actor/item data.
 * Uses sanitized path when present; generic vehicle SVG only when art is missing/placeholder after sanitization.
 * `bindStarshipSheetImageFallbacks` swaps to the same SVG on actual load error (e.g. 404 / TLS).
 */
export function resolveStarshipSheetImageUrl(raw) {
	const cleaned = sanitizeImagePath(raw);
	if ( cleaned ) return getFoundryResolvedAssetUrl(cleaned);
	return getStarshipSheetFallbackImageUrl();
}

export function bindStarshipSheetImageFallbacks(root) {
	if ( !(root instanceof HTMLElement) ) return;
	const fb = getStarshipSheetFallbackImageUrl();
	if ( !fb ) return;
	root.querySelectorAll("img.sw5e-starship-portrait-image, img.sw5e-starship-item-image").forEach(img => {
		if ( img.dataset.sw5eImgFallbackBound === "1" ) return;
		img.dataset.sw5eImgFallbackBound = "1";
		img.addEventListener("error", function onStarshipImageError() {
			img.removeEventListener("error", onStarshipImageError);
			if ( img.dataset.sw5eImgFallbackApplied === "1" ) return;
			img.dataset.sw5eImgFallbackApplied = "1";
			img.src = fb;
		});
	});
}



export function normalizeSourceLabel(source) {
	if ( typeof source === "string" ) return source && source !== "[object Object]" ? source : "";
	if ( source && typeof source === "object" ) return source.custom ?? source.book ?? source.label ?? "";
	return "";
}

export function sanitizeImagePath(value) {
	if ( typeof value !== "string" ) return "";
	const normalized = value.trim();
	if ( !normalized ) return "";
	const lower = normalized.toLowerCase();
	// Placeholder / invalid only — do not block specific hosts; rely on `error` fallback for broken loads.
	if ( ["undefined", "null", "nan"].includes(lower) ) return "";

	// Display-only allowlist: relative Foundry paths, http(s), and data:image/*.
	const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(normalized);
	if ( schemeMatch ) {
		const scheme = schemeMatch[1].toLowerCase();
		if ( scheme === "http" || scheme === "https" ) return normalized;
		if ( scheme === "data" && /^data:image\//i.test(normalized) ) return normalized;
		return "";
	}
	return normalized;
}

export function formatPool(current, max) {
	const currentValue = Number.isFinite(Number(current)) ? Number(current) : null;
	const maxValue = Number.isFinite(Number(max)) ? Number(max) : null;
	if ( currentValue == null && maxValue == null ) return "-";
	if ( maxValue == null ) return `${currentValue ?? 0}`;
	return `${currentValue ?? 0} / ${maxValue}`;
}


export function formatMovement(actor, legacySystem, runtime = null) {
	const derivedMovement = (runtime ?? getDerivedStarshipRuntime(actor)).movement;
	const units = derivedMovement.units || actor.system?.attributes?.movement?.units || "ft";
	const space = Number.isFinite(Number(derivedMovement.space)) ? Number(derivedMovement.space) : null;
	const turn = Number.isFinite(Number(derivedMovement.turn)) ? Number(derivedMovement.turn) : null;
	if ( space != null || turn != null ) {
		const notes = [];
		if ( turn != null ) notes.push(`Turn ${turn}`);
		if ( derivedMovement.profileSource ) notes.push(derivedMovement.profileSource);
		return {
			primary: `${space ?? 0} ${units}`,
			secondary: notes.join(" | ")
		};
	}

	const spaceSpeed = Number.isFinite(Number(actor.system?.attributes?.movement?.speeds?.space))
		? Number(actor.system.attributes.movement.speeds.space)
		: null;
	return {
		primary: spaceSpeed != null ? `${spaceSpeed} ${units}` : "-",
		secondary: ""
	};
}

export function localizeTravelPace(pace) {
	const normalized = String(pace ?? "").trim().toLowerCase();
	if ( normalized === "fast" ) return localizeOrFallback("DND5E.TravelPaceFast", "Fast");
	if ( normalized === "slow" ) return localizeOrFallback("DND5E.TravelPaceSlow", "Slow");
	return localizeOrFallback("DND5E.TravelPaceNormal", "Normal");
}



export function formatTravel(actor, runtime = null) {
	const travel = (runtime ?? getDerivedStarshipRuntime(actor)).travel;
	return {
		primary: localizeTravelPace(travel?.pace),
		secondary: `Stealth ${localizeTravelPace(travel?.stealthPace)}`
	};
}

export function formatHyperdrive(actor, runtime = null) {
	const hyperdriveClass = Number((runtime ?? getDerivedStarshipRuntime(actor)).travel?.hyperdriveClass ?? 0);
	return hyperdriveClass > 0 ? `Class ${hyperdriveClass}` : localizeOrFallback("SW5E.None", "None");
}

export function formatPowerSummary(legacySystem) {
	const power = legacySystem.attributes?.power ?? {};
	const central = Number.isFinite(Number(power.central?.value)) ? Number(power.central.value) : 0;
	const engines = Number.isFinite(Number(power.engines?.value)) ? Number(power.engines.value) : 0;
	const shields = Number.isFinite(Number(power.shields?.value)) ? Number(power.shields.value) : 0;
	const weapons = Number.isFinite(Number(power.weapons?.value)) ? Number(power.weapons.value) : 0;
	return `C ${central} | E ${engines} | S ${shields} | W ${weapons}`;
}

export function getSizeLabel(actor, legacySystem) {
	const sizeKey = actor.system?.traits?.size ?? legacySystem.traits?.size ?? "";
	const entry = CONFIG.DND5E.actorSizes?.[sizeKey];
	return (typeof entry === "string" ? entry : entry?.label) ?? sizeKey ?? "-";
}

export function getDeploymentCounts(legacySystem) {
	const deployment = legacySystem.attributes?.deployment ?? {};
	const crew = Array.isArray(deployment.crew?.items) ? deployment.crew.items : Array.isArray(deployment.crew) ? deployment.crew : [];
	const passenger = Array.isArray(deployment.passenger?.items) ? deployment.passenger.items : Array.isArray(deployment.passenger) ? deployment.passenger : [];
	const rawPilot = deployment.pilot?.value ?? deployment.pilot ?? "";
	return {
		pilot: typeof rawPilot === "string" ? rawPilot : "",
		crew: crew.length,
		passenger: passenger.length
	};
}

export function makeOverviewCards(actor, { runtime } = {}) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const resolvedRuntime = runtime ?? getDerivedStarshipRuntime(actor);
	const pools = deriveStarshipPools(actor);
	const movement = formatMovement(actor, legacySystem, resolvedRuntime);
	const deployment = {
		...getDeploymentCounts(legacySystem),
		...resolvedRuntime.crew
	};
	const travel = formatTravel(actor, resolvedRuntime);
	const fuel = legacySystem.attributes?.fuel ?? {};
	const routing = legacySystem.attributes?.power?.routing ?? "none";
	const effectiveRouting = getEffectivePowerRouting(routing);

	return [
		{
			label: localizeOrFallback("SW5E.Movement", "Movement"),
			value: movement.primary,
			note: movement.secondary || localizeOrFallback("SW5E.MovementSpace", "Space")
		},
		{
			label: localizeOrFallback("DND5E.TravelPace", "Travel Pace"),
			value: travel.primary,
			note: travel.secondary
		},
		{
			label: localizeOrFallback("SW5E.Hyperdrive", "Hyperdrive"),
			value: formatHyperdrive(actor, resolvedRuntime),
			note: resolvedRuntime.travel?.hyperdriveClass ? localizeOrFallback("SW5E.Hyperspace", "Hyperspace") : localizeOrFallback("SW5E.None", "Not Installed")
		},
		{
			label: localizeOrFallback("SW5E.VehicleCrew", "Crew"),
			value: `${deployment.crewCount ?? deployment.crew ?? 0}`,
			note: deployment.pilotName || deployment.pilot ? `Pilot: ${deployment.pilotName || deployment.pilot}` : "No pilot assigned"
		},
		{
			label: localizeOrFallback("SW5E.Fuel", "Fuel"),
			value: formatPool(fuel.value, fuel.fuelCap),
			note: fuel.cost ? `Cost ${fuel.cost}` : localizeOrFallback("SW5E.PowerDie", "Power")
		},
		{
			label: localizeOrFallback("SW5E.PowerDie", "Routing"),
			value: buildStarshipRoutingOptionLabel(effectiveRouting),
			note: pools.power.die ? `${pools.power.die} | ${formatPowerZones(legacySystem, pools)}` : formatPowerSummary(legacySystem)
		}
	];
}

export function makeStarshipSummaryStripVitals(actor) {
	const vitals = buildStarshipSidebarVitalsContext(actor);
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const pools = deriveStarshipPools(actor);
	const tier = legacySystem.details?.tier ?? pools.tier;
	return [
		{
			label: localizeOrFallback("SW5E.StarshipTier", "Tier"),
			value: Number.isFinite(Number(tier)) ? `${tier}` : "-"
		},
		{
			label: localizeOrFallback("SW5E.HullPoints", "Hull Points"),
			value: `${vitals.hull.value}/${vitals.hull.max}`
		},
		{
			label: localizeOrFallback("SW5E.ShieldPoints", "Shield Points"),
			value: `${vitals.shield.value}/${vitals.shield.max}`
		},
		{
			label: localizeOrFallback("SW5E.HullDice", "Hull Dice"),
			value: formatDicePool(vitals.hullDice.current, vitals.hullDice.max, vitals.hullDice.die)
		},
		{
			label: localizeOrFallback("SW5E.ShieldDice", "Shield Dice"),
			value: formatDicePool(vitals.shieldDice.current, vitals.shieldDice.max, vitals.shieldDice.die)
		}
	];
}

/**
 * At-a-glance strip: sidebar summary rows plus the first four operational cards
 * (Movement, Travel Pace, Hyperdrive, Crew). Fuel and power routing live on Core only.
 */
export function makeStarshipSummaryStrip(actor, { runtime } = {}) {
	const operational = makeOverviewCards(actor, { runtime });
	return [
		...makeStarshipSummaryStripVitals(actor),
		...makeSidebarSummary(actor, { includeTier: false, runtime }),
		...operational.slice(0, 4)
	];
}

export function formatDicePool(current, max, die) {
	if ( !max && !die ) return "-";
	const pool = max > 0 ? `${current}/${max}` : "-";
	return die ? `${pool} ${die}` : pool;
}


export function formatPowerZones(legacySystem, pools) {
	const power = legacySystem.attributes?.power ?? {};
	const zones = [
		{ key: "central", label: "C", max: pools.power.cscap },
		{ key: "engines", label: "E", max: pools.power.sscap },
		{ key: "shields", label: "S", max: pools.power.sscap },
		{ key: "weapons", label: "W", max: pools.power.sscap }
	];
	return zones.map(({ key, label, max }) => {
		const current = Number.isFinite(Number(power[key]?.value)) ? Number(power[key].value) : 0;
		return `${label}:${current}/${max}`;
	}).join(" ");
}

export function makeSidebarSummary(actor, { includeTier = false, runtime } = {}) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const pools = deriveStarshipPools(actor);
	const resolvedRuntime = runtime ?? null;

	const rows = [];
	if ( includeTier ) {
		rows.push({
			label: localizeOrFallback("SW5E.StarshipTier", "Tier"),
			value: (() => {
				const t = legacySystem.details?.tier ?? pools.tier;
				return Number.isFinite(Number(t)) ? `${t}` : "-";
			})(),
			note: null,
			sidebarTier: true,
			sidebarSize: false,
			sidebarShowValueOnly: false
		});
	}
	rows.push(
		{
			label: localizeOrFallback("SW5E.Size", "Size"),
			value: getSizeLabel(actor, legacySystem),
			note: formatHyperdrive(actor, resolvedRuntime),
			sidebarTier: false,
			sidebarSize: true,
			sidebarShowValueOnly: false
		}
	);

	return rows.map(entry => ({
		...entry,
		sidebarShowValueOnly: Boolean(entry.sidebarShowValueOnly)
	}));
}

export function getItemMeta(item, actor = null, runtime = null) {
	if ( item.flags?.sw5e?.legacyStarshipSize || item.flags?.sw5e?.starshipCharacter?.role === "classification" ) {
		return localizeOrFallback("SW5E.StarshipTier", "Size Profile");
	}

	if ( item.flags?.sw5e?.legacyStarshipMod || item.flags?.sw5e?.starshipCharacter?.role === "modification" ) {
		return item.system?.type?.subtype ?? "Modification";
	}

	if ( item.system?.type?.subtype ) return game.i18n.localize(item.system.type.subtype);
	const pack = getCompendiumPack(item);
	if ( actor && item.type === "weapon" ) {
		const routingMultiplier = (runtime ?? getDerivedStarshipRuntime(actor)).routing?.weaponsMultiplier ?? 1;
		if ( routingMultiplier === 2 ) return localizeOrFallback("SW5E.PowerRoutingWeaponsPositive", "Weapons deal double damage");
		if ( routingMultiplier === 0.5 ) return localizeOrFallback("SW5E.PowerRoutingWeaponsNegative", "Ship weapon damage is reduced by half");
	}
	return pack ? pack.replace(/-/g, " ") : "";
}

export function getItemSystemData(item) {
	return item?.system ?? item?._source?.system ?? {};
}

export function formatSheetNumber(value, maximumFractionDigits = 2) {
	const numeric = Number(value);
	if ( !Number.isFinite(numeric) ) return "";
	return game?.dnd5e?.utils?.formatNumber?.(numeric, {
		minimumFractionDigits: 0,
		maximumFractionDigits
	}) ?? String(numeric);
}

export function getItemWeightLabel(item) {
	const weight = getItemSystemData(item)?.weight ?? {};
	const rawValue = typeof weight === "object" ? weight.value : weight;
	const value = Number(rawValue);
	if ( !Number.isFinite(value) ) return "";
	const units = typeof weight === "object" ? weight.units : "";
	return [formatSheetNumber(value), units].filter(Boolean).join(" ").trim();
}

export function getItemPriceLabel(item) {
	const price = getItemSystemData(item)?.price ?? {};
	const rawValue = typeof price === "object" ? price.value : price;
	const value = Number(rawValue);
	if ( !Number.isFinite(value) ) return "";

	const denomKey = normalizeSwPriceDenomination(typeof price === "object" ? price.denomination : undefined, { fallbackToBase: false });
	const currencyConfig = CONFIG.DND5E.currencies?.[denomKey];
	const abbrKey = currencyConfig?.abbreviation;
	const abbr = abbrKey ? game.i18n.localize(abbrKey) : (typeof denomKey === "string" ? denomKey.toUpperCase() : "");
	return [formatSheetNumber(value), abbr].filter(Boolean).join(" ").trim();
}

export function makeItemEntry(item, defaultTab = STOCK_CARGO_TAB_ID, actor = null, {
	sotgPanel = null,
	meta = null,
	sourceActorUuid = null,
	allowDelete = true,
	supportsSheetNavigation = undefined
} = {}) {
	return {
		id: item.id,
		name: item.name,
		meta: meta ?? getItemMeta(item, actor),
		img: resolveStarshipSheetImageUrl(item.img),
		defaultTab,
		sotgPanel,
		sourceActorUuid: sourceActorUuid || null,
		allowDelete: allowDelete !== false,
		supportsSheetNavigation,
		weightLabel: getItemWeightLabel(item),
		priceLabel: getItemPriceLabel(item)
	};
}

export function getLegacyNotes(actor, { runtime } = {}) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const resolvedRuntime = runtime ?? getDerivedStarshipRuntime(actor);
	const notes = [];
	if ( legacySystem.attributes?.power?.routing ) notes.push(`Routing: ${legacySystem.attributes.power.routing}`);
	if ( legacySystem.attributes?.systemDamage ) notes.push(`System Damage ${legacySystem.attributes.systemDamage}`);
	if ( resolvedRuntime.travel?.hyperdriveClass ) notes.push(`Hyperdrive Class ${resolvedRuntime.travel.hyperdriveClass}`);
	if ( resolvedRuntime.movement?.enginesMultiplier === 2 ) notes.push(localizeOrFallback("SW5E.PowerRoutingEnginesPositive", "The ship's flying speed is doubled"));
	else if ( resolvedRuntime.movement?.enginesMultiplier === 0.5 ) notes.push(localizeOrFallback("SW5E.PowerRoutingEnginesNegative", "The ship's flying speed is reduced by half"));
	return notes;
}

export function makeHeaderBadges(actor, { runtime } = {}) {
	const resolvedRuntime = runtime ?? getDerivedStarshipRuntime(actor);
	const deployment = {
		...getDeploymentCounts(getLegacyStarshipActorSystem(actor)),
		...resolvedRuntime.crew
	};
	return [
		getSizeLabel(actor, getLegacyStarshipActorSystem(actor)),
		`${deployment.crewCount ?? deployment.crew ?? 0} Crew`,
		`${deployment.passengerCount ?? deployment.passenger ?? 0} Passengers`
	];
}

export function buildOverviewAbilitiesContext(actor, editable = false) {
	const configured = CONFIG?.DND5E?.abilities ?? CONFIG?.SW5E?.abilities ?? {};
	const liveAbilities = actor?.system?.abilities ?? {};
	const preferredOrder = STARSHIP_ABILITY_KEYS;
	const keys = preferredOrder.filter(key => key in configured)
		.concat(Object.keys(configured).filter(key => !preferredOrder.includes(key)));

	const buildEntry = key => {
		const cfg = configured[key] ?? {};
		const live = liveAbilities[key] ?? {};
		const liveValue = Number(live?.value);
		const sourceValue = getPersistedStarshipAbilityValue(actor, key);
		const value = Number.isFinite(liveValue) ? liveValue : sourceValue;
		const currentMod = Number(live?.mod);
		const mod = Number.isFinite(currentMod) ? currentMod : Math.floor((value - 10) / 2);
		// Bug 29C: display uses shared save parts (mod + deterministic bonus + Pilot PB once).
		// Never combine stock prepared `save.value` with Pilot PB.
		let saveValue = mod;
		if ( isStarshipFlagVehicle(actor) ) {
			saveValue = buildStarshipSaveModifierParts(actor, key).displayTotal;
		} else {
			const savePrepared = live?.save;
			saveValue = Number(savePrepared?.value ?? savePrepared);
			if ( !Number.isFinite(saveValue) ) saveValue = mod;
		}
		const proficient = Number.isFinite(Number(live?.proficient)) ? Number(live.proficient) : 0;
		const abbrKey = typeof cfg.abbreviation === "string" ? cfg.abbreviation : "";
		const abbrLocalized = abbrKey ? game.i18n.localize(abbrKey) : "";
		const abbrResolved = abbrKey.includes(".")
			? (abbrLocalized && abbrLocalized !== abbrKey ? abbrLocalized : key.toUpperCase())
			: (abbrKey || key.toUpperCase());
		const labelKey = typeof cfg.label === "string" ? cfg.label : "";
		const labelLocalized = labelKey ? game.i18n.localize(labelKey) : "";
		const labelResolved = labelKey.includes(".")
			? (labelLocalized && labelLocalized !== labelKey ? labelLocalized : key.toUpperCase())
			: (labelKey || key.toUpperCase());
		const configureLabel = game.i18n.format("DND5E.AbilityConfigure", { ability: labelResolved });
		const saveRollTitle = game.i18n.format("DND5E.SavePromptTitle", { ability: labelResolved });
		const saveRollTooltip = saveRollTitle && saveRollTitle !== "DND5E.SavePromptTitle"
			? `Roll ${saveRollTitle}`
			: `Roll ${labelResolved} Saving Throw`;
		return {
			key,
			abbr: abbrResolved,
			abbrLower: abbrResolved.toLowerCase(),
			label: labelResolved,
			value,
			mod,
			modSign: mod > 0 ? "+" : mod < 0 ? "-" : "",
			modAbs: Math.abs(mod),
			save: saveValue,
			sourceValue,
			proficient,
			...getStarshipProficiencyIconMeta(proficient),
			abilityIcon: typeof cfg.icon === "string" ? cfg.icon : `systems/dnd5e/icons/svg/abilities/${key}.svg`,
			configureLabel: configureLabel && configureLabel !== "DND5E.AbilityConfigure"
				? configureLabel
				: `Configure ${labelResolved}`,
			saveRollTooltip,
			proficientName: `system.abilities.${key}.proficient`,
			hover: getExpandedProficiencyHoverLabel(proficient),
			inputName: `system.abilities.${key}.value`,
			editable
		};
	};

	return keys.map(buildEntry);
}

