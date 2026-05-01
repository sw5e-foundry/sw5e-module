import {
	buildChassisSlotDisplayRows,
	buildEnabledChassisStateForItem,
	CHASSIS_RARITIES,
	CHASSIS_RULES_MODES,
	CHASSIS_SETTING_KEYS,
	chassisRarityToItemSystemRarity,
	collectChassisBrowserInformationalHintKeys,
	createInstalledModEntry,
	findChassisInstallPlacements,
	getChassis,
	getChassisInstallCandidates,
	modificationsPackInferenceEligible,
	resolveChassisModMetaForInstall,
	getChassisSlotSemantic,
	getEffectiveChassisRulesMode,
	getNextChassisRarity,
	isItemEligibleForChassis,
	mergeChassisUpdate,
	normalizeChassis,
	validateChassisInstall,
	validateChassisRarityUpgrade,
	validateChassisRemove
} from "../chassis.mjs";
import { getModulePath, getModuleSettingValue } from "../module-support.mjs";
import { withPreservedItemSheetScroll } from "./properties.mjs";

const TEMPLATE = getModulePath("templates/items/chassis-panel.hbs");
const INSTALL_BROWSER_TEMPLATE = getModulePath("templates/items/chassis-install-browser.hbs");

/** @type {typeof foundry.applications.api.DialogV2} */
const DialogV2 = foundry.applications.api.DialogV2;

/**
 * DialogV2 fields live on the submitting button’s enclosing form — prefer `button.form` over `dialog.form`.
 * @param {HTMLButtonElement|undefined|null} button
 * @param {import("@league/foundry").applications.api.DialogV2|undefined|null} dialog
 * @returns {HTMLFormElement|null}
 */
function getDialogV2Form(button, dialog) {
	const el = button?.form ?? dialog?.form ?? dialog?.element?.querySelector?.("form");
	return el instanceof HTMLFormElement ? el : null;
}

/**
 * @param {HTMLFormElement} form
 * @returns {{ pick: string, fromUuidFallback: boolean }}
 */
function readChassisInstallBrowserPick(form) {
	const fbEl = form.elements?.namedItem?.("uuidFallback");
	const fb = typeof fbEl?.value === "string" ? fbEl.value.trim() : "";
	const pickGroup = form.elements?.namedItem?.("chassisPick");
	let fromRadio = "";
	if ( pickGroup instanceof RadioNodeList ) fromRadio = String(pickGroup.value ?? "").trim();
	else if ( pickGroup instanceof HTMLInputElement && pickGroup.checked ) {
		fromRadio = String(pickGroup.value ?? "").trim();
	}
	const pick = (fb || fromRadio).trim();
	return { pick, fromUuidFallback: Boolean(fb) };
}

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

/** @param {JQuery|HTMLElement|HTMLElement[]} html */
function dialogFormRoot(html) {
	if ( globalThis.jQuery && html instanceof globalThis.jQuery ) return html[0];
	return html instanceof HTMLElement ? html : html?.[0] ?? null;
}

function getDetailsTabEl(root) {
	return root.querySelector(".sheet-body section.tab.details")
		?? root.querySelector("section.tab.details")
		?? root.querySelector(".tab.details")
		?? root.querySelector("section.tab[data-tab=\"details\"]")
		?? root.querySelector("[data-tab=\"details\"]");
}

function formatDndItemRarity(raw) {
	if ( raw == null || raw === "" ) return "—";
	const cfg = CONFIG.DND5E?.itemRarity?.[raw];
	if ( cfg?.label ) return game.i18n.localize(cfg.label);
	return String(raw);
}

function labelRulesMode(mode) {
	return game.i18n.localize(`SW5E.ChassisRulesModeChoice.${mode}`);
}

function labelChassisRarity(r) {
	return game.i18n.localize(`SW5E.Chassis.Rarity.${r}`);
}

function labelChassisType(t) {
	return game.i18n.localize(`SW5E.Chassis.ChassisType.${t}`);
}

function formatSlotKind(kind) {
	return kind === "augment"
		? game.i18n.localize("SW5E.Chassis.SlotKindAugment")
		: game.i18n.localize("SW5E.Chassis.SlotKindBase");
}

function formatInstalledTime(ts) {
	if ( !ts ) return game.i18n.localize("SW5E.Chassis.NoTimestamp");
	try {
		return new Date(ts).toLocaleString(game.i18n?.lang ?? undefined);
	} catch {
		return String(ts);
	}
}

function userMayRulesOverride() {
	return game.user?.isGM === true;
}

/**
 * @param {{ blocking: object[], warnings: object[] }} v
 */
function formatValidationHtml(v) {
	const blocks = (v.blocking ?? []).map(i => `<li class="chassis-val-block"><strong>${foundry.utils.escapeHTML(i.code)}</strong>: ${foundry.utils.escapeHTML(i.message)}</li>`).join("");
	const warns = (v.warnings ?? []).map(i => `<li class="chassis-val-warn"><strong>${foundry.utils.escapeHTML(i.code)}</strong>: ${foundry.utils.escapeHTML(i.message)}</li>`).join("");
	let html = "";
	if ( blocks ) html += `<p><strong>${game.i18n.localize("SW5E.Chassis.ValBlocking")}</strong></p><ul>${blocks}</ul>`;
	if ( warns ) html += `<p><strong>${game.i18n.localize("SW5E.Chassis.ValWarnings")}</strong></p><ul>${warns}</ul>`;
	return html || `<p>${game.i18n.localize("SW5E.Chassis.ValNone")}</p>`;
}

