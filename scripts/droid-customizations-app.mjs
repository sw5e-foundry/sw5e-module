import { getModulePath } from "./module-support.mjs";
import { pickDroidCustomizationCompendiumUuid } from "./droid-customizations-browser.mjs";
import {
	addDroidCustomizationToActor,
	DROID_PARTS_ABILITY_KEYS,
	DROID_PROTOCOLS_ABILITY_KEYS,
	DROID_DEFAULT_MOTOR_SLOTS,
	getActorToolProficiencyValue,
	getEffectiveDroidCustomizationItemMeta,
	getMotorUpgradeCost,
	getMotorUpgradeTimeHours,
	isActorDroidCustomizationsManagerAllowed,
	isValidDroidCustomizationItemMeta,
	normalizeActorDroidCustomizations,
	recordDroidCustomizationFailure,
	removeDroidCustomizationFromActor,
	resolveDroidRequiredToolActorKey,
	upgradeDroidMotorSlots,
	updateDroidCustomizationLimitAbilities,
	validateDroidCustomizationInstall,
	validateDroidCustomizationRemove,
	validateDroidMotorUpgrade
} from "./droid-customizations.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const DialogV2 = foundry.applications.api.DialogV2;

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : fallback;
}

function capitalize(text) {
	return typeof text === "string" && text
		? text.charAt(0).toUpperCase() + text.slice(1)
		: "";
}

const DROID_CATEGORY_LABEL_KEYS = Object.freeze({
	part: "SW5E.DroidCustomizations.PickerCategoryPart",
	protocol: "SW5E.DroidCustomizations.PickerCategoryProtocol"
});

const DROID_RARITY_LABEL_KEYS = Object.freeze({
	standard: "DND5E.ItemRarityCommon",
	premium: "DND5E.ItemRarityUncommon",
	prototype: "DND5E.ItemRarityRare",
	advanced: "DND5E.ItemRarityVeryRare",
	legendary: "DND5E.ItemRarityLegendary",
	artifact: "DND5E.ItemRarityArtifact"
});

function formatDroidCategory(category) {
	return localizeOrFallback(DROID_CATEGORY_LABEL_KEYS[category] ?? "", capitalize(category ?? "—"));
}

function formatDroidRarity(rarity) {
	return localizeOrFallback(DROID_RARITY_LABEL_KEYS[rarity] ?? "", capitalize(rarity ?? "—"));
}

function getAbilityLabel(key) {
	const labelKey = CONFIG?.DND5E?.abilities?.[key]?.label;
	if ( typeof labelKey === "string" && labelKey ) return game.i18n.localize(labelKey);
	return String(key ?? "").toUpperCase();
}

function makeAbilityOptions(keys, selected) {
	return keys.map(value => ({
		value,
		label: getAbilityLabel(value),
		selected: value === selected
	}));
}

function getRequiredToolLabel(requiredTool, actorToolKey = null) {
	if ( actorToolKey ) {
		const labelKey = CONFIG?.DND5E?.toolProficiencies?.[actorToolKey];
		if ( typeof labelKey === "string" && labelKey ) return game.i18n.localize(labelKey);
	}
	return typeof requiredTool === "string" && requiredTool.trim()
		? requiredTool.trim()
		: localizeOrFallback("SW5E.DroidCustomizations.RequiredToolAstrotech", "Astrotech's implements");
}

/** @type {typeof import("/systems/dnd5e/module/enrichers.mjs").createRollLabel|null} */
let _cachedCreateRollLabel = undefined;

async function getDnd5eCreateRollLabel() {
	if ( _cachedCreateRollLabel !== undefined ) return _cachedCreateRollLabel;
	try {
		const enrichers = await import("/systems/dnd5e/module/enrichers.mjs");
		_cachedCreateRollLabel = typeof enrichers.createRollLabel === "function" ? enrichers.createRollLabel : null;
	} catch {
		_cachedCreateRollLabel = null;
	}
	return _cachedCreateRollLabel;
}

/**
 * @returns {import("@league/foundry").documents.Actor[]}
 */
function collectProcedureRollActors() {
	return game.actors
		.filter(a => a?.type === "character" && a.hasPlayerOwner)
		.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
}

/**
 * @param {import("@league/foundry").documents.Actor[]} actors
 * @param {string|null} toolKey
 */
function pickDefaultProcedureRollActorId(actors, toolKey) {
	if ( !actors.length ) return "";
	if ( toolKey ) {
		const proficient = actors.find(a => getActorToolProficiencyValue(a, toolKey) > 0);
		if ( proficient ) return proficient.id;
	}
	const assigned = game.user.character;
	if ( assigned && actors.some(a => a.id === assigned.id) ) return assigned.id;
	return actors[0].id;
}

/**
 * @param {{ message?: string }[]} [warnings]
 * @returns {string}
 */
function formatProcedureWarningsHtml(warnings) {
	if ( !Array.isArray(warnings) || !warnings.length ) return "";
	const items = warnings
		.map(w => (typeof w?.message === "string" && w.message.trim() ? w.message.trim() : ""))
		.filter(Boolean)
		.map(msg => `<li>${foundry.utils.escapeHTML(msg)}</li>`)
		.join("");
	if ( !items ) return "";
	return [
		`<div class="notification warning sw5e-droid-procedure-warnings">`,
		`<p class="sw5e-droid-procedure-warnings-title">${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.ProcedureWarningsTitle"))}</p>`,
		`<ul>${items}</ul>`,
		`</div>`
	].join("");
}

