const SUPPORTED_AMMO_TYPES = new Set(["powerCell", "cartridge"]);
const RELOAD_ICON_CLASS = "sw5e-reload-icon";
const RELOAD_ICON_SELECTOR = "[data-sw5e-blaster-reload='true']";
const LEGACY_WARNED_ITEMS = new Set();

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

function localizeReloadLabel() {
	return game.i18n.localize("SW5E.WeaponReload");
}

/**
 * @param {import("@league/foundry").documents.Actor|null|undefined} actor
 */
export function isReloadableActor(actor) {
	if ( !actor ) return false;
	return actor.type === "character" || actor.type === "npc";
}

function getAmmoTypes(itemData) {
	const types = itemData?.system?.ammo?.types;
	if ( Array.isArray(types) && types.length ) return types;
	const legacyTypes = itemData?.flags?.sw5e?.reload?.types;
	return Array.isArray(legacyTypes) ? legacyTypes : [];
}

function getReloadMax(itemData) {
	const usesMax = Number(itemData?.system?.uses?.max);
	if ( Number.isFinite(usesMax) && (usesMax > 0) ) return usesMax;

	const flagRel = Number(
		itemData?.flags?.sw5e?.properties?.rel
		?? itemData?.flags?.sw5e?.properties?.reload
	);
	return Number.isFinite(flagRel) && (flagRel > 0) ? flagRel : 0;
}

function getUsesSpent(item) {
	const spent = Number(item?.system?.uses?.spent);
	return Number.isFinite(spent) && (spent > 0) ? spent : 0;
}

function isWeaponMagazineFull(item) {
	return getUsesSpent(item) <= 0;
}

function needsUsesMaxWrite(item) {
	const max = item?.system?.uses?.max;
	return max == null || max === "";
}

function warnLegacyBlasterData(item) {
	if ( !item?.id || LEGACY_WARNED_ITEMS.has(item.id) ) return;

	const legacyAmmoValue = item.system?.ammo?.value;
	const legacyReloadFlag = item.flags?.sw5e?.reload;
	if ( legacyAmmoValue == null && !legacyReloadFlag ) return;

	LEGACY_WARNED_ITEMS.add(item.id);
	const details = [];
	if ( legacyAmmoValue != null ) details.push("system.ammo.value");
	if ( legacyReloadFlag ) details.push("flags.sw5e.reload");
	console.warn(`SW5E MODULE | ${item.name} uses legacy blaster ammo data (${details.join(", ")}). Runtime reload uses system.uses only.`);
}

function getInitialUsesUpdate(itemData) {
	if ( itemData?.type !== "weapon" ) return null;
	if ( !getAmmoTypes(itemData).some(type => SUPPORTED_AMMO_TYPES.has(type)) ) return null;
	if ( !needsUsesMaxWrite(itemData) ) return null;

	const reloadMax = getReloadMax(itemData);
	if ( reloadMax <= 0 ) return null;
	return { "system.uses.max": String(reloadMax) };
}

export function isManagedBlasterWeapon(item) {
	if ( item?.type !== "weapon" ) return false;
	if ( getReloadMax(item) <= 0 ) return false;
	if ( !getAmmoTypes(item).some(type => SUPPORTED_AMMO_TYPES.has(type)) ) return false;
	warnLegacyBlasterData(item);
	return true;
}

function getCompatibleAmmo(weapon) {
	const actor = weapon?.actor;
	if ( !actor ) return [];

	const validTypes = new Set(getAmmoTypes(weapon).filter(type => SUPPORTED_AMMO_TYPES.has(type)));
	if ( !validTypes.size ) return [];

	return actor.items.filter(item => {
		if ( item.type !== "consumable" ) return false;
		if ( item.system?.type?.value !== "ammo" ) return false;
		return validTypes.has(item.system?.type?.subtype);
	});
}

