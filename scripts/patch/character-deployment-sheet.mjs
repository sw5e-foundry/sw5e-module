import {
	DEPLOYMENT_RANK_BOUNDS,
	getCharacterDeploymentSummary,
	isParentDeploymentFeat
} from "../character-deployments.mjs";
import { getModuleId, LEGACY_SETTINGS_NAMESPACE, SETTINGS_NAMESPACE } from "../module-support.mjs";
import { DEPLOYMENT_CARD_DEBUG_SETTING } from "../settings.mjs";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

/**
 * `renderActorSheetV2` may pass a partial HTML subtree; fall back to `app.element` when it omits the Features tab.
 *
 * @param {unknown} html
 * @param {object} app
 * @returns {HTMLElement|unknown}
 */
function resolveActorSheetDomRoot(html, app) {
	const hookRoot = getHtmlRoot(html);
	let root = hookRoot instanceof HTMLElement ? hookRoot : null;

	const appEl = app?.element;
	const appRoot = appEl instanceof HTMLElement ? appEl : appEl?.[0];
	const appRootOk = appRoot instanceof HTMLElement ? appRoot : null;

	if ( !(root instanceof HTMLElement) ) return appRootOk ?? hookRoot;

	const hookHasFeatures = Boolean(root.querySelector("section.tab[data-tab=\"features\"]"));
	if ( !hookHasFeatures && appRootOk ) {
		const appHasFeatures = Boolean(appRootOk.querySelector("section.tab[data-tab=\"features\"]"));
		if ( appHasFeatures ) return appRootOk;
	}
	return root;
}

function deploymentCardDebugEnabled() {
	const g = globalThis.game;
	if ( !g?.settings?.get ) return false;
	try {
		if ( g.settings.get(SETTINGS_NAMESPACE, DEPLOYMENT_CARD_DEBUG_SETTING) ) return true;
	} catch (_) {}
	try {
		if ( g.settings.get(LEGACY_SETTINGS_NAMESPACE, DEPLOYMENT_CARD_DEBUG_SETTING) ) return true;
	} catch (_) {}
	return false;
}

/**
 * @param {object} app
 */
function serializeAppSheetMode(app) {
	let appModeKey = null;
	let appModeRaw;
	try {
		const MODES = app?.constructor?.MODES;
		appModeRaw = app?._mode;
		if ( MODES && appModeRaw !== undefined ) {
			for ( const [k, v] of Object.entries(MODES) ) {
				if ( v === appModeRaw ) {
					appModeKey = k;
					break;
				}
			}
		}
	} catch (_) {}
	return { appModeKey, appModeRaw, appIsEditable: Boolean(app?.isEditable) };
}

/**
 * Whether Deployment pill **rank** should be interactive (`<select>` vs `<span>`).
 * Matches stock class pills: sheet `app.isEditable` can be true when `actor.canUserModify` is false (permission edge cases).
 * Item flag writes still enforce permissions via `setFlag` / existing error handling.
 *
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {object} app
 */
function deploymentPillInteractionWritable(actor, app) {
	if ( actor.canUserModify(game.user) ) return true;
	return Boolean(app?.isEditable);
}

/**
 * @param {HTMLElement|unknown} root
 * @param {object} app
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {HTMLElement} wrap
 * @param {boolean} sheetEdit
 * @param {boolean} actorCanUserModify
 * @param {boolean} pillInteractionWritable
 * @param {boolean} rankInteractive
 * @param {boolean} pillOpenInteractive
 */