/**
 * Resolve a single modification Item for install (full document). Malformed compendium data fails here, not during browser listing.
 * @param {string} uuid
 * @returns {Promise<import("@league/foundry").documents.Item|null>}
 */
async function loadItemForChassisInstall(uuid) {
	const s = String(uuid ?? "").trim();
	if ( !s ) return null;
	try {
		const doc = await fromUuid(s);
		return doc instanceof Item ? doc : null;
	} catch ( err ) {
		console.warn("SW5E | Chassis: modification item failed to load", s, err);
		return null;
	}
}

/**
 * @param {import("@league/foundry").applications.api.DocumentSheetV2} app
 * @param {import("@league/foundry").documents.Item} host
 * @param {import("@league/foundry").documents.Item} modItem
 * @param {{ slotKind: string, slotIndex: number }} placement
 * @param {boolean} force
 */
/**
 * @param {object} [installCtx]
 * @param {string} [installCtx.slotSemantic]
 */
function commitInstallMod(app, host, modItem, placement, force, installCtx = {}) {
	const chassis = normalizeChassis(host, getChassis(host));
	const actor = app.actor ?? host.actor ?? host.parent;
	const v = validateChassisInstall(host, modItem, {
		...placement,
		actor,
		force,
		...(installCtx.slotSemantic ? { slotSemantic: installCtx.slotSemantic } : {}),
		...chassisInstallBrowserMetaCtx(installCtx, modItem)
	});
	const mode = getEffectiveChassisRulesMode(host);
	if ( mode === "strict" && !v.ok ) {
		ui.notifications.error(game.i18n.localize("SW5E.Chassis.InstallBlocked"));
		return;
	}
	if ( mode === "guided" && !v.ok && !force ) {
		ui.notifications.warn(game.i18n.localize("SW5E.Chassis.InstallIncomplete"));
		return;
	}

	const entry = createInstalledModEntry(modItem, {
		slotKind: placement.slotKind,
		slotIndex: placement.slotIndex,
		...(installCtx.effectiveChassisModFromBrowser && installCtx.effectiveChassisModMeta
			? { effectiveChassisModMeta: installCtx.effectiveChassisModMeta }
			: {})
	});
	const installedMods = [...(chassis.installedMods ?? []), entry];
	const next = normalizeChassis(host, { ...chassis, installedMods });
	void withPreservedItemSheetScroll(app, () => host.update({ "flags.sw5e.chassis": next })).catch(err => console.error(err));
	ui.notifications.info(game.i18n.format("SW5E.Chassis.InstallDone", { name: modItem.name }));
}

function formatModSlotKindsDisplay(meta) {
	const k = meta?.compatibleSlotKinds;
	if ( !k?.length ) return game.i18n.localize("SW5E.Chassis.SlotKindAny");
	return k.join(", ");
}

function formatModRarityLine(metaModRarity, itemSystemRarity) {
	const raw = metaModRarity || itemSystemRarity;
	if ( raw == null || raw === "" ) return "—";
	const s = String(raw);
	if ( CHASSIS_RARITIES.includes(/** @type {any} */ (s)) ) return labelChassisRarity(s);
	return formatDndItemRarity(s);
}

function formatInstallBrowserMetaLine(_host, row) {
	const meta = row.meta;
	const raritySource = row.systemRarity !== undefined ? row.systemRarity : row.item?.system?.rarity;
	/** @type {string[]} */
	const parts = [];
	if ( meta?.sourceType === "legacy-modifications-pack" ) {
		parts.push(game.i18n.localize("SW5E.Chassis.ModSourceLegacy"));
	} else if ( meta?.sourceType === "native" ) {
		parts.push(game.i18n.localize("SW5E.Chassis.ModSourceNative"));
	}
	parts.push(
		formatModRarityLine(meta?.modRarity, raritySource),
		row.sourceLabel,
		game.i18n.format("SW5E.Chassis.InstallBrowserCostLine", { n: row.slotCost }),
		formatModSlotKindsDisplay(meta)
	);
	const tool = meta?.requiresTool;
	const dc = meta?.installDC;
	if ( tool || dc != null ) {
		parts.push(game.i18n.format("SW5E.Chassis.InstallBrowserToolLine", {
			tool: tool ? String(tool) : "—",
			dc: dc != null ? String(dc) : "—"
		}));
	}
	return parts.filter(Boolean).join(" · ");
}

/**
 * @param {object} installCtx
 * @param {import("@league/foundry").documents.Item} modItem
 */