/**
 * @param {import("@league/foundry").applications.api.ApplicationV2|null|undefined} app
 * @param {HTMLElement|null|undefined} element
 * @returns {HTMLElement|null}
 */
function resolveProcedureDialogRoot(app, element) {
	if ( element instanceof HTMLElement ) {
		return element.querySelector(".sw5e-droid-procedure-dialog") ?? element;
	}
	const appEl = app?.element;
	if ( appEl instanceof HTMLElement ) {
		return appEl.querySelector(".sw5e-droid-procedure-dialog") ?? appEl;
	}
	return document.querySelector(".window-app.active .sw5e-droid-procedure-dialog");
}

/**
 * @param {import("@league/foundry").applications.api.ApplicationV2|null|undefined} app
 * @param {HTMLElement|null|undefined} element
 * @param {object} rollCtx
 * @param {{ bound: boolean }} boundRef
 */
function tryBindProcedureRollHandlers(app, element, rollCtx, boundRef) {
	if ( boundRef.bound || !game.user.isGM ) return;
	const root = resolveProcedureDialogRoot(app, element);
	if ( !root?.querySelector(".sw5e-droid-procedure-rolls") ) return;
	boundRef.bound = true;
	bindProcedureRollHandlers(root, rollCtx);
}

/**
 * @param {object} params
 * @param {string} [params.intro]
 * @param {string} params.itemName
 * @param {string} params.requiredTool
 * @param {number|null|undefined} params.checkDC
 * @param {number|null|undefined} params.procedureTimeHours
 * @param {string} [params.outcomeHint]
 * @param {{ message?: string }[]} [params.warnings]
 * @param {boolean} [params.showRollActions]
 * @param {import("@league/foundry").documents.Actor[]} [params.rollActors]
 * @param {string} [params.defaultRollActorId]
 * @param {boolean} [params.rollActionsDisabled]
 */
function buildProcedureDialogContent({
	intro,
	itemName,
	requiredTool,
	checkDC,
	procedureTimeHours,
	outcomeHint,
	warnings = [],
	showRollActions = false,
	rollActors = [],
	defaultRollActorId = "",
	rollActionsDisabled = false
}) {
	const dcText = checkDC != null ? String(checkDC) : "—";
	const timeText = procedureTimeHours != null
		? `${procedureTimeHours} ${game.i18n.localize("SW5E.DroidCustomizations.ProcedureTimeUnit")}`
		: "—";
	const lines = [`<div class="sw5e-droid-procedure-dialog">`];
	const introText = typeof intro === "string" ? intro.trim() : "";
	if ( introText ) lines.push(`<p class="notes">${foundry.utils.escapeHTML(introText)}</p>`);
	const warningsHtml = formatProcedureWarningsHtml(warnings);
	if ( warningsHtml ) lines.push(warningsHtml);
	lines.push(
		`<table class="sw5e-droid-procedure-table">`,
		"<thead><tr>",
		`<th>${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.ColName"))}</th>`,
		`<th>${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.ColRequired"))}</th>`,
		`<th>${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.ColDC"))}</th>`,
		`<th>${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.ColTime"))}</th>`,
		"</tr></thead><tbody><tr>",
		`<td>${foundry.utils.escapeHTML(itemName)}</td>`,
		`<td>${foundry.utils.escapeHTML(requiredTool || "—")}</td>`,
		`<td>${foundry.utils.escapeHTML(dcText)}</td>`,
		`<td>${foundry.utils.escapeHTML(timeText)}</td>`,
		`</tr></tbody></table>`
	);
	if ( showRollActions ) {
		const actorOptions = rollActors.length
			? rollActors.map(a => {
				const selected = a.id === defaultRollActorId ? " selected" : "";
				return `<option value="${foundry.utils.escapeHTML(a.id)}"${selected}>${foundry.utils.escapeHTML(a.name)}</option>`;
			}).join("")
			: `<option value="">${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.ProcedureRollNoParty"))}</option>`;
		const disabledAttr = rollActionsDisabled || !rollActors.length ? " disabled" : "";
		lines.push(
			`<div class="sw5e-droid-procedure-rolls">`,
			`<label class="sw5e-droid-procedure-rolls-label">${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.ProcedureRollerLabel"))}</label>`,
			`<select name="sw5e-droid-procedure-roller" class="sw5e-droid-procedure-roller"${disabledAttr}>${actorOptions}</select>`,
			`<button type="button" class="sw5e-droid-procedure-roll" data-sw5e-droid-procedure-roll="gm"${disabledAttr}>`,
			`<i class="fas fa-dice-d20"></i> ${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.ProcedureRoll"))}`,
			`</button>`,
			`<button type="button" class="sw5e-droid-procedure-roll" data-sw5e-droid-procedure-roll="request"${disabledAttr}>`,
			`<i class="fas fa-comments"></i> ${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.ProcedureRequestRoll"))}`,
			`</button>`,
			`</div>`
		);
	}
	if ( outcomeHint ) lines.push(`<p class="hint">${foundry.utils.escapeHTML(outcomeHint)}</p>`);
	lines.push("</div>");
	return lines.join("");
}