function gatherDeploymentCardDebugPayload(root, app, actor, wrap, sheetEdit, actorCanUserModify, pillInteractionWritable, rankInteractive, pillOpenInteractive) {
	const rootOk = root instanceof HTMLElement;
	const rootTag = rootOk ? root.tagName : null;
	const rootClassSnippet = rootOk && typeof root.className === "string" ? root.className.slice(0, 160) : null;

	const featuresTab = rootOk
		? (root.matches?.("section.tab[data-tab=\"features\"]")
			? root
			: root.querySelector("section.tab[data-tab=\"features\"]"))
		: null;
	const featuresTabFound = featuresTab instanceof HTMLElement;
	const classesSection = featuresTabFound ? featuresTab.querySelector("section.classes") : null;
	const classesStripFound = classesSection instanceof HTMLElement;
	const classesClassName = classesStripFound ? classesSection.className : null;
	const classesHasEditing = classesStripFound ? classesSection.classList.contains("editing") : null;

	const domEditState = rootOk ? isFeaturesClassesStripEditing(root) : null;
	const fallbackEdit = isActorSheetEditMode(app);
	const { appModeKey, appModeRaw, appIsEditable } = serializeAppSheetMode(app);

	const pillHasOpenButton = Boolean(wrap.querySelector("button[data-sw5e-deployment-open]"));
	const pillHasRankSelect = Boolean(wrap.querySelector("select.sw5e-deployment-rank-select"));

	return {
		actorId: actor?.id,
		rootOk,
		rootTag,
		rootClassSnippet,
		featuresTabFound,
		classesStripFound,
		classesClassName,
		classesHasEditing,
		domEditState,
		fallbackEdit,
		sheetEdit,
		actorCanUserModify,
		pillInteractionWritable,
		rankInteractive,
		pillOpenInteractive,
		pillHasOpenButton,
		pillHasRankSelect,
		appModeKey,
		appModeRaw,
		appIsEditable
	};
}

/**
 * @param {Record<string, unknown>} payload
 */
function maybeLogDeploymentCardDebug(payload) {
	if ( !deploymentCardDebugEnabled() ) return;
	console.debug("SW5E | Deployment card sheet state", payload);
}

function localizeOrFallback(key, fallback) {
	const localized = game.i18n?.localize?.(key);
	return localized && localized !== key ? localized : fallback;
}

/**
 * dnd5e 5.2.x actor sheets use `constructor.MODES.PLAY` / `EDIT` and `app._mode`.
 * Mirrors augmentations-sheet.mjs (`isActorSheetEditMode`).
 *
 * @param {object} app
 */
function isActorSheetEditMode(app) {
	const MODES = app?.constructor?.MODES;
	if ( MODES && ("EDIT" in MODES) && ("PLAY" in MODES) ) return app._mode === MODES.EDIT;
	return Boolean(app?.isEditable);
}

/**
 * Tri-state alignment with dnd5e `actor-classes.hbs`: `section.classes` gains `editing` when `@root.editable`.
 *
 * @param {HTMLElement} root Render root from `renderActorSheetV2` (typically `.window-content` / sheet fragment).
 * @returns {boolean|null} `true`/`false` when `section.classes` exists in Features tab; `null` if absent / unknown layout.
 */
function isFeaturesClassesStripEditing(root) {
	if ( !(root instanceof HTMLElement) ) return null;

	const featuresTab = root.matches?.("section.tab[data-tab=\"features\"]")
		? root
		: root.querySelector("section.tab[data-tab=\"features\"]");

	if ( !(featuresTab instanceof HTMLElement) ) return null;

	const classesSection = featuresTab.querySelector("section.classes");
	if ( !(classesSection instanceof HTMLElement) ) return null;

	return classesSection.classList.contains("editing");
}

/**
 * Sheet PLAY vs EDIT for Deployment pill UX — DOM-first (`section.classes.editing`), then `app._mode` heuristic.
 * `null` from the DOM probe means unknown layout: never treat as PLAY; fall back to `isActorSheetEditMode`.
 *
 * @param {HTMLElement|null|undefined} root
 * @param {object} app
 */
function resolveSheetEditFromRenderedDOM(root, app) {
	const domEditState = root instanceof HTMLElement ? isFeaturesClassesStripEditing(root) : null;
	return domEditState === null ? isActorSheetEditMode(app) : domEditState;
}

/**
 * @param {import("@league/foundry").documents.Item} item
 * @param {number} rankValue
 */
async function persistDeploymentRankFlag(item, rankValue) {
	const scope = getModuleId();
	const deployment = foundry.utils.duplicate(item.flags?.[scope]?.deployment ?? item.flags?.sw5e?.deployment ?? {});
	deployment.rank = rankValue;
	await item.setFlag(scope, "deployment", deployment);
}

/**
 * Locate where Deployment pills mount on the Features tab.
 * dnd5e 5.2.x renders classes in `section.classes.pills-lg` (`.class.pill-lg`, Add Class pill).
 *
 * @param {HTMLElement} featuresTab
 * @returns {{ kind: "classes-section"|"legacy-flexrow"|null, el: HTMLElement|null }}
 */
