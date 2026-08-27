/**
 * Bounded wait for dnd5e world migration completion before SW5e writes.
 * Uses the persisted dnd5e systemMigrationVersion setting as the observable signal.
 */

const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * @returns {{ currentVersion: string, worldFlagVersion: string|null, targetVersion: string, needsMigrationVersion: string, compatibleMigrationVersion: string }}
 */
export function readDnd5eMigrationSettings() {
	const targetVersion = game.system?.version ?? "";
	const flags = game.system?.flags ?? {};
	return {
		currentVersion: game.settings.get("dnd5e", "systemMigrationVersion") ?? "",
		worldFlagVersion: game.world?.flags?.dnd5e?.version ?? null,
		targetVersion,
		needsMigrationVersion: flags.needsMigrationVersion ?? targetVersion,
		compatibleMigrationVersion: flags.compatibleMigrationVersion ?? "0"
	};
}

/**
 * Mirror dnd5e 5.3.3 ready-hook migration-required predicate.
 * @returns {{ required: boolean, reason: string, settings: ReturnType<typeof readDnd5eMigrationSettings>, totalDocuments: number }}
 */
export function evaluateDnd5eMigrationRequirement() {
	if ( !game.user?.isGM ) {
		return {
			required: false,
			reason: "not-gm",
			settings: readDnd5eMigrationSettings(),
			totalDocuments: 0
		};
	}
	const settings = readDnd5eMigrationSettings();
	const cv = settings.currentVersion || settings.worldFlagVersion || "";
	const totalDocuments = (game.actors?.size ?? 0) + (game.scenes?.size ?? 0) + (game.items?.size ?? 0);
	if ( !cv && totalDocuments === 0 ) {
		return { required: false, reason: "empty-world-stamp-only", settings, totalDocuments };
	}
	if ( cv && !foundry.utils.isNewerVersion(settings.needsMigrationVersion, cv) ) {
		return { required: false, reason: "already-current", settings, totalDocuments };
	}
	return { required: true, reason: "migration-required", settings, totalDocuments };
}

/**
 * @param {string} currentVersion
 * @param {string} targetVersion
 * @returns {boolean}
 */
export function isDnd5eMigrationComplete(currentVersion, targetVersion) {
	if ( !targetVersion ) return Boolean(currentVersion);
	if ( !currentVersion ) return false;
	return !foundry.utils.isNewerVersion(targetVersion, currentVersion);
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait until dnd5e migration completion is observable or timeout.
 * @param {object} [options]
 * @param {number} [options.pollIntervalMs]
 * @param {number} [options.timeoutMs]
 * @param {(point: string, state: object) => void} [options.onPoll]
 * @returns {Promise<object>}
 */
export async function waitForDnd5eMigrationCompletion(options={}) {
	const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const requirement = evaluateDnd5eMigrationRequirement();
	const startedAt = Date.now();
	const result = {
		required: requirement.required,
		reason: requirement.reason,
		targetVersion: requirement.settings.targetVersion,
		initialVersion: requirement.settings.currentVersion,
		finalVersion: requirement.settings.currentVersion,
		checks: 0,
		elapsedMs: 0,
		passed: false,
		timedOut: false,
		totalDocuments: requirement.totalDocuments
	};

	if ( !requirement.required ) {
		result.passed = true;
		result.elapsedMs = 0;
		options.onPoll?.("not-required", result);
		return result;
	}

	while ( true ) {
		result.checks += 1;
		const settings = readDnd5eMigrationSettings();
		result.finalVersion = settings.currentVersion;
		result.elapsedMs = Date.now() - startedAt;
		options.onPoll?.("poll", { ...result, settings });

		if ( isDnd5eMigrationComplete(settings.currentVersion, settings.targetVersion) ) {
			result.passed = true;
			return result;
		}

		if ( result.elapsedMs >= timeoutMs ) {
			result.timedOut = true;
			result.passed = false;
			return result;
		}

		await sleep(pollIntervalMs);
	}
}