/**
 * @param {HTMLElement} root
 * @param {object} ctx
 * @param {import("@league/foundry").documents.Actor} ctx.hostActor
 * @param {"install"|"remove"} ctx.kind
 * @param {string} ctx.itemName
 * @param {string|null|undefined} ctx.requiredToolActorKey
 * @param {number|null|undefined} ctx.checkDC
 * @param {string} ctx.requiredToolLabel
 */
function bindProcedureRollHandlers(root, ctx) {
	const rollRoot = root.querySelector(".sw5e-droid-procedure-rolls");
	if ( !rollRoot || rollRoot.dataset.sw5eDroidProcedureRollBound === "1" ) return;
	rollRoot.dataset.sw5eDroidProcedureRollBound = "1";

	const getSelectedRoller = () => {
		const id = rollRoot.querySelector("select[name=\"sw5e-droid-procedure-roller\"]")?.value?.trim();
		return id ? game.actors.get(id) : null;
	};

	const ensureRollReady = () => {
		if ( !ctx.requiredToolActorKey ) {
			ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.ProcedureRollToolUnmapped"));
			return false;
		}
		if ( ctx.checkDC == null || !Number.isFinite(Number(ctx.checkDC)) ) {
			ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.ProcedureRollDcMissing"));
			return false;
		}
		const roller = getSelectedRoller();
		if ( !roller ) {
			ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.ProcedureRollNoActor"));
			return false;
		}
		return true;
	};

	const procedureFlavor = ctx.kind === "install"
		? game.i18n.format("SW5E.DroidCustomizations.ProcedureRollFlavorInstall", {
			name: ctx.itemName,
			droid: ctx.hostActor.name
		})
		: game.i18n.format("SW5E.DroidCustomizations.ProcedureRollFlavorRemove", {
			name: ctx.itemName,
			droid: ctx.hostActor.name
		});

	rollRoot.querySelector("[data-sw5e-droid-procedure-roll=\"gm\"]")?.addEventListener("click", async ev => {
		ev.preventDefault();
		if ( !ensureRollReady() ) return;
		const roller = getSelectedRoller();
		try {
			await roller.rollToolCheck(
				{ tool: ctx.requiredToolActorKey, target: Number(ctx.checkDC) },
				{},
				{ data: { flavor: procedureFlavor } }
			);
		} catch ( err ) {
			console.warn("SW5E | Droid procedure GM roll failed", err);
			ui.notifications.error(game.i18n.localize("SW5E.DroidCustomizations.ProcedureRollFailed"));
		}
	});

	rollRoot.querySelector("[data-sw5e-droid-procedure-roll=\"request\"]")?.addEventListener("click", async ev => {
		ev.preventDefault();
		if ( !ensureRollReady() ) return;
		const roller = getSelectedRoller();
		const dataset = {
			type: "tool",
			tool: ctx.requiredToolActorKey,
			dc: String(ctx.checkDC),
			format: "short",
			action: "rollRequest",
			visibility: "all"
		};
		const createRollLabel = await getDnd5eCreateRollLabel();
		const buttonLabel = createRollLabel
			? createRollLabel({ ...dataset, icon: true })
			: `${ctx.requiredToolLabel} (DC ${ctx.checkDC})`;
		const hiddenLabel = createRollLabel
			? createRollLabel({ ...dataset, icon: true, hideDC: true })
			: ctx.requiredToolLabel;
		const content = await foundry.applications.handlebars.renderTemplate(
			"systems/dnd5e/templates/chat/roll-request-card.hbs",
			{ buttons: [{ buttonLabel, hiddenLabel, dataset }] }
		);
		const whisper = game.users.filter(u => roller.testUserPermission(u, "OWNER"));
		const flavorKey = ctx.kind === "install"
			? "SW5E.DroidCustomizations.ProcedureRequestFlavorInstall"
			: "SW5E.DroidCustomizations.ProcedureRequestFlavorRemove";
		await ChatMessage.create({
			content,
			flavor: game.i18n.format(flavorKey, { name: ctx.itemName, roller: roller.name, droid: ctx.hostActor.name }),
			whisper,
			speaker: ChatMessage.getSpeaker({ actor: ctx.hostActor })
		});
		ui.notifications.info(game.i18n.localize("SW5E.DroidCustomizations.ProcedureRequestPosted"));
	});
}

/**
 * @param {object} params
 * @param {"install"|"remove"} params.kind
 * @param {import("@league/foundry").documents.Actor} params.hostActor
 * @param {string} params.itemName
 * @param {object} params.procedureInfo validation.info
 * @param {{ message?: string }[]} [params.warnings]
 * @returns {Promise<"success"|"failure"|null>}
 */