function getAmmoQuantity(item) {
	const quantity = Number(item?.system?.quantity);
	return Number.isFinite(quantity) ? quantity : 0;
}

function resolveAmmoForReload(weapon) {
	const compatibleAmmo = getCompatibleAmmo(weapon);
	if ( !compatibleAmmo.length ) return { reason: "missing" };

	const currentTarget = weapon.system?.ammo?.target;
	const targetedAmmo = currentTarget
		? compatibleAmmo.find(item => item.id === currentTarget && getAmmoQuantity(item) > 0)
		: null;
	if ( targetedAmmo ) return { ammo: targetedAmmo };

	const availableAmmo = compatibleAmmo.find(item => getAmmoQuantity(item) > 0);
	if ( availableAmmo ) return { ammo: availableAmmo };

	return { reason: "empty" };
}

function getPrimaryAmmoType(weapon) {
	const types = getAmmoTypes(weapon).filter(type => SUPPORTED_AMMO_TYPES.has(type));
	if ( types.includes("powerCell") && !types.includes("cartridge") ) return "powerCell";
	if ( types.includes("cartridge") && !types.includes("powerCell") ) return "cartridge";
	return types[0] ?? null;
}

function getNoAmmoWhisper(actor, weapon) {
	const actorName = actor?.name ?? game.i18n.localize("DOCUMENT.Actor");
	const ammoType = getPrimaryAmmoType(weapon);
	if ( ammoType === "powerCell" ) {
		return game.i18n.format("SW5E.NoPowerCells", { actor: actorName });
	}
	return game.i18n.format("SW5E.NoCartridges", { actor: actorName });
}

async function whisperToActorOwnersAndGM(actor, content) {
	const whisper = game.users.filter(u => actor.testUserPermission(u, "OWNER") || u.isGM);
	await ChatMessage.create({
		content,
		whisper,
		speaker: ChatMessage.getSpeaker({ actor })
	});
}

function canReloadActor(actor) {
	return !!actor?.isOwner || game.user.isGM;
}

/**
 * Reload a managed PC blaster: consume one inventory ammo and restore item uses to full.
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {import("@league/foundry").documents.Item} weapon
 * @param {object} [options]
 * @returns {Promise<{ok: boolean, reason: string}>}
 */
export async function reloadBlasterWeapon(actor, weapon, options = {}) {
	if ( !actor || !weapon ) return { ok: false, reason: "invalid" };
	if ( !isReloadableActor(actor) ) return { ok: false, reason: "not-character" };
	if ( !isManagedBlasterWeapon(weapon) ) return { ok: false, reason: "not-managed" };
	if ( !canReloadActor(actor) ) return { ok: false, reason: "no-permission" };

	if ( isWeaponMagazineFull(weapon) ) {
		await whisperToActorOwnersAndGM(actor, game.i18n.format("SW5E.BlasterAlreadyFull", { name: weapon.name }));
		return { ok: true, reason: "already-full" };
	}

	const resolvedAmmo = resolveAmmoForReload(weapon);
	if ( !resolvedAmmo.ammo ) {
		await whisperToActorOwnersAndGM(actor, getNoAmmoWhisper(actor, weapon));
		return { ok: false, reason: resolvedAmmo.reason ?? "no-ammo" };
	}

	const ammo = resolvedAmmo.ammo;
	const ammoQuantity = getAmmoQuantity(ammo);
	if ( ammoQuantity <= 0 ) {
		await whisperToActorOwnersAndGM(actor, getNoAmmoWhisper(actor, weapon));
		return { ok: false, reason: "empty" };
	}

	const reloadMax = getReloadMax(weapon);
	const weaponUpdates = { "system.uses.spent": 0 };
	if ( needsUsesMaxWrite(weapon) ) weaponUpdates["system.uses.max"] = String(reloadMax);

	try {
		await ammo.update({ "system.quantity": ammoQuantity - 1 });
	} catch (error) {
		console.error("SW5E MODULE | Blaster reload ammo update failed.", error);
		await whisperToActorOwnersAndGM(actor, `Failed to reload ${weapon.name}.`);
		return { ok: false, reason: "ammo-update-failed" };
	}

	try {
		await weapon.update(weaponUpdates);
	} catch (error) {
		console.error("SW5E MODULE | Blaster reload weapon update failed.", error);
		await whisperToActorOwnersAndGM(actor, `Failed to reload ${weapon.name}.`);
		return { ok: false, reason: "weapon-update-failed" };
	}

	await whisperToActorOwnersAndGM(actor, game.i18n.format("SW5E.BlasterReloaded", { name: weapon.name }));
	return { ok: true, reason: "reloaded" };
}