function chassisInstallBrowserMetaCtx(installCtx, modItem) {
	if ( !installCtx?.effectiveChassisModFromBrowser || !installCtx?.effectiveChassisModMeta ) return {};
	return {
		effectiveChassisModMeta: installCtx.effectiveChassisModMeta,
		effectiveChassisModFromBrowser: true,
		effectiveChassisModTargetUuid: installCtx.effectiveChassisModTargetUuid ?? modItem?.uuid
	};
}

/** @param {object} row candidate from {@link getChassisInstallCandidates} */
function formatInstallBrowserInfoHintLine(row) {
	const keys = collectChassisBrowserInformationalHintKeys(row.meta);
	if ( !keys.length ) return "";
	return keys.map(k => game.i18n.localize(k)).filter(Boolean).join(" · ");
}

/** @param {object} row candidate from {@link getChassisInstallCandidates} */
function formatInstallBrowserWarningLine(row) {
	if ( row?.tier !== "warn" ) return "";
	const sig = row.tierSignificantWarnings ?? [];
	if ( !sig.length ) return game.i18n.localize("SW5E.Chassis.BrowserWarnUnknown");
	return sig.map(w => String(w?.message ?? "")).filter(Boolean).join(" · ");
}

/**
 * @param {object} chassis normalized
 * @param {object} browserCtx
 */
function formatInstallBrowserContextLine(chassis, browserCtx) {
	const bits = [];
	bits.push(game.i18n.format("SW5E.Chassis.InstallBrowserHostLine", {
		type: labelChassisType(chassis.type),
		rarity: labelChassisRarity(chassis.rarity)
	}));
	if ( browserCtx.preferredSlot ) {
		bits.push(game.i18n.format("SW5E.Chassis.InstallBrowserSlotLine", {
			kind: formatSlotKind(browserCtx.preferredSlot.slotKind),
			index: browserCtx.preferredSlot.slotIndex
		}));
	}
	if ( browserCtx.slotSemantic ) {
		bits.push(game.i18n.format("SW5E.Chassis.InstallBrowserRoleLine", { role: browserCtx.slotSemantic }));
	}
	return bits.join(" · ");
}

/**
 * dnd5e 5.x `system.rarity` patch (object with `value` or plain string).
 * @param {import("@league/foundry").documents.Item} item
 * @param {string} dndRarityKey
 */
function itemSystemRarityUpdateValue(item, dndRarityKey) {
	const cur = item.system?.rarity;
	if ( typeof cur === "object" && cur !== null && !Array.isArray(cur) ) {
		const next = foundry.utils.deepClone(cur);
		next.value = dndRarityKey;
		return next;
	}
	return dndRarityKey;
}

/**
 * When item rarity changes on the sheet, mirror slot tier + `chassis.rarity` from {@link normalizeChassis}.
 * @param {import("@league/foundry").documents.Item} item
 * @param {object} change
 */
function syncChassisFlagsRarityFromItem(item, change) {
	if ( !(item instanceof Item) || !globalThis.game?.ready ) return;
	if ( !foundry.utils.hasProperty(change, "system.rarity") ) return;
	const raw = getChassis(item);
	if ( !raw?.enabled ) return;
	const synced = normalizeChassis(item, raw);
	if ( raw.rarity === synced.rarity
		&& raw.slots?.totalMax === synced.slots?.totalMax
		&& raw.slots?.baseMax === synced.slots?.baseMax
		&& raw.slots?.augmentMax === synced.slots?.augmentMax ) {
		return;
	}
	void item.update({ "flags.sw5e.chassis": synced });
}

function bindInstallBrowserSearch(root) {
	const q = root?.querySelector("input.chassis-browser-search");
	const list = root?.querySelector(".chassis-browser-list");
	if ( !q || !list ) return;
	q.addEventListener("input", () => {
		const needle = q.value.trim().toLowerCase();
		for ( const li of list.querySelectorAll("li.chassis-browser-row") ) {
			const name = li.getAttribute("data-name-lower") ?? "";
			li.classList.toggle("is-filtered-out", Boolean(needle) && !name.includes(needle));
		}
	});
}

/**
 * @param {import("@league/foundry").applications.api.DocumentSheetV2} app
 * @param {{ preferredSlot?: { slotKind: "base"|"augment", slotIndex: number }, slotSemantic?: string|null }} [browserCtx]
 */