async function promptDroidProcedureCheck({ kind, hostActor, itemName, procedureInfo, warnings = [] }) {
	const requiredToolActorKey = procedureInfo.requiredToolActorKey
		?? resolveDroidRequiredToolActorKey(procedureInfo.requiredTool);
	const requiredTool = getRequiredToolLabel(
		procedureInfo.requiredTool,
		requiredToolActorKey
	);
	const titleKey = kind === "install"
		? "SW5E.DroidCustomizations.InstallCheckTitle"
		: "SW5E.DroidCustomizations.RemoveCheckTitle";
	const intro = kind === "install"
		? game.i18n.localize("SW5E.DroidCustomizations.InstallCheckIntro")
		: game.i18n.localize("SW5E.DroidCustomizations.RemoveCheckIntro");
	const outcomeHint = game.i18n.localize(
		kind === "install"
			? "SW5E.DroidCustomizations.InstallCheckHint"
			: "SW5E.DroidCustomizations.RemoveCheckHint"
	);
	const rollActors = game.user.isGM ? collectProcedureRollActors() : [];
	const defaultRollActorId = pickDefaultProcedureRollActorId(rollActors, requiredToolActorKey);
	const rollCtx = {
		hostActor,
		kind,
		itemName,
		requiredToolActorKey,
		checkDC: procedureInfo.checkDC,
		requiredToolLabel: requiredTool
	};
	const boundRef = { bound: false };
	const scheduleRollBindFallback = () => {
		requestAnimationFrame(() => tryBindProcedureRollHandlers(null, null, rollCtx, boundRef));
		setTimeout(() => tryBindProcedureRollHandlers(null, null, rollCtx, boundRef), 50);
	};

	scheduleRollBindFallback();

	return DialogV2.wait({
		window: { title: game.i18n.localize(titleKey) },
		content: buildProcedureDialogContent({
			intro,
			itemName,
			requiredTool,
			checkDC: procedureInfo.checkDC,
			procedureTimeHours: procedureInfo.procedureTimeHours,
			outcomeHint,
			warnings,
			showRollActions: game.user.isGM,
			rollActors,
			defaultRollActorId,
			rollActionsDisabled: !requiredToolActorKey
		}),
		hooks: {
			onRender: (app, element) => tryBindProcedureRollHandlers(app, element, rollCtx, boundRef)
		},
		buttons: [
			{
				action: "success",
				label: game.i18n.localize("SW5E.DroidCustomizations.CheckSuccess"),
				icon: "fas fa-check",
				default: true
			},
			{
				action: "failure",
				label: game.i18n.localize("SW5E.DroidCustomizations.CheckFailure"),
				icon: "fas fa-xmark"
			}
		]
	});
}

function formatDroidPickerLabel(name, meta) {
	const n = typeof name === "string" ? name.trim() : "";
	const base = n || "—";
	if ( !meta || typeof meta !== "object" ) return base;
	const catLabel = formatDroidCategory(meta.category);
	const rarLabel = formatDroidRarity(meta.rarity);
	if ( catLabel && rarLabel ) return `${base} — ${catLabel} · ${rarLabel}`;
	if ( catLabel ) return `${base} — ${catLabel}`;
	return base;
}

async function collectWorldDroidCustomizationInstallChoices() {
	const choices = [];
	const seen = new Set();
	const push = (uuid, name, meta) => {
		if ( !uuid || seen.has(uuid) ) return;
		seen.add(uuid);
		choices.push({ uuid, name, pickerLabel: formatDroidPickerLabel(name, meta) });
	};

	for ( const item of game.items ) {
		const meta = getEffectiveDroidCustomizationItemMeta(item);
		if ( !meta || !isValidDroidCustomizationItemMeta(meta) ) continue;
		push(item.uuid, item.name, meta);
	}

	choices.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
	return choices;
}

async function promptPickWorldDroidCustomization() {
	const choices = await collectWorldDroidCustomizationInstallChoices();
	if ( !choices.length ) {
		ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.WorldInstallUnavailable"));
		return "";
	}

	const optionsHtml = choices.map(choice => {
		const value = foundry.utils.escapeHTML(choice.uuid);
		const label = foundry.utils.escapeHTML(choice.pickerLabel);
		return `<option value="${value}">${label}</option>`;
	}).join("");

	const result = await DialogV2.wait({
		window: { title: game.i18n.localize("SW5E.DroidCustomizations.WorldInstallDialogTitle") },
		content: [
			`<p class="hint">${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.WorldInstallDialogHint"))}</p>`,
			`<div class="form-group">`,
			`<label for="sw5e-droid-world-item-choice">${foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.WorldInstallLabel"))}</label>`,
			`<select id="sw5e-droid-world-item-choice" name="choice" autofocus>${optionsHtml}</select>`,
			`</div>`
		].join(""),
		buttons: [
			{
				action: "choose",
				label: game.i18n.localize("SW5E.DroidCustomizations.WorldInstallConfirm"),
				icon: "fas fa-plus",
				default: true,
				callback: (_event, button) => button.form?.elements?.choice?.value?.trim?.() ?? ""
			},
			{
				action: "cancel",
				label: localizeOrFallback("Cancel", "Cancel"),
				icon: "fas fa-times"
			}
		],
		rejectClose: false
	});

	return typeof result === "string" && result !== "cancel" ? result : "";
}

