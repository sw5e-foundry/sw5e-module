#!/usr/bin/env node
/**
 * One-shot: add Role movement OVERRIDE AEs + sync attributes.speed; fix Courier.
 * Preserves surrounding YAML formatting where possible.
 *
 * Not invoked by build:db. Importing this module does not write pack source.
 * Explicit CLI execution still writes the 36 size Role YAML files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FEATURES = path.join(ROOT, "packs/_source/starships/starship-features");

export const ROLE_MOVEMENT_AE_SPACE_KEY = "system.attributes.movement.speeds.space";
export const ROLE_MOVEMENT_AE_TURN_KEY = "system.attributes.movement.speeds.turn";
export const ROLE_MOVEMENT_AE_OBSOLETE_SPACE_KEY = "system.attributes.movement.space";
export const ROLE_MOVEMENT_AE_OBSOLETE_TURN_KEY = "system.attributes.movement.turn";
export const ROLE_MOVEMENT_AE_MODE = 5;
export const ROLE_MOVEMENT_AE_PRIORITY = 20;

export const ROLE_MOVEMENT_MATRIX = {
	tiny: {
		"role-droid.yml": [450, 200],
		"role-munition.yml": [450, 200],
		"role-predator.yml": [350, 100],
		"role-probe.yml": [400, 150],
		"role-satellite.yml": [400, 150],
		"role-worker.yml": [350, 100]
	},
	small: {
		"role-attack-fighter.yml": [350, 100],
		"role-bomber.yml": [450, 200],
		"role-scout.yml": [450, 200],
		"role-scrambler.yml": [400, 150],
		"role-shuttle.yml": [350, 100],
		"role-superiority-fighter.yml": [400, 150]
	},
	medium: {
		"role-courier.yml": [400, 250],
		"role-freighter.yml": [300, 150],
		"role-gunship.yml": [300, 150],
		"role-missile-boat.yml": [400, 250],
		"role-navigator.yml": [350, 200],
		"role-yacht.yml": [350, 200]
	},
	large: {
		"role-ambassador.yml": [350, 250],
		"role-corvette.yml": [400, 300],
		"role-cruiser.yml": [400, 300],
		"role-explorer.yml": [350, 250],
		"role-picket-ship.yml": [300, 200],
		"role-ships-tender.yml": [300, 200]
	},
	huge: {
		"role-battleship.yml": [200, 400],
		"role-carrier.yml": [300, 500],
		"role-colonizer.yml": [400, 600],
		"role-command-ship.yml": [300, 500],
		"role-interdictor.yml": [200, 400],
		"role-juggernaut.yml": [400, 600]
	},
	gargantuan: {
		"role-blockade-ship.yml": [100, 400],
		"role-flagship.yml": [200, 500],
		"role-industrial-center.yml": [300, 600],
		"role-mobile-metropolis.yml": [300, 600],
		"role-researcher.yml": [100, 400],
		"role-warship.yml": [200, 500]
	}
};

export function buildRoleMovementChanges(space, turn) {
	return [
		{
			key: ROLE_MOVEMENT_AE_SPACE_KEY,
			mode: ROLE_MOVEMENT_AE_MODE,
			value: String(space),
			priority: ROLE_MOVEMENT_AE_PRIORITY
		},
		{
			key: ROLE_MOVEMENT_AE_TURN_KEY,
			mode: ROLE_MOVEMENT_AE_MODE,
			value: String(turn),
			priority: ROLE_MOVEMENT_AE_PRIORITY
		}
	];
}

export function renderRoleMovementChangeBlock(space, turn) {
	return `      - key: ${ROLE_MOVEMENT_AE_SPACE_KEY}
        mode: ${ROLE_MOVEMENT_AE_MODE}
        value: '${space}'
        priority: ${ROLE_MOVEMENT_AE_PRIORITY}
      - key: ${ROLE_MOVEMENT_AE_TURN_KEY}
        mode: ${ROLE_MOVEMENT_AE_MODE}
        value: '${turn}'
        priority: ${ROLE_MOVEMENT_AE_PRIORITY}
`;
}

export function stripExistingMovementChanges(changesBlock) {
	// Remove prior movement space/turn/turning change entries, including speeds.* paths.
	// Use ^ with /m so consecutive movement keys are all removed; a leading-\n match
	// would consume the newline the next key needs.
	return changesBlock.replace(
		/^      - key: (?:system\.)?attributes\.movement\.(?:speeds\.)?(?:space|turn|turning)\n(?:        .*\n)*/gm,
		""
	);
}

export function applyRoleMovementChangeYaml(changesBlock, space, turn) {
	let body = stripExistingMovementChanges(changesBlock);
	if ( !body.endsWith("\n") ) body += "\n";
	body += renderRoleMovementChangeBlock(space, turn);
	return body;
}

function applyFile(full, space, turn) {
	let text = fs.readFileSync(full, "utf8");

	// Sync attributes.speed
	if ( /attributes:\s*\n\s*speed:\s*\n\s*space:\s*\d+\s*\n\s*turn:\s*\d+/.test(text) ) {
		text = text.replace(
			/(attributes:\s*\n\s*speed:\s*\n\s*)space:\s*\d+(\s*\n\s*)turn:\s*\d+/,
			`$1space: ${space}$2turn: ${turn}`
		);
	} else {
		throw new Error(`Could not find attributes.speed block in ${full}`);
	}

	const changesMatch = text.match(/(\n    changes:\n)([\s\S]*?)(\n    disabled:)/);
	if ( !changesMatch ) throw new Error(`Could not find effects changes in ${full}`);

	const body = applyRoleMovementChangeYaml(changesMatch[2], space, turn);

	text = text.slice(0, changesMatch.index)
		+ changesMatch[1]
		+ body
		+ changesMatch[3]
		+ text.slice(changesMatch.index + changesMatch[0].length);

	fs.writeFileSync(full, text, "utf8");
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if ( isDirectRun ) {
	let updated = 0;
	for ( const [size, files] of Object.entries(ROLE_MOVEMENT_MATRIX) ) {
		for ( const [file, [space, turn]] of Object.entries(files) ) {
			const full = path.join(FEATURES, size, file);
			applyFile(full, space, turn);
			updated += 1;
			console.log(`updated ${size}/${file} → ${space}/${turn}`);
		}
	}
	console.log(`\n${updated} Role records updated`);
}
