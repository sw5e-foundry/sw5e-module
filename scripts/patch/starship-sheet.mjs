import {
	getModuleId,
	getModulePath,
	SETTINGS_NAMESPACE
} from "../module-support.mjs";
import {
	getDerivedStarshipRuntime,
	rollStarshipAbilityCheck,
	rollStarshipAbilitySave,
	rollStarshipSkill
} from "../starship-data.mjs";
import { shouldShowStarshipPowerRouting, isLegacyPowerRoutingOverrideEnabled, STARSHIP_LEGACY_POWER_ROUTING_FLAG } from "../starship-routing-gate.mjs";
import {
	buildVehicleStarshipCrewContext,
	canCurrentUserDeployStarshipCrewRole,
	deployStarshipCrew,
	undeployStarshipCrew,
	undeployStarshipCrewMembership,
	adjustStarshipCrewMembershipQuantity
} from "../starship-character.mjs";
import { getExpandedProficiencyHoverLabel } from "./proficiency.mjs";
import {
	canCurrentUserUpdateStarshipActor,
	warnStarshipActorUpdateDenied
} from "../starship-permissions.mjs";
import {
	registerStarshipConditionStatusEffectHooks,
	registerStarshipEffectsConditionPresentation,
	registerStarshipEffectsContextWrapper,
	registerStarshipEffectsSlowedToggleGuard
} from "../starship-conditions.mjs";
import { registerStarshipTokenStatusHooks } from "../starship-token-status.mjs";
import {
	isActiveSpaceStationActor,
	isSpaceStationSizeBelowLarge
} from "../space-station.mjs";
import {
	isSw5eStarshipActor,
	STARSHIP_ABILITY_KEYS,
	STARSHIP_FEATURES_TAB_ID,
	STARSHIP_TAB_ID
} from "../starship-sheet-ids.mjs";
import {
	localizeOrFallback
} from "../starship-sheet-html.mjs";
import {
	onPreUpdateActorStarshipAbilities,
	onPreUpdateActorStarshipHpIntegers,
	onPreUpdateActorStarshipTraitsSize
} from "../starship-sheet-preupdate.mjs";
import {
	categorizeStarshipItems
} from "../starship-sheet-categorize.mjs";
import {
	ensureStarshipCargoInventoryInteractions,
	ensureStarshipDefaultShowVehicleAbilities,
	ensureStarshipFeaturesInventoryInteractions,
	ensureStarshipModificationsSectionHeaderSync,
	registerStarshipCargoInventoryWrappers,
	registerStarshipCargoItemCategoryHook,
	registerStarshipVehicleSheetShowAbilitiesDefault,
	scheduleStarshipModificationsSectionHeader,
	suppressNativeStarshipStationsAbilityAndFeatures
} from "./starship-sheet-inventory.mjs";
import {
	buildCrewRoleGroupsFromAssignedCrew,
	buildGroupContext,
	buildStarshipCrewRoleGroups,
	enrichCrewContextForSheetSearch,
	ensureStarshipAssignedCrewSearch,
	ensureStarshipCrewRosterContextMenu,
	ensureStarshipCrewRosterGroupCollapse,
	ensureStarshipCrewRosterOpenActor,
	openAddCrewDialog
} from "../starship-sheet-crew.mjs";
import {
	activateSheetTab,
	applyStarshipTabsContext,
	configureStarshipPrimaryTabLabels,
	ensureStarshipFeaturesTabNav,
	ensureStarshipTabTargets,
	registerStarshipCoreTabPart,
	registerStarshipFeaturesTabPart,
	activateSotgSubTab
} from "./starship-sheet-tabs.mjs";
export { applyStarshipTabsContext };
import {
	applyStarshipSheetScrollPositions,
	captureStarshipSheetViewState,
	consumeStarshipPendingSidebarScroll,
	readStarshipSheetScrollSnapshot,
	restoreStarshipSheetViewState
} from "./starship-sheet-scroll.mjs";
import {
	isStarshipSheetEditMode,
	removeStarshipSidebarSummary,
	renderStarshipSidebarSections,
	syncDestructionTrayControlState
} from "./starship-sheet-sidebar.mjs";
import {
	beginStarshipSheetRender,
	clearStarshipRenderDecision,
	cloneStarshipRequestedParts,
	compareStarshipSectionSignature,
	createStarshipRenderDecision,
	evaluateStarshipCorePreRenderEligibility,
	evaluateStarshipPartialGate,
	getStarshipRenderDecision,
	hasStarshipCoreBaseline,
	isStarshipSheetRenderCurrent,
	markStarshipSectionElement,
	recordStarshipCoreBaseline,
	signaturePayloadCoreStructuralMode,
	signaturePayloadCoreSummary,
	STARSHIP_CORE_RENDER_DECISION,
	STARSHIP_SECTION,
	tryApplyStarshipCorePartialUpdates
} from "./starship-sheet-partial.mjs";
import {
	applyStarshipSidebarChrome,
	scheduleStarshipDuplicateSizeNeutralize,
	suppressStockVehicleHpMeterForStarship
} from "./starship-sheet-neutralize.mjs";
import {
	buildOverviewAbilitiesContext,
	buildSystemsCoreContext,
	bindStarshipSheetImageFallbacks,
	enrichStarshipSkillsForSheet,
	getLegacyNotes,
	makeHeaderBadges,
	makeStarshipSummaryStrip,
	openStarshipAbilityConfiguration,
	openStarshipSkillConfiguration,
	resolveStarshipSheetImageUrl
} from "./starship-sheet-core-context.mjs";
import {
	ensureStarshipAdvancedPowerDelegate,
	ensureStarshipCorePanelCollapseDelegate,
	ensureStarshipDestructionSaveDelegate,
	ensureStarshipFuelActionsDelegate,
	ensureStarshipLegacyRoutingDelegate,
	ensureStarshipRepairDelegate,
	ensureStarshipReplenishCostModeDelegate,
	ensureStarshipFoodCapSourceDelegate,
	ensureStarshipShipsStoresConfigDelegate,
	ensureStarshipSystemDamageDelegate,
	ensureStarshipTrustedSystemPathDelegate,
	ensureStarshipVitalsDelegate
} from "./starship-sheet-delegates.mjs";
import {
	ensureStarshipSotgItemRowInteractions,
	focusSheetItem,
	getDnd5eItemSheet5e,
	getEventTargetElement,
	resolveSotgRowItem,
	resolveStarshipItemPrimaryTab
} from "./starship-sheet-sotg-items.mjs";



/** Set `true` to enable verbose submit/mode diagnostics for starship vehicle sheets. */
const SW5E_STARSHIP_SHEET_DIAG_ENABLED = false;
const SW5E_STARSHIP_SHEET_DIAG_PREFIX = "SW5E MODULE | StarshipSheetDiag";
const SW5E_STARSHIP_CORE_PART_PREFIX = "SW5E MODULE | StarshipCorePart";

let starshipCorePartRenderOptionsWrapped = false;
let starshipVehiclePartContextWrapped = false;
let starshipCrewDropWrapped = false;

function warnStarshipCorePart(message, details = undefined) {
	if ( details === undefined ) console.warn(SW5E_STARSHIP_CORE_PART_PREFIX, message);
	else console.warn(SW5E_STARSHIP_CORE_PART_PREFIX, message, details);
}

function logStarshipCorePartDiagnostic(message, details = undefined) {
	if ( !SW5E_STARSHIP_SHEET_DIAG_ENABLED ) return;
	if ( details === undefined ) console.info(SW5E_STARSHIP_CORE_PART_PREFIX, message);
	else console.info(SW5E_STARSHIP_CORE_PART_PREFIX, message, details);
}