function formatDroidValidationHtml(validation) {
	if ( !validation ) return "";
	const lines = [];
	if ( validation.blocking?.length ) {
		lines.push(`<p class="sw5e-aug-val-title sw5e-aug-val-blocking">${game.i18n.localize("SW5E.DroidCustomizations.ValidationBlocking")}</p><ul>`);
		for ( const b of validation.blocking ) {
			lines.push(`<li>${foundry.utils.escapeHTML(b.message)}</li>`);
		}
		lines.push("</ul>");
	}
	if ( validation.warnings?.length ) {
		lines.push(`<p class="sw5e-aug-val-title sw5e-aug-val-warn">${game.i18n.localize("SW5E.DroidCustomizations.ValidationWarnings")}</p><ul>`);
		for ( const w of validation.warnings ) {
			lines.push(`<li>${foundry.utils.escapeHTML(w.message)}</li>`);
		}
		lines.push("</ul>");
	}
	const info = validation.info;
	if ( info && typeof info === "object" ) {
		lines.push(`<p class="sw5e-aug-val-title">${game.i18n.localize("SW5E.DroidCustomizations.ValidationInfo")}</p><dl class="sw5e-aug-info-dl">`);
		const add = (dtKey, val) => {
			if ( val == null || val === "" ) return;
			lines.push(`<dt>${game.i18n.localize(dtKey)}</dt><dd>${foundry.utils.escapeHTML(String(val))}</dd>`);
		};
		add("SW5E.DroidCustomizations.InfoMotorTotal", info.motorSlots);
		add("SW5E.DroidCustomizations.InfoMotorUsed", info.usedMotorSlots);
		add("SW5E.DroidCustomizations.InfoMotorAvailable", info.availableMotorSlots);
		add("SW5E.DroidCustomizations.InfoPartsCount", info.partsCount);
		add("SW5E.DroidCustomizations.InfoProtocolsCount", info.protocolsCount);
		add("SW5E.DroidCustomizations.InfoPartsAllowed", info.partsAllowed);
		add("SW5E.DroidCustomizations.InfoProtocolsAllowed", info.protocolsAllowed);
		add("SW5E.DroidCustomizations.InfoMotorCost", info.motorSlotCost);
		if ( info.requiredTool ) add("SW5E.DroidCustomizations.InfoTool", info.requiredTool);
		if ( info.checkDC != null ) add("SW5E.DroidCustomizations.InfoDC", info.checkDC);
		if ( info.procedureTimeHours != null ) add("SW5E.DroidCustomizations.InfoProcedureHours", info.procedureTimeHours);
		if ( info.retryWaitHours != null ) add("SW5E.DroidCustomizations.InfoRetryWaitHours", info.retryWaitHours);
		if ( info.currentMotorSlots != null ) add("SW5E.DroidCustomizations.InfoCurrentMotor", info.currentMotorSlots);
		if ( info.targetMotorSlots != null ) add("SW5E.DroidCustomizations.InfoTargetMotor", info.targetMotorSlots);
		if ( info.upgradeCost != null ) add("SW5E.DroidCustomizations.InfoUpgradeCost", info.upgradeCost);
		if ( info.upgradeTimeHours != null ) add("SW5E.DroidCustomizations.InfoUpgradeHours", info.upgradeTimeHours);
		lines.push("</dl>");
	}
	return lines.join("\n");
}

/**
 * @param {import("@league/foundry").documents.Actor|null} actor
 * @param {string} uuid
 */
async function openInstalledDroidSource(actor, uuid) {
	const id = String(uuid ?? "").trim();
	if ( !id ) {
		ui.notifications.warn(localizeOrFallback("SW5E.DroidCustomizations.OpenItemMissingUuid", "This entry has no linked item UUID."));
		return;
	}
	try {
		const doc = await fromUuid(id);
		if ( doc?.documentName === "Item" && typeof doc.sheet?.render === "function" ) {
			const rendered = doc.sheet.render(true);
			if ( rendered instanceof Promise ) await rendered;
			return;
		}
	} catch ( err ) {
		console.warn("SW5E | Droid customizations: open source item failed", err);
	}
	ui.notifications.warn(localizeOrFallback("SW5E.DroidCustomizations.OpenItemNotFound", "Could not open that item."));
}

export async function resolveDroppedDroidCustomizationItem(event) {
	const dragData = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
	if ( !dragData || typeof dragData !== "object" ) return null;
	try {
		const item = await Item.implementation.fromDropData(dragData);
		return item?.documentName === "Item" ? item : null;
	} catch {
		return null;
	}
}

export async function installDroidCustomizationItem(actor, item, {
	force = false,
	setInstallValidation = null,
	rerender = null
} = {}) {
	if ( !actor ) return { ok: false, validation: null, entry: null, reason: "missing-actor" };
	if ( !item || item.documentName !== "Item" ) {
		setInstallValidation?.(null);
		ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.DropInvalid"));
		return { ok: false, validation: null, entry: null, reason: "invalid-item" };
	}

	const validation = validateDroidCustomizationInstall(actor, item, { force });
	setInstallValidation?.(validation);
	if ( !validation.ok ) {
		ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.InstallBlocked"));
		return { ok: false, validation, entry: null, reason: "blocked" };
	}

	if ( !force ) {
		const installInfo = validation.info ?? {};
		const outcome = await promptDroidProcedureCheck({
			kind: "install",
			hostActor: actor,
			itemName: item.name ?? "—",
			procedureInfo: installInfo,
			warnings: validation.warnings
		});
		if ( outcome !== "success" ) {
			if ( outcome === "failure" ) {
				await recordDroidCustomizationFailure(actor, "install");
				ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.InstallCheckFailed"));
				if ( typeof rerender === "function" ) await rerender();
			}
			return { ok: false, validation, entry: null, reason: outcome ?? "cancelled" };
		}
	}

	const result = await addDroidCustomizationToActor(actor, item, { force: force === true });
	if ( result.ok ) {
		ui.notifications.info(game.i18n.localize("SW5E.DroidCustomizations.InstallDone"));
		setInstallValidation?.(null);
		if ( typeof rerender === "function" ) await rerender();
		return result;
	}

	setInstallValidation?.(result.validation);
	ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.InstallFailed"));
	return result;
}

