import { DroidCustomizationsApp } from "../droid-customizations-app.mjs";
import {
	isActorDroidCustomizationsManagerAllowed,
	normalizeActorDroidCustomizations
} from "../droid-customizations.mjs";

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

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {ReturnType<typeof normalizeActorDroidCustomizations>} state
 * @param {object} [options]
 * @param {boolean} [options.editMode]
 */
function buildInlineDroidCustomizationsSection(actor, state, { editMode = false } = {}) {
	const counts = state.derived.counts;
	const installedN = counts.total;
	const title = foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.InlineTitle"));
	const emptyLabel = foundry.utils.escapeHTML(game.i18n.localize("SW5E.DroidCustomizations.InlineAdd"));
	const hasInstalled = installedN > 0;
	const actionHtml = (editMode && !hasInstalled)
		? `
			<button type="button" class="unbutton sw5e-bodymods-inline-card sw5e-bodymods-inline-card--empty" data-sw5e-droid-open-manager>
				<span class="sw5e-bodymods-inline-title roboto-upper">${emptyLabel}</span>
			</button>
		`
		: `
			<button type="button" class="unbutton sw5e-bodymods-inline-card" data-sw5e-droid-open-manager>
				<span class="sw5e-bodymods-inline-icon" aria-hidden="true">
					<i class="fas fa-robot"></i>
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
		`;

	const wrap = document.createElement("div");
	wrap.className = "sw5e-droid-customizations-inline sw5e-bodymods-inline";
	wrap.innerHTML = actionHtml;
	wrap.querySelector("[data-sw5e-droid-open-manager]")?.addEventListener("click", e => {
		e.preventDefault();
		DroidCustomizationsApp.openForActor(actor);
	});
	return wrap;
}

/**
 * Same mount targets as cybernetic augmentations: details `.right` (character) or NPC `.sidebar`, before Senses / DR pills.
 */
function insertDroidSectionIntoSheetBody(root, actor, section) {
	if ( actor.type === "character" ) {
		const details = root.querySelector("section.tab[data-tab=\"details\"]");
		const right = details?.querySelector(".right");
		if ( !right ) return false;
		const mountBefore = right.querySelector("button[data-config=\"senses\"]")?.closest(".pills-group")
			?? right.querySelector("button[data-trait=\"dr\"]")?.closest(".pills-group");
		const aug = right.querySelector(".sw5e-augmentations-inline");
		if ( aug ) {
			aug.insertAdjacentElement("afterend", section);
			return true;
		}
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
		const aug = sidebar.querySelector(".sw5e-augmentations-inline");
		if ( aug ) {
			aug.insertAdjacentElement("afterend", section);
			return true;
		}
		if ( mountBefore ) sidebar.insertBefore(section, mountBefore);
		else sidebar.appendChild(section);
		return true;
	}
	return false;
}

function injectDroidCustomizationsBodySection(app, html) {
	const actor = app.actor ?? app.document;
	if ( !actor || (actor.type !== "character" && actor.type !== "npc") ) return;
	if ( !isActorDroidCustomizationsManagerAllowed(actor) ) return;

	const root = getHtmlRoot(html);
	if ( !root ) return;

	root.querySelectorAll(".sw5e-droid-customizations-inline").forEach(n => n.remove());

	const canSee = actor.testUserPermission(game.user, "OBSERVER", { exact: false });
	if ( !canSee ) return;

	const editMode = isActorSheetEditMode(app);
	const state = normalizeActorDroidCustomizations(actor);

	const section = buildInlineDroidCustomizationsSection(actor, state, { editMode });
	insertDroidSectionIntoSheetBody(root, actor, section);
}

export function patchDroidCustomizationsSheet() {
	Hooks.on("renderActorSheetV2", injectDroidCustomizationsBodySection);
}
