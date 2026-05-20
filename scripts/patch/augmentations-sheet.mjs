import { AugmentationsApp } from "../augmentations-app.mjs";
import {
	getInstalledAugmentationCount,
	isActorCyberneticAugmentationsManagerAllowed,
	isActorValidAugmentationTarget,
	normalizeActorAugmentations
} from "../augmentations.mjs";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

/**
 * dnd5e 5.2.x actor sheets use `constructor.MODES.PLAY` / `EDIT` and `app._mode`.
 * @param {object} app
 */
function isActorSheetEditMode(app) {
	const MODES = app?.constructor?.MODES;
	if ( MODES && ("EDIT" in MODES) && ("PLAY" in MODES) ) return app._mode === MODES.EDIT;
	return Boolean(app?.isEditable);
}

function hasSideEffectOverrides(state) {
	const o = state?.overrides?.sideEffects;
	if ( !o ) return false;
	return o.ionSaveDisadvantage !== null || o.ionVulnerability !== null || o.countAsDroid !== null;
}

function effectiveDiffersFromDerived(state) {
	const d = state?.derived?.sideEffects;
	const e = state?.effective?.sideEffects;
	if ( !d || !e ) return false;
	return d.ionSaveDisadvantage !== e.ionSaveDisadvantage
		|| d.ionVulnerability !== e.ionVulnerability
		|| d.countAsDroid !== e.countAsDroid;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {ReturnType<typeof normalizeActorAugmentations>} state
 * @param {object} [options]
 * @param {boolean} [options.editMode]
 */
function buildInlineAugmentationsSection(actor, state, { editMode = false } = {}) {
	const installedCount = getInstalledAugmentationCount(actor, state);
	const title = foundry.utils.escapeHTML(game.i18n.localize("SW5E.Augmentations.InlineTitle"));
	const emptyLabel = foundry.utils.escapeHTML(game.i18n.localize("SW5E.Augmentations.InlineAdd"));
	const notes = [];

	if ( !isActorValidAugmentationTarget(actor) ) {
		notes.push(`<p class="sw5e-bodymods-inline-note sw5e-bodymods-inline-note--warn">${foundry.utils.escapeHTML(game.i18n.localize("SW5E.Augmentations.InlineInvalidTargetHint"))}</p>`);
	}

	if ( hasSideEffectOverrides(state) || effectiveDiffersFromDerived(state) ) {
		notes.push(`<p class="sw5e-bodymods-inline-note sw5e-bodymods-inline-note--accent">${foundry.utils.escapeHTML(game.i18n.localize("SW5E.Augmentations.InlineOverridesHint"))}</p>`);
	}

	const hasInstalled = installedCount > 0;
	const actionHtml = hasInstalled
		? `
			<button type="button" class="unbutton sw5e-bodymods-inline-card" data-sw5e-aug-open-manager>
				<span class="sw5e-bodymods-inline-icon" aria-hidden="true">
					<i class="fas fa-microchip"></i>
				</span>
				<span class="sw5e-bodymods-inline-label">
					<span class="sw5e-bodymods-inline-title roboto-upper">${title}</span>
				</span>
				${editMode ? `
					<span class="sw5e-bodymods-inline-control" aria-hidden="true">
						<i class="fas fa-gear"></i>
					</span>
				` : ""}
			</button>
		`
		: `
			<button type="button" class="unbutton sw5e-bodymods-inline-card sw5e-bodymods-inline-card--empty" data-sw5e-aug-open-manager>
				<span class="sw5e-bodymods-inline-title roboto-upper">${emptyLabel}</span>
			</button>
		`;

	const wrap = document.createElement("div");
	wrap.className = "sw5e-augmentations-inline sw5e-bodymods-inline";
	wrap.innerHTML = `${actionHtml}${notes.join("")}`;
	wrap.querySelector("[data-sw5e-aug-open-manager]")?.addEventListener("click", e => {
		e.preventDefault();
		AugmentationsApp.openForActor(actor);
	});
	return wrap;
}

/**
 * Character details tab: `.right` column, after background (`.top.flexrow`), before Senses / Resistances pills.
 * NPC: `.sidebar`, before Senses / Resistances pills.
 */
function insertAugmentationsIntoSheetBody(root, actor, section) {
	if ( actor.type === "character" ) {
		const details = root.querySelector("section.tab[data-tab=\"details\"]");
		const right = details?.querySelector(".right");
		if ( !right ) return false;
		const mountBefore = right.querySelector("button[data-config=\"senses\"]")?.closest(".pills-group")
			?? right.querySelector("button[data-trait=\"dr\"]")?.closest(".pills-group");
		if ( mountBefore ) right.insertBefore(section, mountBefore);
		else {
			const top = right.querySelector(".top.flexrow");
			if ( top ) top.insertAdjacentElement("afterend", section);
			else right.prepend(section);
		}
		return true;
	}
	if ( actor.type === "npc" ) {
		const sidebar = root.querySelector(".sidebar");
		if ( !sidebar ) return false;
		const mountBefore = sidebar.querySelector("button[data-config=\"senses\"]")?.closest(".pills-group")
			?? sidebar.querySelector("button[data-trait=\"dr\"]")?.closest(".pills-group");
		if ( mountBefore ) sidebar.insertBefore(section, mountBefore);
		else sidebar.appendChild(section);
		return true;
	}
	return false;
}

function injectAugmentationsBodySection(app, html) {
	const actor = app.actor ?? app.document;
	if ( !actor || (actor.type !== "character" && actor.type !== "npc") ) return;
	if ( !isActorCyberneticAugmentationsManagerAllowed(actor) ) return;

	const root = getHtmlRoot(html);
	if ( !root ) return;

	root.querySelectorAll(".sw5e-augmentations-inline").forEach(n => n.remove());

	const canSee = actor.testUserPermission(game.user, "OBSERVER", { exact: false });
	if ( !canSee ) return;

	const editMode = isActorSheetEditMode(app);
	const state = normalizeActorAugmentations(actor);
	const installedCount = state.installed.length;

	if ( !editMode && installedCount === 0 ) return;

	const section = buildInlineAugmentationsSection(actor, state, { editMode });
	insertAugmentationsIntoSheetBody(root, actor, section);
}

export function patchAugmentationsSheet() {
	Hooks.on("renderActorSheetV2", injectAugmentationsBodySection);
}
