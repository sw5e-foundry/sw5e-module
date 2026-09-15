import { getFlag } from "../utils.mjs";
import { getModuleId } from "../module-support.mjs";

const MEDPAC_FLAG_PATH = "medpac";
const MEDPAC_BUTTON_SELECTOR = "[data-sw5e-medpac-roll]";
const MEDPAC_MESSAGE_CLASS = "sw5e-medpac-message";
/** dnd5e 6.0 usage-card `system.buttons[].action` handled via UtilityActivity#onChatAction. */
export const MEDPAC_CHAT_ACTION = "sw5eMedpacRoll";
const MEDPAC_CHAT_ACTION_SELECTOR = `[data-action="${MEDPAC_CHAT_ACTION}"]`;
const MEDPAC_ON_CHAT_ACTION_TARGET = "dnd5e.documents.activity.UtilityActivity.prototype.onChatAction";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? null;
}

function normalizeDiceCount(value) {
	const count = Number(value);
	return Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
}

function parseHitDieFaces(hitDie) {
	const match = typeof hitDie === "string" ? /^d(\d+)$/i.exec(hitDie.trim()) : null;
	return match ? Number(match[1]) : null;
}

function parseHitDieFormula(formula) {
	const match = typeof formula === "string" ? /(?:^|[^\w])\d*d(\d+)(?:[^\w]|$)/i.exec(formula) : null;
	return match ? `d${match[1]}` : null;
}

function getMedpacConfig(subject) {
	const item = subject?.item ?? subject;
	if (!item || item.type !== "consumable") return null;

	const configured = getFlag(item, MEDPAC_FLAG_PATH);
	if (configured?.enabled) {
		return {
			enabled: true,
			diceCount: normalizeDiceCount(configured.diceCount),
			itemName: item.name,
			itemUuid: item.uuid
		};
	}

	if (item.system?.type?.subtype !== "medpac") return null;
	return {
		enabled: true,
		diceCount: 1,
		itemName: item.name,
		itemUuid: item.uuid
	};
}

/**
 * Write Medpac SW5e flags and a 6.0 usage-card button onto `preCreateUsageMessage` config.
 * ChatMessage is created from `messageConfig.data`; top-level `messageConfig.flags` is ignored.
 * Compact dnd5e2 usage cards render `system.buttons` after `renderChatMessageHTML`, so a sibling
 * DOM inject is wiped unless the button is persisted here.
 * @param {object|null|undefined} messageConfig
 * @param {object} medpac
 * @returns {object|null|undefined}
 */
export function applyMedpacFlagsToUsageMessage(messageConfig, medpac) {
	if ( !messageConfig || !medpac ) return messageConfig;
	const data = (messageConfig.data ??= {});
	data.flags = foundry.utils.mergeObject(data.flags ?? {}, {
		sw5e: { medpac }
	}, { inplace: false });
	const system = (data.system ??= {});
	const buttons = Array.isArray(system.buttons) ? system.buttons.slice() : [];
	if ( !buttons.some(button => button?.action === MEDPAC_CHAT_ACTION) ) {
		buttons.push({
			action: MEDPAC_CHAT_ACTION,
			icon: "fa-solid fa-heart-pulse",
			label: { value: `Roll ${medpac.itemName} Healing` },
			visibility: "all"
		});
	}
	system.buttons = buttons;
	return messageConfig;
}

function addMedpacMessageFlag(activity, messageConfig) {
	const medpac = getMedpacConfig(activity);
	if (!medpac) return;
	applyMedpacFlagsToUsageMessage(messageConfig, medpac);
}

function resolveClickActor(message, medpac) {
	const controlled = canvas?.tokens?.controlled
		?.map(token => token.actor)
		?.find(actor => actor?.isOwner);
	if (controlled) return controlled;

	const character = game.user?.character;
	if (character?.isOwner) return character;

	const associated = message?.getAssociatedActor?.() ?? message?.speakerActor;
	if (associated?.isOwner) return associated;

	const itemUuid = medpac?.itemUuid;
	if (itemUuid && typeof fromUuidSync === "function") {
		const item = fromUuidSync(itemUuid);
		const parent = item?.parent;
		if (parent?.isOwner) return parent;
	}
	return null;
}

function collectClassHitDice(actor) {
	const tallies = new Map();
	for (const cls of actor?.itemTypes?.class ?? []) {
		const hitDie = cls?.system?.hd?.denomination ?? cls?.system?.hitDice;
		const faces = parseHitDieFaces(hitDie);
		if (!faces) continue;
		const levels = Math.max(Number(cls?.system?.levels) || 0, 1);
		const current = tallies.get(hitDie) ?? { hitDie, faces, count: 0 };
		current.count += levels;
		tallies.set(hitDie, current);
	}
	return Array.from(tallies.values());
}