async function openInstallModificationDialog(app, browserCtx = {}) {
	const host = app.item;
	const chassis = normalizeChassis(host, getChassis(host));
	const rows = await getChassisInstallCandidates(host, browserCtx);
	const contextLine = formatInstallBrowserContextLine(chassis, browserCtx);

	const candidates = rows.map(r => ({
		uuid: r.uuid,
		name: r.name,
		nameLower: r.name.toLowerCase(),
		img: r.img || "icons/svg/item-bag.svg",
		tier: r.tier,
		tierLabel: game.i18n.localize(`SW5E.Chassis.InstallBrowserTier.${r.tier}`),
		selectable: r.tier === "valid" || r.tier === "warn",
		metaLine: formatInstallBrowserMetaLine(host, r),
		infoHintLine: formatInstallBrowserInfoHintLine(r),
		warningLine: formatInstallBrowserWarningLine(r),
		_row: r
	}));

	/** @type {Map<string, object>} */
	const rowByUuid = new Map(rows.map(r => [String(r.uuid), r]));

	const html = await foundry.applications.handlebars.renderTemplate(INSTALL_BROWSER_TEMPLATE, {
		candidates,
		contextLine
	});

	await DialogV2.wait({
		rejectClose: false,
		modal: false,
		window: { title: game.i18n.localize("SW5E.Chassis.InstallBrowserTitle") },
		position: { width: 560 },
		classes: ["sw5e-chassis-install-browser-app"],
		content: html,
		render: (_event, dialog) => {
			const root = dialog?.form ?? dialog?.element?.querySelector("form") ?? dialog?.element;
			bindInstallBrowserSearch(root);
		},
		buttons: [
			{
				action: "cancel",
				label: game.i18n.localize("SW5E.Chassis.Cancel"),
				icon: "fas fa-times"
			},
			{
				action: "next",
				label: game.i18n.localize("SW5E.Chassis.Continue"),
				icon: "fas fa-arrow-right",
				default: true,
				callback: async (event, button, dialog) => {
					const form = getDialogV2Form(button, dialog);
					if ( !form ) {
						ui.notifications.error(game.i18n.localize("SW5E.Chassis.InstallBrowserFormMissing"));
						return false;
					}
					const { pick, fromUuidFallback } = readChassisInstallBrowserPick(form);
					if ( !pick ) {
						ui.notifications.warn(game.i18n.localize("SW5E.Chassis.InstallBrowserPickOne"));
						return false;
					}
					const modItem = await loadItemForChassisInstall(pick);
					if ( !modItem ) {
						ui.notifications.error(game.i18n.localize("SW5E.Chassis.InstallItemInvalidData"));
						return false;
					}
					const fromRow = rowByUuid.get(pick) ?? null;
					if ( !fromUuidFallback && !fromRow ) {
						ui.notifications.error(game.i18n.localize("SW5E.Chassis.InstallBrowserRowMissing"));
						return false;
					}
					let placements = fromRow?.placements;
					if ( !placements?.length ) {
						const meta = resolveChassisModMetaForInstall(modItem, {
							allowModificationsPackInference: modificationsPackInferenceEligible(modItem)
						});
						const cost = meta?.slotCost ?? 1;
						placements = findChassisInstallPlacements(chassis, cost);
					}
					if ( !placements?.length ) {
						ui.notifications.error(game.i18n.localize("SW5E.Chassis.InstallNoPlacement"));
						return false;
					}
					/** @type {{ slotSemantic?: string, effectiveChassisModMeta?: object, effectiveChassisModFromBrowser?: boolean, effectiveChassisModTargetUuid?: string }} */
					const installCtx = { slotSemantic: browserCtx.slotSemantic ?? undefined };
					if ( fromRow?.meta ) {
						installCtx.effectiveChassisModMeta = foundry.utils.deepClone(fromRow.meta);
						installCtx.effectiveChassisModFromBrowser = true;
						installCtx.effectiveChassisModTargetUuid = fromRow.uuid;
					}
					if ( placements.length === 1 ) {
						void runInstallValidationDialog(app, host, modItem, placements[0], installCtx);
					} else {
						void openPlacementPickDialog(app, host, modItem, placements, installCtx);
					}
					return true;
				}
			}
		]
	});
}

/**
 * @param {import("@league/foundry").applications.api.DocumentSheetV2} app
 * @param {import("@league/foundry").documents.Item} host
 * @param {import("@league/foundry").documents.Item} modItem
 * @param {{ slotKind: string, slotIndex: number }[]} placements
 */
/**
 * @param {object} [installCtx]
 * @param {string} [installCtx.slotSemantic]
 */
async function openPlacementPickDialog(app, host, modItem, placements, installCtx = {}) {
	const opts = placements.map((p, i) => {
		const label = `${formatSlotKind(p.slotKind)} ${p.slotIndex}`;
		return `<label class="chassis-placement-opt"><input type="radio" name="place" value="${i}" ${i === 0 ? "checked" : ""}/> ${foundry.utils.escapeHTML(label)}</label>`;
	}).join("");
	const content = `<p>${game.i18n.localize("SW5E.Chassis.PickPlacement")}</p><div class="chassis-placement-list">${opts}</div>`;

	const result = await DialogV2.wait({
		rejectClose: false,
		modal: true,
		window: { title: game.i18n.localize("SW5E.Chassis.SlotPlacementTitle") },
		position: { width: 420 },
		content,
		buttons: [
			{
				action: "cancel",
				label: game.i18n.localize("SW5E.Chassis.Cancel"),
				icon: "fas fa-times"
			},
			{
				action: "ok",
				label: game.i18n.localize("SW5E.Chassis.Continue"),
				icon: "fas fa-check",
				default: true,
				callback: (event, button, dialog) => {
					const form = getDialogV2Form(button, dialog);
					const checked = form?.querySelector("input[name=\"place\"]:checked");
					const idx = Number(checked?.value ?? 0);
					return Number.isFinite(idx) ? idx : 0;
				}
			}
		]
	});

	if ( result == null || result === "cancel" ) return;
	const idx = Number(result);
	const p = placements[Number.isFinite(idx) ? idx : 0];
	void runInstallValidationDialog(app, host, modItem, p, installCtx);
}