function buildStarshipCoreRenderData(app, actor, runtime, { integrated = true, showPowerRouting = shouldShowStarshipPowerRouting(actor) } = {}) {
	const crewRoleGroups = buildStarshipCrewRoleGroups(actor);
	const skills = enrichStarshipSkillsForSheet(actor);
	const skillsCrewPbAttribution = skills.find(skill => skill?.crewPbAttributionLabel)?.crewPbAttributionLabel ?? "";
	const withIntegrated = arr => arr.map(group => ({
		...group,
		supportsSheetNavigation: group.supportsSheetNavigation === false
			? false
			: (integrated && group.defaultTab !== null)
	}));

	const sheetEditMode = isStarshipSheetEditMode(app);
	const actorEditable = app.isEditable !== false;
	const canUpdateActor = canCurrentUserUpdateStarshipActor(actor);
	const crewManageEditable = canUpdateActor && actorEditable;
	const crew = enrichCrewContextForSheetSearch(buildVehicleStarshipCrewContext(actor, {
		sheetEditable: crewManageEditable
	}), {
		collapseMap: app?._sw5eCrewRosterGroupCollapse,
		starship: actor
	});
	const systemsCore = buildSystemsCoreContext(actor, {
		runtime,
		costConfigEditable: sheetEditMode && actorEditable
	});
	const overviewAbilities = buildOverviewAbilitiesContext(actor, actorEditable);

	const coreRenderData = {
		actorName: actor.name,
		actorImage: resolveStarshipSheetImageUrl(actor.img),
		title: localizeOrFallback("TYPES.Actor.starshipPl", "Starship Systems"),
		subtitle: localizeOrFallback("TYPES.Actor.vehicle", "Vehicle Actor"),
		headerBadges: makeHeaderBadges(actor, { runtime }),
		summaryStrip: makeStarshipSummaryStrip(actor, { runtime }),
		legacyNotes: getLegacyNotes(actor, { runtime }),
		skills,
		skillsCrewPbAttribution,
		crew,
		editable: actorEditable,
		crewManageEditable,
		systemsSetupEditable: sheetEditMode && actorEditable,
		systemsRoutingEditable: actorEditable,
		showPowerRouting,
		legacyPowerRoutingEnabled: isLegacyPowerRoutingOverrideEnabled(actor),
		legacyPowerRoutingFlagPath: `flags.${SETTINGS_NAMESPACE}.${STARSHIP_LEGACY_POWER_ROUTING_FLAG}`,
		systemsCore,
		crewRoleGroups: withIntegrated(crewRoleGroups),
		crewRolesKicker: localizeOrFallback("SW5E.Feature.Deployment.Label", "Deployments"),
		overviewLandingKicker: localizeOrFallback("SW5E.StarshipSheet.OverviewKicker", "Overview"),
		overviewLandingTitle: localizeOrFallback("SW5E.StarshipSheet.OverviewTitle", "Starship at a glance"),
		overviewLandingLede: localizeOrFallback(
			"SW5E.StarshipSheet.OverviewLede",
			"Use this overview for starship skills and the tabs for crew, operations, equipment, modifications, and systems configuration. Live statistics remain in the sidebar."
		),
		overviewSkillsAriaLabel: localizeOrFallback("SW5E.StarshipSheet.OverviewSkillsAria", "Starship skills"),
		overviewSkillsKicker: localizeOrFallback("SW5E.StarshipSheet.OverviewSkillsKicker", "Skills"),
		overviewSkillsLede: localizeOrFallback(
			"SW5E.StarshipSheet.OverviewSkillsLede",
			"Roll a skill from the row. In edit mode, use the cog to adjust proficiency, ability, and check bonus (starship skills use a compact editor compatible with vehicle actors)."
		),
		overviewAbilitiesAriaLabel: localizeOrFallback("SW5E.StarshipSheet.OverviewAbilitiesAria", "Starship abilities"),
		overviewAbilitiesKicker: localizeOrFallback("SW5E.StarshipSheet.OverviewAbilitiesKicker", "Abilities"),
		overviewAbilitiesTitle: localizeOrFallback("SW5E.StarshipSheet.OverviewAbilitiesTitle", "Core ability scores"),
		overviewAbilitiesLede: localizeOrFallback(
			"SW5E.StarshipSheet.OverviewAbilitiesLede",
			"Core ship abilities shown in a compact score-card layout. In edit mode, adjust the base score directly here."
		),
		overviewAbilities,
		overviewAbilitySaveLabel: localizeOrFallback("SW5E.StarshipSheet.AbilitySaveLabel", "Save"),
		overviewPassiveHint: localizeOrFallback("DND5E.PassiveScore", "Passive score"),
		overviewSkillConfigureTitle: localizeOrFallback("SW5E.SkillConfigure", "Configure skill"),
		sotgSheetEditMode: sheetEditMode,
		sotgFindInSheetAria: localizeOrFallback("SW5E.StarshipSheet.FindInSheet", "Find on sheet"),
		sotgContextMenuAria: game.i18n.localize("DND5E.AdditionalControls")
	};

	const coreMeta = {
		...coreRenderData,
		actorEditable,
		overviewAbilitiesPresent: Array.isArray(overviewAbilities) && overviewAbilities.length > 0,
		crewPanelPresent: Boolean(crew)
	};

	return { coreRenderData, coreMeta };
}

async function renderStarshipCoreInnerHtml(coreRenderData) {
	return foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sheet-layer.hbs"),
		coreRenderData
	);
}

function getStarshipCoreWrapperState(nav, panelParent) {
	const navEntries = Array.from(nav?.querySelectorAll?.(`[data-tab="${STARSHIP_TAB_ID}"]`) ?? [])
		.filter(node => node instanceof HTMLElement);
	const roots = Array.from(panelParent?.querySelectorAll?.(`.sw5e-starship-tab[data-tab="${STARSHIP_TAB_ID}"]`) ?? [])
		.filter(node => node instanceof HTMLElement);
	const partRoots = roots.filter(node => node.dataset.sw5eCoreOwner === "part");
	const customRoots = roots.filter(node => node.dataset.sw5eCoreOwner !== "part");
	const customNavEntries = navEntries.filter(node => node.classList.contains("sw5e-starship-tab-button"));
	const stockNavEntries = navEntries.filter(node => !node.classList.contains("sw5e-starship-tab-button"));
	return { navEntries, roots, partRoots, customRoots, customNavEntries, stockNavEntries };
}

function removeStarshipCoreOwnershipDom(nav, panelParent) {
	for ( const button of nav?.querySelectorAll?.(`[data-tab="${STARSHIP_TAB_ID}"]`) ?? [] ) button.remove();
	for ( const panel of panelParent?.querySelectorAll?.(`.sw5e-starship-tab[data-tab="${STARSHIP_TAB_ID}"]`) ?? [] ) panel.remove();
}