export async function installDroidCustomizationByUuid(actor, uuid, options = {}) {
	const id = String(uuid ?? "").trim();
	if ( !id ) return { ok: false, validation: null, entry: null, reason: "missing-uuid" };
	const item = await fromUuid(id);
	if ( !item || item.documentName !== "Item" ) {
		options.setInstallValidation?.(null);
		ui.notifications.error(game.i18n.localize("SW5E.DroidCustomizations.ItemNotFound"));
		return { ok: false, validation: null, entry: null, reason: "item-not-found" };
	}
	return installDroidCustomizationItem(actor, item, options);
}

export class DroidCustomizationsApp extends HandlebarsApplicationMixin(ApplicationV2) {
	/** @param {{ actor: import("@league/foundry").documents.Actor }} opts */
	constructor({ actor } = {}) {
		if ( !actor?.id ) throw new Error("DroidCustomizationsApp requires a persisted actor with an id.");
		super({ id: `sw5e-droid-customizations-${actor.id}` });
		this._actorId = actor.id;
		this.#boundOnActorUpdate = this.#onActorUpdate.bind(this);
		Hooks.on("updateActor", this.#boundOnActorUpdate);
	}

	/** @returns {import("@league/foundry").documents.Actor|null} */
	get actor() {
		return game.actors.get(this._actorId) ?? null;
	}

	static openForActor(actor) {
		if ( !actor?.id ) throw new Error("DroidCustomizationsApp requires a persisted actor with an id.");
		if ( !isActorDroidCustomizationsManagerAllowed(actor) ) {
			ui.notifications.warn(localizeOrFallback("SW5E.DroidCustomizations.OpenBlocked", "This actor cannot use Droid Customizations."));
			return null;
		}
		const id = `sw5e-droid-customizations-${actor.id}`;
		const existing = foundry.applications.instances.get(id);
		if ( existing instanceof DroidCustomizationsApp ) {
			existing.render(true);
			return existing;
		}
		const created = new DroidCustomizationsApp({ actor });
		created.render(true);
		return created;
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["sw5e-droid-customizations-manager"],
		window: {
			resizable: true,
			icon: "fas fa-robot"
		},
		position: {
			width: 580,
			height: 560
		}
	};

	static PARTS = {
		manager: {
			template: getModulePath("templates/apps/droid-customizations-manager.hbs")
		}
	};

	get title() {
		const a = this.actor;
		const name = a?.name ?? localizeOrFallback("SW5E.DroidCustomizations.FallbackActor", "Actor");
		return `${localizeOrFallback("SW5E.DroidCustomizations.WindowTitle", "Droid customizations")}: ${name}`;
	}

	#boundOnActorUpdate;

	#onActorUpdate(doc, change) {
		if ( doc.id !== this._actorId ) return;
		if ( foundry.utils.hasProperty(change, "flags.sw5e.droidCustomizations") ) this.render(false);
	}

	async _prepareContext() {
		const actor = this.actor;
		const actorPresent = Boolean(actor);
		const eligible = Boolean(actor && isActorDroidCustomizationsManagerAllowed(actor));
		const state = actor ? normalizeActorDroidCustomizations(actor) : null;
		const cap = state?.derived?.capacity;
		const counts = state?.derived?.counts;

		const isGm = game.user.isGM;
		const canEdit = Boolean(actor?.isOwner || isGm);
		const showWorkflow = eligible && canEdit;
		const hasWorldInstallChoices = showWorkflow
			? (await collectWorldDroidCustomizationInstallChoices()).length > 0
			: false;

		const installedList = state?.installed ?? [];
		const installedRows = installedList.map(entry => {
			const uuid = entry.uuid ?? "";
			return {
				uuid,
				name: entry.name ?? entry.snapshot?.name ?? "—",
				img: entry.snapshot?.img ?? "",
				categoryLabel: formatDroidCategory(entry.category),
				rarity: formatDroidRarity(entry.rarity),
				motorSlotCost: Math.max(1, Math.floor(Number(entry.motorSlotCost) || 1)),
				installedAtText: entry.installedAt
					? new Date(entry.installedAt).toLocaleDateString(game.i18n.lang)
					: "—"
			};
		});

		const currentMotor = state?.motorSlots ?? DROID_DEFAULT_MOTOR_SLOTS;
		let pickNext = true;
		const motorUpgradeTargets = [3, 4, 5, 6].map(t => {
			const v = actor ? validateDroidMotorUpgrade(actor, t) : null;
			const cost = getMotorUpgradeCost(actor, t);
			const hours = getMotorUpgradeTimeHours(actor, t);
			const disabled = !actor || t <= currentMotor || (v && !v.ok && !isGm);
			const selected = !disabled && pickNext;
			if ( selected ) pickNext = false;
			return {
				value: t,
				selected,
				disabled,
				cost,
				costText: cost != null ? String(cost) : "—",
				hoursText: String(hours),
				blockedSummary: v && !v.ok && v.blocking?.length ? v.blocking.map(b => b.message).join("; ") : ""
			};
		});

		const limitsPartsAbility = state?.limits?.partsAbility ?? "";
		const limitsProtocolsAbility = state?.limits?.protocolsAbility ?? "";

		return {
			actorPresent,
			eligible,
			motorSlots: state?.motorSlots ?? 0,
			motorUsed: cap?.motorUsed ?? 0,
			motorAvailable: cap?.motorAvailable ?? 0,
			partsCount: counts?.parts ?? 0,
			protocolsCount: counts?.protocols ?? 0,
			partsAllowed: cap?.partsAllowed ?? 0,
			protocolsAllowed: cap?.protocolsAllowed ?? 0,
			limitsPartsAbility,
			limitsProtocolsAbility,
			limitsPartsAbilityLabel: limitsPartsAbility ? getAbilityLabel(limitsPartsAbility) : "",
			limitsProtocolsAbilityLabel: limitsProtocolsAbility ? getAbilityLabel(limitsProtocolsAbility) : "",
			partsAbilityOptions: makeAbilityOptions(DROID_PARTS_ABILITY_KEYS, limitsPartsAbility),
			protocolsAbilityOptions: makeAbilityOptions(DROID_PROTOCOLS_ABILITY_KEYS, limitsProtocolsAbility),
			installedRows,
			hasWorldInstallChoices,
			canEdit,
			isGm,
			showWorkflow,
			motorUpgradeTargets,
			readOnlyHint: ""
		};
	}