export function getPredominantHitDie(actor) {
	const classHitDice = collectClassHitDice(actor);
	if (classHitDice.length) {
		classHitDice.sort((left, right) => {
			if (right.count !== left.count) return right.count - left.count;
			return right.faces - left.faces;
		});
		return classHitDice[0].hitDie;
	}

	const actorHd = actor?.system?.attributes?.hd?.denomination ?? actor?.system?.attributes?.hp?.formula;
	return parseHitDieFormula(actorHd) ?? parseHitDieFormula(actor?.system?.attributes?.hp?.formula);
}

function createMedpacButton(medpac) {
	const controls = document.createElement("div");
	controls.className = "card-buttons";

	const button = document.createElement("button");
	button.type = "button";
	button.dataset.sw5eMedpacRoll = "true";
	button.textContent = `Roll ${medpac.itemName} Healing`;

	controls.append(button);
	return { controls, button };
}

async function rollMedpacHealing(message, button) {
	const medpac = getFlag(message, MEDPAC_FLAG_PATH);
	if (!medpac?.enabled) return;

	const actor = resolveClickActor(message, medpac);
	if (!actor) {
		ui.notifications.warn("Select a token you control or assign a character before rolling medpac healing.");
		return;
	}

	const hitDie = getPredominantHitDie(actor);
	if (!hitDie) {
		ui.notifications.warn(`${actor.name} does not have a detectable Hit Die size for medpac healing.`);
		return;
	}

	const diceCount = normalizeDiceCount(medpac.diceCount);
	const formula = `max(1, ${diceCount}${hitDie} + @abilities.con.mod)`;
	const rollData = actor.getRollData ? actor.getRollData() : actor.system;
	const roll = await new Roll(formula, rollData).evaluate();
	const flavor = `${medpac.itemName} Healing (${diceCount}${hitDie} + CON)`;

	await roll.toMessage({
		flavor,
		speaker: ChatMessage.getSpeaker({ actor }),
		flags: {
			sw5e: {
				medpacResult: {
					actorId: actor.id,
					diceCount,
					hitDie,
					itemName: medpac.itemName,
					itemUuid: medpac.itemUuid
				}
			}
		}
	});

	button?.blur?.();
}

function hasMedpacChatButton(root) {
	return Boolean(root?.querySelector(`${MEDPAC_BUTTON_SELECTOR}, ${MEDPAC_CHAT_ACTION_SELECTOR}`));
}

function renderMedpacButton(message, html) {
	const medpac = getFlag(message, MEDPAC_FLAG_PATH);
	if (!medpac?.enabled) return;

	const root = getHtmlRoot(html);
	if (!root) return;
	root.classList.add(MEDPAC_MESSAGE_CLASS);
	if (hasMedpacChatButton(root)) return;

	const content = root.querySelector(".message-content") ?? root;
	const { controls, button } = createMedpacButton(medpac);
	button.addEventListener("click", async event => {
		event.preventDefault();
		button.disabled = true;
		try {
			await rollMedpacHealing(message, button);
		} finally {
			button.disabled = false;
		}
	});

	content.append(controls);
}

function onRenderMedpacChatMessage(message, html) {
	renderMedpacButton(message, html);
	// dnd5e 6.0 usage cards replace `.message-content` in ApplicationV2 `_onRender` after this hook.
	globalThis.requestAnimationFrame?.(() => renderMedpacButton(message, html));
}

async function onMedpacChatAction(wrapped, event, target, message) {
	const action = target?.dataset?.action ?? message?.system?.getButton?.(target)?.action;
	if ( action === MEDPAC_CHAT_ACTION ) {
		await rollMedpacHealing(message, target);
		return;
	}
	return wrapped(event, target, message);
}

function patchMedpacChatAction() {
	try {
		libWrapper.register(getModuleId(), MEDPAC_ON_CHAT_ACTION_TARGET, onMedpacChatAction, "MIXED");
	} catch (err) {
		console.warn("SW5E MODULE | Could not wrap UtilityActivity.onChatAction for Medpac.", err);
	}
}

export function patchMedpac() {
	patchMedpacChatAction();
	Hooks.on("dnd5e.preCreateUsageMessage", addMedpacMessageFlag);
	Hooks.on("renderChatMessageHTML", onRenderMedpacChatMessage);
}