function ensureStarshipCoreInteractions(wrapper, app, actor) {
	if ( !(wrapper instanceof HTMLElement) ) return;
	if ( wrapper.dataset.sw5eCoreInteractionsBound === "1" ) {
		ensureStarshipSotgItemRowInteractions(wrapper, app);
		ensureStarshipCorePanelCollapseDelegate(wrapper, app);
		ensureStarshipAssignedCrewSearch(wrapper, app);
		ensureStarshipCrewRosterGroupCollapse(wrapper, app);
		ensureStarshipCrewRosterOpenActor(wrapper, app);
		ensureStarshipCrewRosterContextMenu(wrapper, app);
		return;
	}

	wrapper.dataset.sw5eCoreInteractionsBound = "1";
	ensureStarshipSotgItemRowInteractions(wrapper, app);
	ensureStarshipCorePanelCollapseDelegate(wrapper, app);
	ensureStarshipAssignedCrewSearch(wrapper, app);
	ensureStarshipCrewRosterGroupCollapse(wrapper, app);
	ensureStarshipCrewRosterOpenActor(wrapper, app);
	ensureStarshipCrewRosterContextMenu(wrapper, app);

	const handleTabClick = async event => {
		const target = getEventTargetElement(event);
		const sheetActor = app.actor ?? actor;
		const abilityStrip = target?.closest(".sw5e-starship-ability-strip");

		if ( abilityStrip ) {
			const abilityCog = target?.closest("[data-action=\"showConfiguration\"][data-config=\"ability\"]");
			if ( abilityCog ) {
				event.preventDefault();
				event.stopPropagation();
				const abilityKey = abilityCog.closest(".ability-score")?.dataset?.ability;
				await openStarshipAbilityConfiguration(sheetActor, abilityKey);
				return;
			}

			if ( target?.closest("proficiency-cycle") ) return;

			const abilitySave = target?.closest(".save-tab.saving-throw.rollable[data-action=\"roll\"][data-type=\"ability\"]");
			if ( abilitySave ) {
				event.preventDefault();
				event.stopPropagation();
				const abilityKey = abilitySave.closest(".ability-score")?.dataset?.ability;
				await rollStarshipAbilitySave(sheetActor, abilityKey, event);
				return;
			}

			const abilityRoll = target?.closest(".label.ability-check[data-action=\"roll\"][data-type=\"ability\"]");
			if ( abilityRoll ) {
				event.preventDefault();
				event.stopPropagation();
				const abilityKey = abilityRoll.closest(".ability-score")?.dataset?.ability
					?? abilityRoll.dataset.ability;
				await rollStarshipAbilityCheck(sheetActor, abilityKey, event);
				return;
			}
		}

		const actionNode = target?.closest("[data-sw5e-action]");
		if ( !actionNode ) return;

		event.preventDefault();
		event.stopPropagation();
		const action = actionNode.dataset.sw5eAction
			?? actionNode.getAttribute("data-sw5e-action");
		const actionRow = actionNode.closest(".sw5e-starship-item-row--sotg[data-item-id]") ?? actionNode;
		const { item } = resolveSotgRowItem(app, actionRow);

		if ( action === "edit-item" ) {
			const ItemSheet5e = getDnd5eItemSheet5e();
			if ( ItemSheet5e ) await item?.sheet?.render(true, { mode: ItemSheet5e.MODES.EDIT });
			else await item?.sheet?.render(true);
			return;
		}

		if ( action === "delete-item" ) {
			if ( !item || actionRow?.dataset?.sourceActorUuid ) return;
			if ( typeof item.deleteDialog === "function" ) await item.deleteDialog();
			return;
		}

		if ( action === "focus-item" ) {
			if ( actionRow?.dataset?.sourceActorUuid ) return;
			const focusItem = actionNode.dataset.itemId ? sheetActor?.items?.get(actionNode.dataset.itemId) : null;
			const focusTab = actionNode.dataset.tab || resolveStarshipItemPrimaryTab(focusItem);
			focusSheetItem(wrapper.closest(".sw5e-starship-sheet") ?? wrapper, app, actionNode.dataset.itemId, focusTab);
			return;
		}

		if ( action === "open-tab" ) {
			const firstItemId = actionNode.dataset.firstItemId;
			if ( firstItemId ) focusSheetItem(wrapper.closest(".sw5e-starship-sheet") ?? wrapper, app, firstItemId);
			return;
		}

		if ( action === "roll-skill" ) {
			await rollStarshipSkill(sheetActor, actionNode.dataset.skillId, event, game.user);
			return;
		}

		if ( action === "roll-ability" ) {
			await rollStarshipAbilityCheck(sheetActor, actionNode.dataset.ability, event);
			return;
		}

		if ( action === "roll-save" ) {
			await rollStarshipAbilitySave(sheetActor, actionNode.dataset.ability, event);
			return;
		}

		if ( action === "configure-skill" ) {
			await openStarshipSkillConfiguration(sheetActor, actionNode.dataset.skillId);
		}
	};

	wrapper.addEventListener("click", handleTabClick, { capture: true });

	wrapper.addEventListener("click", event => {
		const ctl = event.target.closest("[data-sw5e-sotg-tab], [data-sw5e-sotg-goto]");
		if ( !ctl ) return;
		event.preventDefault();
		const id = ctl.getAttribute("data-sw5e-sotg-tab") || ctl.getAttribute("data-sw5e-sotg-goto");
		if ( !id ) return;
		activateSotgSubTab(wrapper, app, id);
	});

	wrapper.addEventListener("click", async event => {
		const btn = event.target.closest("[data-sw5e-crew-command]");
		if ( !btn ) return;
		event.preventDefault();
		if ( btn.disabled ) return;
		if ( app?.isEditable === false ) {
			warnStarshipActorUpdateDenied();
			return;
		}
		const command = btn.dataset.sw5eCrewCommand;
		if ( (command === "remove" || command === "set-pilot" || command === "undeploy-pilot"
			|| command === "quantity-inc" || command === "quantity-dec")
			&& !isStarshipSheetEditMode(app) ) {
			warnStarshipActorUpdateDenied();
			return;
		}
		btn.disabled = true;
		try {
			const uuid = btn.dataset.actorUuid;
			const membershipId = btn.dataset.membershipId || "";
			if ( command === "open-add-crew" ) {
				await openAddCrewDialog(actor);
				return;
			}

			let ok = false;
			if ( command === "deploy" ) ok = await deployStarshipCrew(actor, uuid, btn.dataset.deployRole);
			else if ( command === "remove" ) {
				ok = membershipId
					? await undeployStarshipCrewMembership(actor, membershipId)
					: await undeployStarshipCrew(actor, uuid);
			}
			else if ( command === "set-pilot" ) ok = await deployStarshipCrew(actor, uuid, "pilot");
			else if ( command === "undeploy-pilot" ) ok = await undeployStarshipCrew(actor, uuid, ["pilot"]);
			else if ( command === "quantity-inc" || command === "quantity-dec" ) {
				if ( !membershipId ) {
					warnStarshipActorUpdateDenied();
					return;
				}
				const delta = command === "quantity-inc" ? 1 : -1;
				const result = await adjustStarshipCrewMembershipQuantity(actor, membershipId, delta);
				ok = result?.ok === true;
				if ( ok && app?.rendered ) await app.render(false);
			}
			else return; // including stale toggle-active: no write

			if ( ok !== true ) warnStarshipActorUpdateDenied();
		} catch ( err ) {
			console.error("SW5E MODULE | Crew command failed.", err);
		} finally {
			btn.disabled = false;
		}
	});
}





/**
 * Core operations (routing + fuel): sync disabled/locked state on PLAY/EDIT toggle without a full SotG re-render.
 * Fuel cap/cost/value inputs follow sheet EDIT mode; routing select and Burn/Refuel follow actor edit permission.
 */
function applyCoreOperationsControlState(app, starshipPanel) {
	if ( !(starshipPanel instanceof HTMLElement) ) return;
	const overview = starshipPanel.querySelector("[data-sw5e-sotg-panel=\"overview\"]");
	if ( !overview ) return;

	const setupEditable = isStarshipSheetEditMode(app) && app.isEditable !== false;
	const routingEditable = app.isEditable !== false;

	const setupControlIds = [
		"sw5e-core-fuel-value",
		"sw5e-core-fuel-cap",
		"sw5e-core-fuel-cost"
	];

	for ( const id of setupControlIds ) {
		const el = overview.querySelector(`#${id}`);
		if ( el instanceof HTMLInputElement || el instanceof HTMLSelectElement ) {
			el.disabled = !setupEditable;
			el.closest(".sw5e-starship-systems-field")?.classList.toggle("sw5e-starship-systems-field--locked", !setupEditable);
		}
	}

	const routing = overview.querySelector("#sw5e-core-routing");
	if ( routing instanceof HTMLSelectElement ) {
		routing.disabled = !routingEditable;
		routing.closest(".sw5e-starship-systems-field")?.classList.toggle("sw5e-starship-systems-field--locked", !routingEditable);
	}

	for ( const btn of overview.querySelectorAll("[data-sw5e-supplies-action]") ) {
		if ( btn instanceof HTMLButtonElement ) btn.disabled = !routingEditable;
	}
	for ( const btn of overview.querySelectorAll("[data-sw5e-advanced-power-action='spend']") ) {
		if ( btn instanceof HTMLButtonElement ) {
			btn.disabled = !routingEditable || btn.dataset.canSpend !== "1";
		}
	}
	const recoverBtn = overview.querySelector("[data-sw5e-advanced-power-action='recover']");
	if ( recoverBtn instanceof HTMLButtonElement ) {
		recoverBtn.disabled = !routingEditable || recoverBtn.dataset.canRecover !== "1";
	}
	overview.querySelector(".sw5e-starship-core-fuel-actions")
		?.classList.toggle("sw5e-starship-core-fuel-actions--locked", !routingEditable);
	overview.querySelector(".sw5e-starship-core-advanced-power-actions")
		?.classList.toggle("sw5e-starship-core-advanced-power-actions--locked", !routingEditable);

	const advancedPowerPanel = overview.querySelector(".sw5e-starship-core-advanced-power-panel");
	if ( advancedPowerPanel ) {
		for ( const input of advancedPowerPanel.querySelectorAll("input[name^='system.attributes.power.']") ) {
			if ( input instanceof HTMLInputElement || input instanceof HTMLSelectElement ) {
				input.disabled = !setupEditable;
			}
		}
		advancedPowerPanel.querySelectorAll(".sw5e-starship-advanced-power-slot--edit")
			.forEach(row => row.classList.toggle("sw5e-starship-systems-field--locked", !setupEditable));
	}
}

