/**
 * Character Deployment summary helpers (SotG-style feats on actors).
 * Reads embedded Deployment/Venture feats; optional stored rank lives on `flags.sw5e.deployment.rank`
 * on **parent** Deployment items only.
 * Does not apply advancement grants or mutate advancement definitions.
 */

/** @type {Readonly<{ min: number, max: number }>} */
export const DEPLOYMENT_RANK_BOUNDS = Object.freeze({ min: 0, max: 5 });

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
 * Parent Deployment feat (e.g. Pilot): progression container with an advancement track and/or legacy mirror.
 * Granted Deployment features (Piloting Procedure, etc.) intentionally do **not** match — they stay in Features.
 *
 * Conservative signals:
 * - `flags.sw5e.legacyDeployment`, and/or
 * - non-empty `system.advancement` array.
 *
 * @param {unknown} item
 * @returns {boolean}
 */
export function isParentDeploymentFeat(item) {
	if ( item?.type !== "feat" ) return false;
	const { value, subtype } = getFeatDeploymentType(item);
	if ( value !== "deployment" || subtype === "venture" ) return false;
	if ( item.flags?.sw5e?.legacyDeployment ) return true;
	const adv = item.system?.advancement;
	return Array.isArray(adv) && adv.length > 0;
}

/**
 * Venture feat (`deployment` + `venture` subtype).
 *
 * @param {unknown} item
 * @returns {boolean}
 */
export function isVentureFeat(item) {
	if ( item?.type !== "feat" ) return false;
	const { value, subtype } = getFeatDeploymentType(item);
	return value === "deployment" && subtype === "venture";
}

/**
 * Granted Deployment feature: deployment feat that is not a Venture and not a parent progression item.
 *
 * @param {unknown} item
 * @returns {boolean}
 */
export function isDeploymentFeatureFeat(item) {
	if ( item?.type !== "feat" ) return false;
	const { value, subtype } = getFeatDeploymentType(item);
	if ( value !== "deployment" || subtype === "venture" ) return false;
	return !isParentDeploymentFeat(item);
}

/**
 * Highest advancement tier marker defined on the parent Deployment feat (`advancement[].level`).
 * This is **not** earned rank — schema ceiling / authoring layout only.
 *
 * @param {unknown} item
 * @returns {{ maxConfiguredRank: number|null, maxConfiguredUncertain: boolean }}
 */
function getMaxConfiguredRankFromAdvancement(item) {
	const adv = item?.system?.advancement;
	if ( !Array.isArray(adv) || adv.length === 0 ) {
		return { maxConfiguredRank: null, maxConfiguredUncertain: true };
	}

	let maxLevel = null;
	for ( const entry of adv ) {
		const lv = Number(entry?.level);
		if ( Number.isFinite(lv) ) maxLevel = maxLevel === null ? lv : Math.max(maxLevel, lv);
	}

	if ( maxLevel === null ) return { maxConfiguredRank: null, maxConfiguredUncertain: true };
	return { maxConfiguredRank: maxLevel, maxConfiguredUncertain: false };
}

/**
 * @param {unknown} item
 * @returns {{ storedRank: number|null, rankFlagInvalid: boolean }}
 */
function readStoredDeploymentRank(item) {
	const raw = item?.flags?.sw5e?.deployment?.rank;
	if ( raw === undefined || raw === null || raw === "" ) return { storedRank: null, rankFlagInvalid: false };
	const n = Number(raw);
	if ( !Number.isFinite(n) || !Number.isInteger(n)
		|| n < DEPLOYMENT_RANK_BOUNDS.min || n > DEPLOYMENT_RANK_BOUNDS.max ) {
		return { storedRank: null, rankFlagInvalid: true };
	}
	return { storedRank: n, rankFlagInvalid: false };
}

/**
 * @param {number|null} storedRank
 * @returns {string}
 */