function resolveDeploymentFeaturesMount(featuresTab) {
	const classesSection = featuresTab.querySelector("section.classes");
	if ( classesSection instanceof HTMLElement ) return { kind: "classes-section", el: classesSection };

	const anchor = featuresTab.querySelector(".class-summary");
	const legacyRow = anchor instanceof HTMLElement ? anchor.closest(".flexrow") : null;
	if ( legacyRow instanceof HTMLElement ) return { kind: "legacy-flexrow", el: legacyRow };

	const inventoryEl = featuresTab.querySelector("inventory-element");
	const prev = inventoryEl?.previousElementSibling;
	if ( prev instanceof HTMLElement ) {
		const looksLikeClassRow = prev.classList.contains("flexrow")
			|| Boolean(prev.querySelector(".class-summary, .create-entry, [data-action=\"createEntry\"]"));
		if ( looksLikeClassRow ) return { kind: "legacy-flexrow", el: prev };
	}

	const partClasses = featuresTab.querySelector("[data-application-part=\"classes\"]");
	if ( partClasses instanceof HTMLElement ) return { kind: "legacy-flexrow", el: partClasses };

	const fieldsetClasses = featuresTab.querySelector("fieldset.classes.card");
	if ( fieldsetClasses instanceof HTMLElement ) return { kind: "legacy-flexrow", el: fieldsetClasses };

	const inventoryHost = inventoryEl?.parentElement;
	if ( inventoryHost instanceof HTMLElement ) {
		for ( const row of inventoryHost.querySelectorAll(":scope > .flexrow") ) {
			if ( row.querySelector(".class-summary") ) return { kind: "legacy-flexrow", el: row };
		}
	}

	return { kind: null, el: null };
}

/**
 * @param {ReturnType<typeof getCharacterDeploymentSummary>["deployments"][number]} entry
 * @param {boolean} rankInteractive rank `<select>` vs readonly `<span>`
 * @param {boolean} pillOpenInteractive OBSERVER+: wrapped icon+name open `<button>` (PLAY + EDIT); false only if caller withholds
 */