	async close(options = {}) {
		Hooks.off("updateActor", this.#boundOnActorUpdate);
		return super.close(options);
	}

	_onRender(context, options) {
		super._onRender(context, options);
		const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
		if ( !root ) return;

		const installValidationEl = root.querySelector("[data-sw5e-droid-validation-install]");
		const motorValidationEl = root.querySelector("[data-sw5e-droid-validation-motor]");
		const setInstallValidation = (validation) => {
			if ( !installValidationEl ) return;
			if ( !validation ) {
				installValidationEl.innerHTML = "";
				installValidationEl.hidden = true;
				return;
			}
			installValidationEl.innerHTML = formatDroidValidationHtml(validation);
			installValidationEl.hidden = false;
		};
		const setMotorValidation = (validation) => {
			if ( !motorValidationEl ) return;
			if ( !validation ) {
				motorValidationEl.innerHTML = "";
				motorValidationEl.hidden = true;
				return;
			}
			motorValidationEl.innerHTML = formatDroidValidationHtml(validation);
			motorValidationEl.hidden = false;
		};
		const installButtons = root.querySelectorAll(".sw5e-droid-install-submit, .sw5e-droid-install-world-submit");
		const setInstallBusy = (busy) => {
			for ( const button of installButtons ) {
				if ( button instanceof HTMLButtonElement ) button.disabled = busy;
			}
		};
		const installDropZone = root.querySelector("[data-sw5e-droid-install-dropzone]");
		const setInstallDropActive = (active) => installDropZone?.classList.toggle("sw5e-droid-drop-target--active", active);

		const motorSelect = root.querySelector("select[name=\"sw5e-droid-motor-target\"]");
		const refreshMotorPreview = () => {
			const actor = this.actor;
			if ( !actor || !motorSelect ) return;
			const t = Math.floor(Number(motorSelect.value) || 0);
			const costEl = root.querySelector("[data-sw5e-droid-motor-cost]");
			const hoursEl = root.querySelector("[data-sw5e-droid-motor-hours]");
			if ( !t ) {
				if ( costEl ) costEl.textContent = "—";
				if ( hoursEl ) hoursEl.textContent = "—";
				setMotorValidation(null);
				return;
			}
			const cost = getMotorUpgradeCost(actor, t);
			const hours = getMotorUpgradeTimeHours(actor, t);
			if ( costEl ) costEl.textContent = cost != null ? String(cost) : "—";
			if ( hoursEl ) hoursEl.textContent = String(hours);
			const v = validateDroidMotorUpgrade(actor, t);
			setMotorValidation(v.ok ? null : v);
		};
		motorSelect?.addEventListener("change", refreshMotorPreview);
		refreshMotorPreview();

		root.querySelector(".sw5e-droid-limits-save-submit")?.addEventListener("click", async () => {
			const actor = this.actor;
			if ( !actor ) return;
			const partsAbility = root.querySelector("select[name=\"sw5e-droid-parts-ability\"]")?.value?.trim() || null;
			const protocolsAbility = root.querySelector("select[name=\"sw5e-droid-protocols-ability\"]")?.value?.trim() || null;
			await updateDroidCustomizationLimitAbilities(actor, { partsAbility, protocolsAbility });
			ui.notifications.info(game.i18n.localize("SW5E.DroidCustomizations.LimitsSaved"));
			setInstallValidation(null);
			setMotorValidation(null);
			await this.render(false);
		});

		const installFromUuid = async (uuid) => {
			const actor = this.actor;
			if ( !actor || !uuid ) return;
			const force = game.user.isGM && root.querySelector("input[name=\"sw5e-droid-force-install\"]")?.checked === true;
			await installDroidCustomizationByUuid(actor, uuid, {
				force,
				setInstallValidation,
				rerender: async () => this.render(false)
			});
		};

		root.querySelector(".sw5e-droid-install-submit")?.addEventListener("click", async () => {
			setInstallBusy(true);
			try {
				let uuid = "";
				try {
					uuid = await pickDroidCustomizationCompendiumUuid() ?? "";
				} catch ( err ) {
					console.warn("SW5E | Droid customizations: browser open failed", err);
					ui.notifications.error(game.i18n.localize("SW5E.DroidCustomizations.BrowserOpenFailed"));
					return;
				}
				await installFromUuid(uuid);
			} finally {
				setInstallBusy(false);
			}
		});

		if ( installDropZone ) {
			let installDragDepth = 0;
			installDropZone.addEventListener("dragenter", event => {
				event.preventDefault();
				event.stopPropagation();
				installDragDepth += 1;
				setInstallDropActive(true);
			});
			installDropZone.addEventListener("dragover", event => {
				event.preventDefault();
				event.stopPropagation();
				if ( event.dataTransfer ) event.dataTransfer.dropEffect = "copy";
				setInstallDropActive(true);
			});
			installDropZone.addEventListener("dragleave", event => {
				event.preventDefault();
				event.stopPropagation();
				installDragDepth = Math.max(0, installDragDepth - 1);
				if ( installDragDepth === 0 ) setInstallDropActive(false);
			});
			installDropZone.addEventListener("drop", async event => {
				event.preventDefault();
				event.stopPropagation();
				installDragDepth = 0;
				setInstallDropActive(false);
				const actor = this.actor;
				if ( !actor ) return;
				setInstallBusy(true);
				try {
					const droppedItem = await resolveDroppedDroidCustomizationItem(event);
					const force = game.user.isGM && root.querySelector("input[name=\"sw5e-droid-force-install\"]")?.checked === true;
					await installDroidCustomizationItem(actor, droppedItem, {
						force,
						setInstallValidation,
						rerender: async () => this.render(false)
					});
				} finally {
					setInstallBusy(false);
				}
			});
		}

		root.querySelector(".sw5e-droid-install-world-submit")?.addEventListener("click", async () => {
			setInstallBusy(true);
			try {
				const uuid = await promptPickWorldDroidCustomization();
				await installFromUuid(uuid);
			} finally {
				setInstallBusy(false);
			}
		});

		for ( const btn of root.querySelectorAll("[data-sw5e-droid-remove]") ) {
			btn.addEventListener("click", async () => {
				const actor = this.actor;
				if ( !actor ) return;
				const uuid = btn.getAttribute("data-sw5e-droid-remove") ?? "";
				const itemName = btn.getAttribute("data-sw5e-droid-remove-name") ?? uuid;
				const validation = validateDroidCustomizationRemove(actor, uuid);
				if ( !validation.ok ) {
					setInstallValidation(validation);
					ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.RemoveBlocked"));
					return;
				}
				const removeInfo = validation.info ?? {};
				const outcome = await promptDroidProcedureCheck({
					kind: "remove",
					hostActor: actor,
					itemName,
					procedureInfo: removeInfo,
					warnings: validation.warnings
				});
				if ( outcome !== "success" && outcome !== "failure" ) return;
				const result = await removeDroidCustomizationFromActor(actor, uuid);
				if ( result.ok ) {
					ui.notifications.info(game.i18n.localize(
						outcome === "failure"
							? "SW5E.DroidCustomizations.RemoveDestroyed"
							: "SW5E.DroidCustomizations.RemoveDone"
					));
					setInstallValidation(null);
					await this.render(false);
				}
				else {
					setInstallValidation(result.validation);
				}
			});
		}

		for ( const btn of root.querySelectorAll("[data-sw5e-droid-open-item]") ) {
			btn.addEventListener("click", async (ev) => {
				ev.preventDefault();
				await openInstalledDroidSource(this.actor, btn.getAttribute("data-sw5e-droid-open-item") ?? "");
			});
		}

		root.querySelector(".sw5e-droid-motor-upgrade-submit")?.addEventListener("click", async () => {
			const actor = this.actor;
			if ( !actor ) return;
			const sel = root.querySelector("select[name=\"sw5e-droid-motor-target\"]");
			const target = Math.floor(Number(sel?.value) || 0);
			if ( !target ) {
				ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.MotorPickTarget"));
				return;
			}
			const force = game.user.isGM && root.querySelector("input[name=\"sw5e-droid-force-motor\"]")?.checked === true;
			const validation = validateDroidMotorUpgrade(actor, target, { force });
			setMotorValidation(validation);
			if ( !validation.ok ) {
				ui.notifications.warn(game.i18n.localize("SW5E.DroidCustomizations.MotorUpgradeBlocked"));
				return;
			}
			const result = await upgradeDroidMotorSlots(actor, target, { force: force === true });
			if ( result.ok ) {
				ui.notifications.info(game.i18n.localize("SW5E.DroidCustomizations.MotorUpgradeDone"));
				setMotorValidation(null);
				await this.render(false);
			}
			else {
				setMotorValidation(result.validation);
			}
		});
	}
}