/**
 * @param {import("@league/foundry").applications.api.DocumentSheetV2} app
 * @param {import("@league/foundry").documents.Item} host
 * @param {import("@league/foundry").documents.Item} modItem
 * @param {{ slotKind: string, slotIndex: number }} placement
 */
/**
 * @param {object} [installCtx]
 * @param {string} [installCtx.slotSemantic]
 */
async function runInstallValidationDialog(app, host, modItem, placement, installCtx = {}) {
	const actor = app.actor ?? host.actor ?? host.parent;
	const base = validateChassisInstall(host, modItem, {
		...placement,
		actor,
		force: false,
		...(installCtx.slotSemantic ? { slotSemantic: installCtx.slotSemantic } : {}),
		...chassisInstallBrowserMetaCtx(installCtx, modItem)
	});
	const mode = base.mode;

	const buttons = [
		{
			action: "cancel",
			label: mode === "strict"
				? game.i18n.localize("SW5E.Chassis.DialogClose")
				: game.i18n.localize("SW5E.Chassis.Cancel"),
			icon: "fas fa-times"
		}
	];

	if ( mode === "freeform" || base.ok ) {
		buttons.push({
			action: "install",
			label: game.i18n.localize("SW5E.Chassis.ConfirmInstall"),
			icon: "fas fa-check",
			default: true,
			callback: () => {
				commitInstallMod(app, host, modItem, placement, false, installCtx);
				return true;
			}
		});
	} else if ( mode === "guided" && base.overrideAllowed && userMayRulesOverride() ) {
		buttons.push({
			action: "force",
			label: game.i18n.localize("SW5E.Chassis.InstallAnyway"),
			icon: "fas fa-exclamation-triangle",
			callback: () => {
				commitInstallMod(app, host, modItem, placement, true, installCtx);
				return true;
			}
		});
		buttons[0].default = true;
	} else {
		buttons[0].default = true;
	}

	await DialogV2.wait({
		rejectClose: false,
		modal: true,
		window: { title: game.i18n.localize("SW5E.Chassis.InstallValidateTitle") },
		position: { width: 480 },
		content: `<div class="chassis-val-report">${formatValidationHtml(base)}<p class="chassis-val-tools"><strong>${game.i18n.localize("SW5E.Chassis.InstallToolDc")}</strong> ${base.info?.installDC ?? "—"}</p></div>`,
		buttons
	});
}

/**
 * @param {import("@league/foundry").applications.api.DocumentSheetV2} app
 */
async function openRemoveModificationDialog(app) {
	const host = app.item;
	const chassis = normalizeChassis(host, getChassis(host));
	const mods = chassis.installedMods ?? [];
	if ( !mods.length ) {
		ui.notifications.warn(game.i18n.localize("SW5E.Chassis.RemoveNone"));
		return;
	}
	const opts = mods.map((m, i) => {
		const name = m?.snapshot?.name || m?.uuid || `(${i})`;
		return `<option value="${foundry.utils.escapeHTML(m.uuid)}">${foundry.utils.escapeHTML(name)}</option>`;
	}).join("");

	const content = `
		<form>
			<div class="form-group">
				<label>${game.i18n.localize("SW5E.Chassis.RemovePick")}</label>
				<select name="rm" style="width:100%">${opts}</select>
			</div>
			<div class="form-group">
				<label>${game.i18n.localize("SW5E.Chassis.RemoveOutcome")}</label>
				<label class="radio"><input type="radio" name="out" value="salvaged" checked/> ${game.i18n.localize("SW5E.Chassis.RemoveSalvaged")}</label>
				<label class="radio"><input type="radio" name="out" value="destroyed"/> ${game.i18n.localize("SW5E.Chassis.RemoveDestroyed")}</label>
			</div>
			<p class="notes">${game.i18n.localize("SW5E.Chassis.RemoveOutcomeHint")}</p>
		</form>`;

	new Dialog({
		title: game.i18n.localize("SW5E.Chassis.ActionRemove"),
		content,
		buttons: {
			remove: {
				icon: '<i class="fas fa-minus"></i>',
				label: game.i18n.localize("SW5E.Chassis.RemoveConfirm"),
				callback: html => {
					const el = dialogFormRoot(html);
					const uuid = el?.querySelector("select[name=\"rm\"]")?.value;
					const out = el?.querySelector("input[name=\"out\"]:checked")?.value ?? "salvaged";
					void runRemoveValidationAndCommit(app, host, uuid, out);
				}
			},
			cancel: {
				label: game.i18n.localize("SW5E.Chassis.Cancel"),
				callback: () => {}
			}
		},
		default: "remove"
	}).render(true);
}

/**
 * @param {import("@league/foundry").applications.api.DocumentSheetV2} app
 * @param {import("@league/foundry").documents.Item} host
 * @param {string} installedUuid
 * @param {"salvaged"|"destroyed"} outcome
 */