function formatDeploymentClassCard(entry, rankInteractive, pillOpenInteractive) {
	const safeId = foundry.utils.escapeHTML(entry.id);
	const name = foundry.utils.escapeHTML(entry.name || entry.identifier || entry.id);
	const imgSrc = entry.img ? foundry.utils.escapeHTML(entry.img) : "";
	const imgInner = imgSrc
		? `<img class="gold-icon sw5e-deployment-icon-img" src="${imgSrc}" alt="">`
		: `<span class="sw5e-deployment-icon-placeholder" aria-hidden="true"><i class="fas fa-rocket"></i></span>`;

	const displayRank = entry.displayRank;

	let rankPart;
	if ( rankInteractive ) {
		const options = [];
		for ( let r = DEPLOYMENT_RANK_BOUNDS.min; r <= DEPLOYMENT_RANK_BOUNDS.max; r++ ) {
			const sel = displayRank === r ? " selected" : "";
			options.push(`<option value="${r}"${sel}>${r}</option>`);
		}
		const aria = foundry.utils.escapeHTML(localizeOrFallback("SW5E.Deployment.RankSelectAria", "Deployment rank"));
		rankPart = `<select class="level-selector sw5e-deployment-rank-select" data-item-id="${safeId}" aria-label="${aria}">
				${options.join("")}
			</select>`;
	}
	else rankPart = `<span>${foundry.utils.escapeHTML(String(displayRank))}</span>`;

	const openLabel = foundry.utils.escapeHTML(localizeOrFallback("SW5E.Deployment.CardOpenItem", "Open deployment item"));

	const iconsBlock = `<div class="icons">${imgInner}</div>`;
	const nameBlock = `<div class="name-stacked">
				<div class="title">${name}</div>
			</div>`;

	const rankReadonlyClass = rankInteractive ? "" : " sw5e-deployment-pill--rank-readonly";

	const headChrome = pillOpenInteractive
		? `<button type="button" class="unstyled-button sw5e-deployment-card-open" data-sw5e-deployment-open="${safeId}"
				title="${openLabel}" aria-label="${openLabel}">
				${iconsBlock}
				${nameBlock}
			</button>`
		: `${iconsBlock}${nameBlock}`;

	return `<div class="class pill-lg sw5e-deployment-pill${rankReadonlyClass}" data-item-id="${safeId}">
			${headChrome}
			<div class="level">${rankPart}</div>
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

			const n = Number(target.value);
			if ( !Number.isInteger(n) ) return;
			const next = Math.max(DEPLOYMENT_RANK_BOUNDS.min, Math.min(DEPLOYMENT_RANK_BOUNDS.max, n));

			try {
				await persistDeploymentRankFlag(item, next);
				await app.render?.(true);
			} catch ( err ) {
				console.warn("SW5E | Deployment rank update failed", err);
				ui.notifications?.error?.(localizeOrFallback(
					"SW5E.Deployment.RankUpdateFailed", "Could not update deployment rank."));
				const summary = getCharacterDeploymentSummary(actor);
				const entry = summary.deployments.find(d => d.id === itemId);
				target.value = String(entry?.displayRank ?? DEPLOYMENT_RANK_BOUNDS.min);
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
 * Mount Deployment cards on the **Features** tab: inline with class cards when possible; otherwise before inventory.
 *
 * @returns {boolean}
 */
function insertDeploymentCardsIntoFeaturesTab(root, section) {
	const featuresTab = root.querySelector("section.tab[data-tab=\"features\"]");
	if ( !featuresTab ) return false;

	const { kind, el: mount } = resolveDeploymentFeaturesMount(featuresTab);

	if ( kind === "classes-section" && mount instanceof HTMLElement ) {
		section.classList.add("sw5e-deployment-features-header--inline", "sw5e-deployment-features-header--in-classes");
		const addPill = mount.querySelector(".pill-lg.empty[data-action=\"findItem\"][data-item-type=\"class\"]")
			?? mount.querySelector("[data-action=\"findItem\"][data-item-type=\"class\"]")
			?? mount.querySelector(".pill-lg.empty.roboto-upper");
		if ( addPill?.parentNode === mount ) mount.insertBefore(section, addPill);
		else mount.appendChild(section);
		return true;
	}

	if ( kind === "legacy-flexrow" && mount instanceof HTMLElement ) {
		section.classList.add("sw5e-deployment-features-header--inline");
		section.classList.remove("sw5e-deployment-features-header--in-classes");
		const createEntry = mount.querySelector(".create-entry")
			?? mount.querySelector("[data-action=\"createEntry\"]");
		if ( createEntry?.parentNode === mount ) mount.insertBefore(section, createEntry);
		else mount.appendChild(section);
		return true;
	}

	section.classList.remove("sw5e-deployment-features-header--inline", "sw5e-deployment-features-header--in-classes");

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
 * @param {HTMLElement} root
 */
function buildDeploymentFeaturesHeader(actor, summary, app, root) {
	const sheetEdit = resolveSheetEditFromRenderedDOM(root, app);
	const actorCanUserModify = actor.canUserModify(game.user);
	const pillInteractionWritable = deploymentPillInteractionWritable(actor, app);
	const rankInteractive = sheetEdit && pillInteractionWritable;
	const pillOpenInteractive = actor.testUserPermission(game.user, "OBSERVER", { exact: false });

	const wrap = document.createElement("div");
	wrap.className = "sw5e-deployment-features-header";
	wrap.setAttribute("role", "region");
	wrap.setAttribute("aria-label", localizeOrFallback("SW5E.DeploymentSummary.Title", "Deployments"));

	const cardsHtml = summary.deployments.map(d =>
		formatDeploymentClassCard(d, rankInteractive, pillOpenInteractive)).join("");

	wrap.innerHTML = `
		<div class="sw5e-features-deployment-cards">${cardsHtml}</div>
	`;

	bindDeploymentRankControls(wrap, actor, app);
	bindDeploymentCardOpenHandlers(wrap, actor);

	maybeLogDeploymentCardDebug(gatherDeploymentCardDebugPayload(
		root, app, actor, wrap, sheetEdit, actorCanUserModify, pillInteractionWritable, rankInteractive, pillOpenInteractive));

	return wrap;
}

function injectCharacterDeploymentFeaturesHeader(app, html) {
	try {
		const actor = app.actor ?? app.document;
		if ( !actor || (actor.type !== "character" && actor.type !== "npc") ) return;

		const root = resolveActorSheetDomRoot(html, app);
		if ( !(root instanceof HTMLElement) ) return;

		root.querySelectorAll(".sw5e-deployment-features-header").forEach(el => el.remove());

		const canSee = actor.testUserPermission(game.user, "OBSERVER", { exact: false });
		if ( !canSee ) return;

		const summary = getCharacterDeploymentSummary(actor);
		if ( !summary.hasDeployments ) return;

		const section = buildDeploymentFeaturesHeader(actor, summary, app, root);
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