function getStarshipAbilitySaveRollTooltip(label) {
	const saveRollTitle = game.i18n.format("DND5E.SavePromptTitle", { ability: label });
	return saveRollTitle && saveRollTitle !== "DND5E.SavePromptTitle"
		? `Roll ${saveRollTitle}`
		: `Roll ${label} Saving Throw`;
}

function getStarshipAbilityProficiencyHover(proficient) {
	return getExpandedProficiencyHoverLabel(proficient);
}

/**
 * Keep Core ability save tabs aligned with sheet PLAY/EDIT mode without a full SotG template re-render.
 * Play: NPC-style rollable save tab (CL4e). Edit: non-rollable tab with editable proficiency-cycle.
 */
function syncStarshipAbilitySaveTabRollState(app, starshipPanel) {
	if ( !(starshipPanel instanceof HTMLElement) ) return;
	const isEditMode = isStarshipSheetEditMode(app);

	for ( const tile of starshipPanel.querySelectorAll(".sw5e-starship-ability-strip .ability-score[data-ability]") ) {
		const key = tile.dataset.ability;
		const saveTab = tile.querySelector(".save-tab.saving-throw");
		if ( !key || !(saveTab instanceof HTMLElement) ) continue;

		const label = tile.getAttribute("title") || key.toUpperCase();
		const proficiencyCycle = saveTab.querySelector("proficiency-cycle");
		const proficient = Number(proficiencyCycle?.getAttribute("value") ?? proficiencyCycle?.value ?? 0);

		if ( isEditMode ) {
			saveTab.classList.remove("rollable");
			saveTab.removeAttribute("data-action");
			saveTab.removeAttribute("data-type");
			saveTab.removeAttribute("data-sw5e-action");
			saveTab.removeAttribute("data-ability");
			const hover = getStarshipAbilityProficiencyHover(proficient);
			if ( hover ) {
				saveTab.dataset.tooltip = hover;
				saveTab.setAttribute("aria-label", hover);
			} else {
				saveTab.removeAttribute("data-tooltip");
				saveTab.removeAttribute("aria-label");
			}
			proficiencyCycle?.removeAttribute("disabled");
		} else {
			const saveRollTooltip = getStarshipAbilitySaveRollTooltip(label);
			saveTab.classList.add("rollable");
			saveTab.dataset.action = "roll";
			saveTab.dataset.type = "ability";
			saveTab.dataset.sw5eAction = "roll-save";
			saveTab.dataset.ability = key;
			saveTab.dataset.tooltip = saveRollTooltip;
			saveTab.setAttribute("aria-label", saveRollTooltip);
			proficiencyCycle?.setAttribute("disabled", "");
		}
	}
}

function syncSotgSheetPhaseClasses(app, starshipPanel) {
	if ( !starshipPanel ) return;
	const isEditMode = isStarshipSheetEditMode(app);
	starshipPanel.classList.toggle("sw5e-starship-sotg--mode-edit", isEditMode);
	starshipPanel.classList.toggle("sw5e-starship-sotg--mode-play", !isEditMode);
	starshipPanel.classList.toggle("sw5e-starship-sotg--readonly", app.isEditable === false);
	applyCoreOperationsControlState(app, starshipPanel);
	syncStarshipAbilitySaveTabRollState(app, starshipPanel);
	const sheetRoot = starshipPanel.closest(".sw5e-starship-sheet") ?? app?.element;
	syncDestructionTrayControlState(app, sheetRoot);
}

function scheduleStarshipAbilitySaveTabSync(root, app) {
	if ( !(root instanceof HTMLElement) ) return;
	const run = () => {
		const panel = root.querySelector(".sw5e-starship-panel");
		if ( panel ) syncStarshipAbilitySaveTabRollState(app, panel);
	};
	queueMicrotask(run);
	requestAnimationFrame(run);
}

function ensureStarshipAbilitySaveTabModeSync(root, app) {
	if ( !(root instanceof HTMLElement) || root.dataset.sw5eAbilitySaveTabModeBound === "1" ) return;
	root.dataset.sw5eAbilitySaveTabModeBound = "1";

	const onModeChange = () => {
		const panel = root.querySelector(".sw5e-starship-panel");
		if ( panel ) syncSotgSheetPhaseClasses(app, panel);
		if ( app?.actor ) applyStarshipSidebarChrome(root, app.actor, app);
	};

	root.addEventListener("change", event => {
		if ( event.target?.matches?.("slide-toggle.mode-slider, .mode-slider") ) onModeChange();
	});
	root.addEventListener("click", event => {
		if ( event.target?.closest?.("slide-toggle.mode-slider, .mode-slider") ) {
			queueMicrotask(() => requestAnimationFrame(onModeChange));
		}
	});
}


function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

function getSheetForm(root, app) {
	return app?.form
		?? (root instanceof HTMLFormElement ? root : root.querySelector("form"));
}


/** @typedef {{ sidebarScrollTop: number, mainScrollTop: number, sotgPanelScrollTop: number, sw5ePrimary: string|null|boolean, stockPrimary: string|null, sotgSub: string }} StarshipSheetViewState */

/**
 * dnd5e vehicle sheet can inject a second native `[name="system.traits.size"]` in EDIT mode.
 * Prefer a marked Systems control when present; otherwise keep the first match so submit stays unambiguous.
 */

function syncStarshipOverviewAuthoritativeAbilityInput(input) {
	if ( !(input instanceof HTMLInputElement) ) return;
	const key = input.dataset.sw5eOverviewEditAbility;
	if ( !key ) return;
	const path = input.dataset.sw5eOverviewInputName || `system.abilities.${key}.value`;
	const form = input.form;
	if ( !(form instanceof HTMLFormElement) ) return;
	const hidden = form.querySelector(`[data-sw5e-overview-authoritative-ability="${key}"][name="${path}"]`);
	if ( !(hidden instanceof HTMLInputElement) ) return;
	hidden.value = input.value;
}

function ensureStarshipOverviewAbilityMirrors(root, _app, actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	if ( !root || root.dataset.sw5eOverviewAbilityMirrorBound === "1" ) return;
	root.dataset.sw5eOverviewAbilityMirrorBound = "1";
	const sync = event => {
		const el = event.target;
		if ( !(el instanceof HTMLInputElement) ) return;
		if ( !el.matches("[data-sw5e-overview-edit-ability]") ) return;
		syncStarshipOverviewAuthoritativeAbilityInput(el);
	};
	root.addEventListener("input", sync);
	root.addEventListener("change", sync);
}

/**
 * Temporary: audit DOM + optional form submit for `system.traits.size` (module scope only).
 * Stock vehicle sheet may register a second native control; custom Systems + sidebar use module templates.
 */
