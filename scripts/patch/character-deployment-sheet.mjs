import {
	DEPLOYMENT_RANK_BOUNDS,
	getCharacterDeploymentSummary,
	isParentDeploymentFeat
} from "../character-deployments.mjs";
import { getModuleId } from "../module-support.mjs";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

function localizeOrFallback(key, fallback) {
	const localized = game.i18n?.localize?.(key);
	return localized && localized !== key ? localized : fallback;
}

/**
 * @param {import("@league/foundry").documents.Item} item
 * @param {number|null} nextValue
 */
async function persistDeploymentRankFlag(item, nextValue) {
	const deployment = foundry.utils.duplicate(item.flags?.sw5e?.deployment ?? {});

	if ( nextValue === null ) {
		delete deployment.rank;
		if ( Object.keys(deployment).length === 0 ) await item.unsetFlag("sw5e", "deployment");
		else await item.setFlag("sw5e", "deployment", deployment);
		return;
	}

	deployment.rank = nextValue;
	await item.setFlag("sw5e", "deployment", deployment);
}

/**
 * @param {ReturnType<typeof getCharacterDeploymentSummary>["deployments"][number]} entry
 * @param {boolean} editable
 */
function formatDeploymentClassCard(entry, editable) {
	const safeId = foundry.utils.escapeHTML(entry.id);
	const name = foundry.utils.escapeHTML(entry.name || entry.identifier || entry.id);
	const imgSrc = entry.img ? foundry.utils.escapeHTML(entry.img) : "";
	const imgHtml = imgSrc
		? `<img class="sw5e-deployment-card-img" src="${imgSrc}" alt="" decoding="async">`
		: `<span class="sw5e-deployment-card-img-placeholder" aria-hidden="true"><i class="fas fa-rocket"></i></span>`;

	const legacy = entry.legacyMirror
		? ` <span class="subdued">(${foundry.utils.escapeHTML(localizeOrFallback("SW5E.DeploymentSummary.LegacyMirror", "legacy snapshot"))})</span>`
		: "";

	const unsetHint = entry.rankUncertain
		? `<span class="subdued sw5e-deployment-rank-hint">${foundry.utils.escapeHTML(
			localizeOrFallback("SW5E.Deployment.RankUnsetHint", "No stored rank — choose a rank or leave unset.")
		)}</span>`
		: "";

	let rankPart;
	if ( editable ) {
		const unsetLabel = foundry.utils.escapeHTML(localizeOrFallback("SW5E.Deployment.RankOptionUnset", "Unset (?)"));
		const options = [`<option value="">${unsetLabel}</option>`];
		for ( let r = DEPLOYMENT_RANK_BOUNDS.min; r <= DEPLOYMENT_RANK_BOUNDS.max; r++ ) {
			const sel = entry.storedRank === r ? " selected" : "";
			const label = game.i18n?.format
				? game.i18n.format("SW5E.Deployment.RankOption", { rank: r })
				: `Rank ${r}`;
			options.push(`<option value="${r}"${sel}>${foundry.utils.escapeHTML(label)}</option>`);
		}
		const aria = foundry.utils.escapeHTML(localizeOrFallback("SW5E.Deployment.RankSelectAria", "Deployment rank"));
		rankPart = `
			<select class="sw5e-deployment-rank-select" data-item-id="${safeId}" aria-label="${aria}">
				${options.join("")}
			</select>`;
	}
	else rankPart = `<span class="sw5e-deployment-summary-rank-readonly">${foundry.utils.escapeHTML(entry.rankLabel)}</span>`;

	const openLabel = foundry.utils.escapeHTML(localizeOrFallback("SW5E.Deployment.CardOpenItem", "Open deployment item"));

	return `<div class="sw5e-deployment-class-card" data-item-id="${safeId}">
			<button type="button" class="unstyled-button sw5e-deployment-card-open" data-sw5e-deployment-open="${safeId}"
				title="${openLabel}" aria-label="${openLabel}">
				${imgHtml}
				<span class="sw5e-deployment-card-name">${name}</span>
			</button>
			<div class="sw5e-deployment-card-rank">${rankPart}${unsetHint}${legacy}</div>
		</div>`;
}

/**
 * @param {HTMLElement} section
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {import("@league/foundry").applications.api.ApplicationV2} app
 */