function formatDeploymentRankLabel(storedRank) {
	if ( typeof game !== "undefined" && game?.i18n ) {
		if ( storedRank !== null ) return game.i18n.format("SW5E.Deployment.Rank", { rank: storedRank });
		return game.i18n.localize("SW5E.Deployment.RankUnset");
	}
	if ( storedRank !== null ) return `Rank ${storedRank}`;
	return "Rank ?";
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
 * Scan Deployment/Venture feats for character/NPC actors.
 *
 * @param {unknown} actor
 * @returns {{
 *   actorId: string|null,
 *   actorName: string,
 *   deployments: Array<{
 *     id: string,
 *     name: string,
 *     identifier: string,
 *     legacyMirror: boolean,
 *     storedRank: number|null,
 *     rankSource: "stored"|"unset",
 *     rankUncertain: boolean,
 *     rankFlagInvalid: boolean,
 *     maxConfiguredRank: number|null,
 *     maxConfiguredUncertain: boolean,
 *     rankLabel: string,
 *     img: string
 *   }>,
 *   deploymentFeatures: Array<{ id: string, name: string, identifier: string }>,
 *   ventures: Array<{ id: string, name: string, identifier: string }>,
 *   warnings: string[],
 *   hasDeployments: boolean,
 *   hasDeploymentFeatures: boolean,
 *   hasVentures: boolean,
 *   hasAny: boolean
 * }}
 */
export function getCharacterDeploymentSummary(actor) {
	const empty = () => ({
		actorId: null,
		actorName: "",
		deployments: [],
		deploymentFeatures: [],
		ventures: [],
		warnings: [],
		hasDeployments: false,
		hasDeploymentFeatures: false,
		hasVentures: false,
		hasAny: false
	});

	if ( !actor || typeof actor !== "object" ) return empty();

	try {
		if ( actor.documentName !== "Actor" ) return empty();
		const aType = actor.type;
		if ( aType !== "character" && aType !== "npc" ) return empty();

		const deployments = [];
		const deploymentFeatures = [];
		const ventures = [];
		const warnings = [];

		for ( const item of iterateEmbeddedItems(actor) ) {
			if ( !item ) continue;

			const isFeat = item.type === "feat";
			const { value: typeValue } = getFeatDeploymentType(item);
			const legacyMirror = Boolean(item.flags?.sw5e?.legacyDeployment);

			if ( typeValue !== "deployment" ) continue;

			if ( isVentureFeat(item) ) {
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

			const parent = isParentDeploymentFeat(item);

			if ( parent ) {
				const { maxConfiguredRank, maxConfiguredUncertain } = getMaxConfiguredRankFromAdvancement(item);
				const { storedRank, rankFlagInvalid } = readStoredDeploymentRank(item);
				const rankSource = storedRank !== null ? "stored" : "unset";
				const rankUncertain = storedRank === null;

				deployments.push({
					id: item.id ?? "",
					name: item.name ?? "",
					identifier: typeof item.system?.identifier === "string" ? item.system.identifier : "",
					img: typeof item.img === "string" ? item.img : "",
					legacyMirror,
					storedRank,
					rankSource,
					rankUncertain,
					rankFlagInvalid,
					maxConfiguredRank,
					maxConfiguredUncertain,
					rankLabel: formatDeploymentRankLabel(storedRank)
				});

				if ( rankFlagInvalid ) warnings.push("SW5E.Deployment.RankInvalidWarning");
				if ( legacyMirror && rankUncertain ) {
					warnings.push(`legacyDeployment mirror on "${item.name ?? item.id}" — rank may require manual verification`);
				}
			}
			else if ( isDeploymentFeatureFeat(item) ) {
				deploymentFeatures.push({
					id: item.id ?? "",
					name: item.name ?? "",
					identifier: typeof item.system?.identifier === "string" ? item.system.identifier : ""
				});
			}
		}

		const hasDeployments = deployments.length > 0;
		const hasDeploymentFeatures = deploymentFeatures.length > 0;
		const hasVentures = ventures.length > 0;
		const hasAny = hasDeployments || hasDeploymentFeatures || hasVentures;

		if ( hasDeployments && deployments.every(d => d.rankUncertain) ) {
			warnings.push("SW5E.DeploymentSummary.WarningUnclear");
		}

		return {
			actorId: actor.id ?? null,
			actorName: actor.name ?? "",
			deployments,
			deploymentFeatures,
			ventures,
			warnings,
			hasDeployments,
			hasDeploymentFeatures,
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