function ensureStarshipSheetSubmitDiagnostic(root, app, actor) {
	if ( !SW5E_STARSHIP_SHEET_DIAG_ENABLED ) return;
	if ( !isSw5eStarshipActor(actor) ) return;
	const form = getSheetForm(root, app);
	if ( !form || form.dataset.sw5eStarshipDiagSubmitBound === "1" ) return;
	form.dataset.sw5eStarshipDiagSubmitBound = "1";
	form.addEventListener("submit", () => {
		const a = app.actor;
		if ( !isSw5eStarshipActor(a) ) return;
		try {
			const fd = new FormData(form);
			const traitsSizePairs = [];
			for ( const [k, v] of fd.entries() ) {
				if ( k === "system.traits.size" || k.endsWith(".traits.size") ) traitsSizePairs.push([k, String(v)]);
			}
			const named = form.querySelectorAll("[name=\"system.traits.size\"]");
			const abilitySnapshots = STARSHIP_ABILITY_KEYS.map(key => {
				const path = `system.abilities.${key}.value`;
				const namedInputs = Array.from(form.querySelectorAll(`[name="${path}"]`));
				return {
					key,
					formDataValue: fd.get(path),
					namedCount: namedInputs.length,
					inputs: namedInputs.map((el, i) => ({
						i,
						type: el.getAttribute("type"),
						value: el.value,
						disabled: el.disabled,
						id: el.id || null,
						className: el.className?.slice?.(0, 120) ?? ""
					}))
				};
			});
			console.info(SW5E_STARSHIP_SHEET_DIAG_PREFIX, "formSubmit (capture phase)", {
				actorId: a.id,
				formTraitsSizeKeyPairs: traitsSizePairs,
				namedNameCount: named.length,
				abilitySnapshots,
				namedSnapshots: Array.from(named).map((el, i) => ({
					i,
					value: el.value,
					disabled: el.disabled,
					id: el.id || null,
					className: el.className?.slice?.(0, 120) ?? ""
				}))
			});
		} catch ( err ) {
			console.warn(SW5E_STARSHIP_SHEET_DIAG_PREFIX, "formSubmit capture failed", err);
		}
	}, true);
}

function runStarshipSheetDiagnostics(root, app, actor, phase) {
	if ( !SW5E_STARSHIP_SHEET_DIAG_ENABLED ) return;
	if ( !isSw5eStarshipActor(actor) ) return;

	const form = getSheetForm(root, app);
	const edit = isStarshipSheetEditMode(app);
	const prevMode = app._sw5eDiagSheetMode;
	if ( prevMode !== undefined && prevMode !== edit ) {
		console.info(SW5E_STARSHIP_SHEET_DIAG_PREFIX, "sheetEditModeTransition (after render)", {
			phase,
			actorId: actor.id,
			from: prevMode ? "EDIT" : "PLAY",
			to: edit ? "EDIT" : "PLAY",
			appMode: app._mode,
			modeEnum: app.constructor?.MODES ?? null
		});
	}
	app._sw5eDiagSheetMode = edit;

	const namedAll = root.querySelectorAll("[name=\"system.traits.size\"]");
	const dataPath = root.querySelectorAll("[data-sw5e-system-path=\"system.traits.size\"]");
	const namedInForm = form ? form.querySelectorAll("[name=\"system.traits.size\"]") : [];
	const abilityDomAudit = STARSHIP_ABILITY_KEYS.map(key => {
		const path = `system.abilities.${key}.value`;
		const named = form ? Array.from(form.querySelectorAll(`[name="${path}"]`)) : [];
		return {
			key,
			count: named.length,
			values: named.map((el, i) => ({
				i,
				type: el.getAttribute("type"),
				value: el.value,
				disabled: el.disabled,
				className: el.className?.slice?.(0, 100) ?? ""
			}))
		};
	});

	console.info(SW5E_STARSHIP_SHEET_DIAG_PREFIX, "domAudit", {
		phase,
		actorId: actor.id,
		sheetMode: edit ? "EDIT" : "PLAY",
		namedSystemTraitsSize_totalUnderRoot: namedAll.length,
		namedSystemTraitsSize_insideForm: namedInForm.length,
		dataSw5eSystemPath_traitsSize: dataPath.length,
		formElementFound: Boolean(form),
		validActorSizeKeys: Object.keys(CONFIG?.DND5E?.actorSizes ?? {}),
		persistedActorSystemTraitsSize: actor.system?.traits?.size,
		abilityDomAudit,
		namedDetails: Array.from(namedAll).map((el, i) => ({
			i,
			tag: el.tagName,
			id: el.id || null,
			inForm: form ? form.contains(el) : false,
			value: el.value,
			disabled: el.disabled,
			className: el.className?.slice?.(0, 100) ?? ""
		})),
		dataPathDetails: Array.from(dataPath).map((el, i) => ({
			i,
			tag: el.tagName,
			inForm: form ? form.contains(el) : false,
			value: el.value,
			className: el.className?.slice?.(0, 100) ?? ""
		}))
	});
}

function logStarshipPreUpdateTraitsIncoming(document, changed) {
	if ( !SW5E_STARSHIP_SHEET_DIAG_ENABLED ) return;
	if ( !isSw5eStarshipActor(document) ) return;
	if ( !foundry.utils.hasProperty(changed, "system.traits.size") ) return;
	const incoming = foundry.utils.getProperty(changed, "system.traits.size");
	const keys = Object.keys(CONFIG?.DND5E?.actorSizes ?? {});
	console.info(SW5E_STARSHIP_SHEET_DIAG_PREFIX, "preUpdateActor INCOMING (before sanitize)", {
		actorId: document.id,
		"system.traits.size": incoming,
		incomingIsBlank: incoming === "" || incoming === undefined,
		incomingIsValidKey: typeof incoming === "string" && keys.includes(incoming)
	});
}

function logStarshipPreUpdateTraitsAfterSanitize(document, changed) {
	if ( !SW5E_STARSHIP_SHEET_DIAG_ENABLED ) return;
	if ( !isSw5eStarshipActor(document) ) return;
	if ( !foundry.utils.hasProperty(changed, "system.traits.size") ) return;
	const val = foundry.utils.getProperty(changed, "system.traits.size");
	const keys = Object.keys(CONFIG?.DND5E?.actorSizes ?? {});
	console.info(SW5E_STARSHIP_SHEET_DIAG_PREFIX, "preUpdateActor AFTER sanitize hook", {
		actorId: document.id,
		"system.traits.size": val,
		isValidKey: typeof val === "string" && keys.includes(val)
	});
}

function logStarshipPreUpdateAbilities(document, changed, phase = "incoming") {
	if ( !SW5E_STARSHIP_SHEET_DIAG_ENABLED ) return;
	if ( !isSw5eStarshipActor(document) ) return;
	const details = STARSHIP_ABILITY_KEYS.flatMap(key => {
		const path = `system.abilities.${key}.value`;
		if ( !foundry.utils.hasProperty(changed, path) ) return [];
		return [{
			key,
			path,
			changedValue: foundry.utils.getProperty(changed, path),
			sourceValue: document?._source?.system?.abilities?.[key]?.value,
			liveValue: document?.system?.abilities?.[key]?.value
		}];
	});
	if ( !details.length ) return;
	console.info(SW5E_STARSHIP_SHEET_DIAG_PREFIX, `preUpdateActor ABILITIES (${phase})`, {
		actorId: document.id,
		details
	});
}
































async function ensureWarningsDialog(root, app, actor) {
	const form = getSheetForm(root, app);
	if ( !form || form.querySelector("dialog.warnings") ) return;

	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-warnings-dialog.hbs"),
		{
			title: localizeOrFallback("DND5E.Warnings", "Warnings"),
			body: localizeOrFallback("DND5E.WarningDetails", "This sheet has one or more warnings from the dnd5e actor preparation step."),
			actorName: actor?.name ?? localizeOrFallback("TYPES.Actor.vehicle", "Vehicle Actor"),
			closeLabel: localizeOrFallback("Close", "Close")
		}
	);

	const dialog = document.createElement("dialog");
	dialog.className = "warnings sw5e-starship-warnings-dialog";
	dialog.innerHTML = rendered;
	form.append(dialog);
}











/**
 * Starship skill cog: use core dialogs only when they match this actor's schema and skill key; otherwise inline config.
 */







































/**
 * @param {object} starshipActor
 * @returns {Record<string, boolean>}
 */








function partitionStarshipGroups(actor) {
	const groups = categorizeStarshipItems(actor);
	for ( const group of Object.values(groups) ) group.actor = actor;
	const build = keys => keys.map(key => buildGroupContext(groups[key])).filter(group => group.items.length);
	return {
		/** Starship Actions — operational/tab visible as "Actions". */
		actionsGroups: build(["actions"]),
		weaponsGroups: build(["weapons"]),
		equipmentGroups: build(["equipment"]),
		modificationsGroups: build(["modifications"]),
		/** Size classification item(s) + passive Starship Features feats — tab "Systems" */
		systemsGroups: build(["size", "features"]),
		/** Deployments / crew roles — Core crew panel (live from assigned PCs + vessel-attached) */
		crewRoleGroups: buildCrewRoleGroupsFromAssignedCrew(actor, groups)
	};
}