function bindDeploymentRankControls(section, actor, app) {
	section.querySelectorAll("select.sw5e-deployment-rank-select[data-item-id]").forEach(select => {
		select.addEventListener("change", async ev => {
			const target = ev.target;
			if ( !(target instanceof HTMLSelectElement) ) return;
			const itemId = target.dataset.itemId;
			if ( !itemId ) return;

			const item = actor.items.get(itemId);
			if ( !item ) return;

			const raw = target.value;
			let next = null;
			if ( raw !== "" ) {
				const n = Number(raw);
				if ( !Number.isInteger(n) ) return;
				next = Math.max(DEPLOYMENT_RANK_BOUNDS.min, Math.min(DEPLOYMENT_RANK_BOUNDS.max, n));
			}

			try {
				await persistDeploymentRankFlag(item, next);
				ui.notifications?.info?.(
					localizeOrFallback("SW5E.Deployment.RankChangedNoAdvancement", "Rank saved — advancement rewards are not applied automatically yet."));
				await app.render?.(true);
			} catch ( err ) {
				console.warn("SW5E | Deployment rank update failed", err);
				ui.notifications?.error?.(localizeOrFallback(
					"SW5E.Deployment.RankUpdateFailed", "Could not update deployment rank."));
				const r = item.flags?.sw5e?.deployment?.rank;
				target.value = r === undefined || r === null ? "" : String(r);
			}
		});
	});
}

/**
 * @param {HTMLElement} section
 * @param {import("@league/foundry").documents.Actor} actor
 */
function bindDeploymentCardOpenHandlers(section, actor) {
	section.querySelectorAll("button[data-sw5e-deployment-open]").forEach(btn => {
		btn.addEventListener("click", ev => {
			ev.preventDefault();
			ev.stopPropagation();
			const itemId = btn instanceof HTMLElement ? btn.dataset.sw5eDeploymentOpen : "";
			if ( !itemId ) return;
			const item = actor.items.get(itemId);
			item?.sheet?.render?.(true);
		});
	});
}

/**
 * Mount Deployment header cards on the **Features** tab only (before inventory). No Core/Details injection.
 *
 * @returns {boolean}
 */
