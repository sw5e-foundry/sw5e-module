import { getModule, getModulePath, getModuleSettingValue } from "./module-support.mjs";
import { analyzeLegacyItemPacks, formatLegacyPackReport } from "./legacy-pack-preflight.mjs";
import { getActiveMigrationRun, getLastMigrationRun, migrateWorld, needsMigration } from "./migration.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** GM-only settings menu for inspecting and rerunning the world migration path. */
export class MigrationTools extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "sw5e-migration-tools",
		tag: "form",
		classes: ["sw5e-migration-tools"],
		window: {
			title: "SW5E Migration Tools",
			resizable: true
		},
		position: {
			width: 550
		}
	};

	static PARTS = {
		body: {
			template: getModulePath("templates/migration-tools.hbs")
		}
	};

	async _prepareContext() {
		return {
			moduleVersion: getModule()?.version ?? "unknown",
			worldVersion: getModuleSettingValue("moduleMigrationVersion", "") || "never",
			requiredVersion: getModule()?.flags?.needsMigrationVersion ?? "unknown",
			needsMigration: needsMigration(),
			busy: Boolean(getActiveMigrationRun()),
			lastState: getLastMigrationRun()?.summary?.completionState ?? "none",
			report: this.report ?? "Select Analyze World to inspect legacy Item types in world packs."
		};
	}

	async _onRender() {
		const root = this.element;
		root.querySelector("[data-action=analyze]")?.addEventListener("click", event => {
			event.preventDefault();
			this._run(false);
		});
		root.querySelector("[data-action=migrate]")?.addEventListener("click", event => {
			event.preventDefault();
			this._run(true);
		});
	}

	async _run(migrate) {
		if ( !game.user?.isGM || getActiveMigrationRun() ) return;
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
			this.report = formatLegacyPackReport(results);
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
}