async function runRemoveValidationAndCommit(app, host, installedUuid, outcome) {
	const v = validateChassisRemove(host, installedUuid, { force: false });
	const mode = v.mode;

	const commit = () => {
		const chassis = normalizeChassis(host, getChassis(host));
		const had = (chassis.installedMods ?? []).some(m => m?.uuid === installedUuid);
		if ( !had ) {
			ui.notifications.warn(game.i18n.localize("SW5E.Chassis.RemoveMissing"));
			return;
		}
		const installedMods = (chassis.installedMods ?? []).filter(m => m?.uuid !== installedUuid);
		const workflowState = {
			...(chassis.workflowState ?? {}),
			lastOperation: { type: "remove", installedUuid, outcome, at: Date.now() }
		};
		const next = normalizeChassis(host, { ...chassis, installedMods, workflowState });
		void withPreservedItemSheetScroll(app, () => host.update({ "flags.sw5e.chassis": next })).catch(console.error);
		ui.notifications.info(game.i18n.localize("SW5E.Chassis.RemoveDone"));
	};

	if ( mode === "freeform" || v.ok ) {
		commit();
		return;
	}
	if ( mode === "strict" ) {
		new Dialog({
			title: game.i18n.localize("SW5E.Chassis.RemoveBlockedTitle"),
			content: formatValidationHtml(v),
			buttons: {
				close: { label: game.i18n.localize("SW5E.Chassis.DialogClose"), callback: () => {} }
			}
		}).render(true);
		return;
	}
	if ( mode === "guided" && userMayRulesOverride() ) {
		new Dialog({
			title: game.i18n.localize("SW5E.Chassis.RemoveValidateTitle"),
			content: formatValidationHtml(v),
			buttons: {
				force: {
					label: game.i18n.localize("SW5E.Chassis.RemoveAnyway"),
					callback: () => commit()
				},
				cancel: { label: game.i18n.localize("SW5E.Chassis.Cancel"), callback: () => {} }
			},
			default: "cancel"
		}).render(true);
		return;
	}
	ui.notifications.warn(game.i18n.localize("SW5E.Chassis.RemoveNotAllowed"));
}

/**
 * @param {import("@league/foundry").applications.api.DocumentSheetV2} app
 */
async function openChassisRarityUpgradeDialog(app) {
	const host = app.item;
	const chassis = normalizeChassis(host, getChassis(host));
	const nextRarity = getNextChassisRarity(chassis.rarity);
	if ( !nextRarity ) {
		ui.notifications.warn(game.i18n.localize("SW5E.Chassis.UpgradeNoNext"));
		return;
	}

	const runCommit = (targetRarity, force) => {
		const v = validateChassisRarityUpgrade(host, targetRarity, { force });
		const mode = getEffectiveChassisRulesMode(host);
		if ( mode === "strict" && !v.ok ) {
			ui.notifications.error(game.i18n.localize("SW5E.Chassis.UpgradeBlocked"));
			return;
		}
		if ( mode === "guided" && !v.ok && !force ) {
			ui.notifications.warn(game.i18n.localize("SW5E.Chassis.UpgradeIncomplete"));
			return;
		}
		const cur = normalizeChassis(host, getChassis(host));
		const nextState = normalizeChassis(host, cur, { rarityPreview: targetRarity });
		const dndKey = chassisRarityToItemSystemRarity(targetRarity);
		const systemRarity = itemSystemRarityUpdateValue(host, dndKey);
		void withPreservedItemSheetScroll(app, () => host.update({
			"flags.sw5e.chassis": nextState,
			"system.rarity": systemRarity
		})).catch(console.error);
		ui.notifications.info(game.i18n.format("SW5E.Chassis.UpgradeDone", { rarity: labelChassisRarity(targetRarity) }));
	};

	const val = validateChassisRarityUpgrade(host, nextRarity, { force: false });
	const rulesMode = getEffectiveChassisRulesMode(host);
	const content = `
		<p>${game.i18n.format("SW5E.Chassis.UpgradePrompt", { next: labelChassisRarity(nextRarity), current: labelChassisRarity(chassis.rarity) })}</p>
		<div class="chassis-val-report">${formatValidationHtml(val)}</div>`;

	const buttons = {
		cancel: {
			label: game.i18n.localize("SW5E.Chassis.Cancel"),
			callback: () => {}
		}
	};

	if ( rulesMode === "freeform" || val.ok ) {
		buttons.upgrade = {
			icon: '<i class="fas fa-arrow-up"></i>',
			label: game.i18n.localize("SW5E.Chassis.UpgradeConfirm"),
			callback: () => runCommit(nextRarity, false)
		};
	} else if ( rulesMode === "strict" ) {
		buttons.cancel.label = game.i18n.localize("SW5E.Chassis.DialogClose");
	} else if ( rulesMode === "guided" && val.overrideAllowed && userMayRulesOverride() ) {
		buttons.force = {
			icon: '<i class="fas fa-exclamation-triangle"></i>',
			label: game.i18n.localize("SW5E.Chassis.UpgradeAnyway"),
			callback: () => runCommit(nextRarity, true)
		};
	}

	new Dialog({
		title: game.i18n.localize("SW5E.Chassis.ActionUpgrade"),
		content,
		buttons,
		default: val.ok || rulesMode === "freeform" ? "upgrade" : "cancel"
	}).render(true);
}

