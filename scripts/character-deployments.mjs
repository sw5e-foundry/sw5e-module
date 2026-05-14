/**
 * Read-only Character Deployment summary helpers (SotG-style feats on actors).
 * Does not mutate actors or items.
 */

/**
 * @param {unknown} item
 * @returns {{ value: string, subtype: string }}
 */
function getFeatDeploymentType(item) {
	const sys = item?.system;
	const typeBlock = sys?.type;
	const value = typeof typeBlock?.value === "string" ? typeBlock.value : "";
	const subtype = typeof typeBlock?.subtype === "string" ? typeBlock.subtype : "";
	return { value: value, subtype: subtype };
}

/**
 * Infer an approximate deployment rank from Advancement level markers on the parent Deployment feat.
 * This is display-only heuristics — prestige / multispec may disagree with Advancement clicks.
 *
 * @param {unknown} item
 * @returns {{ rank: number|null, uncertain: boolean }}
 */
function inferDeploymentRankFromAdvancement(item) {
	const adv = item?.system?.advancement;
	if ( !Array.isArray(adv) || adv.length === 0 ) return { rank: null, uncertain: true };

	let maxLevel = null;
	for ( const entry of adv ) {
		const lv = Number(entry?.level);
		if ( Number.isFinite(lv) ) maxLevel = maxLevel === null ? lv : Math.max(maxLevel, lv);
	}

	if ( maxLevel === null ) return { rank: null, uncertain: true };
	return { rank: maxLevel, uncertain: false };
}

/**
 * @param {import("@league/foundry").documents.Actor} actor
 * @returns {Iterable<import("@league/foundry").documents.Item>}
 */
function* iterateEmbeddedItems(actor) {
	const items = actor?.items;
	if ( !items ) return;
	for ( const item of items ) yield item;
}

/**
 * Read-only scan of Deployment/Venture feats for character/NPC actors.
 *
 * @param {unknown} actor
 * @returns {{
 *   actorId: string|null,
 *   actorName: string,
 *   deployments: Array<{ id: string, name: string, identifier: string, inferredRank: number|null, rankUncertain: boolean, legacyMirror: boolean }>,
 *   ventures: Array<{ id: string, name: string, identifier: string }>,
 *   warnings: string[],
 *   hasDeployments: boolean,
 *   hasVentures: boolean,
 *   hasAny: boolean
 * }}
 */
export function getCharacterDeploymentSummary(actor) {
	const empty = () => ({
		actorId: null,
		actorName: "",
		deployments: [],
		ventures: [],
		warnings: [],
		hasDeployments: false,
		hasVentures: false,
		hasAny: false
	});

	if ( !actor || typeof actor !== "object" ) return empty();

	try {
		if ( actor.documentName !== "Actor" ) return empty();
		const aType = actor.type;
		if ( aType !== "character" && aType !== "npc" ) return empty();

		const deployments = [];
		const ventures = [];
		const warnings = [];

		for ( const item of iterateEmbeddedItems(actor) ) {
			if ( !item ) continue;

			const isFeat = item.type === "feat";
			const { value: typeValue, subtype } = getFeatDeploymentType(item);
			const legacyMirror = Boolean(item.flags?.sw5e?.legacyDeployment);

			if ( typeValue !== "deployment" ) continue;

			if ( subtype === "venture" ) {
				if ( isFeat ) {
					ventures.push({
						id: item.id ?? "",
						name: item.name ?? "",
						identifier: typeof item.system?.identifier === "string" ? item.system.identifier : ""
					});
				}
				continue;
			}

			if ( !isFeat ) continue;

			const { rank, uncertain } = inferDeploymentRankFromAdvancement(item);
			deployments.push({
				id: item.id ?? "",
				name: item.name ?? "",
				identifier: typeof item.system?.identifier === "string" ? item.system.identifier : "",
				inferredRank: rank,
				rankUncertain: uncertain,
				legacyMirror
			});

			if ( legacyMirror && uncertain ) {
				warnings.push(`legacyDeployment mirror on "${item.name ?? item.id}" — rank may require manual verification`);
			}
		}

		const hasDeployments = deployments.length > 0;
		const hasVentures = ventures.length > 0;
		const hasAny = hasDeployments || hasVentures;

		if ( hasDeployments && deployments.every(d => d.rankUncertain) ) {
			warnings.push("SW5E.DeploymentSummary.WarningUnclear");
		}

		return {
			actorId: actor.id ?? null,
			actorName: actor.name ?? "",
			deployments,
			ventures,
			warnings,
			hasDeployments,
			hasVentures,
			hasAny
		};
	} catch ( err ) {
		console.warn("SW5E | getCharacterDeploymentSummary failed", err);
		const out = empty();
		out.warnings.push("SW5E.DeploymentSummary.WarningFailed");
		return out;
	}
}