async function onReloadButtonClick(app, event) {
	event.preventDefault();
	event.stopPropagation();

	const row = event.currentTarget.closest("li.item[data-item-id]");
	const weapon = app.actor?.items?.get(row?.dataset?.itemId);
	if ( !weapon || !isManagedBlasterWeapon(weapon) ) return;

	await reloadBlasterWeapon(app.actor, weapon);
}

/**
 * dnd5e 5.2.5 inventory rows: controls live in the always-visible controls column.
 * @param {HTMLElement} row
 */
function findItemControlsContainer(row) {
	return row.querySelector('.item-controls[data-column-id="controls"]')
		?? row.querySelector(".item-row .item-controls");
}

/**
 * `renderActorSheetV2` may provide a partial subtree, so prefer a root that actually
 * contains the inventory rows before falling back to the sheet element.
 * @param {HTMLElement|JQuery|null|undefined} html
 * @param {object} app
 * @returns {HTMLElement|null}
 */
function resolveReloadRenderRoot(html, app) {
	const hookRoot = getHtmlRoot(html);
	const appRoot = getHtmlRoot(app?.element);
	const hasInventory = root => (
		root instanceof HTMLElement
		&& !!root.querySelector?.("li.item[data-item-id], dnd5e-inventory, .inventory-element")
	);

	if ( hasInventory(hookRoot) ) return hookRoot;
	if ( hasInventory(appRoot) ) return appRoot;
	if ( appRoot instanceof HTMLElement ) return appRoot;
	return hookRoot instanceof HTMLElement ? hookRoot : null;
}

/**
 * @param {object} app
 */
function createReloadButton(app) {
	const label = localizeReloadLabel();
	const button = document.createElement("button");
	button.type = "button";
	button.className = `unbutton config-button item-control always-interactive ${RELOAD_ICON_CLASS}`;
	button.dataset.sw5eBlasterReload = "true";
	button.dataset.tooltip = label;
	button.setAttribute("aria-label", label);
	button.innerHTML = `<i class="fas fa-rotate-right" inert></i>`;
	button.addEventListener("click", onReloadButtonClick.bind(null, app));
	return button;
}

function renderReloadButtons(app, html) {
	const root = resolveReloadRenderRoot(html, app);
	if ( !(root instanceof HTMLElement) || !isReloadableActor(app?.actor) || !canReloadActor(app?.actor) ) return;

	root.querySelectorAll(RELOAD_ICON_SELECTOR).forEach(button => button.remove());

	for ( const row of root.querySelectorAll("li.item[data-item-id]") ) {
		const weapon = app.actor?.items?.get(row.dataset.itemId);
		if ( !isManagedBlasterWeapon(weapon) ) continue;

		const controls = findItemControlsContainer(row);
		if ( !controls ) continue;

		controls.insertBefore(createReloadButton(app), controls.firstChild);
	}
}

export function patchBlasterReload() {
	Hooks.on("preCreateItem", (document, data) => {
		if ( document?.parent?.documentName !== "Actor" ) return;
		const updates = getInitialUsesUpdate(data);
		if ( updates ) document.updateSource(updates);
	});

	Hooks.on("renderActorSheetV2", renderReloadButtons);
}
