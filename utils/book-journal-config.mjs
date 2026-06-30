/**
 * Per-book source layout and page-splitting rules for StarWars5e.Parser text sources.
 *
 * Page split patterns are tested in order; the first matching pattern on a line
 * starts a new journal page. Titles are derived from the heading text on that line.
 */
export const DEFAULT_SOURCE_SUBPATH = "StarWars5e.Parser/Sources/en";

export const BOOKS = {
	phb: {
		key: "phb",
		journalName: "SW5e Player's Handbook",
		packName: "phb-journals",
		packLabel: "Player's Handbook",
		outputFile: "sw5e-players-handbook.yml",
		files: [
			{ path: "PHB/phb_00.txt" },
			{ path: "PHB/phb_01.txt" },
			{ path: "PHB/phb_02.txt" },
			{ path: "PHB/phb_03.txt" },
			{ path: "PHB/phb_04.txt" },
			{ path: "PHB/phb_05.txt" },
			{ path: "PHB/phb_06.txt" },
			{ path: "PHB/phb_07.txt" },
			{ path: "PHB/phb_08.txt" },
			{ path: "PHB/phb_09.txt" },
			{ path: "PHB/phb_10.txt" },
			{ path: "PHB/phb_11.txt" },
			{ path: "PHB/phb_12.txt" },
			{ path: "PHB/phb_13.txt" },
			{ path: "PHB/phb_aa.txt" },
			{ path: "PHB/phb_ab.txt" }
		],
		pageSplits: [/^# /]
	},
	ec: {
		key: "ec",
		journalName: "SW5e Expanded Content",
		packName: "expanded-content-journals",
		packLabel: "Expanded Content",
		outputFile: "sw5e-expanded-content.yml",
		files: [
			{ path: "ec_02.txt", pageSplits: [/^# /, /^> ## /] },
			{ path: "ec_03.txt", pageSplits: [/^# /, /^## /] },
			{ path: "ec_04.txt", pageSplits: [/^# /, /^## /] },
			{ path: "ec_05.txt", pageSplits: [/^# /, /^## /] },
			{ path: "ec_06.txt", pageSplits: [/^# /, /^## /] },
			{ path: "ec_11.txt", pageSplits: [/^# /, /^#### /] },
			{ path: "ec_12.txt", pageSplits: [/^# /, /^#### /] },
			{ path: "ec_13.txt", pageSplits: [/^# /, /^#### /] },
			{ path: "ec_enhanced_items.txt", pageSplits: [/^# /, /^## /] },
			{ path: "ec_variantrules.txt", pageSplits: [/^# /, /^## /, /^### /] }
		]
	},
	wh: {
		key: "wh",
		journalName: "SW5e Wretched Hives",
		packName: "wretched-hives-journals",
		packLabel: "Wretched Hives",
		outputFile: "sw5e-wretched-hives.yml",
		files: [
			{ path: "WH/wh_00.txt" },
			{ path: "WH/wh_01.txt" },
			{ path: "WH/wh_02.txt" },
			{ path: "WH/wh_03.txt" },
			{ path: "WH/wh_04.txt" },
			{ path: "WH/wh_05.txt" },
			{ path: "WH/wh_06.txt" },
			{ path: "WH/wh_07.txt" },
			{ path: "WH/wh_08.txt" },
			{ path: "WH/wh_aa.txt" }
		],
		pageSplits: [/^# /]
	}
};

export function getBookKeys() {
	return Object.keys(BOOKS);
}

export function getBookConfig(bookKey) {
	const config = BOOKS[bookKey];
	if ( !config ) throw new Error(`Unknown book key: ${bookKey}`);
	return config;
}