/**
 * @param {import("@league/foundry").applications.api.DocumentSheetV2} app
 */
async function buildChassisPanelContext(app) {
	const item = app.item;
	const rulesSelectId = foundry.utils.randomID();
	let worldMode = getModuleSettingValue(CHASSIS_SETTING_KEYS.rulesMode, "guided");
	if ( !CHASSIS_RULES_MODES.includes(worldMode) ) worldMode = "guided";

	const rawChassis = getChassis(item);
	const normalized = rawChassis ? normalizeChassis(item, rawChassis) : null;
	const chassisEnabled = Boolean(normalized?.enabled);
	const effectiveMode = chassisEnabled ? getEffectiveChassisRulesMode(item) : worldMode;

	const override = normalized?.rulesMode;
	const rulesModeOptions = [
		{
			value: "",
			label: game.i18n.localize("SW5E.Chassis.RulesModeUseWorld"),
			selected: override == null || override === ""
		},
		...CHASSIS_RULES_MODES.map(m => ({
			value: m,
			label: labelRulesMode(m),
			selected: override === m
		}))
	];

	const slotRowsRaw = normalized ? buildChassisSlotDisplayRows(normalized) : [];
	const slotRows = slotRowsRaw.map(row => ({
		...row,
		kindLabel: formatSlotKind(row.kind),
		slotSemantic: normalized ? getChassisSlotSemantic(normalized, row.kind, row.index) : null
	}));
	const slotRowsBase = slotRows.filter(r => r.kind === "base");
	const slotRowsAugment = slotRows.filter(r => r.kind === "augment");

	const installedRows = (normalized?.installedMods ?? []).map(m => {
		const snapR = m?.snapshot?.rarity;
		const name = m?.snapshot?.name || m?.uuid || "—";
		return {
			name,
			uuid: m?.uuid ?? "",
			rarityDisplay: formatDndItemRarity(snapR),
			slotKindLabel: formatSlotKind(m?.slotKind ?? "base"),
			slotIndex: m?.slotIndex ?? 0,
			slotCost: m?.slotCost ?? 1,
			installedTime: formatInstalledTime(m?.installedAt)
		};
	});

	let slotsSummaryText = "";
	let slotsUsedTotal = "";
	let attunementText = "";
	let chassisTypeLabel = "";
	let chassisRarityLabel = "";
	let rulesModeLine = "";
	let hasRulesOverride = false;
	let canUpgradeChassis = false;
	if ( normalized ) {
		const b = normalized.slots;
		slotsSummaryText = game.i18n.format("SW5E.Chassis.SlotsSummaryFormat", {
			base: b.baseMax,
			augment: b.augmentMax,
			total: b.totalMax,
			used: b.used
		});
		slotsUsedTotal = game.i18n.format("SW5E.Chassis.SlotsUsedTotal", { used: b.used, total: b.totalMax });
		const att = normalized.attunement ?? {};
		attunementText = game.i18n.format("SW5E.Chassis.AttunementFormat", {
			req: att.required ? game.i18n.localize("SW5E.Chassis.BoolYes") : game.i18n.localize("SW5E.Chassis.BoolNo"),
			enh: att.enhanced ? game.i18n.localize("SW5E.Chassis.BoolYes") : game.i18n.localize("SW5E.Chassis.BoolNo")
		});
		chassisTypeLabel = labelChassisType(normalized.type);
		chassisRarityLabel = labelChassisRarity(normalized.rarity);
		canUpgradeChassis = Boolean(getNextChassisRarity(normalized.rarity));
		const ro = normalized.rulesMode;
		hasRulesOverride = ro != null && ro !== "";
		rulesModeLine = hasRulesOverride
			? game.i18n.format("SW5E.Chassis.RulesLineOverride", { mode: labelRulesMode(ro) })
			: game.i18n.format("SW5E.Chassis.RulesLineWorld", { world: labelRulesMode(worldMode) });
	}

	return {
		isEditable: app.isEditable,
		chassisEnabled,
		chassisTypeLabel,
		chassisRarityLabel,
		effectiveRulesModeLabel: labelRulesMode(effectiveMode),
		worldRulesModeLabel: labelRulesMode(worldMode),
		rulesModeLine,
		hasRulesOverride,
		slotsSummaryText,
		slotsUsedTotal,
		attunementText,
		rulesModeOptions,
		rulesSelectId,
		slotRows,
		slotRowsBase,
		slotRowsAugment,
		installedRows,
		canUpgradeChassis
	};
}

/**
 * @param {import("@league/foundry").documents.Item} item
 * @returns {Promise<"disable"|"remove"|null>}
 */
