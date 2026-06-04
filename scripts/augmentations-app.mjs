import { getModulePath } from "./module-support.mjs";
import { applySw5eThemeScope } from "./theme.mjs";
import { isActorDroidCustomizationHost } from "./droid-customizations.mjs";
import { pickAugmentationCompendiumUuid } from "./augmentations-browser.mjs";
import {
	AUGMENTATION_SIDE_EFFECT_KEYS,
	addAugmentationToActor,
	collectOccupiedBodySlots,
	getEffectiveAugmentationItemMeta,
	getMaxAugmentationsForActor,
	getInstalledAugmentationCount,
	isActorAugmentationCandidate,
	isActorCyberneticAugmentationsManagerAllowed,
	isActorValidAugmentationTarget,
	isLegacyStarshipActor,
	isValidAugmentationItemMeta,
	normalizeActorAugmentations,
	plainTextExcerptFromItemDescriptionHtml,
	removeAugmentationFromActor,
	setAugmentationSideEffectOverride,
	validateAugmentationInstall,
	validateAugmentationRemove
} from "./augmentations.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const DialogV2 = foundry.applications.api.DialogV2;

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : fallback;
}

function formatYesNo(value) {
	return value
		? localizeOrFallback("SW5E.Augmentations.Yes", "Yes")
		: localizeOrFallback("SW5E.Augmentations.No", "No");
}

function overrideModeText(mode) {
	if ( mode === "inherit" ) return localizeOrFallback("SW5E.Augmentations.OverrideInherit", "Use derived");
	if ( mode === "on" ) return localizeOrFallback("SW5E.Augmentations.OverrideOn", "Force on");
	return localizeOrFallback("SW5E.Augmentations.OverrideOff", "Force off");
}

const SIDE_EFFECT_LABEL_KEYS = Object.freeze({
	ionSaveDisadvantage: "SW5E.Augmentations.EffectIonSaves",
	ionVulnerability: "SW5E.Augmentations.EffectIonVulnerability",
	countAsDroid: "SW5E.Augmentations.EffectCountAsDroid"
});

const SIDE_EFFECT_ACTIVE_LABEL_KEYS = Object.freeze({
	ionSaveDisadvantage: "SW5E.Augmentations.InlineFxIonSaves",
	ionVulnerability: "SW5E.Augmentations.InlineFxIonVuln",
	countAsDroid: "SW5E.Augmentations.InlineFxDroid"
});

const SIDE_EFFECT_TOOLTIP_KEYS = Object.freeze({
	ionSaveDisadvantage: "SW5E.Augmentations.EffectIonSavesTooltip",
	ionVulnerability: "SW5E.Augmentations.EffectIonVulnerabilityTooltip",
	countAsDroid: "SW5E.Augmentations.EffectCountAsDroidTooltip"
});

const AUGMENTATION_CATEGORY_LABEL_KEYS = Object.freeze({
	enhancement: "SW5E.Augmentations.PickerCategoryEnhancement",
	replacement: "SW5E.Augmentations.PickerCategoryReplacement"
});

const AUGMENTATION_RARITY_LABEL_KEYS = Object.freeze({
	standard: "DND5E.ItemRarityCommon",
	premium: "DND5E.ItemRarityUncommon",
	prototype: "DND5E.ItemRarityRare",
	advanced: "DND5E.ItemRarityVeryRare",
	legendary: "DND5E.ItemRarityLegendary",
	artifact: "DND5E.ItemRarityArtifact"
});

function sideEffectLabel(key) {
	return localizeOrFallback(SIDE_EFFECT_LABEL_KEYS[key] ?? key, key);
}

function activeSideEffectLabel(key) {
	return localizeOrFallback(SIDE_EFFECT_ACTIVE_LABEL_KEYS[key] ?? SIDE_EFFECT_LABEL_KEYS[key] ?? key, key);
}

