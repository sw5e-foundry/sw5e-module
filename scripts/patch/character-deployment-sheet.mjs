import { getCharacterDeploymentSummary } from "../character-deployments.mjs";

function getHtmlRoot(html) {
	return html instanceof HTMLElement ? html : html?.[0] ?? html;
}

function localizeOrFallback(key, fallback) {
	const localized = game.i18n?.localize?.(key);
	return localized && localized !== key ? localized : fallback;
}

function formatRankLine(summaryEntry) {
	if ( summaryEntry.rankUncertain || summaryEntry.inferredRank === null ) {
		return localizeOrFallback("SW5E.DeploymentSummary.RankUnknown", "Rank unclear");
	}
	return game.i18n.format("SW5E.DeploymentSummary.Rank", { rank: summaryEntry.inferredRank });
}

/**
 * Character details tab: `.right` column — mirror augmentations-sheet anchor points.
 * NPC: `.sidebar` — mirror augmentations-sheet anchor points.
 *
 * @returns {boolean} Whether insertion succeeded.
 */
function insertDeploymentSummaryIntoSheetBody(root, actor, section) {
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

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @param {ReturnType<typeof getCharacterDeploymentSummary>} summary
 */
function buildDeploymentSummarySection(actor, summary) {
	const wrap = document.createElement("div");
	wrap.className = "sw5e-deployment-summary";
	wrap.setAttribute("role", "region");
	wrap.setAttribute("aria-label", localizeOrFallback("SW5E.DeploymentSummary.Title", "Deployments"));

	const deploymentsHtml = summary.deployments.map(d => {
		const name = foundry.utils.escapeHTML(d.name || d.identifier || d.id);
		const rankText = foundry.utils.escapeHTML(formatRankLine(d));
		const legacy = d.legacyMirror
			? ` <span class="subdued">(${foundry.utils.escapeHTML(localizeOrFallback("SW5E.DeploymentSummary.LegacyMirror", "legacy snapshot"))})</span>`
			: "";
		return `<div class="sw5e-deployment-summary-line sw5e-deployment-summary-line--multi">
			<span class="sw5e-deployment-summary-multi-label">${name}</span>
			<span>${rankText}</span>${legacy}
		</div>`;
	}).join("");

	const venturesLabel = localizeOrFallback("SW5E.DeploymentSummary.VenturesLabel", "Ventures");
	const venturesText = summary.ventures.length
		? summary.ventures.map(v => foundry.utils.escapeHTML(v.name || v.identifier || v.id)).join(", ")
		: "";

	const warningsText = summary.warnings.length
		? `<div class="subdued">${summary.warnings.map(w => {
			const msg = w.startsWith("SW5E.") ? localizeOrFallback(w, w) : w;
			return foundry.utils.escapeHTML(msg);
		}).join(" ")}</div>`
		: "";

	const venturesBlock = summary.hasVentures
		? `<div class="sw5e-deployment-summary-ventures subdued">${foundry.utils.escapeHTML(venturesLabel)}: ${venturesText}</div>`
		: "";

	wrap.innerHTML = `
		<div class="sw5e-deployment-summary-inner">
			<i class="fas fa-rocket" inert aria-hidden="true"></i>
			<div class="sw5e-deployment-summary-main">
				<span class="sw5e-deployment-summary-kicker roboto-upper">${foundry.utils.escapeHTML(localizeOrFallback("SW5E.DeploymentSummary.Kicker", "Read-only summary"))}</span>
				<div class="sw5e-deployment-summary-body">
					${deploymentsHtml}
					${venturesBlock}
					${warningsText}
				</div>
			</div>
		</div>
	`;

	return wrap;
}

function injectCharacterDeploymentSummary(app, html) {
	try {
		const actor = app.actor ?? app.document;
		if ( !actor || (actor.type !== "character" && actor.type !== "npc") ) return;

		const root = getHtmlRoot(html);
		if ( !root ) return;

		root.querySelectorAll(".sw5e-deployment-summary").forEach(el => el.remove());

		const canSee = actor.testUserPermission(game.user, "OBSERVER", { exact: false });
		if ( !canSee ) return;

		const summary = getCharacterDeploymentSummary(actor);
		if ( !summary.hasAny ) return;

		const section = buildDeploymentSummarySection(actor, summary);
		insertDeploymentSummaryIntoSheetBody(root, actor, section);
	} catch ( err ) {
		console.warn("SW5E | Deployment summary sheet injection failed", err);
	}
}

/**
 * Register read-only Deployment summary rendering on dnd5e actor sheets (V2).
 */
export function patchCharacterDeploymentSheet() {
	Hooks.on("renderActorSheetV2", injectCharacterDeploymentSummary);
}