async function confirmRemoveChassisData(item) {
	const n = (getChassis(item)?.installedMods ?? []).length;
	const content = `<p>${n > 0 ? game.i18n.format("SW5E.Chassis.RemoveDataWarnMods", { n }) : game.i18n.localize("SW5E.Chassis.RemoveDataWarnEmpty")}</p>`;
	const buttons = [
		{
			action: "cancel",
			label: game.i18n.localize("SW5E.Chassis.Cancel"),
			icon: "fas fa-times",
			default: true
		}
	];
	if ( n > 0 ) {
		buttons.push({
			action: "disable",
			label: game.i18n.localize("SW5E.Chassis.DisableOnly"),
			icon: "fas fa-power-off"
		});
	}
	buttons.push({
		action: "remove",
		label: game.i18n.localize("SW5E.Chassis.RemoveDataConfirmButton"),
		icon: "fas fa-trash"
	});

	const result = await DialogV2.wait({
		rejectClose: false,
		modal: true,
		window: { title: game.i18n.localize("SW5E.Chassis.RemoveDataTitle") },
		position: { width: 480 },
		content,
		buttons
	});

	if ( result === "disable" ) return "disable";
	if ( result === "remove" ) return "remove";
	return null;
}

/**
 * @param {import("@league/foundry").applications.api.DocumentSheetV2} app
 * @param {HTMLElement} host
 */
function bindChassisPanel(app, host) {
	const item = app.item;

	const runUpdate = fn => {
		withPreservedItemSheetScroll(app, fn).catch(err => console.error("SW5E | Chassis update failed", err));
	};

	host.querySelector("select[data-chassis-field=\"rulesMode\"]")?.addEventListener("change", ev => {
		const sel = /** @type {HTMLSelectElement} */ (ev.currentTarget);
		const v = sel.value;
		const rulesMode = v === "" ? null : v;
		runUpdate(() => item.update(mergeChassisUpdate(item, { rulesMode })));
	});

	host.addEventListener("click", ev => {
		const btn = ev.target.closest("[data-chassis-action]");
		if ( !btn || !host.contains(btn) ) return;
		const action = btn.getAttribute("data-chassis-action");
		if ( !action ) return;

		switch ( action ) {
			case "enable":
				runUpdate(() => item.update({ "flags.sw5e.chassis": buildEnabledChassisStateForItem(item) }));
				break;
			case "disable":
				runUpdate(() => {
					const cur = getChassis(item);
					if ( !cur ) return Promise.resolve();
					return item.update({ "flags.sw5e.chassis": normalizeChassis(item, { ...cur, enabled: false }) });
				});
				break;
			case "remove-data":
				void (async () => {
					const choice = await confirmRemoveChassisData(item);
					if ( choice === null ) return;
					if ( choice === "disable" ) {
						runUpdate(() => {
							const cur = getChassis(item);
							if ( !cur ) return Promise.resolve();
							return item.update({ "flags.sw5e.chassis": normalizeChassis(item, { ...cur, enabled: false }) });
						});
						return;
					}
					if ( choice === "remove" ) {
						// Legacy data path is flags.sw5e.chassis; unsetFlag("sw5e", …) fails when sw5e is not an active package scope.
						runUpdate(() => item.update({ "flags.sw5e.-=chassis": null }));
					}
				})();
				break;
			case "install-workflow": {
				const slotKind = btn.getAttribute("data-chassis-slot-kind");
				const slotIndexRaw = btn.getAttribute("data-chassis-slot-index");
				const slotRole = btn.getAttribute("data-chassis-slot-role");
				/** @type {{ preferredSlot?: { slotKind: "base"|"augment", slotIndex: number }, slotSemantic?: string|null }} */
				const browserCtx = {};
				if ( slotKind != null && slotIndexRaw != null && slotIndexRaw !== "" ) {
					browserCtx.preferredSlot = {
						slotKind: slotKind === "augment" ? "augment" : "base",
						slotIndex: Number(slotIndexRaw)
					};
				}
				if ( slotRole ) browserCtx.slotSemantic = slotRole;
				void openInstallModificationDialog(app, browserCtx);
				break;
			}
			case "remove-workflow":
				void openRemoveModificationDialog(app);
				break;
			case "upgrade-workflow":
				void openChassisRarityUpgradeDialog(app);
				break;
			default:
				break;
		}
	});
}

/**
 * @param {import("@league/foundry").applications.api.DocumentSheetV2} app
 * @param {HTMLElement|JQuery} html
 */
async function injectChassisPanel(app, html) {
	const item = app.item;
	if ( !item || !isItemEligibleForChassis(item) ) return;

	const root = getHtmlRoot(html);
	if ( !root ) return;

	const tabDetails = getDetailsTabEl(root);
	if ( !tabDetails ) return;

	tabDetails.querySelector(".sw5e-chassis-panel-host")?.remove();

	const host = document.createElement("div");
	host.className = "sw5e-chassis-panel-host";

	const context = await buildChassisPanelContext(app);
	const htmlStr = await foundry.applications.handlebars.renderTemplate(TEMPLATE, context);
	host.innerHTML = htmlStr;
	tabDetails.insertBefore(host, tabDetails.firstChild);

	bindChassisPanel(app, host);
}

export function patchChassisItemSheet() {
	Hooks.on("renderItemSheet5e", (app, html) => {
		void injectChassisPanel(app, html);
	});
	Hooks.on("updateItem", (item, change) => {
		syncChassisFlagsRarityFromItem(item, change);
	});
}