/**
 * Soft RAW size warning for space stations below Large. Notification only — no data writes.
 * Throttled per actor uuid for the session to avoid toast spam on re-render.
 * @param {Actor} actor
 */
function maybeWarnSpaceStationUndersized(actor) {
	if ( !isActiveSpaceStationActor(actor) ) return;
	if ( !isSpaceStationSizeBelowLarge(actor) ) return;
	const uuid = actor.uuid ?? actor.id;
	globalThis.sw5eSpaceStationSizeWarn ??= new Set();
	if ( globalThis.sw5eSpaceStationSizeWarn.has(uuid) ) return;
	globalThis.sw5eSpaceStationSizeWarn.add(uuid);
	ui.notifications?.warn?.(localizeOrFallback(
		"SW5E.variant.SpaceStation.SizeWarning",
		"{name} is flagged as a space station but is smaller than Large. Space stations are intended for Large and larger sizes."
	).replaceAll("{name}", actor.name ?? "Space Station"));
}

function markStarshipCoreSectionOwnership(root, { showPowerRouting }) {
	if ( !(root instanceof HTMLElement) ) return;
	const selectors = [
		[".sw5e-starship-overview-abilities-row", STARSHIP_SECTION.CORE_ABILITIES],
		["section.sw5e-starship-overview-skills", STARSHIP_SECTION.CORE_SKILLS],
		['section.sw5e-starship-crew-panel[data-sw5e-core-panel="crew"]', STARSHIP_SECTION.CORE_CREW],
		['section.sw5e-starship-core-advanced-power-panel[data-sw5e-core-panel="advancedPower"]', STARSHIP_SECTION.CORE_SYSTEMS_ROUTING],
		['section.sw5e-starship-core-fuel-panel[data-sw5e-core-panel="fuel"]', STARSHIP_SECTION.CORE_SYSTEMS_ROUTING]
	];
	if ( showPowerRouting ) selectors.push(["section.sw5e-starship-core-routing-panel", STARSHIP_SECTION.CORE_SYSTEMS_ROUTING]);
	for ( const [selector, sectionId] of selectors ) {
		for ( const el of root.querySelectorAll(selector) ) markStarshipSectionElement(el, sectionId);
	}
}

function inspectLiveStarshipCoreRenderState(app) {
	const root = getHtmlRoot(app?.element);
	if ( !(root instanceof HTMLElement) ) {
		return {
			root: null,
			nav: null,
			panelParent: null,
			integrated: false,
			coreState: {
				navEntries: [],
				roots: [],
				partRoots: [],
				customRoots: [],
				customNavEntries: [],
				stockNavEntries: []
			},
			malformedReasons: ["missing-render-root"],
			existingWrapper: null
		};
	}
	const { nav, panelParent, integrated } = ensureStarshipTabTargets(root);
	const coreState = getStarshipCoreWrapperState(nav, panelParent);
	const malformedReasons = [];
	if ( coreState.stockNavEntries.length !== 1 ) malformedReasons.push("duplicate-core-nav");
	if ( coreState.partRoots.length !== 1 ) malformedReasons.push("duplicate-core-root");
	if ( coreState.partRoots[0]?.dataset?.group !== "primary" ) malformedReasons.push("malformed-wrapper-contract");
	return {
		root,
		nav,
		panelParent,
		integrated,
		coreState,
		malformedReasons,
		existingWrapper: coreState.partRoots[0] ?? null
	};
}

