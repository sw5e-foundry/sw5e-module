import { getFlag } from "../utils.mjs";
import { isManagedBlasterWeapon, isReloadableActor, reloadBlasterWeapon } from "./blaster-reload.mjs";

const BLASTER_RELOAD_FLAG = "blasterReload";
const BLASTER_EMPTY_CLASS = "sw5e-blaster-empty";
const RELOAD_BUTTON_SELECTOR = "[data-sw5e-blaster-reload='true']";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? null;
}

function localizeReloadLabel() {
	return game.i18n.localize("SW5E.WeaponReload");
}

/**
 * `dnd5e.preUseActivity` receives an Activity whose item is a clone used during the use pipeline.
 * @param {import("@league/foundry").documents.Activity} activity
 * @returns {import("@league/foundry").documents.Item|null}
 */
function getRealEmbeddedItemFromActivity(activity) {
	const probeItem = activity?.item;
	const id = probeItem?.id;
	const parent = probeItem?.parent;
	if ( !id || parent?.documentName !== "Actor" ) return null;
	return parent.items.get(id) ?? null;
}

/**
 * @param {unknown} raw
 * @param {import("@league/foundry").documents.Item} item
 */
function parseConsumptionValue(raw, item) {
	const direct = Number(raw);
	if ( Number.isFinite(direct) ) return direct;

	const rollData = item.getRollData?.() ?? item.parent?.getRollData?.() ?? {};
	try {
		return Number(Roll.safeEval(String(raw ?? 0), rollData)) || 0;
	} catch {
		return 0;
	}
}

/**
 * @param {import("@league/foundry").documents.Activity} activity
 * @param {import("@league/foundry").documents.Item} item
 */
function getItemUsesCost(activity, item) {
	const targets = activity?.consumption?.targets;
	if ( !targets?.length ) return 0;

	let cost = 0;
	for ( const target of targets ) {
		if ( target?.type !== "itemUses" ) continue;

		const targetId = target.target;
		if ( targetId && targetId !== item.id ) continue;

		const parsed = parseConsumptionValue(target.value, item);
		if ( parsed > 0 ) cost += parsed;
	}
	return cost;
}

/**
 * @param {import("@league/foundry").documents.Item} item
 * @returns {number|null} null when uses cannot be read safely
 */
function getRemainingItemUses(item) {
	const uses = item?.system?.uses;
	if ( !uses ) return null;

	const value = uses.value;
	if ( value != null && value !== "" ) {
		const remaining = Number(value);
		if ( Number.isFinite(remaining) ) return Math.max(0, remaining);
	}

	const max = Number(uses.max);
	const spent = Number(uses.spent) || 0;
	if ( Number.isFinite(max) && max > 0 ) return Math.max(0, max - spent);

	return null;
}

/**
 * @param {import("@league/foundry").documents.Activity} activity
 */
function getActivityDisplayName(activity) {
	if ( activity?.name ) return activity.name;
	if ( activity?.type === "attack" ) return "Attack";
	return "this activity";
}

/**
 * @param {import("@league/foundry").documents.Item} weapon
 * @param {import("@league/foundry").documents.Activity} activity
 * @param {number} remaining
 * @param {number} cost
 */
function buildAmmoFailureMessage(weapon, activity, remaining, cost) {
	if ( remaining === 0 ) {
		return game.i18n.format("SW5E.BlasterOutOfAmmo", { name: weapon.name });
	}
	if ( remaining < cost ) {
		return game.i18n.format("SW5E.BlasterNotEnoughAmmo", {
			name: weapon.name,
			activity: getActivityDisplayName(activity)
		});
	}
	return null;
}

function buildChatCardHtml(message) {
	const escaped = foundry.utils.escapeHTML(message);
	const reloadLabel = foundry.utils.escapeHTML(localizeReloadLabel());
	return `<div class="${BLASTER_EMPTY_CLASS}"><p>${escaped}</p><button type="button" class="sw5e-reload-button" data-sw5e-blaster-reload="true"><i class="fas fa-rotate-right"></i> ${reloadLabel}</button></div>`;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {import("@league/foundry").documents.Item} weapon
 * @param {import("@league/foundry").documents.Activity} activity
 * @param {string} message
 */
async function whisperAmmoFailure(actor, weapon, activity, message) {
	const whisper = game.users.filter(u => actor.testUserPermission(u, "OWNER") || u.isGM);
	await ChatMessage.create({
		content: buildChatCardHtml(message),
		whisper,
		speaker: ChatMessage.getSpeaker({ actor }),
		flags: {
			sw5e: {
				[BLASTER_RELOAD_FLAG]: {
					actorId: actor.id,
					itemId: weapon.id,
					itemName: weapon.name,
					activityName: getActivityDisplayName(activity)
				}
			}
		}
	});
}

/**
 * @param {import("@league/foundry").documents.Activity} activity
 */
async function onPreUseActivity(activity) {
	const weapon = getRealEmbeddedItemFromActivity(activity);
	const actor = weapon?.parent;
	if ( !isReloadableActor(actor) ) return true;
	if ( !isManagedBlasterWeapon(weapon) ) return true;

	const cost = getItemUsesCost(activity, weapon);
	if ( cost <= 0 ) return true;

	const remaining = getRemainingItemUses(weapon);
	if ( remaining == null ) return true;

	const message = buildAmmoFailureMessage(weapon, activity, remaining, cost);
	if ( !message ) return true;

	await whisperAmmoFailure(actor, weapon, activity, message);
	return false;
}

function canClickReload(actor) {
	return !!actor?.isOwner || game.user.isGM;
}

/**
 * @param {import("@league/foundry").documents.ChatMessage} message
 * @param {HTMLButtonElement} button
 */
async function onChatReloadClick(message, button) {
	const config = getFlag(message, BLASTER_RELOAD_FLAG);
	if ( !config?.actorId || !config?.itemId ) return;

	const actor = game.actors.get(config.actorId);
	const weapon = actor?.items?.get(config.itemId);
	if ( !actor || !weapon ) return;
	if ( !canClickReload(actor) ) return;

	button.disabled = true;
	try {
		await reloadBlasterWeapon(actor, weapon);
	} finally {
		button.disabled = false;
	}
}

/**
 * @param {import("@league/foundry").documents.ChatMessage} message
 * @param {HTMLElement|JQuery} html
 */
function renderChatReloadButton(message, html) {
	const config = getFlag(message, BLASTER_RELOAD_FLAG);
	if ( !config?.actorId || !config?.itemId ) return;

	const root = getHtmlRoot(html);
	if ( !root ) return;

	const button = root.querySelector(RELOAD_BUTTON_SELECTOR);
	if ( !button || button.dataset.sw5eBlasterReloadBound === "true" ) return;

	button.dataset.sw5eBlasterReloadBound = "true";
	button.addEventListener("click", async event => {
		event.preventDefault();
		await onChatReloadClick(message, button);
	});

	root.classList.add(BLASTER_EMPTY_CLASS);
}

export function patchBlasterAmmoUx() {
	Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
	Hooks.on("renderChatMessageHTML", renderChatReloadButton);
}
