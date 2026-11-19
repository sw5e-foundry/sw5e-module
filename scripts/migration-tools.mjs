import { getModule, getModulePath, getModuleSettingValue } from "./module-support.mjs";
import { analyzeLegacyItemPacks } from "./legacy-pack-preflight.mjs";
import { getActiveMigrationRun, getLastMigrationRun, migrateWorld, needsMigration } from "./migration.mjs";

/** GM-only settings menu for inspecting and rerunning the same migration path used on startup. */
export class MigrationTools extends FormApplication {
	static get defaultOptions() {
		return foundry.utils.mergeObject(super.defaultOptions, {
			id: "sw5e-migration-tools",
			title: "SW5E Migration Tools",
			template: getModulePath("templates/migration-tools.hbs"),
			width: 550,
			closeOnSubmit: false
		});
	}

	getData() {
		return {
			moduleVersion: getModule()?.version ?? "unknown",
			worldVersion: getModuleSettingValue("moduleMigrationVersion", "") || "never",
			requiredVersion: getModule()?.flags?.needsMigrationVersion ?? "unknown",
			needsMigration: needsMigration(),
			busy: Boolean(getActiveMigrationRun()),
			lastState: getLastMigrationRun()?.summary?.completionState ?? "none",
			report: this.report ?? "Select Analyze World to count legacy Item types in world packs."
		};
	}

	activateListeners(html) {
		super.activateListeners(html);
		html.find("[data-action=analyze]").on("click", () => this._run(false));
		html.find("[data-action=migrate]").on("click", () => this._run(true));
	}

	async _run(migrate) {
		if ( !game.user.isGM || getActiveMigrationRun() ) return;
		if ( migrate ) {
			const confirmed = await foundry.applications.api.DialogV2.wait({
				window: { title: "Run SW5E world migration" },
				content: "<p>This updates world documents and world Compendium packs. Create a Foundry backup first.</p>" +
					"<label><input type='checkbox' name='backup'> I have created a backup</label>",
				buttons: [
					{ action: "run", label: "Repair and migrate", default: true,
						callback: (_event, button) => Boolean(button.form?.elements?.backup?.checked) },
					{ action: "cancel", label: "Cancel", callback: () => false }
				]
			});
			if ( !confirmed ) return;
		}
		try {
			const results = await analyzeLegacyItemPacks();
			const count = results.reduce((total, row) => total + row.entries.length, 0);
			this.report = count
				? results.map(row => `${row.packId}: ${row.entries.length} legacy Items`).join("\n")
				: "No recognized legacy Item types found in world Compendium packs.";
			if ( migrate ) {
				await migrateWorld();
				this.report += `\nMigration status: ${getLastMigrationRun()?.summary?.completionState ?? "unknown"}.`;
			}
		} catch (err) {
			console.error("SW5E MODULE | Migration tools failed", err);
			this.report = `Blocked: ${err.message}`;
		} finally {
			this.render(false);
		}
	}

	async _updateObject() {}
}