function registerStarshipCorePartRenderOptionsWrapper() {
	if ( starshipCorePartRenderOptionsWrapped ) return;
	starshipCorePartRenderOptionsWrapped = true;
	try {
		libWrapper.register(getModuleId(), "dnd5e.applications.actor.VehicleActorSheet.prototype._configureRenderOptions", function(wrapped, options) {
			const actor = this.actor ?? this.document ?? null;
			const originalPartRequest = cloneStarshipRequestedParts(options?.parts);
			const result = wrapped(options);
			if ( isSw5eStarshipActor(actor) ) {
				this.tabGroups ??= {};
				if ( options?.isFirstRender ) {
					this.tabGroups.primary = STARSHIP_TAB_ID;
				} else if ( !this.tabGroups.primary ) {
					this.tabGroups.primary = STARSHIP_TAB_ID;
				}

				const normalizedPartRequest = Array.isArray(options?.parts) ? [...options.parts] : [];
				const coreRequested = normalizedPartRequest.includes(STARSHIP_TAB_ID);
				if ( !coreRequested ) {
					createStarshipRenderDecision(this, options, {
						actorId: actor?.id ?? actor?.uuid ?? null,
						originalPartRequest,
						normalizedPartRequest,
						effectivePartRequest: [...normalizedPartRequest],
						coreDecision: STARSHIP_CORE_RENDER_DECISION.NOT_REQUESTED,
						reason: "not-requested",
						structuralMode: null,
						hasPriorBaseline: hasStarshipCoreBaseline(this),
						expectedCoreRoot: null
					});
					return result;
				}

				const showPowerRouting = shouldShowStarshipPowerRouting(actor);
				const runtime = getDerivedStarshipRuntime(actor, { showPowerRouting });
				const { coreMeta } = buildStarshipCoreRenderData(this, actor, runtime, {
					integrated: true,
					showPowerRouting
				});
				const liveState = inspectLiveStarshipCoreRenderState(this);
				const structuralMode = signaturePayloadCoreStructuralMode(coreMeta);
				const structuralCompare = compareStarshipSectionSignature(
					this,
					STARSHIP_SECTION.CORE_STRUCTURAL_MODE,
					structuralMode
				);
				const summaryCompare = compareStarshipSectionSignature(
					this,
					STARSHIP_SECTION.CORE_SUMMARY,
					signaturePayloadCoreSummary(coreMeta)
				);
				const hasPriorBaseline = hasStarshipCoreBaseline(this);
				const coreDecision = evaluateStarshipCorePreRenderEligibility(this, actor, {
					coreRequested,
					isFirstRender: Boolean(options?.isFirstRender),
					hasCoreWrapper: liveState.existingWrapper instanceof HTMLElement,
					malformedCoreRoot: liveState.malformedReasons.length > 0,
					hasPriorBaseline,
					structuralModeChanged: structuralCompare.dirty,
					summaryChanged: summaryCompare.dirty
				});
				let effectivePartRequest = coreDecision.coreDecision === STARSHIP_CORE_RENDER_DECISION.PARTIAL_PRESERVE
					? normalizedPartRequest.filter(partId => partId !== STARSHIP_TAB_ID)
					: [...normalizedPartRequest];
				let resolvedCoreDecision = coreDecision;
				if ( resolvedCoreDecision.coreDecision === STARSHIP_CORE_RENDER_DECISION.PARTIAL_PRESERVE && effectivePartRequest.length === 0 ) {
					resolvedCoreDecision = {
						coreDecision: STARSHIP_CORE_RENDER_DECISION.STOCK_REPLACE,
						reason: "core-only-request"
					};
					effectivePartRequest = [...normalizedPartRequest];
				}
				if ( resolvedCoreDecision.coreDecision === STARSHIP_CORE_RENDER_DECISION.PARTIAL_PRESERVE ) {
					options.parts = effectivePartRequest;
				}
				createStarshipRenderDecision(this, options, {
					actorId: actor?.id ?? actor?.uuid ?? null,
					originalPartRequest,
					normalizedPartRequest,
					effectivePartRequest,
					coreDecision: resolvedCoreDecision.coreDecision,
					reason: resolvedCoreDecision.reason,
					structuralMode,
					hasPriorBaseline: resolvedCoreDecision.reason === "actor-identity-changed" ? false : hasPriorBaseline,
					expectedCoreRoot: liveState.existingWrapper ?? null,
					expectedCoreOwner: liveState.existingWrapper?.dataset?.sw5eCoreOwner ?? null,
					coreRequested,
					structuralModeChanged: structuralCompare.dirty,
					summaryChanged: summaryCompare.dirty
				});
				logStarshipCorePartDiagnostic("Render-options decision prepared.", {
					coreDecision: resolvedCoreDecision.coreDecision,
					reason: resolvedCoreDecision.reason,
					originalPartRequest,
					normalizedPartRequest,
					effectivePartRequest
				});
			}
			return result;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap VehicleActorSheet._configureRenderOptions for permanent starship Core PART ownership.", err);
	}
}

function registerStarshipVehiclePartContextWrapper() {
	if ( starshipVehiclePartContextWrapped ) return;
	starshipVehiclePartContextWrapped = true;
	try {
		libWrapper.register(getModuleId(), "dnd5e.applications.actor.VehicleActorSheet.prototype._preparePartContext", async function(wrapped, partId, context, options) {
			context = await wrapped(partId, context, options);
			const actor = this.actor ?? this.document ?? null;
			context = suppressNativeStarshipStationsAbilityAndFeatures(this, partId, context);
			if ( partId !== STARSHIP_TAB_ID || !isSw5eStarshipActor(actor) ) return context;
			const renderDecision = getStarshipRenderDecision(this, options);
			if ( renderDecision?.coreDecision === STARSHIP_CORE_RENDER_DECISION.PARTIAL_PRESERVE ) return context;

			const showPowerRouting = shouldShowStarshipPowerRouting(actor);
			const runtime = getDerivedStarshipRuntime(actor, { showPowerRouting });
			const { coreRenderData } = buildStarshipCoreRenderData(this, actor, runtime, {
				integrated: true,
				showPowerRouting
			});
			context.sw5eCoreHtml = await renderStarshipCoreInnerHtml(coreRenderData);
			return context;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap VehicleActorSheet._preparePartContext for starship sheet part shaping.", err);
	}
}

/**
 * Phase 1A Bug 1 + 1A′: SW5E starship Actor drops deploy via deployStarshipCrew (role crew).
 * Consumes the Actor already resolved by Foundry ActorSheet._onDrop → fromDropData.
 * Registered as MIXED because SW5E starships intentionally short-circuit stock (no wrapped call);
 * non-starship vehicles still chain via wrapped(...). WRAPPER is invalid for that pattern.
 * Phase 1A′: GM Alt+drop passes `{ hidden: true }` into the storage-abstracted deploy API
 * (no direct crewProfiles writes here). Non-GM Alt+drop matches plain visible drop.
 */
function registerStarshipCrewDropWrapper() {
	if ( starshipCrewDropWrapped ) return;
	starshipCrewDropWrapped = true;
	try {
		libWrapper.register(getModuleId(), "dnd5e.applications.actor.VehicleActorSheet.prototype._onDropActor", async function(wrapped, event, actor, ...rest) {
			const starship = this.actor ?? this.document ?? null;
			if ( !isSw5eStarshipActor(starship) ) return wrapped(event, actor, ...rest);

			// Short-circuit stock _onAdjustCrew for SW5E starships (unsupported types stay silent).
			if ( !actor || (actor.type !== "character" && actor.type !== "npc") ) return;

			if ( !canCurrentUserDeployStarshipCrewRole(starship, actor, "crew") ) {
				warnStarshipActorUpdateDenied();
				return;
			}

			const hiddenIntent = event?.altKey === true && globalThis.game?.user?.isGM === true;
			const ok = await deployStarshipCrew(
				starship,
				actor,
				"crew",
				hiddenIntent ? { hidden: true } : undefined
			);
			if ( ok !== true ) warnStarshipActorUpdateDenied();
		}, "MIXED");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap VehicleActorSheet._onDropActor for starship crew deploy.", err);
	}
}

async function renderStarshipLayer(app, html, data, options) {
	const actor = data.actor ?? app.actor;
	if ( !isSw5eStarshipActor(actor) ) return;
	const renderGen = beginStarshipSheetRender(app);
	const renderDecision = getStarshipRenderDecision(app, options);
	const coreDecision = renderDecision?.coreDecision
		?? (Array.isArray(options?.parts) && options.parts.includes(STARSHIP_TAB_ID)
			? STARSHIP_CORE_RENDER_DECISION.STOCK_REPLACE
			: STARSHIP_CORE_RENDER_DECISION.NOT_REQUESTED);
	const coreDecisionReason = renderDecision?.reason
		?? (coreDecision === STARSHIP_CORE_RENDER_DECISION.NOT_REQUESTED ? "not-requested" : "decision-missing");

	await ensureStarshipDefaultShowVehicleAbilities(actor);
	if ( !isStarshipSheetRenderCurrent(app, renderGen) ) {
		clearStarshipRenderDecision(app, options);
		return;
	}
	maybeWarnSpaceStationUndersized(actor);

	const root = getHtmlRoot(html);
	if ( !root ) {
		clearStarshipRenderDecision(app, options);
		return;
	}
	try {
		const scrollSnap = readStarshipSheetScrollSnapshot(app);
		const pendingSidebarScroll = consumeStarshipPendingSidebarScroll(app);
		if ( pendingSidebarScroll !== null ) scrollSnap.sidebarScrollTop = pendingSidebarScroll;

		root.classList.add("sw5e-starship-sheet");
		if ( SW5E_STARSHIP_SHEET_DIAG_ENABLED ) root.dataset.sw5eStarshipDiagSheet = "1";

		ensureStarshipAbilitySaveTabModeSync(root, app);
		ensureStarshipTrustedSystemPathDelegate(root, app);
		ensureStarshipVitalsDelegate(root, app);
		ensureStarshipFuelActionsDelegate(root, app);
		ensureStarshipShipsStoresConfigDelegate(root, app);
		ensureStarshipReplenishCostModeDelegate(root, app);
		ensureStarshipFoodCapSourceDelegate(root, app);
		ensureStarshipRepairDelegate(root, app);
		ensureStarshipLegacyRoutingDelegate(root, app);
		ensureStarshipAdvancedPowerDelegate(root, app);
		ensureStarshipCorePanelCollapseDelegate(root, app);
		ensureStarshipDestructionSaveDelegate(root, app);
		ensureStarshipSystemDamageDelegate(root, app);
		ensureStarshipOverviewAbilityMirrors(root, app, actor);
		ensureStarshipSheetSubmitDiagnostic(root, app, actor);

		await ensureWarningsDialog(root, app, actor);
		if ( !isStarshipSheetRenderCurrent(app, renderGen) ) return;

		// Phase 3: one gate + one derived runtime for this Core render invocation (movement/chrome + template).
		const showPowerRouting = shouldShowStarshipPowerRouting(actor);
		const runtime = getDerivedStarshipRuntime(actor, { showPowerRouting });

		const { nav, panelParent, integrated } = ensureStarshipTabTargets(root);
		if ( !nav || !panelParent ) {
			warnStarshipCorePart("Could not resolve stock primary tab targets for permanent Core PART ownership.");
			return;
		}

		const migrateToFeaturesTab = app._sw5eSotgSubTab === "features"
			|| app._sw5eStarshipActiveTab === STARSHIP_FEATURES_TAB_ID;
		if ( app._sw5eSotgSubTab === "features" ) app._sw5eSotgSubTab = "overview";
		delete app._sw5eStarshipActiveTab;

		const starshipViewState = captureStarshipSheetViewState(app, scrollSnap);
		if ( migrateToFeaturesTab ) starshipViewState.stockPrimary = STARSHIP_FEATURES_TAB_ID;

		let coreState = getStarshipCoreWrapperState(nav, panelParent);
		if ( coreState.customRoots.length || coreState.customNavEntries.length ) {
			warnStarshipCorePart("Removing stale custom Core ownership from permanent PART path.", {
				customRoots: coreState.customRoots.length,
				customNavEntries: coreState.customNavEntries.length
			});
			for ( const node of coreState.customRoots ) node.remove();
			for ( const node of coreState.customNavEntries ) node.remove();
			coreState = getStarshipCoreWrapperState(nav, panelParent);
		}

		const malformedReasons = [];
		if ( coreState.stockNavEntries.length !== 1 ) malformedReasons.push("duplicate-core-nav");
		if ( coreState.partRoots.length !== 1 ) malformedReasons.push("duplicate-core-root");
		if ( coreState.partRoots[0]?.dataset?.group !== "primary" ) malformedReasons.push("malformed-wrapper-contract");
		if ( malformedReasons.length ) {
			warnStarshipCorePart("Permanent Core PART root is missing or malformed; aborting starship Core update.", {
				reasons: malformedReasons,
				navEntries: coreState.navEntries.length,
				partRoots: coreState.partRoots.length,
				customRoots: coreState.customRoots.length
			});
			return;
		}

		const existingWrapper = coreState.partRoots[0];
		app._sw5eLastCorePartialUpdate = {
			decision: {
				coreDecision,
				reason: coreDecisionReason,
				originalPartRequest: renderDecision?.originalPartRequest ?? null,
				normalizedPartRequest: renderDecision?.normalizedPartRequest ?? null,
				effectivePartRequest: renderDecision?.effectivePartRequest ?? cloneStarshipRequestedParts(options?.parts) ?? []
			},
			gate: {
				allowPartial: coreDecision === STARSHIP_CORE_RENDER_DECISION.PARTIAL_PRESERVE,
				reason: coreDecisionReason
			},
			result: coreDecision === STARSHIP_CORE_RENDER_DECISION.NOT_REQUESTED
				? { status: "not-requested", reason: coreDecisionReason }
				: coreDecision === STARSHIP_CORE_RENDER_DECISION.STOCK_REPLACE
					? { status: "stock-replace", reason: coreDecisionReason }
					: null,
			fallbackApplied: false,
			owner: existingWrapper?.dataset?.sw5eCoreOwner ?? "unknown",
			renderGeneration: renderGen
		};

		const sidebarOutcome = await renderStarshipSidebarSections(root, actor, app, {
			runtime,
			renderGen,
			allowPartial: coreDecision === STARSHIP_CORE_RENDER_DECISION.PARTIAL_PRESERVE
		});
		if ( sidebarOutcome === "skipped" || !isStarshipSheetRenderCurrent(app, renderGen) ) return;

		removeStarshipSidebarSummary(root);
		applyStarshipSidebarChrome(root, actor, app, { runtime });
		applyStarshipSheetScrollPositions(app, {
			sidebarScrollTop: Number(scrollSnap.sidebarScrollTop) || 0,
			mainScrollTop: 0,
			sotgPanelScrollTop: 0
		});
		suppressStockVehicleHpMeterForStarship(root, actor, app);

		if ( coreDecision !== STARSHIP_CORE_RENDER_DECISION.NOT_REQUESTED ) {
			const { coreRenderData, coreMeta } = buildStarshipCoreRenderData(app, actor, runtime, {
				integrated,
				showPowerRouting
			});
			if ( coreDecision === STARSHIP_CORE_RENDER_DECISION.STOCK_REPLACE ) {
				markStarshipCoreSectionOwnership(existingWrapper, { showPowerRouting });
				recordStarshipCoreBaseline(app, actor, coreMeta);
				logStarshipCorePartDiagnostic("Accepted stock Core PART render.", {
					reason: coreDecisionReason
				});
			} else {
				const structuralCompare = compareStarshipSectionSignature(
					app,
					STARSHIP_SECTION.CORE_STRUCTURAL_MODE,
					signaturePayloadCoreStructuralMode(coreMeta)
				);
				const summaryCompare = compareStarshipSectionSignature(
					app,
					STARSHIP_SECTION.CORE_SUMMARY,
					signaturePayloadCoreSummary(coreMeta)
				);
				const partialGate = evaluateStarshipPartialGate(app, actor, {
					hasCoreWrapper: existingWrapper instanceof HTMLElement && (!renderDecision?.expectedCoreRoot || existingWrapper === renderDecision.expectedCoreRoot),
					structuralModeChanged: structuralCompare.dirty,
					summaryChanged: summaryCompare.dirty
				});
				app._sw5eLastCorePartialUpdate.gate = partialGate;
				const rendered = await renderStarshipCoreInnerHtml(coreRenderData);
				if ( !isStarshipSheetRenderCurrent(app, renderGen) ) return;

				let partialCoreResult = partialGate.allowPartial
					? await tryApplyStarshipCorePartialUpdates(existingWrapper, rendered, app, renderGen, coreMeta, {
						expectedCoreRoot: renderDecision?.expectedCoreRoot ?? null
					})
					: { status: "fallback", reason: partialGate.reason, details: { phase: "gate" } };
				app._sw5eLastCorePartialUpdate.result = partialCoreResult;
				if ( partialCoreResult.status === "skipped" ) return;
				if ( partialCoreResult.status !== "applied" ) {
					if ( !isStarshipSheetRenderCurrent(app, renderGen) ) return;
					existingWrapper.innerHTML = rendered;
					markStarshipCoreSectionOwnership(existingWrapper, { showPowerRouting });
					recordStarshipCoreBaseline(app, actor, coreMeta);
					if ( app._sw5eLastCorePartialUpdate ) app._sw5eLastCorePartialUpdate.fallbackApplied = true;
					logStarshipCorePartDiagnostic("Controlled Core inner fallback applied.", {
						reason: partialCoreResult.reason,
						details: partialCoreResult.details ?? null
					});
				}
			}
		}
		if ( existingWrapper instanceof HTMLElement ) {
			syncSotgSheetPhaseClasses(app, existingWrapper.querySelector(".sw5e-starship-panel"));
			ensureStarshipCoreInteractions(existingWrapper, app, actor);
		}
		configureStarshipPrimaryTabLabels(nav);
		ensureStarshipFeaturesTabNav(root, app, nav);
		restoreStarshipSheetViewState(app, starshipViewState, root);
		ensureStarshipCargoInventoryInteractions(root, app);
		ensureStarshipFeaturesInventoryInteractions(root, app);
		// Rebind modifications-header observer when Inventory PART identity changes (Phase 10A).
		ensureStarshipModificationsSectionHeaderSync(root, app);
		scheduleStarshipModificationsSectionHeader(root, actor);
		scheduleStarshipDuplicateSizeNeutralize(root, app, actor);
		scheduleStarshipAbilitySaveTabSync(root, app);
		queueMicrotask(() => runStarshipSheetDiagnostics(root, app, actor, "render:updateSotgLayer"));
	} finally {
		clearStarshipRenderDecision(app, options);
		bindStarshipSheetImageFallbacks(root);
	}
}

export function patchStarshipSheet() {
	registerStarshipConditionStatusEffectHooks();
	registerStarshipTokenStatusHooks();
	registerStarshipEffectsContextWrapper();
	registerStarshipEffectsConditionPresentation();
	registerStarshipEffectsSlowedToggleGuard();
	registerStarshipCoreTabPart();
	registerStarshipFeaturesTabPart();
	registerStarshipCorePartRenderOptionsWrapper();
	registerStarshipVehiclePartContextWrapper();
	registerStarshipCrewDropWrapper();
	registerStarshipVehicleSheetShowAbilitiesDefault();
	registerStarshipCargoInventoryWrappers();
	registerStarshipCargoItemCategoryHook();
	Hooks.on("renderActorSheetV2", renderStarshipLayer);
	Hooks.on("preUpdateActor", (doc, changed, opts, uid) => {
		logStarshipPreUpdateTraitsIncoming(doc, changed);
		logStarshipPreUpdateAbilities(doc, changed, "incoming");
	});
	Hooks.on("preUpdateActor", onPreUpdateActorStarshipTraitsSize);
	Hooks.on("preUpdateActor", onPreUpdateActorStarshipHpIntegers);
	Hooks.on("preUpdateActor", onPreUpdateActorStarshipAbilities);
	Hooks.on("preUpdateActor", (doc, changed, opts, uid) => {
		logStarshipPreUpdateTraitsAfterSanitize(doc, changed);
		logStarshipPreUpdateAbilities(doc, changed, "after sanitize");
	});
	Hooks.on("updateActor", (doc, changed) => {
		if ( !isSw5eStarshipActor(doc) ) return;
		const hull = foundry.utils.getProperty(changed, "system.attributes.hp.value");
		if ( hull !== 0 ) return;
		const sheet = doc.sheet;
		if ( sheet?.rendered ) sheet._sw5eDestructionTrayOpen = true;
	});
}

