function insertDeploymentCardsIntoFeaturesTab(root, section) {
	const featuresTab = root.querySelector("section.tab[data-tab=\"features\"]");
	if ( !featuresTab ) return false;

	const inventoryEl = featuresTab.querySelector("inventory-element");
	if ( inventoryEl?.parentNode ) {
		inventoryEl.parentNode.insertBefore(section, inventoryEl);
		return true;
	}

	const fallbackHost = featuresTab.querySelector(".sheet-body") ?? featuresTab;
	fallbackHost.insertAdjacentElement("afterbegin", section);
	return true;
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {ReturnType<typeof getCharacterDeploymentSummary>} summary
 * @param {import("@league/foundry").applications.api.ApplicationV2} app
 */
function buildDeploymentFeaturesHeader(actor, summary, app) {
	const editable = actor.canUserModify(game.user);

	const wrap = document.createElement("div");
	wrap.className = "sw5e-deployment-features-header";
	wrap.setAttribute("role", "region");
	wrap.setAttribute("aria-label", localizeOrFallback("SW5E.DeploymentSummary.Title", "Deployments"));

	const cardsHtml = summary.deployments.map(d => formatDeploymentClassCard(d, editable)).join("");

	const warningsText = summary.warnings.length
		? `<div class="subdued sw5e-deployment-features-warnings">${summary.warnings.map(w => {
			const msg = w.startsWith("SW5E.") ? localizeOrFallback(w, w) : w;
			return foundry.utils.escapeHTML(msg);
		}).join(" ")}</div>`
		: "";

	wrap.innerHTML = `
		<div class="sw5e-features-deployment-cards">${cardsHtml}</div>
		${warningsText}
	`;

	bindDeploymentRankControls(wrap, actor, app);
	bindDeploymentCardOpenHandlers(wrap, actor);

	return wrap;
}

function injectCharacterDeploymentFeaturesHeader(app, html) {
	try {
		const actor = app.actor ?? app.document;
		if ( !actor || (actor.type !== "character" && actor.type !== "npc") ) return;

		const root = getHtmlRoot(html);
		if ( !root ) return;

		root.querySelectorAll(".sw5e-deployment-features-header").forEach(el => el.remove());

		const canSee = actor.testUserPermission(game.user, "OBSERVER", { exact: false });
		if ( !canSee ) return;

		const summary = getCharacterDeploymentSummary(actor);
		if ( !summary.hasDeployments ) return;

		const section = buildDeploymentFeaturesHeader(actor, summary, app);
		insertDeploymentCardsIntoFeaturesTab(root, section);
	} catch ( err ) {
		console.warn("SW5E | Deployment Features header injection failed", err);
	}
}

/**
 * @param {import("@league/foundry").documents.Item} item
 * @returns {"sw5e-deployment"|"sw5e-venture"|null}
 */
function classifyFeatDeploymentOrigin(item) {
	if ( item?.type !== "feat" ) return null;
	const value = item.system?.type?.value;
	const subtype = item.system?.type?.subtype;
	if ( value !== "deployment" ) return null;
	return subtype === "venture" ? "sw5e-venture" : "sw5e-deployment";
}

/**
 * Insert Deployment/Venture sections before stock **Other** (dnd5e 5.2.5 Features tab).
 *
 * @param {import("@league/foundry").applications.api.ApplicationV2} sheet
 * @param {Record<string, unknown>} context
 */
function injectDeploymentFeatureSections(sheet, context) {
	const feats = context.itemCategories?.features ?? [];
	let needsDeployment = false;
	let needsVenture = false;
	for ( const item of feats ) {
		const origin = classifyFeatDeploymentOrigin(item);
		if ( origin === "sw5e-deployment" ) {
			if ( !isParentDeploymentFeat(item) ) needsDeployment = true;
		}
		else if ( origin === "sw5e-venture" ) needsVenture = true;
	}
	if ( !needsDeployment && !needsVenture ) return;

	const Inventory = customElements.get(sheet.options.elements.inventory);
	if ( !Inventory?.prepareSections || !Inventory.mapColumns ) return;

	const sections = context.sections;
	if ( !Array.isArray(sections) ) return;

	context.sections = sections.filter(s => s.id !== "sw5e-deployment" && s.id !== "sw5e-venture");

	const otherIdx = context.sections.findIndex(s => s.id === "other");
	if ( otherIdx < 0 ) return;

	const columns = Inventory.mapColumns([{ id: "uses", order: 200 }, "recovery", "controls"]);

	const raw = [];
	if ( needsDeployment ) {
		raw.push({
			columns,
			id: "sw5e-deployment",
			label: localizeOrFallback("SW5E.FeatureCategory.Deployments", "Deployment Features"),
			order: 2050,
			groups: { origin: "sw5e-deployment" },
			items: []
		});
	}
	if ( needsVenture ) {
		raw.push({
			columns,
			id: "sw5e-venture",
			label: localizeOrFallback("SW5E.FeatureCategory.Ventures", "Venture Features"),
			order: 2100,
			groups: { origin: "sw5e-venture" },
			items: []
		});
	}

	const prepared = Inventory.prepareSections(raw);
	context.sections.splice(otherIdx, 0, ...prepared);
}

function registerCharacterDeploymentFeatureGroupingWrappers() {
	const lw = globalThis.libWrapper;
	if ( !lw?.register ) {
		console.warn("SW5E | Deployment/Venture Features grouping: libWrapper unavailable — wrappers not registered.");
		return;
	}
	const moduleId = getModuleId();

	try {
		lw.register(moduleId, "dnd5e.applications.actor.CharacterActorSheet.prototype._prepareItemFeature", async function(wrapped, item, ctx) {
			await wrapped.call(this, item, ctx);
			const origin = classifyFeatDeploymentOrigin(item);
			if ( !origin ) return;
			if ( origin === "sw5e-deployment" && isParentDeploymentFeat(item) ) return;
			ctx.groups ??= {};
			ctx.groups.origin = origin;
		}, "WRAPPER");
	}
	catch ( err ) {
		console.warn("SW5E | Deployment/Venture Features grouping: failed to register _prepareItemFeature wrapper", err);
	}

	try {
		lw.register(moduleId, "dnd5e.applications.actor.CharacterActorSheet.prototype._prepareFeaturesContext", async function(wrapped, context, options) {
			const result = await wrapped.call(this, context, options);
			injectDeploymentFeatureSections(this, context);
			return result;
		}, "WRAPPER");
	}
	catch ( err ) {
		console.warn("SW5E | Deployment/Venture Features grouping: failed to register _prepareFeaturesContext wrapper", err);
	}
}

/**
 * Parent Deployment feats are excluded from `itemCategories.features` (same maneuver pattern).
 */
function registerExcludeParentDeploymentFromFeatureCategories() {
	Hooks.on("sw5e.BaseActorSheet._assignItemCategories", (_this, _result, config, item) => {
		if ( !isParentDeploymentFeat(item) ) return;
		config.result = new Set();
	});
}

/**
 * Register Deployment header cards on Features tab; grouping wrappers; parent exclusion hook.
 */
export function patchCharacterDeploymentSheet() {
	registerExcludeParentDeploymentFromFeatureCategories();
	Hooks.on("renderActorSheetV2", injectCharacterDeploymentFeaturesHeader);
	registerCharacterDeploymentFeatureGroupingWrappers();
}