function capitalize(text) {
	return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function formatAugmentationCategory(category) {
	return localizeOrFallback(AUGMENTATION_CATEGORY_LABEL_KEYS[category] ?? "", capitalize(category ?? "—"));
}

function formatAugmentationRarity(rarity) {
	return localizeOrFallback(AUGMENTATION_RARITY_LABEL_KEYS[rarity] ?? "", capitalize(rarity ?? "—"));
}

function formatAugmentationPickerLabel(name, meta) {
	const n = typeof name === "string" ? name.trim() : "";
	const base = n || "—";
	if ( !meta || typeof meta !== "object" ) return base;
	const catLabel = formatAugmentationCategory(meta.category);
	const rarLabel = formatAugmentationRarity(meta.rarity);
	if ( catLabel && rarLabel ) return `${base} — ${catLabel} · ${rarLabel}`;
	if ( catLabel ) return `${base} — ${catLabel}`;
	return base;
}

function sideEffectTooltip(key, { mode = "inherit", derived = false } = {}) {
	const base = localizeOrFallback(SIDE_EFFECT_TOOLTIP_KEYS[key] ?? "", sideEffectLabel(key));
	if ( (mode === "on") && !derived ) {
		const override = localizeOrFallback(
			"SW5E.Augmentations.SideEffectTooltipOverrideOn",
			"Currently active because of a GM override."
		);
		return `${base} ${override}`.trim();
	}
	return base;
}

/**
 * @param {import("@league/foundry").documents.Actor|null} actor
 * @param {string} uuid
 */
async function openInstalledAugmentationSource(actor, uuid) {
	const id = String(uuid ?? "").trim();
	if ( !id ) {
		ui.notifications.warn(localizeOrFallback("SW5E.Augmentations.OpenItemMissingUuid", "This installed entry has no item reference."));
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
		console.warn("SW5E | Augmentations: open source item failed", err);
	}
	let excerpt = "";
	if ( actor ) {
		const entry = normalizeActorAugmentations(actor).installed.find(e => e?.uuid === id);
		excerpt = entry?.snapshot?.descriptionSnippet ?? "";
	}
	if ( excerpt ) {
		await DialogV2.wait({
			window: { title: game.i18n.localize("SW5E.Augmentations.SnapshotPreviewTitle") },
			content: `<p class="notes" style="white-space: pre-wrap;">${foundry.utils.escapeHTML(excerpt)}</p>`,
			buttons: [
				{ action: "ok", label: game.i18n.localize("SW5E.Augmentations.PreviewClose"), default: true }
			]
		});
		return;
	}
	ui.notifications.warn(localizeOrFallback("SW5E.Augmentations.OpenItemNotFound", "Could not open that item. It may have been deleted, the pack is unavailable, or you lack permission."));
}

function isPersistentAugmentationSourceItem(item) {
	if ( item?.documentName !== "Item" ) return false;
	const uuid = typeof item?.uuid === "string" ? item.uuid.trim() : "";
	return uuid.startsWith("Item.") || uuid.startsWith("Compendium.");
}

async function collectWorldAugmentationInstallChoices() {
	const choices = [];
	const seen = new Set();
	const push = (uuid, name, meta) => {
		if ( !uuid || seen.has(uuid) ) return;
		seen.add(uuid);
		choices.push({ uuid, name, pickerLabel: formatAugmentationPickerLabel(name, meta) });
	};

	for ( const item of game.items ) {
		const meta = getEffectiveAugmentationItemMeta(item);
		if ( !meta || !isValidAugmentationItemMeta(meta) ) continue;
		push(item.uuid, item.name, meta);
	}

	choices.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
	return choices;
}

async function promptPickWorldAugmentation() {
	const choices = await collectWorldAugmentationInstallChoices();
	if ( !choices.length ) {
		ui.notifications.warn(game.i18n.localize("SW5E.Augmentations.WorldInstallUnavailable"));
		return "";
	}

	const optionsHtml = choices.map(choice => {
		const value = foundry.utils.escapeHTML(choice.uuid);
		const label = foundry.utils.escapeHTML(choice.pickerLabel);
		return `<option value="${value}">${label}</option>`;
	}).join("");

	const result = await DialogV2.wait({
		window: { title: game.i18n.localize("SW5E.Augmentations.WorldInstallDialogTitle") },
		content: [
			`<p class="hint">${foundry.utils.escapeHTML(game.i18n.localize("SW5E.Augmentations.WorldInstallDialogHint"))}</p>`,
			`<div class="form-group">`,
			`<label for="sw5e-aug-world-item-choice">${foundry.utils.escapeHTML(game.i18n.localize("SW5E.Augmentations.WorldInstallLabel"))}</label>`,
			`<select id="sw5e-aug-world-item-choice" name="choice" autofocus>${optionsHtml}</select>`,
			`</div>`
		].join(""),
		buttons: [
			{
				action: "choose",
				label: game.i18n.localize("SW5E.Augmentations.WorldInstallConfirm"),
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

function formatValidationHtml(validation) {
	if ( !validation ) return "";
	const lines = [];
	if ( validation.blocking?.length ) {
		lines.push(`<p class="sw5e-aug-val-title sw5e-aug-val-blocking">${game.i18n.localize("SW5E.Augmentations.ValidationBlocking")}</p><ul>`);
		for ( const b of validation.blocking ) {
			lines.push(`<li>${foundry.utils.escapeHTML(b.message)}</li>`);
		}
		lines.push("</ul>");
	}
	if ( validation.warnings?.length ) {
		lines.push(`<p class="sw5e-aug-val-title sw5e-aug-val-warn">${game.i18n.localize("SW5E.Augmentations.ValidationWarnings")}</p><ul>`);
		for ( const w of validation.warnings ) {
			lines.push(`<li>${foundry.utils.escapeHTML(w.message)}</li>`);
		}
		lines.push("</ul>");
	}
	const info = validation.info;
	if ( info && typeof info === "object" ) {
		lines.push(`<p class="sw5e-aug-val-title">${game.i18n.localize("SW5E.Augmentations.ValidationInfo")}</p><dl class="sw5e-aug-info-dl">`);
		if ( info.actorTargetType != null ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoTargetType")}</dt><dd>${foundry.utils.escapeHTML(String(info.actorTargetType))}</dd>`);
		}
		if ( info.maxAugmentations != null ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoMax")}</dt><dd>${foundry.utils.escapeHTML(String(info.maxAugmentations))}</dd>`);
		}
		if ( info.currentAugmentations != null ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoCurrent")}</dt><dd>${foundry.utils.escapeHTML(String(info.currentAugmentations))}</dd>`);
		}
		if ( info.requiredTool ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoTool")}</dt><dd>${foundry.utils.escapeHTML(String(info.requiredTool))}</dd>`);
		}
		if ( info.installDC != null ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoDC")}</dt><dd>${foundry.utils.escapeHTML(String(info.installDC))}</dd>`);
		}
		if ( Array.isArray(info.occupiedBodySlots) && info.occupiedBodySlots.length ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoOccupiedSlots")}</dt><dd>${foundry.utils.escapeHTML(info.occupiedBodySlots.join(", "))}</dd>`);
		}
		if ( Array.isArray(info.proposedBodySlots) && info.proposedBodySlots.length ) {
			lines.push(`<dt>${game.i18n.localize("SW5E.Augmentations.InfoProposedSlots")}</dt><dd>${foundry.utils.escapeHTML(info.proposedBodySlots.join(", "))}</dd>`);
		}
		lines.push("</dl>");
	}
	return lines.join("\n");
}

export async function resolveDroppedAugmentationItem(event) {
	const dragData = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
	if ( !dragData || typeof dragData !== "object" ) return null;
	try {
		const item = await Item.implementation.fromDropData(dragData);
		return isPersistentAugmentationSourceItem(item) ? item : null;
	} catch {
		return null;
	}
}

export async function installAugmentationItem(actor, item, {
	force = false,
	setInstallValidation = null,
	rerender = null
} = {}) {
	if ( !actor ) return { ok: false, validation: null, entry: null, reason: "missing-actor" };
	if ( !item || item.documentName !== "Item" ) {
		setInstallValidation?.(null);
		ui.notifications.warn(game.i18n.localize("SW5E.Augmentations.DropInvalid"));
		return { ok: false, validation: null, entry: null, reason: "invalid-item" };
	}

	const validation = validateAugmentationInstall(actor, item, { force });
	setInstallValidation?.(validation);
	if ( !validation.ok ) {
		ui.notifications.warn(game.i18n.localize("SW5E.Augmentations.InstallBlocked"));
		return { ok: false, validation, entry: null, reason: "blocked" };
	}

	const result = await addAugmentationToActor(actor, item, { force: force === true });
	if ( result.ok ) {
		ui.notifications.info(game.i18n.localize("SW5E.Augmentations.InstallDone"));
		setInstallValidation?.(null);
		if ( typeof rerender === "function" ) await rerender();
		return result;
	}

	setInstallValidation?.(result.validation);
	ui.notifications.warn(game.i18n.localize("SW5E.Augmentations.InstallFailed"));
	return result;
}

export async function installAugmentationByUuid(actor, uuid, options = {}) {
	const id = String(uuid ?? "").trim();
	if ( !id ) return { ok: false, validation: null, entry: null, reason: "missing-uuid" };
	const item = await fromUuid(id);
	if ( !item || item.documentName !== "Item" ) {
		options.setInstallValidation?.(null);
		ui.notifications.error(game.i18n.localize("SW5E.Augmentations.ItemNotFound"));
		return { ok: false, validation: null, entry: null, reason: "item-not-found" };
	}
	return installAugmentationItem(actor, item, options);
}

export class AugmentationsApp extends HandlebarsApplicationMixin(ApplicationV2) {
	/** @param {{ actor: import("@league/foundry").documents.Actor }} opts */
	constructor({ actor } = {}) {
		if ( !actor?.id ) throw new Error("AugmentationsApp requires a persisted actor with an id.");
		super({ id: `sw5e-augmentations-${actor.id}` });
		this._actorId = actor.id;
		this.#boundOnActorUpdate = this.#onActorUpdate.bind(this);
		Hooks.on("updateActor", this.#boundOnActorUpdate);
	}

	/** @returns {import("@league/foundry").documents.Actor|null} */
	get actor() {
		return game.actors.get(this._actorId) ?? null;
	}

	static openForActor(actor) {
		if ( !actor?.id ) throw new Error("AugmentationsApp requires a persisted actor with an id.");
		if ( !isActorCyberneticAugmentationsManagerAllowed(actor) ) {
			if ( isActorDroidCustomizationHost(actor) && isActorAugmentationCandidate(actor) && !isLegacyStarshipActor(actor) ) {
				ui.notifications.warn(localizeOrFallback("SW5E.Augmentations.OpenBlockedDroidSpecies", "Cybernetic augmentations are not used for droid-class species (use Droid Customizations when available)."));
			}
			else {
				ui.notifications.warn(localizeOrFallback("SW5E.Augmentations.OpenBlockedNotCandidate", "This actor cannot use the augmentations manager."));
			}
			return null;
		}
		const id = `sw5e-augmentations-${actor.id}`;
		const existing = foundry.applications.instances.get(id);
		if ( existing instanceof AugmentationsApp ) {
			existing.render(true);
			return existing;
		}
		const created = new AugmentationsApp({ actor });
		created.render(true);
		return created;
	}

	static DEFAULT_OPTIONS = {
		tag: "section",
		classes: ["sw5e-augmentations-manager"],
		window: {
			resizable: true,
			icon: "fas fa-microchip"
		},
		position: {
			width: 560,
			/** Numeric height so the window body can scroll; avoids auto-height growth past the viewport with no scrollbar. */
			height: 520
		}
	};

	static PARTS = {
		manager: {
			template: getModulePath("templates/apps/augmentations-manager.hbs")
		}
	};

	get title() {
		const a = this.actor;
		const name = a?.name ?? localizeOrFallback("SW5E.Augmentations.FallbackActor", "Actor");
		const count = a ? getInstalledAugmentationCount(a) : 0;
		return `${localizeOrFallback("SW5E.Augmentations.WindowTitle", "Cybernetic augmentations")}: ${name} (${count})`;
	}

	#boundOnActorUpdate;

	#onActorUpdate(doc, change) {
		if ( doc.id !== this._actorId ) return;
		if ( foundry.utils.hasProperty(change, "flags.sw5e.augmentations") ) this.render(false);
	}

	async _prepareContext() {
		const actor = this.actor;
		const actorPresent = Boolean(actor);
		const eligibleKind = Boolean(actor && isActorCyberneticAugmentationsManagerAllowed(actor));
		const validTarget = Boolean(actor && isActorValidAugmentationTarget(actor));
		const state = actor ? normalizeActorAugmentations(actor) : null;
		const derived = state?.derived?.sideEffects ?? {};
		const effective = state?.effective?.sideEffects ?? {};
		const ov = state?.overrides?.sideEffects ?? {};

		const sideEffectRows = AUGMENTATION_SIDE_EFFECT_KEYS.map(key => {
			const d = Boolean(derived[key]);
			const e = Boolean(effective[key]);
			const raw = ov[key];
			const mode = raw === true ? "on" : raw === false ? "off" : "inherit";
			return {
				key,
				label: sideEffectLabel(key),
				activeLabel: activeSideEffectLabel(key),
				tooltip: sideEffectTooltip(key, { mode, derived: d }),
				derived: d,
				effective: e,
				mode,
				derivedText: formatYesNo(d),
				effectiveText: formatYesNo(e),
				overrideText: overrideModeText(mode),
				differs: d !== e
			};
		});

		const isGm = game.user.isGM;
		const canEdit = Boolean(actor?.isOwner || isGm);
		const showInstallWorkflow = eligibleKind && validTarget && canEdit;

		const occupied = state ? [...collectOccupiedBodySlots(state.installed)].sort() : [];
		const occupiedSlotsText = occupied.length
			? occupied.join(", ")
			: localizeOrFallback("SW5E.Augmentations.NoBodySlots", "—");

		const installedList = state?.installed ?? [];
		const installedRows = await Promise.all(installedList.map(async (entry) => {
			const uuid = entry.uuid ?? "";
			const snapshotSnippet = entry.snapshot?.descriptionSnippet ?? "";
			let descriptionPreview = snapshotSnippet;
			if ( uuid ) {
				try {
					const doc = await fromUuid(uuid);
					const html = doc?.system?.description?.value;
					if ( typeof html === "string" && html )
						descriptionPreview = plainTextExcerptFromItemDescriptionHtml(html, 320);
				} catch {
					/* keep snapshot / empty */
				}
			}
			if ( !descriptionPreview ) descriptionPreview = snapshotSnippet;
			const previewOneLine = descriptionPreview ? descriptionPreview.replace(/\s+/g, " ").trim() : "";
			const slotless = Boolean(entry.slotless);
			const hasBodySlots = Array.isArray(entry.bodySlots) && entry.bodySlots.length > 0;
			return {
				uuid,
				name: entry.name ?? entry.snapshot?.name ?? "—",
				img: entry.snapshot?.img ?? "",
				category: formatAugmentationCategory(entry.category),
				rarity: formatAugmentationRarity(entry.rarity),
				bodySlotsText: Array.isArray(entry.bodySlots) && entry.bodySlots.length ? entry.bodySlots.join(", ") : "—",
				slotSummary: slotless
					? localizeOrFallback("SW5E.Augmentations.ColSlotless", "Slotless")
					: hasBodySlots
						? entry.bodySlots.join(", ")
						: "—",
				slotLabel: slotless
					? localizeOrFallback("SW5E.Augmentations.ColSlotless", "Slotless")
					: localizeOrFallback("SW5E.Augmentations.ColSlots", "Body slots"),
				installedAtText: entry.installedAt
					? new Date(entry.installedAt).toLocaleDateString(game.i18n.lang)
					: "—",
				descriptionPreview: previewOneLine
			};
		}));

		const overrideControls = AUGMENTATION_SIDE_EFFECT_KEYS.map(key => {
			const row = sideEffectRows.find(effect => effect.key === key);
			const raw = ov[key];
			const selected = raw === true ? "on" : raw === false ? "off" : "inherit";
			return {
				key,
				label: row?.label ?? sideEffectLabel(key),
				statusText: game.i18n.format("SW5E.Augmentations.OverrideStatus", {
					derived: row?.derivedText ?? formatYesNo(false),
					effective: row?.effectiveText ?? formatYesNo(false)
				}),
				options: [
					{ value: "inherit", label: localizeOrFallback("SW5E.Augmentations.OverrideInherit", "Use derived"), selected: selected === "inherit" },
					{ value: "on", label: localizeOrFallback("SW5E.Augmentations.OverrideOn", "Force on"), selected: selected === "on" },
					{ value: "off", label: localizeOrFallback("SW5E.Augmentations.OverrideOff", "Force off"), selected: selected === "off" }
				]
			};
		});

		const activeSideEffects = sideEffectRows
			.filter(row => row.effective)
			.map(row => ({
				key: row.key,
				label: row.activeLabel,
				tooltip: row.tooltip,
				isOverrideOnly: (row.mode === "on") && !row.derived
			}));

		return {
			actorPresent,
			eligibleKind,
			validTarget,
			currentCount: state ? getInstalledAugmentationCount(actor, state) : 0,
			maxCount: actor && state ? getMaxAugmentationsForActor(actor, state) : 0,
			occupiedSlotsText,
			activeSideEffects,
			installedRows,
			hasWorldInstallChoices: showInstallWorkflow
				? (await collectWorldAugmentationInstallChoices()).length > 0
				: false,
			canEdit,
			isGm,
			showGmOverrides: isGm && actorPresent,
			showInstallWorkflow,
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
		applySw5eThemeScope(root, { scope: "module-app" });

		const validationEl = root.querySelector("[data-sw5e-aug-validation]");
		const setValidation = (validation) => {
			if ( !validationEl ) return;
			if ( !validation ) {
				validationEl.innerHTML = "";
				validationEl.hidden = true;
				return;
			}
			validationEl.innerHTML = formatValidationHtml(validation);
			validationEl.hidden = false;
		};
		const installButtons = root.querySelectorAll(".sw5e-aug-install-submit, .sw5e-aug-install-world-submit");
		const setInstallBusy = (busy) => {
			for ( const button of installButtons ) {
				if ( button instanceof HTMLButtonElement ) button.disabled = busy;
			}
		};
		const installDropZone = root.querySelector("[data-sw5e-aug-install-dropzone]");
		const setInstallDropActive = (active) => installDropZone?.classList.toggle("sw5e-aug-drop-target--active", active);
		const installFromUuid = async (uuid) => {
			const actor = this.actor;
			if ( !actor || !uuid ) return;
			const force = game.user.isGM && root.querySelector("input[name=\"sw5e-aug-force-install\"]")?.checked === true;
			await installAugmentationByUuid(actor, uuid, {
				force,
				setInstallValidation: setValidation,
				rerender: async () => this.render(false)
			});
		};

		root.querySelector(".sw5e-aug-install-submit")?.addEventListener("click", async () => {
			setInstallBusy(true);
			try {
				let uuid = "";
				try {
					uuid = await pickAugmentationCompendiumUuid() ?? "";
				} catch ( err ) {
					console.warn("SW5E | Augmentations: browser open failed", err);
					ui.notifications.error(localizeOrFallback("SW5E.Augmentations.BrowserOpenFailed", "Could not open the augmentation browser."));
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
					const droppedItem = await resolveDroppedAugmentationItem(event);
					const force = game.user.isGM && root.querySelector("input[name=\"sw5e-aug-force-install\"]")?.checked === true;
					await installAugmentationItem(actor, droppedItem, {
						force,
						setInstallValidation: setValidation,
						rerender: async () => this.render(false)
					});
				} finally {
					setInstallBusy(false);
				}
			});
		}

		root.querySelector(".sw5e-aug-install-world-submit")?.addEventListener("click", async () => {
			setInstallBusy(true);
			try {
				const uuid = await promptPickWorldAugmentation();
				await installFromUuid(uuid);
			} finally {
				setInstallBusy(false);
			}
		});

		for ( const btn of root.querySelectorAll("[data-sw5e-aug-remove]") ) {
			btn.addEventListener("click", async () => {
				const actor = this.actor;
				if ( !actor ) return;
				const uuid = btn.getAttribute("data-sw5e-aug-remove") ?? "";
				const itemName = btn.getAttribute("data-sw5e-aug-remove-name") ?? uuid;
				const validation = validateAugmentationRemove(actor, uuid);
				if ( !validation.ok ) {
					setValidation(validation);
					ui.notifications.warn(game.i18n.localize("SW5E.Augmentations.RemoveBlocked"));
					return;
				}
				const confirm = await DialogV2.wait({
					window: { title: game.i18n.localize("SW5E.Augmentations.RemoveConfirmTitle") },
					content: `<p>${game.i18n.format("SW5E.Augmentations.RemoveConfirmText", { name: foundry.utils.escapeHTML(itemName) })}</p>`,
					buttons: [
						{ action: "remove", label: game.i18n.localize("SW5E.Augmentations.Remove"), icon: "fas fa-trash", default: true },
						{ action: "cancel", label: game.i18n.localize("SW5E.Chassis.Cancel"), icon: "fas fa-times" }
					]
				});
				if ( confirm !== "remove" ) return;
				const result = await removeAugmentationFromActor(actor, uuid);
				if ( result.ok ) {
					ui.notifications.info(game.i18n.localize("SW5E.Augmentations.RemoveDone"));
					setValidation(null);
					await this.render(false);
				} else {
					setValidation(result.validation);
				}
			});
		}

		for ( const btn of root.querySelectorAll("[data-sw5e-aug-open-item]") ) {
			btn.addEventListener("click", async (ev) => {
				ev.preventDefault();
				await openInstalledAugmentationSource(this.actor, btn.getAttribute("data-sw5e-aug-open-item") ?? "");
			});
		}

		for ( const sel of root.querySelectorAll("select[data-sw5e-aug-override-key]") ) {
			sel.addEventListener("change", async () => {
				const actor = this.actor;
				if ( !actor || !game.user.isGM ) return;
				const key = sel.getAttribute("data-sw5e-aug-override-key");
				if ( !AUGMENTATION_SIDE_EFFECT_KEYS.includes(key) ) return;
				const v = sel.value;
				const value = v === "on" ? true : v === "off" ? false : null;
				await setAugmentationSideEffectOverride(actor, key, value);
				ui.notifications.info(game.i18n.localize("SW5E.Augmentations.OverrideSaved"));
				await this.render(false);
			});
		}
	}
}
