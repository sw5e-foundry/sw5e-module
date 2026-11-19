/**
 * Remove duplicated Drake's Shipyard actor-level transferred effects.
 *
 * The manifest is derived from the current source. Deletion keys are
 * normalized filepath + actor id + actor-level effect id.
 *
 * Two repository states are valid:
 * - pre-repair: 927 mutually exclusive candidates, and the four Makeshift
 *   penalties exist only on the actor-level effects
 * - post-repair: zero candidates, those penalties exist once on the retained
 *   item effects, both orphan effect ids are absent, and the CR90 exclusion remains
 *
 * Any partial or mixed state exits 1 and writes nothing.
 *
 * Usage: node ./utils/fix-drakes-duplicated-actor-effects.mjs [--dry-run]
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRAKES = path.join(ROOT, "packs", "_source", "drakes-shipyard");
const SOURCE_PREFIX = "packs/_source/drakes-shipyard";

const EXPECTED_PRE = {
	"same-actor-nonempty": 852,
	"clone-source-nonempty": 37,
	"makeshift": 4,
	"orphan": 2,
	"inert-lightweight": 32
};
const EXPECTED_TOTAL = 927;
const EXPECTED_INERT_SAME = 31;
const EXPECTED_INERT_CLONE = 1;

const REMOVED_ROLE_SPEC_IDS = [
	"BQ1QP4pDtSswfpEk",
	"vrbxUmzq0uXtKnJ4",
	"3LpnhMKSnfj2kweZ",
	"cYTnq6omxIAHtLjz",
	"CuY0bUBgTMQ5QG5t",
	"gW3SJJLUPgQdHGuX",
	"zkaANU1XMiQGdlf0",
	"iaFkhGXZPYZSPcJ9",
	"PDWg1DWCwL0eiu32",
	"chOWaILOZPSmcELU"
];

const CR90 = {
	file: "cr90-corvette.yml",
	actorId: "0S6RxfRRNiswQrya",
	effectId: "ZtUQ6YtH6HkdJH60",
	name: "Role: Corvette"
};

const ABILITY_NAMES = {
	"system.abilities.str.value": "Strength",
	"system.abilities.dex.value": "Dexterity",
	"system.abilities.con.value": "Constitution",
	"system.abilities.int.value": "Intelligence",
	"system.abilities.wis.value": "Wisdom",
	"system.abilities.cha.value": "Charisma"
};

const MAKESHIFT = [
	{
		file: "c-wing-corellian-b-wing.yml",
		actorId: "NYWhs7E7dXECVXNq",
		effectId: "kzNbnLvrITWzBEAX",
		itemId: "1sOlirh6b3nvK7fJ",
		itemEffectId: "MFmEao36oVlzKQAf",
		bonus: { key: "system.abilities.con.value", mode: 2, value: "1" },
		penalty: { key: "system.abilities.dex.value", mode: 2, value: "-1" }
	},
	{
		file: "chirdaki-deathseed.yml",
		actorId: "OMMoXTxtFhVheNdP",
		effectId: "qKuKsRwjZGK9Ajhq",
		itemId: "Q7TJBeN1RZBQXv4j",
		itemEffectId: "pGr8kuryyuo2srt5",
		bonus: { key: "system.abilities.dex.value", mode: 2, value: "1" },
		penalty: { key: "system.abilities.str.value", mode: 2, value: "-1" }
	},
	{
		file: "dp20-frigate.yml",
		actorId: "NRhEjklvSBU3e1e2",
		effectId: "UhAwYYHcnBSa8R1x",
		itemId: "6GVg7Ryiu8tPdaWZ",
		itemEffectId: "QqpA53Psrw6O9vhK",
		bonus: { key: "system.abilities.int.value", mode: 2, value: "+1" },
		penalty: { key: "system.abilities.cha.value", mode: 2, value: "-1" }
	},
	{
		file: "dp20-frigate.yml",
		actorId: "NRhEjklvSBU3e1e2",
		effectId: "N6V0RhFAJSDlDQNM",
		itemId: "fJEpINHyoeArIR37",
		itemEffectId: "bxIgXxH8k3VKqoI0",
		bonus: { key: "system.abilities.wis.value", mode: 2, value: "1" },
		penalty: { key: "system.abilities.cha.value", mode: 2, value: "-1" }
	}
];

const ORPHANS = [
	{
		file: "baudo-class-star-yacht-modified.yml",
		actorId: "IbM8uXHEpvvdf0TN",
		effectId: "T95ZrMngkvi4muNq",
		name: "Quick-Charge Shield",
		origin: "Actor.e5uv8tcM0cFQLI7R.Item.824XlJbDjltEP5Se",
		originItemId: "824XlJbDjltEP5Se"
	},
	{
		file: "deepwater-class-light-freighter-legendary.yml",
		actorId: "NdFAYbYXP78V2jqD",
		effectId: "uAzLDWw1Or6D04g6",
		name: "Directional Shield",
		origin: "Actor.8X549fFDsnYcpJY7.Item.NvW7TgtOqtqJKqw3",
		originItemId: "NvW7TgtOqtqJKqw3"
	}
];

const CHANGE_FIELDS = new Set(["key", "mode", "value", "priority"]);
const EXPECTED_KEYS = [
	"packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml|Y0Vf2Yi6pPQjliD1|KHbB1Lq5FvNUQS06",
	"packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml|Y0Vf2Yi6pPQjliD1|DXMOAEt1O44cRTZj",
	"packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml|Y0Vf2Yi6pPQjliD1|1dtPbBoz5jEDahhx",
	"packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml|Y0Vf2Yi6pPQjliD1|jod8TVQds3efPlD7",
	"packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml|Y0Vf2Yi6pPQjliD1|9hTss8Gebtw4efXl",
	"packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml|Y0Vf2Yi6pPQjliD1|NPCSVwjrOCuIso9Z",
	"packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml|Y0Vf2Yi6pPQjliD1|EarwKjaheHhgJYOV",
	"packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml|Y0Vf2Yi6pPQjliD1|A5Apmzo3dHYKQT0d",
	"packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml|Y0Vf2Yi6pPQjliD1|lYWYt168VQonUuqi",
	"packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml|Y0Vf2Yi6pPQjliD1|gpQzqF76z8joKNet",
	"packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml|Y0Vf2Yi6pPQjliD1|DMWelMFm4wDbSQ30",
	"packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml|Y0Vf2Yi6pPQjliD1|2oXOnO3i1q0ov493",
	"packs/_source/drakes-shipyard/a-sf-01-b-wing-starfighter.yml|Y0Vf2Yi6pPQjliD1|iiEGWFRpNsgly9by",
	"packs/_source/drakes-shipyard/a-z-z-3-light-freighter.yml|Ec0jtuoGKx6dPdXL|G9RYPquiqoxntiKK",
	"packs/_source/drakes-shipyard/a-z-z-3-light-freighter.yml|Ec0jtuoGKx6dPdXL|vzhEAXijVl3F66oH",
	"packs/_source/drakes-shipyard/a-z-z-3-light-freighter.yml|Ec0jtuoGKx6dPdXL|uS1FdIyIHVNcEdaI",
	"packs/_source/drakes-shipyard/a-z-z-3-light-freighter.yml|Ec0jtuoGKx6dPdXL|9SpIYqNvsiV65ydH",
	"packs/_source/drakes-shipyard/a-z-z-3-light-freighter.yml|Ec0jtuoGKx6dPdXL|zCxMUdO5o9aewAVc",
	"packs/_source/drakes-shipyard/a-z-z-3-light-freighter.yml|Ec0jtuoGKx6dPdXL|VNBKM5lVglqhw8yz",
	"packs/_source/drakes-shipyard/a-z-z-3-light-freighter.yml|Ec0jtuoGKx6dPdXL|gjar2dqhas1NfS8Y",
	"packs/_source/drakes-shipyard/a-z-z-3-light-freighter.yml|Ec0jtuoGKx6dPdXL|Yg8tRA0DE4zXMEd3",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|Yqq0yEFMPYoPxrn8",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|dcIU7fRQtQvJamfM",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|hoMVbqtKtUpGVEv6",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|nWSoHAwDIXNiPcht",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|8YCpg9f7QY2bl9U0",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|XVAaDOi9K8XAl1tX",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|Owg8XFjyyGYdpOhA",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|FdtQXwlgCjrXWeu4",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|yZs6EyCZtLXWNirk",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|43y0p8uK4x308kIi",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|ehR5KqvUSKZsZlth",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|7U6mCvX2H2coJR3k",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|LQHDXA0xlKcEobbC",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|oefrGNk9sWUMbeU3",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|AewgDPeLnwIcZW2F",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|vn0W1kS0Fyn2POD7",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|2lrW5od2HsSoBmox",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|AxTLVl3C1MwJG7mW",
	"packs/_source/drakes-shipyard/aeg-77-vigo-gunship.yml|g7Rc7hHyyWraZ9xB|uHlvQW9YieVQmliv",
	"packs/_source/drakes-shipyard/aiat-i-gunship.yml|EAiaXORMgRRDVsz9|qIzmu3t6OSM6yzu3",
	"packs/_source/drakes-shipyard/aiat-i-gunship.yml|EAiaXORMgRRDVsz9|KTyDIZ0zyfW8VOUm",
	"packs/_source/drakes-shipyard/aiat-i-gunship.yml|EAiaXORMgRRDVsz9|E78Xgfqh1o1YqkTt",
	"packs/_source/drakes-shipyard/aiat-i-gunship.yml|EAiaXORMgRRDVsz9|xnftafkWnUxm0DSA",
	"packs/_source/drakes-shipyard/aiat-i-gunship.yml|EAiaXORMgRRDVsz9|fuor7gUpY6ViWc4I",
	"packs/_source/drakes-shipyard/aiat-i-gunship.yml|EAiaXORMgRRDVsz9|NNBFR6S3QjZaAGu2",
	"packs/_source/drakes-shipyard/aiat-i-gunship.yml|EAiaXORMgRRDVsz9|PNdQ8ucFYJbd8HPv",
	"packs/_source/drakes-shipyard/aiat-i-gunship.yml|EAiaXORMgRRDVsz9|TC4Df03EwBHfCVPo",
	"packs/_source/drakes-shipyard/akajor-class-shuttle.yml|tRnGAAILKowm8n4T|QQZN3Cn9CTqciNT5",
	"packs/_source/drakes-shipyard/akajor-class-shuttle.yml|tRnGAAILKowm8n4T|Y57YW3BaaxVPO4wu",
	"packs/_source/drakes-shipyard/akajor-class-shuttle.yml|tRnGAAILKowm8n4T|ljLwuvSxNPAaYg0h",
	"packs/_source/drakes-shipyard/akajor-class-shuttle.yml|tRnGAAILKowm8n4T|0RlB54eJOemGnAg4",
	"packs/_source/drakes-shipyard/akajor-class-shuttle.yml|tRnGAAILKowm8n4T|HqFSumhPFyPgrQ8q",
	"packs/_source/drakes-shipyard/akajor-class-shuttle.yml|tRnGAAILKowm8n4T|AzdES49FJo4tQmMK",
	"packs/_source/drakes-shipyard/amphibious-fighter.yml|LGffjLPNJFnU0dFw|MpxRagDRjIwd1RWy",
	"packs/_source/drakes-shipyard/amphibious-fighter.yml|LGffjLPNJFnU0dFw|WTuadT8LbSTSgMDN",
	"packs/_source/drakes-shipyard/amphibious-fighter.yml|LGffjLPNJFnU0dFw|Bg5AwsoecSmEiwda",
	"packs/_source/drakes-shipyard/amphibious-fighter.yml|LGffjLPNJFnU0dFw|UujDAK9Qe0tkLu02",
	"packs/_source/drakes-shipyard/amphibious-fighter.yml|LGffjLPNJFnU0dFw|Pf5jw1jvVa2GiANt",
	"packs/_source/drakes-shipyard/amphibious-fighter.yml|LGffjLPNJFnU0dFw|cH2Mnh0J51yUh641",
	"packs/_source/drakes-shipyard/amphibious-fighter.yml|LGffjLPNJFnU0dFw|llzIHu1LPoK7Q7K8",
	"packs/_source/drakes-shipyard/arc-170-starfighter.yml|B5AmMDBTT6TrfW5E|gVSKeDRj2ZqlQTCD",
	"packs/_source/drakes-shipyard/arc-170-starfighter.yml|B5AmMDBTT6TrfW5E|LYLdS6rXHZrDrXl7",
	"packs/_source/drakes-shipyard/arc-170-starfighter.yml|B5AmMDBTT6TrfW5E|6zIQOGLnG1HRbmp4",
	"packs/_source/drakes-shipyard/arc-170-starfighter.yml|B5AmMDBTT6TrfW5E|QrauEvpwl1oMdWv7",
	"packs/_source/drakes-shipyard/arc-170-starfighter.yml|B5AmMDBTT6TrfW5E|FVqRY2kv3xER04iZ",
	"packs/_source/drakes-shipyard/arc-170-starfighter.yml|B5AmMDBTT6TrfW5E|XqeOnVVtkF1xbdB5",
	"packs/_source/drakes-shipyard/arc-170-starfighter.yml|B5AmMDBTT6TrfW5E|ArdFqbrVFZuuu1pR",
	"packs/_source/drakes-shipyard/arc-170-starfighter.yml|B5AmMDBTT6TrfW5E|L2z3kOmbYaOstCiK",
	"packs/_source/drakes-shipyard/arc-170-starfighter.yml|B5AmMDBTT6TrfW5E|IqsxWMDmIOWr2FiN",
	"packs/_source/drakes-shipyard/arc-170-starfighter.yml|B5AmMDBTT6TrfW5E|VwYKB2gAtIqPYDar",
	"packs/_source/drakes-shipyard/arc-170-starfighter.yml|B5AmMDBTT6TrfW5E|DtEC53XSlZeDlj6j",
	"packs/_source/drakes-shipyard/arc-170-starfighter.yml|B5AmMDBTT6TrfW5E|G5yen3wNwLlnpxlB",
	"packs/_source/drakes-shipyard/arc-170-starfighter.yml|B5AmMDBTT6TrfW5E|7LcrdDPj66daQmhs",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|vAoSHIkvxqacuIln",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|pCgifct0PESfDlSS",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|hr5lS5PacS0nArvk",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|fcn8buFqFEy4OcOx",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|eXqN1vUhbcgsqAoh",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|lq5wzxlbXBbRxJeq",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|gHdnNxrbPYOEr0dM",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|r9vYH2hKYK0qUoft",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|Ztv7JQmS0SUHvCQq",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|wt26d8URH54FIgrt",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|a55VkLGDYOOGKdqz",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|ukFKbYXuJax9XBev",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|hqrG94vRS82f4tvc",
	"packs/_source/drakes-shipyard/arquitens-class-command-cruiser.yml|mpt1kUtoAefmMm2J|SG6BS0uZl9sLy780",
	"packs/_source/drakes-shipyard/arquitens-class-light-cruiser.yml|gcbEAITXaFubk3Te|zNhn1FgxoESxF55q",
	"packs/_source/drakes-shipyard/arquitens-class-light-cruiser.yml|gcbEAITXaFubk3Te|7a1wnCdHVR9QLmua",
	"packs/_source/drakes-shipyard/arquitens-class-light-cruiser.yml|gcbEAITXaFubk3Te|bOcSRhgtKLYqXT0m",
	"packs/_source/drakes-shipyard/arquitens-class-light-cruiser.yml|gcbEAITXaFubk3Te|AGB70uwkmxruovFZ",
	"packs/_source/drakes-shipyard/arquitens-class-light-cruiser.yml|gcbEAITXaFubk3Te|IcfviRTnVy7tQLWZ",
	"packs/_source/drakes-shipyard/arquitens-class-light-cruiser.yml|gcbEAITXaFubk3Te|vLp3C1Bvck5g4iKb",
	"packs/_source/drakes-shipyard/arquitens-class-light-cruiser.yml|gcbEAITXaFubk3Te|64netGwwFqttZW0X",
	"packs/_source/drakes-shipyard/arquitens-class-light-cruiser.yml|gcbEAITXaFubk3Te|MUN1PCRNyu3kEIUb",
	"packs/_source/drakes-shipyard/arquitens-class-light-cruiser.yml|gcbEAITXaFubk3Te|uPAGT3qDCaLowu8E",
	"packs/_source/drakes-shipyard/arquitens-class-light-cruiser.yml|gcbEAITXaFubk3Te|ApaJSAQKBsEEJPSb",
	"packs/_source/drakes-shipyard/arquitens-class-light-cruiser.yml|gcbEAITXaFubk3Te|nmLmOFdLdGOkX4Q3",
	"packs/_source/drakes-shipyard/arquitens-class-light-cruiser.yml|gcbEAITXaFubk3Te|CKivx2VtjPJIlSaR",
	"packs/_source/drakes-shipyard/baleen-class-heavy-freighter.yml|gDIld1heRHyZAON9|pGugUgT9hKNAmiwA",
	"packs/_source/drakes-shipyard/baleen-class-heavy-freighter.yml|gDIld1heRHyZAON9|Du9TEnGpvZC5J3By",
	"packs/_source/drakes-shipyard/baleen-class-heavy-freighter.yml|gDIld1heRHyZAON9|Rn0PR5w9lbtWCtjL",
	"packs/_source/drakes-shipyard/baleen-class-heavy-freighter.yml|gDIld1heRHyZAON9|dSh6sB5ApBMwYG4G",
	"packs/_source/drakes-shipyard/baleen-class-heavy-freighter.yml|gDIld1heRHyZAON9|LwzTmueaEIyJP5oF",
	"packs/_source/drakes-shipyard/baleen-class-heavy-freighter.yml|gDIld1heRHyZAON9|g3mflmAlIiwHtYDL",
	"packs/_source/drakes-shipyard/baleen-class-heavy-freighter.yml|gDIld1heRHyZAON9|l0GVKxmOLbvnIrUm",
	"packs/_source/drakes-shipyard/baleen-class-heavy-freighter.yml|gDIld1heRHyZAON9|264kw9I44dRgipsa",
	"packs/_source/drakes-shipyard/baleen-class-heavy-freighter.yml|gDIld1heRHyZAON9|32vd0a8oAs2xVrNl",
	"packs/_source/drakes-shipyard/baradium-missile.yml|cfolyngp2wsTmiAI|9mYF5wvr6Ytk3swB",
	"packs/_source/drakes-shipyard/baradium-missile.yml|cfolyngp2wsTmiAI|riJz76XRoOPhkll5",
	"packs/_source/drakes-shipyard/baradium-missile.yml|cfolyngp2wsTmiAI|gbWp1Ily1kWdFjV7",
	"packs/_source/drakes-shipyard/baradium-missile.yml|cfolyngp2wsTmiAI|SFyEw6nsWcuhBUlD",
	"packs/_source/drakes-shipyard/baradium-missile.yml|cfolyngp2wsTmiAI|TOIg1Hxig05Ap7Z1",
	"packs/_source/drakes-shipyard/baradium-missile.yml|cfolyngp2wsTmiAI|YBoLdHvvthMoHh0d",
	"packs/_source/drakes-shipyard/barloz-class-medium-freighter.yml|cczypZPh7owYKxX1|n3t5xRcBHZIJxPkC",
	"packs/_source/drakes-shipyard/barloz-class-medium-freighter.yml|cczypZPh7owYKxX1|j6zmz3prMDddWtTR",
	"packs/_source/drakes-shipyard/barloz-class-medium-freighter.yml|cczypZPh7owYKxX1|VW2zEf8xFjPPOOLk",
	"packs/_source/drakes-shipyard/barloz-class-medium-freighter.yml|cczypZPh7owYKxX1|aDxrlNNlT7NFta2v",
	"packs/_source/drakes-shipyard/barloz-class-medium-freighter.yml|cczypZPh7owYKxX1|pJrtqMqAwU8T6tG3",
	"packs/_source/drakes-shipyard/barloz-class-medium-freighter.yml|cczypZPh7owYKxX1|7bHwhWCf1vQ1IMkV",
	"packs/_source/drakes-shipyard/barloz-class-medium-freighter.yml|cczypZPh7owYKxX1|PH5g6XgWPxXt0gQw",
	"packs/_source/drakes-shipyard/barloz-class-medium-freighter.yml|cczypZPh7owYKxX1|iXiH2NTDOz0rMrad",
	"packs/_source/drakes-shipyard/barloz-class-medium-freighter.yml|cczypZPh7owYKxX1|i72bQNO2KC7UFPb3",
	"packs/_source/drakes-shipyard/basilisk-space-droid.yml|7X4txvq9CcL2MPdL|VHOBdQbha9AOrQmx",
	"packs/_source/drakes-shipyard/basilisk-space-droid.yml|7X4txvq9CcL2MPdL|PhSvAbgKsgr4kZyV",
	"packs/_source/drakes-shipyard/basilisk-space-droid.yml|7X4txvq9CcL2MPdL|3nyO43XgJsfb7t8w",
	"packs/_source/drakes-shipyard/basilisk-space-droid.yml|7X4txvq9CcL2MPdL|WR8TfaefI1OWNGKL",
	"packs/_source/drakes-shipyard/basilisk-space-droid.yml|7X4txvq9CcL2MPdL|pBROmvVAd8vrjyaK",
	"packs/_source/drakes-shipyard/basilisk-space-droid.yml|7X4txvq9CcL2MPdL|f2lYpoJYNlyCM3Xz",
	"packs/_source/drakes-shipyard/basilisk-space-droid.yml|7X4txvq9CcL2MPdL|dy16N915tg56OlTD",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|1yvOOHhEejvJv0cd",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|XiuySd3mJnSPViFB",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|wvyv2G3LIEuQRMU7",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|T95ZrMngkvi4muNq",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|kOE1YpCyFOEuu044",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|NKpvEhJ5tNQY5i3J",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|fBJ9fRV2CdhL6dAn",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|zxEUSvMWyG4QdkZz",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|nELX2h42r2HH6eKW",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|FXx6aGYFjiX15iKQ",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|oDoc8k5ga8At5lkk",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|wfHdQWym1aIGZMw6",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|MTg5onqJ568vQnww",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|Ajf3rWDVofj2bQX9",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|fPsuqbuq670NzLaN",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|vYqyxE6TvQVjcDiY",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|PNW4eRshNeiFiNKB",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht-modified.yml|IbM8uXHEpvvdf0TN|cnRSHbamONTcZvPn",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht.yml|e5uv8tcM0cFQLI7R|1yvOOHhEejvJv0cd",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht.yml|e5uv8tcM0cFQLI7R|XiuySd3mJnSPViFB",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht.yml|e5uv8tcM0cFQLI7R|wvyv2G3LIEuQRMU7",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht.yml|e5uv8tcM0cFQLI7R|T95ZrMngkvi4muNq",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht.yml|e5uv8tcM0cFQLI7R|kOE1YpCyFOEuu044",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht.yml|e5uv8tcM0cFQLI7R|NKpvEhJ5tNQY5i3J",
	"packs/_source/drakes-shipyard/baudo-class-star-yacht.yml|e5uv8tcM0cFQLI7R|fBJ9fRV2CdhL6dAn",
	"packs/_source/drakes-shipyard/c-wing-corellian-b-wing.yml|NYWhs7E7dXECVXNq|iMshBxD6Lb9GSNiP",
	"packs/_source/drakes-shipyard/c-wing-corellian-b-wing.yml|NYWhs7E7dXECVXNq|PXqT2Bf0VdWb06Hd",
	"packs/_source/drakes-shipyard/c-wing-corellian-b-wing.yml|NYWhs7E7dXECVXNq|gGSv9LZqRQFGuxP4",
	"packs/_source/drakes-shipyard/c-wing-corellian-b-wing.yml|NYWhs7E7dXECVXNq|lKScDtzq3VhwBfOw",
	"packs/_source/drakes-shipyard/c-wing-corellian-b-wing.yml|NYWhs7E7dXECVXNq|kzNbnLvrITWzBEAX",
	"packs/_source/drakes-shipyard/c-wing-corellian-b-wing.yml|NYWhs7E7dXECVXNq|ORjpOlW6ymrXJAtP",
	"packs/_source/drakes-shipyard/c-wing-corellian-b-wing.yml|NYWhs7E7dXECVXNq|aV1d0JtuAEldXZLB",
	"packs/_source/drakes-shipyard/c-wing-corellian-b-wing.yml|NYWhs7E7dXECVXNq|rl9lVHkwojAb0QAi",
	"packs/_source/drakes-shipyard/c-wing-corellian-b-wing.yml|NYWhs7E7dXECVXNq|Jfeha8Yvkfl1uTYm",
	"packs/_source/drakes-shipyard/chirdaki-deathseed.yml|OMMoXTxtFhVheNdP|Qd66O73ndQ0yuXhm",
	"packs/_source/drakes-shipyard/chirdaki-deathseed.yml|OMMoXTxtFhVheNdP|jn4TpEkMUmF3RNLD",
	"packs/_source/drakes-shipyard/chirdaki-deathseed.yml|OMMoXTxtFhVheNdP|qChgVoglsWpj26Ru",
	"packs/_source/drakes-shipyard/chirdaki-deathseed.yml|OMMoXTxtFhVheNdP|72qxpRoCE1gZWNjP",
	"packs/_source/drakes-shipyard/chirdaki-deathseed.yml|OMMoXTxtFhVheNdP|zGb0HJ8vDZNyF2b7",
	"packs/_source/drakes-shipyard/chirdaki-deathseed.yml|OMMoXTxtFhVheNdP|qKuKsRwjZGK9Ajhq",
	"packs/_source/drakes-shipyard/chirdaki-deathseed.yml|OMMoXTxtFhVheNdP|RUThbFPqqW9D7nnM",
	"packs/_source/drakes-shipyard/chirdaki-deathseed.yml|OMMoXTxtFhVheNdP|34BiyZIPmuKEz5Af",
	"packs/_source/drakes-shipyard/clutch-tri-fighter.yml|jzfWoZefO4jrwMP5|wvpL94usrLNOfmQs",
	"packs/_source/drakes-shipyard/clutch-tri-fighter.yml|jzfWoZefO4jrwMP5|pul3Rs5UV0dACAzv",
	"packs/_source/drakes-shipyard/clutch-tri-fighter.yml|jzfWoZefO4jrwMP5|9LKQoKYvYIHwzSSC",
	"packs/_source/drakes-shipyard/clutch-tri-fighter.yml|jzfWoZefO4jrwMP5|FFDxrWAGcBFJc5KX",
	"packs/_source/drakes-shipyard/clutch-tri-fighter.yml|jzfWoZefO4jrwMP5|5g0rPJV4gi6vUZgA",
	"packs/_source/drakes-shipyard/clutch-tri-fighter.yml|jzfWoZefO4jrwMP5|TUk67ESUtzWarou9",
	"packs/_source/drakes-shipyard/clutch-tri-fighter.yml|jzfWoZefO4jrwMP5|3wQ3AXktBpkuJPqU",
	"packs/_source/drakes-shipyard/cr90-corvette.yml|0S6RxfRRNiswQrya|1RWII66GkqZ9nIjr",
	"packs/_source/drakes-shipyard/cr90-corvette.yml|0S6RxfRRNiswQrya|Bg2mb6NJPTe29zp1",
	"packs/_source/drakes-shipyard/cr90-corvette.yml|0S6RxfRRNiswQrya|btezrtfHgHR5ysrX",
	"packs/_source/drakes-shipyard/cr90-corvette.yml|0S6RxfRRNiswQrya|Eem19rOgwZJ1HJGk",
	"packs/_source/drakes-shipyard/cr90-corvette.yml|0S6RxfRRNiswQrya|Rm71azecWTlhaoQQ",
	"packs/_source/drakes-shipyard/cr90-corvette.yml|0S6RxfRRNiswQrya|nbLikgfTrEJImjOq",
	"packs/_source/drakes-shipyard/cr90-corvette.yml|0S6RxfRRNiswQrya|NtNThYWmDxdwRcxr",
	"packs/_source/drakes-shipyard/cr90-corvette.yml|0S6RxfRRNiswQrya|fn8FfWPjzrt7xsug",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|NBs6A2glJCIWrCmJ",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|GajP5hmmefkoWjsL",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|ckZH3rdb2PGSi0ni",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|trmvLL90uaIynuO0",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|6N1LO7CLDFqyHY3H",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|ivVF0QozmlYs2diK",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|7lj999DxT2cjUpKC",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|inP99qap2Pnc70mW",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|Wm08I08S36mNT0o8",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|IFKbzb74qU5oD20U",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|ygIjqOl54vpkxNDN",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|mSo0Wz93x4aEnooV",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|3GxjsdnFsOiiFHbD",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|sNbtXEaQL6cjE5Bf",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|Yhn7yvwFfjcefdJc",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|ked4kRPzEOIyehp1",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|UCeS9tY1NccGhnuF",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|xOwfRgEOfWS555kz",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|V7tvARe4LwGA4XIq",
	"packs/_source/drakes-shipyard/crusader-xx-777-prototype-droid-frigate.yml|G0XGdRHTGz8BXfmN|pBt828SafaUHTiKf",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|rbewWG9P2KXT8mVu",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|eUnlCbZJ0sRnb2we",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|yYWhVjyjN11MY3o0",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|fu74qfbyA6Vv132P",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|jyR59UgVEBiitLX2",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|u0HRGu2Uyxe4X0hg",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|OplOVxNGsWk2lU0K",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|dLFB0aJIxVyZYWiJ",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|8hW6Mco6mbB3AEKi",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|0MeJ80KDBuFbfRUM",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|ZJ5yV70KzbYpoLEd",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|uAzLDWw1Or6D04g6",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|oxrT657qfJW7ZHJL",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|LY4IY2jsFOPdEQJr",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|wR4WGsT1zBBpZg5n",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|ofxGr34fwmg2x2dQ",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter-legendary.yml|NdFAYbYXP78V2jqD|lH7QyW59s36419Sg",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter.yml|8X549fFDsnYcpJY7|rbewWG9P2KXT8mVu",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter.yml|8X549fFDsnYcpJY7|eUnlCbZJ0sRnb2we",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter.yml|8X549fFDsnYcpJY7|yYWhVjyjN11MY3o0",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter.yml|8X549fFDsnYcpJY7|fu74qfbyA6Vv132P",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter.yml|8X549fFDsnYcpJY7|jyR59UgVEBiitLX2",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter.yml|8X549fFDsnYcpJY7|u0HRGu2Uyxe4X0hg",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter.yml|8X549fFDsnYcpJY7|OplOVxNGsWk2lU0K",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter.yml|8X549fFDsnYcpJY7|dLFB0aJIxVyZYWiJ",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter.yml|8X549fFDsnYcpJY7|8hW6Mco6mbB3AEKi",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter.yml|8X549fFDsnYcpJY7|0MeJ80KDBuFbfRUM",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter.yml|8X549fFDsnYcpJY7|ZJ5yV70KzbYpoLEd",
	"packs/_source/drakes-shipyard/deepwater-class-light-freighter.yml|8X549fFDsnYcpJY7|uAzLDWw1Or6D04g6",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml|FbzPxDn1FfeRvDym|2DLoajpx7heVqszr",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml|FbzPxDn1FfeRvDym|EcdDyKhbgBr1FB6X",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml|FbzPxDn1FfeRvDym|laUzBgS2kStWVqJ6",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml|FbzPxDn1FfeRvDym|86TRae8uXy9Mnzvs",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml|FbzPxDn1FfeRvDym|2DmODa4tIMI7PHJR",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml|FbzPxDn1FfeRvDym|yKI2uea67hK3BQGB",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml|FbzPxDn1FfeRvDym|JE1egQxclYL7XPmM",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml|FbzPxDn1FfeRvDym|Rny85IHx6GDYwWVq",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml|FbzPxDn1FfeRvDym|FRvf5uD07MbmwFdA",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml|FbzPxDn1FfeRvDym|1V1h2E9EIat06tSu",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml|FbzPxDn1FfeRvDym|1zY7dlV8Yg3x1bC2",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml|FbzPxDn1FfeRvDym|Q67R8ORP0xOGZPJS",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor-modified.yml|FbzPxDn1FfeRvDym|tgGe9jwohBDQRwua",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor.yml|fqQgg2zi7i1ZWjly|2DLoajpx7heVqszr",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor.yml|fqQgg2zi7i1ZWjly|EcdDyKhbgBr1FB6X",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor.yml|fqQgg2zi7i1ZWjly|laUzBgS2kStWVqJ6",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor.yml|fqQgg2zi7i1ZWjly|86TRae8uXy9Mnzvs",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor.yml|fqQgg2zi7i1ZWjly|2DmODa4tIMI7PHJR",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor.yml|fqQgg2zi7i1ZWjly|yKI2uea67hK3BQGB",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor.yml|fqQgg2zi7i1ZWjly|JE1egQxclYL7XPmM",
	"packs/_source/drakes-shipyard/delta-7-aethersprite-class-light-interceptor.yml|fqQgg2zi7i1ZWjly|Rny85IHx6GDYwWVq",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|GcNsKZ04INT2RmlB",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|APhgtoPxupc7dFQD",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|b6XX24FHPnMThaha",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|2z9qiJsmc0EXk6io",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|RKEPfqCKfE211Sdw",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|SLgnzbdEIELXMbQA",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|UhAwYYHcnBSa8R1x",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|9jquGxyFeiK8uzHj",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|N6V0RhFAJSDlDQNM",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|dWX9JptMqYwrFDgO",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|jGfvimyuls4pmqep",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|bogN4fQCc2Rk4GgG",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|Q7nKU7KhEk5HrPU2",
	"packs/_source/drakes-shipyard/dp20-frigate.yml|NRhEjklvSBU3e1e2|fVaTVSR5WHiHZpSY",
	"packs/_source/drakes-shipyard/droid-tri-fighter.yml|Twk5AisCbp7TvL9M|KembF6bFQkruFJlP",
	"packs/_source/drakes-shipyard/droid-tri-fighter.yml|Twk5AisCbp7TvL9M|HKan61nKPOoLWsIg",
	"packs/_source/drakes-shipyard/droid-tri-fighter.yml|Twk5AisCbp7TvL9M|4rXn8VastiMTAVuS",
	"packs/_source/drakes-shipyard/droid-tri-fighter.yml|Twk5AisCbp7TvL9M|F59MQMDW23RN5l0S",
	"packs/_source/drakes-shipyard/droid-tri-fighter.yml|Twk5AisCbp7TvL9M|i6w7AZ6Y6kGIBc7v",
	"packs/_source/drakes-shipyard/droid-tri-fighter.yml|Twk5AisCbp7TvL9M|qXpxYsfqOPJSFKxf",
	"packs/_source/drakes-shipyard/droid-tri-fighter.yml|Twk5AisCbp7TvL9M|LTezRC5ysBbsXrqn",
	"packs/_source/drakes-shipyard/dynamic-class-light-freighter.yml|gawTKA6kzr7qNnnD|avtPyASdCVr4fSJD",
	"packs/_source/drakes-shipyard/dynamic-class-light-freighter.yml|gawTKA6kzr7qNnnD|O6KcOWq55bt2EJAW",
	"packs/_source/drakes-shipyard/dynamic-class-light-freighter.yml|gawTKA6kzr7qNnnD|NNJ61f5bJ6mJmPwb",
	"packs/_source/drakes-shipyard/dynamic-class-light-freighter.yml|gawTKA6kzr7qNnnD|gpoa7OZj5fmjiOrs",
	"packs/_source/drakes-shipyard/dynamic-class-light-freighter.yml|gawTKA6kzr7qNnnD|zql2rGwgZupzbrss",
	"packs/_source/drakes-shipyard/dynamic-class-light-freighter.yml|gawTKA6kzr7qNnnD|wexY64GDFsfQLjiV",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate-medical.yml|8uUUatfcGjYMSKZr|ZuTV7rYcRZDiY2rp",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate-medical.yml|8uUUatfcGjYMSKZr|Y8eTKrymYoDCtpTH",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate-medical.yml|8uUUatfcGjYMSKZr|DguyDWTKaM0C3n7K",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate-medical.yml|8uUUatfcGjYMSKZr|4zDaRLmJ8PSqneG8",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate-medical.yml|8uUUatfcGjYMSKZr|ZZ11ZM7nB5W2ipRE",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate-medical.yml|8uUUatfcGjYMSKZr|4oSxxey7hYvj2GVA",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate-medical.yml|8uUUatfcGjYMSKZr|g3fQJGvFfA5Avr5a",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate-medical.yml|8uUUatfcGjYMSKZr|oR76VvJHehmqDILW",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate-medical.yml|8uUUatfcGjYMSKZr|2ZpwP0uyFsQLeKaP",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate.yml|MBlMVJlmhIjF9IqH|xa1sRFiPfDf9Lwl9",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate.yml|MBlMVJlmhIjF9IqH|cLVfiK0Lkc8CaoTw",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate.yml|MBlMVJlmhIjF9IqH|8tk2F87OOlpiQFHA",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate.yml|MBlMVJlmhIjF9IqH|aPaE0sri0qz8mdOz",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate.yml|MBlMVJlmhIjF9IqH|tRbomgOgEZFW4u0p",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate.yml|MBlMVJlmhIjF9IqH|gUFElYjnIsQjlJi1",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate.yml|MBlMVJlmhIjF9IqH|cZc3a7HVDTQokPIZ",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate.yml|MBlMVJlmhIjF9IqH|EQcBgpJuYnFx3WtP",
	"packs/_source/drakes-shipyard/ef76-nebulon-b-escort-frigate.yml|MBlMVJlmhIjF9IqH|zcb2KgkVpmYXA1tE",
	"packs/_source/drakes-shipyard/escape-pod.yml|2YtJawA2uITnhq6V|krlW7P942Vzhz1YP",
	"packs/_source/drakes-shipyard/escape-pod.yml|2YtJawA2uITnhq6V|abuDPEChQ122eUAA",
	"packs/_source/drakes-shipyard/escape-pod.yml|2YtJawA2uITnhq6V|tGnIpVH52nUb8xsZ",
	"packs/_source/drakes-shipyard/escape-pod.yml|2YtJawA2uITnhq6V|QqjHN7V3FLclz4yr",
	"packs/_source/drakes-shipyard/escape-pod.yml|2YtJawA2uITnhq6V|2syCVNwz21D3U3Jm",
	"packs/_source/drakes-shipyard/eta-2-actis-class-interceptor.yml|kxOYt1pVQc0rh1OP|omzOSv2a4183Wm7z",
	"packs/_source/drakes-shipyard/eta-2-actis-class-interceptor.yml|kxOYt1pVQc0rh1OP|rcZLZPRf87K61ktM",
	"packs/_source/drakes-shipyard/eta-2-actis-class-interceptor.yml|kxOYt1pVQc0rh1OP|u2teYR9FCctuY21x",
	"packs/_source/drakes-shipyard/eta-2-actis-class-interceptor.yml|kxOYt1pVQc0rh1OP|BOOZt3vkVt3reZb8",
	"packs/_source/drakes-shipyard/eta-2-actis-class-interceptor.yml|kxOYt1pVQc0rh1OP|VYtjdSzQHThila8R",
	"packs/_source/drakes-shipyard/eta-2-actis-class-interceptor.yml|kxOYt1pVQc0rh1OP|H8kQhahX2yanYtEA",
	"packs/_source/drakes-shipyard/eta-2-actis-class-interceptor.yml|kxOYt1pVQc0rh1OP|XbjIMSHBdKQUl7I1",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|ZLWmON2CQKZYjFUx",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|egfKA0jnWsZlL2x5",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|CCB3q9kIaV8Dz2ar",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|FPnVXjducDC5LUdq",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|Iy4UnnpmS1XpUu6z",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|cpNGgUDqWP9OEFDA",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|JLw4uH6mxgYgSncv",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|LPk7g7fiM0OMTsV1",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|XejIdYd6BQcvvUfZ",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|3utpgw9tGoi4arGU",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|8ycWty83xVgsUj1B",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|OhS2tDL3azbSMQw8",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|Z0gquD1KzAvindLV",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|CJZGaRe7fvx9L0g8",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|zqiJCyiUjs1FDwiU",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|i3VI6TVdaZEvutGL",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|fIYfhOhzAVlt9O0D",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|q4XksGlJddxMgFOT",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|JtGImpuFPjoi5q4q",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|JqLgQb3ruLZ3VA4k",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|SbjxHpvGRMJzJahp",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|GjKwcBMzXaRmhZE3",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|uF0PJEeVTDJbJg9j",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|VDnOsrjcEbyetFo9",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|5UKp3I366zZVkg7M",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|QMZFY0l9tiOuGYBk",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|elrGhVVLoTOkGLbT",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|gVuTlsf84fyjkLzl",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|5cg08V1zktiDN4dE",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|BrGGjWCMaUsUq9jN",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|fpLOq785kIOtMQXF",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|4QrRuQ42Tpq3OTM7",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|Fm4rDSCWwTNJDpVI",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|FcwjwqtXA9wSsvba",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|ZMwdbeoAuTZBJAaj",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|nNxduE1YUrqYfg30",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|HnteRFYEkOYMs7vg",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|jD1KUuDmJawbJbWO",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|i4c3uckbLlYryG9d",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|b9YFEkceUEULlbpN",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|cYFoRBeCWBUJRQCE",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|ufF7KesAx1g14siW",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|ydkWsFk30gSJigXR",
	"packs/_source/drakes-shipyard/executor-i-class-star-dreadnought.yml|RMKgV514aBS7LwMo|2uzNijSqvGjsX9P2",
	"packs/_source/drakes-shipyard/fang-class.yml|uAzqh6bUJ4ZfKcol|q4GXz2CNpbESiTGq",
	"packs/_source/drakes-shipyard/fang-class.yml|uAzqh6bUJ4ZfKcol|aaiE5N7idp7cMbMT",
	"packs/_source/drakes-shipyard/fang-class.yml|uAzqh6bUJ4ZfKcol|M0CN4gBQnkg3SWFa",
	"packs/_source/drakes-shipyard/fang-class.yml|uAzqh6bUJ4ZfKcol|8j6BCOP5RHQNSdII",
	"packs/_source/drakes-shipyard/fang-class.yml|uAzqh6bUJ4ZfKcol|S8A94ZI66ZMscLNU",
	"packs/_source/drakes-shipyard/fang-class.yml|uAzqh6bUJ4ZfKcol|b1REtZF3pswmA0pa",
	"packs/_source/drakes-shipyard/fang-class.yml|uAzqh6bUJ4ZfKcol|WAxyWdsR7lk9XgAi",
	"packs/_source/drakes-shipyard/fang-class.yml|uAzqh6bUJ4ZfKcol|Lvcu5wE8VxPEmeXk",
	"packs/_source/drakes-shipyard/fang-class.yml|uAzqh6bUJ4ZfKcol|T1DRdC4ytr7jVMOU",
	"packs/_source/drakes-shipyard/gand-starfighter.yml|DiyflQC8xEhqvrzp|l05oajRzmwrTdDTu",
	"packs/_source/drakes-shipyard/gand-starfighter.yml|DiyflQC8xEhqvrzp|MVeaftUXt65th3b4",
	"packs/_source/drakes-shipyard/gand-starfighter.yml|DiyflQC8xEhqvrzp|WNG2sYtCVAcXvtKW",
	"packs/_source/drakes-shipyard/gand-starfighter.yml|DiyflQC8xEhqvrzp|ZlLdV2Hf4s106jHG",
	"packs/_source/drakes-shipyard/gand-starfighter.yml|DiyflQC8xEhqvrzp|SPV3is5AvCY01daF",
	"packs/_source/drakes-shipyard/gand-starfighter.yml|DiyflQC8xEhqvrzp|D7qa0A7lXNDZ1Lk4",
	"packs/_source/drakes-shipyard/gand-starfighter.yml|DiyflQC8xEhqvrzp|7ZHnPLSsXUwI9YAr",
	"packs/_source/drakes-shipyard/gand-starfighter.yml|DiyflQC8xEhqvrzp|HtdeXlErVB3DSfkP",
	"packs/_source/drakes-shipyard/gat-12-skipray-blastboat.yml|Bgqr4WNQpTzEIepj|rqwJFJeP0feD2Gg8",
	"packs/_source/drakes-shipyard/gat-12-skipray-blastboat.yml|Bgqr4WNQpTzEIepj|eabhoSJBXwwnn99D",
	"packs/_source/drakes-shipyard/gat-12-skipray-blastboat.yml|Bgqr4WNQpTzEIepj|RBy6DhM3bBSJXtAm",
	"packs/_source/drakes-shipyard/gat-12-skipray-blastboat.yml|Bgqr4WNQpTzEIepj|lEiFFloq2ZkkeApZ",
	"packs/_source/drakes-shipyard/gat-12-skipray-blastboat.yml|Bgqr4WNQpTzEIepj|2vG9jq3YkxmchqFb",
	"packs/_source/drakes-shipyard/gat-12-skipray-blastboat.yml|Bgqr4WNQpTzEIepj|xkpF89kRtW195Z8n",
	"packs/_source/drakes-shipyard/gat-12-skipray-blastboat.yml|Bgqr4WNQpTzEIepj|dKszFX5qmM61GqXi",
	"packs/_source/drakes-shipyard/gat-12-skipray-blastboat.yml|Bgqr4WNQpTzEIepj|LbbmcXf7becfdzdz",
	"packs/_source/drakes-shipyard/gat-12-skipray-blastboat.yml|Bgqr4WNQpTzEIepj|hMTxzj5VZPTNLvwM",
	"packs/_source/drakes-shipyard/gat-12-skipray-blastboat.yml|Bgqr4WNQpTzEIepj|258Bs4KjJSbvVaAx",
	"packs/_source/drakes-shipyard/gat-12-skipray-blastboat.yml|Bgqr4WNQpTzEIepj|DhG4EjqWT9EkDxlS",
	"packs/_source/drakes-shipyard/gat-12-skipray-blastboat.yml|Bgqr4WNQpTzEIepj|WdTrAHlsTJACbgqV",
	"packs/_source/drakes-shipyard/hmp-droid-gunship.yml|reNHgyibXInPuEMz|ScVQfRMTb7uufcGl",
	"packs/_source/drakes-shipyard/hmp-droid-gunship.yml|reNHgyibXInPuEMz|fauu46jPNuuAI4cX",
	"packs/_source/drakes-shipyard/hmp-droid-gunship.yml|reNHgyibXInPuEMz|SICmCAnAstbXI6DP",
	"packs/_source/drakes-shipyard/hmp-droid-gunship.yml|reNHgyibXInPuEMz|xUzuFt3V5DPjfqm8",
	"packs/_source/drakes-shipyard/hmp-droid-gunship.yml|reNHgyibXInPuEMz|8wjmSxuVPwByi96Y",
	"packs/_source/drakes-shipyard/hmp-droid-gunship.yml|reNHgyibXInPuEMz|0kwuahN5nIk34a2w",
	"packs/_source/drakes-shipyard/hmp-droid-gunship.yml|reNHgyibXInPuEMz|Jyk67rtDn2kT1aCT",
	"packs/_source/drakes-shipyard/hmp-droid-gunship.yml|reNHgyibXInPuEMz|aL8wrs0OrpraMyEE",
	"packs/_source/drakes-shipyard/hmp-droid-gunship.yml|reNHgyibXInPuEMz|aFwmfPhEYGEcs65a",
	"packs/_source/drakes-shipyard/hmp-droid-gunship.yml|reNHgyibXInPuEMz|roy0Tlmp8y4ccBFf",
	"packs/_source/drakes-shipyard/hmp-droid-gunship.yml|reNHgyibXInPuEMz|KFDzYB4GfBDxlqRA",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|UudiUqGJ9fQIh66P",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|JAKcmyLNFpD1ImWx",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|fgaScWlbZevg6Fem",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|ML5imtqAzKc0JT81",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|f8X6Rf6dDTmkZugz",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|KqdhXE7r02vEagyv",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|cTtxalaBD1ugxMTj",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|2bEREZCfSogjppjf",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|kOCNvk2vDOsngfwv",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|nuVAffUiIgf5KZ27",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|h50CisIbWknxHGs7",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|S84PvnvBrqGUJhNi",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|X9YYaX34rTXQnPWr",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|0ruIJM3uWYVPWVHC",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|Qc0QJYC37xTNAEeQ",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|SSiCQozFC2xlKp6X",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|dwsBr5CVpqUyCWlF",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|aVU9cMGdSSxt6mSu",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|Gwn2JXh3D5BS4XpV",
	"packs/_source/drakes-shipyard/horizon-class-star-yacht-legendary.yml|LVFuVcFl4gF7tNoR|QZRtcW0vW3u5mtfy",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|K1tsV7LR2tF9ztnN",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|STeFp8druRL1amz4",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|6ecOnKXp9FASS8FA",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|MpEUXV8BBjs7a5Lt",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|xjkQR9HlJH9rLUbF",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|bkDQDGmiFn3aMlnb",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|KsDw1NwIhBYe07Dy",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|On2IoVvX3znbMx8I",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|hUyf6Rq6SKOgDvpg",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|y7tLcWxOzEzu8Ltr",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|Xwk35c7uDfMuu77E",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|YhMQFYtABp0WXLrY",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|71MwxXguZ0tCR1o6",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|He6g3KROXwwDFXMx",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|lJ7k6PEeCv2HCqLb",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|AltdARSXlGhN8es2",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|SEcVMTxbGA4dulAg",
	"packs/_source/drakes-shipyard/imperial-i-class-star-destroyer.yml|eLlCXi97DAtixinm|3xjvahUg8x32Zvo7",
	"packs/_source/drakes-shipyard/k-wing-btl-s8.yml|vuT2zQ9MkT4bl9sX|mA1MURuFjofNUY6r",
	"packs/_source/drakes-shipyard/k-wing-btl-s8.yml|vuT2zQ9MkT4bl9sX|E5mgdoSapRHmwBph",
	"packs/_source/drakes-shipyard/k-wing-btl-s8.yml|vuT2zQ9MkT4bl9sX|EvNVRNfqdNpTA0AJ",
	"packs/_source/drakes-shipyard/k-wing-btl-s8.yml|vuT2zQ9MkT4bl9sX|q1ZeuhDU6dCTFlGH",
	"packs/_source/drakes-shipyard/k-wing-btl-s8.yml|vuT2zQ9MkT4bl9sX|RGuz120OOUM4jca5",
	"packs/_source/drakes-shipyard/k-wing-btl-s8.yml|vuT2zQ9MkT4bl9sX|cAlJO1Cdqm1CGIbi",
	"packs/_source/drakes-shipyard/k-wing-btl-s8.yml|vuT2zQ9MkT4bl9sX|yUOsX7jGUIHjSImw",
	"packs/_source/drakes-shipyard/k-wing-btl-s8.yml|vuT2zQ9MkT4bl9sX|wyDhNbt9wxFHyhYf",
	"packs/_source/drakes-shipyard/m12-l-kimogila-heavy-fighter.yml|zEXFY5OjrHTSUdjm|sZveOOoCZOjTF9Pp",
	"packs/_source/drakes-shipyard/m12-l-kimogila-heavy-fighter.yml|zEXFY5OjrHTSUdjm|EkOTjuUotVLmRwnr",
	"packs/_source/drakes-shipyard/m12-l-kimogila-heavy-fighter.yml|zEXFY5OjrHTSUdjm|VgF1KFyFOiP1m4fc",
	"packs/_source/drakes-shipyard/m12-l-kimogila-heavy-fighter.yml|zEXFY5OjrHTSUdjm|1cmArj2QhKcOr5XK",
	"packs/_source/drakes-shipyard/m12-l-kimogila-heavy-fighter.yml|zEXFY5OjrHTSUdjm|4omjS5BhaWcuC9rz",
	"packs/_source/drakes-shipyard/m12-l-kimogila-heavy-fighter.yml|zEXFY5OjrHTSUdjm|9kBv0nVVQCemI2EY",
	"packs/_source/drakes-shipyard/m12-l-kimogila-heavy-fighter.yml|zEXFY5OjrHTSUdjm|YmPKhcjwXwzpkObv",
	"packs/_source/drakes-shipyard/m12-l-kimogila-heavy-fighter.yml|zEXFY5OjrHTSUdjm|5QT0jlk83hp2nVz1",
	"packs/_source/drakes-shipyard/m12-l-kimogila-heavy-fighter.yml|zEXFY5OjrHTSUdjm|Sq2OKz0GcViwFntA",
	"packs/_source/drakes-shipyard/m12-l-kimogila-heavy-fighter.yml|zEXFY5OjrHTSUdjm|rzzjSkLkj4W7YAF8",
	"packs/_source/drakes-shipyard/m12-l-kimogila-heavy-fighter.yml|zEXFY5OjrHTSUdjm|r2CrOTDXsDECKKGe",
	"packs/_source/drakes-shipyard/m22-t-krayt-gunship.yml|9pA2rg6Eme3DtR1h|2VKwAZIYJklffwgF",
	"packs/_source/drakes-shipyard/m22-t-krayt-gunship.yml|9pA2rg6Eme3DtR1h|pRkOdNKDgQEIF7jW",
	"packs/_source/drakes-shipyard/m22-t-krayt-gunship.yml|9pA2rg6Eme3DtR1h|QRcQJ4lafrw36bpm",
	"packs/_source/drakes-shipyard/m22-t-krayt-gunship.yml|9pA2rg6Eme3DtR1h|g2m4WD9oF78grvk8",
	"packs/_source/drakes-shipyard/m22-t-krayt-gunship.yml|9pA2rg6Eme3DtR1h|N1FwnAGycjv8Z9tS",
	"packs/_source/drakes-shipyard/m22-t-krayt-gunship.yml|9pA2rg6Eme3DtR1h|LwVTTIRaYrABLdhh",
	"packs/_source/drakes-shipyard/m22-t-krayt-gunship.yml|9pA2rg6Eme3DtR1h|EYTB8YNiFvaDmNTO",
	"packs/_source/drakes-shipyard/m22-t-krayt-gunship.yml|9pA2rg6Eme3DtR1h|VgIbcauu5Z5AZwMC",
	"packs/_source/drakes-shipyard/m22-t-krayt-gunship.yml|9pA2rg6Eme3DtR1h|g3Eert73q2Efyey1",
	"packs/_source/drakes-shipyard/m22-t-krayt-gunship.yml|9pA2rg6Eme3DtR1h|cHEMhzhbTnmN6ce1",
	"packs/_source/drakes-shipyard/m22-t-krayt-gunship.yml|9pA2rg6Eme3DtR1h|aPoY2jzUwT4s57Jw",
	"packs/_source/drakes-shipyard/m22-t-krayt-gunship.yml|9pA2rg6Eme3DtR1h|ez7jf4SRMcafQq4B",
	"packs/_source/drakes-shipyard/m3-a-scyk-fighter.yml|Gc58wD4Yv0HoMsZW|HGZc6Zy7CBLiIctH",
	"packs/_source/drakes-shipyard/m3-a-scyk-fighter.yml|Gc58wD4Yv0HoMsZW|oJTzdTRgDFSD8Fa5",
	"packs/_source/drakes-shipyard/m3-a-scyk-fighter.yml|Gc58wD4Yv0HoMsZW|Ddlg8sIqWhMiG9H0",
	"packs/_source/drakes-shipyard/m3-a-scyk-fighter.yml|Gc58wD4Yv0HoMsZW|6ubsrZsiuEVxodP1",
	"packs/_source/drakes-shipyard/m3-a-scyk-fighter.yml|Gc58wD4Yv0HoMsZW|9JlO5IGYR3sI4FI2",
	"packs/_source/drakes-shipyard/m3-a-scyk-fighter.yml|Gc58wD4Yv0HoMsZW|zYDLmjHFbfibQRU1",
	"packs/_source/drakes-shipyard/m3-a-scyk-heavy-fighter.yml|1r4jBr6JMShi7Uay|sE7rr84DDMRe46HY",
	"packs/_source/drakes-shipyard/m3-a-scyk-heavy-fighter.yml|1r4jBr6JMShi7Uay|t7Ehy4KVYXfTGmLG",
	"packs/_source/drakes-shipyard/m3-a-scyk-heavy-fighter.yml|1r4jBr6JMShi7Uay|432d9ErUCmJyja3c",
	"packs/_source/drakes-shipyard/m3-a-scyk-heavy-fighter.yml|1r4jBr6JMShi7Uay|yyvOfGdjlDE5h6XA",
	"packs/_source/drakes-shipyard/m3-a-scyk-heavy-fighter.yml|1r4jBr6JMShi7Uay|oFJtp9JSjjnzsW4d",
	"packs/_source/drakes-shipyard/m3-a-scyk-heavy-fighter.yml|1r4jBr6JMShi7Uay|8Fn9i9bgxrUGTgKW",
	"packs/_source/drakes-shipyard/m3-a-scyk-heavy-fighter.yml|1r4jBr6JMShi7Uay|8wOptm20DvmxxglN",
	"packs/_source/drakes-shipyard/m3-a-scyk-tie-killer.yml|ZDQ7jvM0EdDgQCoy|x67WlJ6V5g4dAkuj",
	"packs/_source/drakes-shipyard/m3-a-scyk-tie-killer.yml|ZDQ7jvM0EdDgQCoy|SviQ6W8SzPUqCMg2",
	"packs/_source/drakes-shipyard/m3-a-scyk-tie-killer.yml|ZDQ7jvM0EdDgQCoy|8WuZM621AURr3s6N",
	"packs/_source/drakes-shipyard/m3-a-scyk-tie-killer.yml|ZDQ7jvM0EdDgQCoy|VZoHkcu3BfFwU1IA",
	"packs/_source/drakes-shipyard/m3-a-scyk-tie-killer.yml|ZDQ7jvM0EdDgQCoy|bPqg4OwriyOCJYPT",
	"packs/_source/drakes-shipyard/m3-a-scyk-tie-killer.yml|ZDQ7jvM0EdDgQCoy|cdW5ig1UQ9qdF6VA",
	"packs/_source/drakes-shipyard/m3-a-scyk-tie-killer.yml|ZDQ7jvM0EdDgQCoy|qiGgaNlIFyIJkb5E",
	"packs/_source/drakes-shipyard/m3-a-scyk-tie-killer.yml|ZDQ7jvM0EdDgQCoy|zUk7iwvd8clY65JA",
	"packs/_source/drakes-shipyard/m3-a-scyk-tie-killer.yml|ZDQ7jvM0EdDgQCoy|gHI4sjFw4zaFUhzZ",
	"packs/_source/drakes-shipyard/m3-a-scyk-tie-killer.yml|ZDQ7jvM0EdDgQCoy|et8v8zSZQySOzda7",
	"packs/_source/drakes-shipyard/m3-a-scyk-tie-killer.yml|ZDQ7jvM0EdDgQCoy|8xAbDxVjIycxkt4x",
	"packs/_source/drakes-shipyard/m3-a-scyk-tie-killer.yml|ZDQ7jvM0EdDgQCoy|skAElWq8SYSq8PL0",
	"packs/_source/drakes-shipyard/m3-a-scyk-tie-killer.yml|ZDQ7jvM0EdDgQCoy|Hxjx9scWhDYWRTFL",
	"packs/_source/drakes-shipyard/m4-c-dunelizard-fighter.yml|WTLl7aWFzvM6C5TV|N32Lyc4yNVottmJ8",
	"packs/_source/drakes-shipyard/m4-c-dunelizard-fighter.yml|WTLl7aWFzvM6C5TV|BtlpqnypTPjiXywY",
	"packs/_source/drakes-shipyard/m4-c-dunelizard-fighter.yml|WTLl7aWFzvM6C5TV|L83BuS3AEx5itcOh",
	"packs/_source/drakes-shipyard/m4-c-dunelizard-fighter.yml|WTLl7aWFzvM6C5TV|9dRoJfkYy46mUqM5",
	"packs/_source/drakes-shipyard/m4-c-dunelizard-fighter.yml|WTLl7aWFzvM6C5TV|Y7MVeK5J8pieHqIF",
	"packs/_source/drakes-shipyard/m4-c-dunelizard-fighter.yml|WTLl7aWFzvM6C5TV|tqyF8WqjyIRtVm11",
	"packs/_source/drakes-shipyard/m4-c-dunelizard-fighter.yml|WTLl7aWFzvM6C5TV|vQwBjy335FqDm7vE",
	"packs/_source/drakes-shipyard/m4-c-dunelizard-fighter.yml|WTLl7aWFzvM6C5TV|I9VwwWnUXq81fSVr",
	"packs/_source/drakes-shipyard/m4-c-dunelizard-fighter.yml|WTLl7aWFzvM6C5TV|AhDNJfCvT81uylzc",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|gOZrhnwRLobTZATI",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|wM0bwG9Dh3j4Wu6Z",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|s3Yd6Jlgjy1xYhOS",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|OXNvmIATendR1Tqs",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|NsuxCmaKIDofAnoV",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|row54kMPlZsWtDhz",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|ShJqGIu1KALHXDBD",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|A19WPeM0yk2AsKgA",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|Bme2QPIPSpuOZyxX",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|T7ojjoTEFyjwmGsT",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|iYUIGuVODDVzxwDp",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|kaWQFSK8CfGVGqtJ",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|lxHbdox3tzzh5qqu",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter-custom.yml|Ug33oVFGY7Qp3ufC|H4S4FEaWZxtPgb5p",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter.yml|lKELcx2njLSJrP5Q|mLWe96xPm5wzYZrw",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter.yml|lKELcx2njLSJrP5Q|iPOOvbZSBXPoF2jH",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter.yml|lKELcx2njLSJrP5Q|9KZTQpwj7SQuSZHX",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter.yml|lKELcx2njLSJrP5Q|4iOlIbsIZtR0nFKN",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter.yml|lKELcx2njLSJrP5Q|u4thQRf4tnxT7GzB",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter.yml|lKELcx2njLSJrP5Q|RIRU92JnCTFRYKXE",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter.yml|lKELcx2njLSJrP5Q|tXzOEq56jPI6eYQ4",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter.yml|lKELcx2njLSJrP5Q|Uhis2dQMpU7vC4Ir",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter.yml|lKELcx2njLSJrP5Q|XOmYKYhPuAEsr6pg",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter.yml|lKELcx2njLSJrP5Q|40KPOIRzBsrqjtL9",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter.yml|lKELcx2njLSJrP5Q|ndKxS3Zru7WRxg6Q",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter.yml|lKELcx2njLSJrP5Q|YQFZxuO6I3ulEkgI",
	"packs/_source/drakes-shipyard/n-1-naboo-starfighter.yml|lKELcx2njLSJrP5Q|mSpzNKm7gM9ejl1a",
	"packs/_source/drakes-shipyard/nantex-class-territorial-defense-starfighter.yml|bc83jDYGauWHxSjB|f3ZGrHXNI7DckApO",
	"packs/_source/drakes-shipyard/nantex-class-territorial-defense-starfighter.yml|bc83jDYGauWHxSjB|J77vS9ERXbeSHupj",
	"packs/_source/drakes-shipyard/nantex-class-territorial-defense-starfighter.yml|bc83jDYGauWHxSjB|MCUPZlQXdafT5Kxs",
	"packs/_source/drakes-shipyard/nantex-class-territorial-defense-starfighter.yml|bc83jDYGauWHxSjB|dsG0ECXmfhLqvpaz",
	"packs/_source/drakes-shipyard/nantex-class-territorial-defense-starfighter.yml|bc83jDYGauWHxSjB|nHTMkXmN6eLbCcC4",
	"packs/_source/drakes-shipyard/nantex-class-territorial-defense-starfighter.yml|bc83jDYGauWHxSjB|SSc63INUAYyDBnpz",
	"packs/_source/drakes-shipyard/nantex-class-territorial-defense-starfighter.yml|bc83jDYGauWHxSjB|bXtrZmGWnscwPCbI",
	"packs/_source/drakes-shipyard/probe-mate-hyperspace-pod.yml|eMVRexg9Xh6wKFUe|fVOHxekB9AZqjVYc",
	"packs/_source/drakes-shipyard/probe-mate-hyperspace-pod.yml|eMVRexg9Xh6wKFUe|2J0qt5s8LbGD2qgI",
	"packs/_source/drakes-shipyard/probe-mate-hyperspace-pod.yml|eMVRexg9Xh6wKFUe|xolkoKCGSQbql3F1",
	"packs/_source/drakes-shipyard/probe-mate-hyperspace-pod.yml|eMVRexg9Xh6wKFUe|T4PKxbpR9yF1J2g0",
	"packs/_source/drakes-shipyard/probe-mate-hyperspace-pod.yml|eMVRexg9Xh6wKFUe|aOUEpj96ZwPk0kU4",
	"packs/_source/drakes-shipyard/probe-mate-hyperspace-pod.yml|eMVRexg9Xh6wKFUe|W7jcOUevoNR7hVJN",
	"packs/_source/drakes-shipyard/rz-1-a-wing-interceptor.yml|bE202kqpwHSmKTaI|qoZ2X6MuofPfmUgv",
	"packs/_source/drakes-shipyard/rz-1-a-wing-interceptor.yml|bE202kqpwHSmKTaI|W4R20UozAwA4sekH",
	"packs/_source/drakes-shipyard/rz-1-a-wing-interceptor.yml|bE202kqpwHSmKTaI|U646AUvp6TKWADEn",
	"packs/_source/drakes-shipyard/rz-1-a-wing-interceptor.yml|bE202kqpwHSmKTaI|dHRbAp5OSjcCunQc",
	"packs/_source/drakes-shipyard/rz-1-a-wing-interceptor.yml|bE202kqpwHSmKTaI|YJhoYjFG8XZjCfnK",
	"packs/_source/drakes-shipyard/rz-1-a-wing-interceptor.yml|bE202kqpwHSmKTaI|YBcVO9rWapFAVRi5",
	"packs/_source/drakes-shipyard/rz-1-a-wing-interceptor.yml|bE202kqpwHSmKTaI|jTTlQvZtnaQQEOCj",
	"packs/_source/drakes-shipyard/rz-1-a-wing-interceptor.yml|bE202kqpwHSmKTaI|zJetXljs7FwrHoIS",
	"packs/_source/drakes-shipyard/rz-1-a-wing-interceptor.yml|bE202kqpwHSmKTaI|VXiZGUXFY2GDCdMp",
	"packs/_source/drakes-shipyard/rz-1-a-wing-interceptor.yml|bE202kqpwHSmKTaI|SercQR2KsQV4Op0N",
	"packs/_source/drakes-shipyard/rz-1-a-wing-interceptor.yml|bE202kqpwHSmKTaI|ot3GhuQq0rdS8zOR",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|kYGKWez0vb6JT3xf",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|JLRgL3oVCzM3Za63",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|H2a4Q082snIyosQ2",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|4c8BztYAE3vVpAWN",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|hZGtO2RrRh8QCOei",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|rl1VZqOc7iUfWPFu",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|ItC5E9eYf2yih5lt",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|SpEK8f5iIBYLqw1I",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|QJlb9w0y8a4EZnzh",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|5roJYEKYL2j0jVSz",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|BGRUrhmn4Y6wzg5k",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|f3EUzCvv2nQLujnp",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|ENeaAKYfL76TFi6X",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|OHueXqrL5cuTXqFT",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|2ZFc4acIOMrYM1j7",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|57y9m4dzdaVazrHX",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|PU4qj9svbvS5KqAT",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship-legendary.yml|0X0Aklqyf02hbyBb|ncGLW0Iui96Bjw0O",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship.yml|MsLkNfJG6uHWftYA|E8oEuOI9ZjlRcKWr",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship.yml|MsLkNfJG6uHWftYA|3s09kw9yaEq093cS",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship.yml|MsLkNfJG6uHWftYA|vjzpwChfM2v3bZiT",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship.yml|MsLkNfJG6uHWftYA|AdmIP5akMMC1mI9D",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship.yml|MsLkNfJG6uHWftYA|2zyRSwMkbLi3pw7c",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship.yml|MsLkNfJG6uHWftYA|ufgOaHCIhvZkFCiU",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship.yml|MsLkNfJG6uHWftYA|xh7Re3nA43XUIWcv",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship.yml|MsLkNfJG6uHWftYA|hhBcvdqMHL9TPUWg",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship.yml|MsLkNfJG6uHWftYA|pf8HbYodA7dbihrC",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship.yml|MsLkNfJG6uHWftYA|SXxlrVkjNiKHHKBW",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship.yml|MsLkNfJG6uHWftYA|iqNufs0hfetkGGQi",
	"packs/_source/drakes-shipyard/st-70-razor-crest-assault-ship.yml|MsLkNfJG6uHWftYA|Ak3LyUVrA2yk1JyP",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|CPQvDVZSEEfaKGAl",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|b688lmCKKSUp1Ff1",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|dfN7BQuDx2SEVu39",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|MPWQr8JvUNWjC9E4",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|sjG3jf8VMhuHd1db",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|m6YrTw78GwZEP56I",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|A43Pu56VlXeHmayv",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|NEAFQ3eOl2Adz4MY",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|v46qyIAawNvGa3IV",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|79MivNd0pykYkSJd",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|d5Twm2h93Z56a4zS",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|64rK46yCUa1OJ3LM",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|5sQLuVmeHxG3zRmH",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|O5XQK6UKsc3EWUGr",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|xMjVqHqaWmyhkqoi",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|0dqWCq8FNtsq4fqL",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform-prototype.yml|JmiBJf3Wa2OcBpte|ZFlQJ2Jj2QbcqNP1",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform.yml|O5nM5NhXI4h9WW9P|j5RWlDK6XM2g3qqb",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform.yml|O5nM5NhXI4h9WW9P|UTPjfCqffFmGJCIm",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform.yml|O5nM5NhXI4h9WW9P|uIiriMFOvQJtnmmx",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform.yml|O5nM5NhXI4h9WW9P|aF3PUyiKG7PDwsqg",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform.yml|O5nM5NhXI4h9WW9P|hFDHexUzE0LAU4Jh",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform.yml|O5nM5NhXI4h9WW9P|BDl5NSRnLkUCBV57",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform.yml|O5nM5NhXI4h9WW9P|Yo3bHUfDvyAGG0wl",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform.yml|O5nM5NhXI4h9WW9P|a1Epho5XieNLkQgP",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform.yml|O5nM5NhXI4h9WW9P|PTunNPw5A4GgK5fh",
	"packs/_source/drakes-shipyard/starviper-class-attack-platform.yml|O5nM5NhXI4h9WW9P|hCyxkv9tqQMU7hGl",
	"packs/_source/drakes-shipyard/starviper-mk-ii.yml|CvOvBLzu6qwpXdBM|QzOKCEqZSEu1Nf2G",
	"packs/_source/drakes-shipyard/starviper-mk-ii.yml|CvOvBLzu6qwpXdBM|Qg1d5tH3YBuGlFCB",
	"packs/_source/drakes-shipyard/starviper-mk-ii.yml|CvOvBLzu6qwpXdBM|LdYBdW7OPm93Zoey",
	"packs/_source/drakes-shipyard/starviper-mk-ii.yml|CvOvBLzu6qwpXdBM|wKfO4GSBmh3dCjXm",
	"packs/_source/drakes-shipyard/starviper-mk-ii.yml|CvOvBLzu6qwpXdBM|Ym41VYQgXIeF1ot0",
	"packs/_source/drakes-shipyard/starviper-mk-ii.yml|CvOvBLzu6qwpXdBM|9zVpiKoUeOTia1AC",
	"packs/_source/drakes-shipyard/starviper-mk-ii.yml|CvOvBLzu6qwpXdBM|E8pJa3SxQJ8D12EG",
	"packs/_source/drakes-shipyard/starviper-mk-ii.yml|CvOvBLzu6qwpXdBM|bWe3YbEWUbJAMqrN",
	"packs/_source/drakes-shipyard/starviper-mk-ii.yml|CvOvBLzu6qwpXdBM|uDGWklAHiXYNncOw",
	"packs/_source/drakes-shipyard/starviper-mk-ii.yml|CvOvBLzu6qwpXdBM|xwrVAfV80YBfeRLU",
	"packs/_source/drakes-shipyard/starviper-mk-ii.yml|CvOvBLzu6qwpXdBM|r7yp19OT7AgT5yZP",
	"packs/_source/drakes-shipyard/starviper-mk-ii.yml|CvOvBLzu6qwpXdBM|ubwUYfVeZAoUoLun",
	"packs/_source/drakes-shipyard/t-65-x-wing-starfighter.yml|KIYZmULvhfmiOrC2|anr73xbeqP5V9tLt",
	"packs/_source/drakes-shipyard/t-65-x-wing-starfighter.yml|KIYZmULvhfmiOrC2|klAITJyv2jRHoLoM",
	"packs/_source/drakes-shipyard/t-65-x-wing-starfighter.yml|KIYZmULvhfmiOrC2|e00SD1vawDdR5436",
	"packs/_source/drakes-shipyard/t-65-x-wing-starfighter.yml|KIYZmULvhfmiOrC2|b6CMSn0MH9gFpMpA",
	"packs/_source/drakes-shipyard/t-65-x-wing-starfighter.yml|KIYZmULvhfmiOrC2|2OUEjEIlpsnM3Cb3",
	"packs/_source/drakes-shipyard/t-65-x-wing-starfighter.yml|KIYZmULvhfmiOrC2|82HIXvPd3lnDWimO",
	"packs/_source/drakes-shipyard/t-65-x-wing-starfighter.yml|KIYZmULvhfmiOrC2|EYrDZItlZ8yR1h2o",
	"packs/_source/drakes-shipyard/t-65-x-wing-starfighter.yml|KIYZmULvhfmiOrC2|hlLD1zAA2kF5Qw05",
	"packs/_source/drakes-shipyard/t-65-x-wing-starfighter.yml|KIYZmULvhfmiOrC2|tbUiKjDySlNic0Zr",
	"packs/_source/drakes-shipyard/t-65-x-wing-starfighter.yml|KIYZmULvhfmiOrC2|gkW2IgvJzkyFVsXG",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|glT2U4i5liPNEQqL",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|JoEdmnSjy5gMFBvm",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|zmSMl5p4gjOQvFkQ",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|8C8uheAmXuwuPAzZ",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|h66gZ4rMvPds31Ha",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|x0iesKjtmafjpJAg",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|rhYWsIKo7TVRpAiq",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|fGZB91Q7lVOr38Kf",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|E5FK8qp8B68lBHu6",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|IOplaQ8KscgGHwUb",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|j2cQrcqWKjgceBm1",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|cNO9e1clPMkeBCoD",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|7vrGnRqHf2oj9KO9",
	"packs/_source/drakes-shipyard/tie-advanced-x1.yml|4LttOGkwmXWfxQhQ|5CI9Kgz4trYeUQFb",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|an14EMOi2cMSJX4o",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|RoNaxW6z6AczVjNU",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|YyzfRtT3nKp844ny",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|ipLCSOP8qQde2qbn",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|YNNyJJ7vPZOoIzGd",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|9xNq0eU6y2PXaU9B",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|tZqeZTiG8VZtRX97",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|Kwu5ckFx45qYRNXH",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|wjIx2ljdBnEjSMYC",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|M35HJNiC1G8SmJ2b",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|Vwi6V8gVsxWaQ1CW",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|5BtKbkF4BLK9UXot",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|jWTZmEW6EnDm8EBb",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|vMMYU9MCgIG2Vgi0",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|RhTNCQV7Np9HoMBH",
	"packs/_source/drakes-shipyard/tie-d-defender.yml|SuqAQa6LsY1hNJnI|xf1Q1BfBHTcTUBU8",
	"packs/_source/drakes-shipyard/tie-hu-hunter-multi-role-starfighter.yml|xAvg4N6BLjZ1AW8x|2VgJktYkM7t6elKg",
	"packs/_source/drakes-shipyard/tie-hu-hunter-multi-role-starfighter.yml|xAvg4N6BLjZ1AW8x|tayFWiXHCQddAsW9",
	"packs/_source/drakes-shipyard/tie-hu-hunter-multi-role-starfighter.yml|xAvg4N6BLjZ1AW8x|Hd2d01ZIVOZ1iLen",
	"packs/_source/drakes-shipyard/tie-hu-hunter-multi-role-starfighter.yml|xAvg4N6BLjZ1AW8x|QfK5e5GFgWChUStt",
	"packs/_source/drakes-shipyard/tie-hu-hunter-multi-role-starfighter.yml|xAvg4N6BLjZ1AW8x|uOGLrbkKv1wZShf3",
	"packs/_source/drakes-shipyard/tie-hu-hunter-multi-role-starfighter.yml|xAvg4N6BLjZ1AW8x|BqFpQSIqxMaOY0fN",
	"packs/_source/drakes-shipyard/tie-hu-hunter-multi-role-starfighter.yml|xAvg4N6BLjZ1AW8x|sq0qUjjrs7oViCbc",
	"packs/_source/drakes-shipyard/tie-hu-hunter-multi-role-starfighter.yml|xAvg4N6BLjZ1AW8x|3zffhRFD9pXfUrRJ",
	"packs/_source/drakes-shipyard/tie-hu-hunter-multi-role-starfighter.yml|xAvg4N6BLjZ1AW8x|zkMKQMLswFa0TLZz",
	"packs/_source/drakes-shipyard/tie-hu-hunter-multi-role-starfighter.yml|xAvg4N6BLjZ1AW8x|zBSG0BbuDTTnPCxu",
	"packs/_source/drakes-shipyard/tie-hu-hunter-multi-role-starfighter.yml|xAvg4N6BLjZ1AW8x|heRZiiou1SzXimhO",
	"packs/_source/drakes-shipyard/tie-in-interceptor.yml|ajAHTOE1nFbXxusm|8pS4qY7nPDveW1qi",
	"packs/_source/drakes-shipyard/tie-in-interceptor.yml|ajAHTOE1nFbXxusm|Jk0tJ9XbFRmAv0Yk",
	"packs/_source/drakes-shipyard/tie-in-interceptor.yml|ajAHTOE1nFbXxusm|Lft9WFdTr6W2NhJp",
	"packs/_source/drakes-shipyard/tie-in-interceptor.yml|ajAHTOE1nFbXxusm|SH0ort9DbN2rgp8j",
	"packs/_source/drakes-shipyard/tie-in-interceptor.yml|ajAHTOE1nFbXxusm|q2EUCmcTlvj7TERH",
	"packs/_source/drakes-shipyard/tie-in-interceptor.yml|ajAHTOE1nFbXxusm|nIOtrmwngCjT1xtG",
	"packs/_source/drakes-shipyard/tie-in-interceptor.yml|ajAHTOE1nFbXxusm|YooOZa7EIiOeFtfx",
	"packs/_source/drakes-shipyard/tie-in-interceptor.yml|ajAHTOE1nFbXxusm|BmSfV55oZTxb3ybM",
	"packs/_source/drakes-shipyard/tie-ln-starfighter.yml|CyMwaR1CkveFBSb7|jXUqhwnyNDIK7xnB",
	"packs/_source/drakes-shipyard/tie-ln-starfighter.yml|CyMwaR1CkveFBSb7|pDoyxBeEfAZ9QdLV",
	"packs/_source/drakes-shipyard/tie-ln-starfighter.yml|CyMwaR1CkveFBSb7|AYpxYozgjUoepmxO",
	"packs/_source/drakes-shipyard/tie-ln-starfighter.yml|CyMwaR1CkveFBSb7|1JZYeaI5hfiC28fA",
	"packs/_source/drakes-shipyard/tie-ln-starfighter.yml|CyMwaR1CkveFBSb7|GMIZZ1GWcQgs75n3",
	"packs/_source/drakes-shipyard/tie-ln-starfighter.yml|CyMwaR1CkveFBSb7|1aX1CnlzbfTxvznR",
	"packs/_source/drakes-shipyard/tie-ln-starfighter.yml|CyMwaR1CkveFBSb7|AZPrsww2dIYwJ04q",
	"packs/_source/drakes-shipyard/tie-sa-bomber-mine-layer.yml|PgRFaYvoWARHlfUS|L8ox0AOlZUFAP9az",
	"packs/_source/drakes-shipyard/tie-sa-bomber-mine-layer.yml|PgRFaYvoWARHlfUS|dInPSreXLOBCoVlI",
	"packs/_source/drakes-shipyard/tie-sa-bomber-mine-layer.yml|PgRFaYvoWARHlfUS|Klf9y5HE9cxLN1Kf",
	"packs/_source/drakes-shipyard/tie-sa-bomber-mine-layer.yml|PgRFaYvoWARHlfUS|65Zgw8aKo9ezAhCB",
	"packs/_source/drakes-shipyard/tie-sa-bomber-mine-layer.yml|PgRFaYvoWARHlfUS|qa16bVKrSMulC33L",
	"packs/_source/drakes-shipyard/tie-sa-bomber-mine-layer.yml|PgRFaYvoWARHlfUS|C02qjXxRknycuTeT",
	"packs/_source/drakes-shipyard/tie-sa-bomber-missile-boat.yml|Yj3aH9iBLduHKl4q|uoUfNl8nfYRKTPWt",
	"packs/_source/drakes-shipyard/tie-sa-bomber-missile-boat.yml|Yj3aH9iBLduHKl4q|ehDcOQirr8BG1uxu",
	"packs/_source/drakes-shipyard/tie-sa-bomber-missile-boat.yml|Yj3aH9iBLduHKl4q|qTRuQnl0idiytjMX",
	"packs/_source/drakes-shipyard/tie-sa-bomber-missile-boat.yml|Yj3aH9iBLduHKl4q|CUNOatGgwUz0uVce",
	"packs/_source/drakes-shipyard/tie-sa-bomber-missile-boat.yml|Yj3aH9iBLduHKl4q|TFv2j77JkeyMe7Au",
	"packs/_source/drakes-shipyard/tie-sa-bomber-missile-boat.yml|Yj3aH9iBLduHKl4q|N3uMGYm0G1kCgkoh",
	"packs/_source/drakes-shipyard/tie-sa-bomber.yml|Y36w1nGrrDghf1bq|Oair6YHT5Db90Iru",
	"packs/_source/drakes-shipyard/tie-sa-bomber.yml|Y36w1nGrrDghf1bq|gDbjmBdbzYTCq95h",
	"packs/_source/drakes-shipyard/tie-sa-bomber.yml|Y36w1nGrrDghf1bq|eoJikkse9YPTQmdO",
	"packs/_source/drakes-shipyard/tie-sa-bomber.yml|Y36w1nGrrDghf1bq|N7fhwadaxu5XUtcG",
	"packs/_source/drakes-shipyard/tie-sa-bomber.yml|Y36w1nGrrDghf1bq|nZwJqAdJiEFapv7O",
	"packs/_source/drakes-shipyard/tie-sa-bomber.yml|Y36w1nGrrDghf1bq|Fu3md72dvHSwVDtq",
	"packs/_source/drakes-shipyard/tye-wing.yml|WUJlWDH4enxYeX4n|WrfYSGRmhxbGkLdZ",
	"packs/_source/drakes-shipyard/tye-wing.yml|WUJlWDH4enxYeX4n|9YCrlV9h0DVVchsH",
	"packs/_source/drakes-shipyard/tye-wing.yml|WUJlWDH4enxYeX4n|P27Zgom0jYKrrVVr",
	"packs/_source/drakes-shipyard/tye-wing.yml|WUJlWDH4enxYeX4n|kxcQNbkYrS3opty9",
	"packs/_source/drakes-shipyard/tye-wing.yml|WUJlWDH4enxYeX4n|4vWORb75RSYbuPu7",
	"packs/_source/drakes-shipyard/u-wing-starfighter-support-craft-ut-60d.yml|8rxZGWKJJ2XbyhNl|cyLnJFumEJriOX44",
	"packs/_source/drakes-shipyard/u-wing-starfighter-support-craft-ut-60d.yml|8rxZGWKJJ2XbyhNl|ZbLz5nCvu0yzSn22",
	"packs/_source/drakes-shipyard/u-wing-starfighter-support-craft-ut-60d.yml|8rxZGWKJJ2XbyhNl|L84UThMvDvqf6H1M",
	"packs/_source/drakes-shipyard/u-wing-starfighter-support-craft-ut-60d.yml|8rxZGWKJJ2XbyhNl|xOJu9xzLXuiUIdJN",
	"packs/_source/drakes-shipyard/u-wing-starfighter-support-craft-ut-60d.yml|8rxZGWKJJ2XbyhNl|PFTDOmfLGSj16hOA",
	"packs/_source/drakes-shipyard/u-wing-starfighter-support-craft-ut-60d.yml|8rxZGWKJJ2XbyhNl|8LzzS8yrqrbF4q8S",
	"packs/_source/drakes-shipyard/u-wing-starfighter-support-craft-ut-60d.yml|8rxZGWKJJ2XbyhNl|nNmvWRzLgR4CFx4y",
	"packs/_source/drakes-shipyard/u-wing-starfighter-support-craft-ut-60d.yml|8rxZGWKJJ2XbyhNl|QGnsGnvvr3bFRZMx",
	"packs/_source/drakes-shipyard/u-wing-starfighter-support-craft-ut-60d.yml|8rxZGWKJJ2XbyhNl|dpHlRstZ9Hcydz95",
	"packs/_source/drakes-shipyard/u-wing-starfighter-support-craft-ut-60d.yml|8rxZGWKJJ2XbyhNl|0YHtiCLTILH82zs8",
	"packs/_source/drakes-shipyard/u-wing-starfighter-support-craft-ut-60d.yml|8rxZGWKJJ2XbyhNl|NvitKUb39KW4eyZ4",
	"packs/_source/drakes-shipyard/v-wing-starfighter-alpha-3-nimbus-class.yml|qiAPxTVe39l5Su3w|RTCJXmc1RgNz96L6",
	"packs/_source/drakes-shipyard/v-wing-starfighter-alpha-3-nimbus-class.yml|qiAPxTVe39l5Su3w|8YxiAr729IwvOdHu",
	"packs/_source/drakes-shipyard/v-wing-starfighter-alpha-3-nimbus-class.yml|qiAPxTVe39l5Su3w|OrJkKOXrBO2y7rkH",
	"packs/_source/drakes-shipyard/v-wing-starfighter-alpha-3-nimbus-class.yml|qiAPxTVe39l5Su3w|b2flqdPD8hDMUkMT",
	"packs/_source/drakes-shipyard/v-wing-starfighter-alpha-3-nimbus-class.yml|qiAPxTVe39l5Su3w|73EwhG7ZaVVZRhaR",
	"packs/_source/drakes-shipyard/v-wing-starfighter-alpha-3-nimbus-class.yml|qiAPxTVe39l5Su3w|7afbD0b0cAnVCu9x",
	"packs/_source/drakes-shipyard/v-wing-starfighter-alpha-3-nimbus-class.yml|qiAPxTVe39l5Su3w|XIgdEIBovODRLIO9",
	"packs/_source/drakes-shipyard/v-wing-starfighter-alpha-3-nimbus-class.yml|qiAPxTVe39l5Su3w|PA2hYp2SdgfbWsZ7",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|puqoCCeVf9dgQqIC",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|QI0xMQ8ITBupJPf0",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|wRaHBSkIYjzATkjl",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|2nio9IpTizFQXeus",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|bi0miZDg8RrMTNKk",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|pyxMreM4ToLRjzDK",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|jwfMsHNzr9jS83Tx",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|X24v4TXeQo4MEdai",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|JgLYsj7DGf5jtESj",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|1w8lMynjg4QbcwDY",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|kY5RmJyCPiC6AWSh",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|Km1QmXyEADj5IZtq",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|B04tUb04JuVXtejJ",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|2o1HlMCvgbLdOlo3",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|mcAyeudppJTTJ6DA",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|uIUGgc2tBLGQkN5Q",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|BmEuqNr77v2gzHyL",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|Y5sOSISzMVeG57WX",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|G8xfPlaI3N91Beed",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|88MwQBqUPQZUcb3e",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter-modified.yml|474155zgDsAVDg5N|uKuRZYJV0aabrzHB",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter.yml|GWyrReJAN9ByMpoa|puqoCCeVf9dgQqIC",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter.yml|GWyrReJAN9ByMpoa|QI0xMQ8ITBupJPf0",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter.yml|GWyrReJAN9ByMpoa|wRaHBSkIYjzATkjl",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter.yml|GWyrReJAN9ByMpoa|2nio9IpTizFQXeus",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter.yml|GWyrReJAN9ByMpoa|bi0miZDg8RrMTNKk",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter.yml|GWyrReJAN9ByMpoa|pyxMreM4ToLRjzDK",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter.yml|GWyrReJAN9ByMpoa|jwfMsHNzr9jS83Tx",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter.yml|GWyrReJAN9ByMpoa|X24v4TXeQo4MEdai",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter.yml|GWyrReJAN9ByMpoa|JgLYsj7DGf5jtESj",
	"packs/_source/drakes-shipyard/vcx-100-light-freighter.yml|GWyrReJAN9ByMpoa|1w8lMynjg4QbcwDY",
	"packs/_source/drakes-shipyard/vcx-series-auxiliary-starfighter.yml|DaTKXigeX6pTNsO2|WCwRJSe4efctOPL2",
	"packs/_source/drakes-shipyard/vcx-series-auxiliary-starfighter.yml|DaTKXigeX6pTNsO2|V6EFe5s72G9KZ67l",
	"packs/_source/drakes-shipyard/vcx-series-auxiliary-starfighter.yml|DaTKXigeX6pTNsO2|AGqp2t7CtSuFsIJu",
	"packs/_source/drakes-shipyard/vcx-series-auxiliary-starfighter.yml|DaTKXigeX6pTNsO2|BIq29e3rA02wg8kL",
	"packs/_source/drakes-shipyard/vcx-series-auxiliary-starfighter.yml|DaTKXigeX6pTNsO2|p9DsXvJpgaS56zo9",
	"packs/_source/drakes-shipyard/vcx-series-auxiliary-starfighter.yml|DaTKXigeX6pTNsO2|EbqZQjNtWzbn9RwU",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|yNYyypdsX0hvOVzO",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|HMdOyjDhLZHQNWeJ",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|R8JzdqJ7Il1Nv50d",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|rXA8DCp38eIMwKRg",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|ymMhMf30ZW5pvX7B",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|27QpzNbdeeD88EPF",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|GT6qsSK6HRxnkqiK",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|Z1bDdVEEyDgbMaJU",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|PO6xTzJ5jreh3cEj",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|N4cFrKPvU3GonYdF",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|JJaPf5oDzctaE2Ux",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|1LqDboGNiMi4NeAq",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|t9dFXxuxKa4F2Ifr",
	"packs/_source/drakes-shipyard/vt-49-decimator.yml|0PlzcuyrY9qaDM4q|Z1ZhwWFLZo8qzfPk",
	"packs/_source/drakes-shipyard/vulture-droid-cis.yml|8yjv1R0XJQ7QPbmy|8Ln4hvzoCi15ayy9",
	"packs/_source/drakes-shipyard/vulture-droid-cis.yml|8yjv1R0XJQ7QPbmy|oRHlahqDCcPBScNR",
	"packs/_source/drakes-shipyard/vulture-droid-cis.yml|8yjv1R0XJQ7QPbmy|ijORi3oV727Si3Ok",
	"packs/_source/drakes-shipyard/vulture-droid-cis.yml|8yjv1R0XJQ7QPbmy|bqnrrUlfp983zSJx",
	"packs/_source/drakes-shipyard/vulture-droid-cis.yml|8yjv1R0XJQ7QPbmy|CqDryHIZYQpMaASv",
	"packs/_source/drakes-shipyard/wander-class-jump-freighter.yml|otFcy4156sFvukFS|mGhPgBnQo6SvaJ76",
	"packs/_source/drakes-shipyard/wander-class-jump-freighter.yml|otFcy4156sFvukFS|Ju9HGTL5AohDQnwL",
	"packs/_source/drakes-shipyard/wander-class-jump-freighter.yml|otFcy4156sFvukFS|0nKrRJU5TaUH7Y7c",
	"packs/_source/drakes-shipyard/wander-class-jump-freighter.yml|otFcy4156sFvukFS|UmD0rmj4LMoPYQTG",
	"packs/_source/drakes-shipyard/wander-class-jump-freighter.yml|otFcy4156sFvukFS|unSqNuy5hEkTzyxl",
	"packs/_source/drakes-shipyard/wander-class-jump-freighter.yml|otFcy4156sFvukFS|8ryQoKDaFKLsgq7q",
	"packs/_source/drakes-shipyard/wander-class-jump-freighter.yml|otFcy4156sFvukFS|LNTzrzsDlWvnh84K",
	"packs/_source/drakes-shipyard/wayfarer-class-medium-transport.yml|edvK3te9EEg9kZcU|OMF901t893Rq0rr2",
	"packs/_source/drakes-shipyard/wayfarer-class-medium-transport.yml|edvK3te9EEg9kZcU|W1niQT5RtWBvVxR7",
	"packs/_source/drakes-shipyard/wayfarer-class-medium-transport.yml|edvK3te9EEg9kZcU|VcwXJ67MrjQwPXhY",
	"packs/_source/drakes-shipyard/wayfarer-class-medium-transport.yml|edvK3te9EEg9kZcU|fKIREhx6YO7jp21L",
	"packs/_source/drakes-shipyard/wayfarer-class-medium-transport.yml|edvK3te9EEg9kZcU|WjdxQoq4M1JnBsRv",
	"packs/_source/drakes-shipyard/wayfarer-class-medium-transport.yml|edvK3te9EEg9kZcU|jA7IrOZb0STHiCbr",
	"packs/_source/drakes-shipyard/wayfarer-class-medium-transport.yml|edvK3te9EEg9kZcU|kkcraQVNDjSr13SV",
	"packs/_source/drakes-shipyard/wayfarer-class-medium-transport.yml|edvK3te9EEg9kZcU|D8KwkvoUoq0yKgrQ",
	"packs/_source/drakes-shipyard/wayfarer-class-medium-transport.yml|edvK3te9EEg9kZcU|mJ5FuFXCuiPo3plJ",
	"packs/_source/drakes-shipyard/wayfarer-class-medium-transport.yml|edvK3te9EEg9kZcU|YhYLowi68YjHLn9I",
	"packs/_source/drakes-shipyard/wayfarer-class-medium-transport.yml|edvK3te9EEg9kZcU|Dcph9ytoz3rbPACG",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|IcykEKFgVqNkYXF7",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|idjznGURXdgaRebq",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|jsd8pT61MpIgNL4G",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|Qx6oEPV4XOMEZ0yP",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|9ATb7vTCSPqc7EFI",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|1pUsUPCDWZwspznf",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|fGL546dn67PgsInk",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|S9jwQ74mhHDSqA8e",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|LwyVzYC8DNfAVAfz",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|a3TpXd1Zd2gkFQeU",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|9sCbwpcnJFo71IJQ",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|AuzARrr0vzoJvB4Y",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|rCOVh9G6uSbtjBYK",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|GHidnjylWfESu4uy",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|VJcG63Uc61VV1U8X",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|FUHG1VaHp97hWRlI",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|LfyTEPrnsQ3SwTRp",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|s3bblonbyP2NCn9z",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|scGjardEsXYdNrWa",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|ZHSA9E1EsJCntI3A",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|RrZqYNX5W6zCMVPC",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|ABYQtXtff8hFv45M",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|0RqQZ9CSltYsT6wP",
	"packs/_source/drakes-shipyard/x-70b-phantom-class-prototype.yml|CXI1rlrERTsjeoSo|a4PKcA37EFxhLY7t",
	"packs/_source/drakes-shipyard/x-ceptor.yml|U7Pstus7Kt5jGaxq|L99ChHSw8jgp8vi6",
	"packs/_source/drakes-shipyard/x-ceptor.yml|U7Pstus7Kt5jGaxq|OLGNdbflucgq1FBz",
	"packs/_source/drakes-shipyard/x-ceptor.yml|U7Pstus7Kt5jGaxq|DFtnPfeUkRR0sGCK",
	"packs/_source/drakes-shipyard/x-ceptor.yml|U7Pstus7Kt5jGaxq|XKY2cCdVxJpoO37r",
	"packs/_source/drakes-shipyard/x-ceptor.yml|U7Pstus7Kt5jGaxq|zcTRJ2sWUEQckgsc",
	"packs/_source/drakes-shipyard/x-tie-fighter.yml|Z9GLGFS5bmGEF188|A2j0QCvPsfr4nYEf",
	"packs/_source/drakes-shipyard/x-tie-fighter.yml|Z9GLGFS5bmGEF188|Txu0PpjwKlGtbSPu",
	"packs/_source/drakes-shipyard/x-tie-fighter.yml|Z9GLGFS5bmGEF188|mDjNi2u31oeRFPfD",
	"packs/_source/drakes-shipyard/x-tie-fighter.yml|Z9GLGFS5bmGEF188|3GWG87QdQ5CtKKwz",
	"packs/_source/drakes-shipyard/x-tie-fighter.yml|Z9GLGFS5bmGEF188|nbGwbLhG6cvITMtE",
	"packs/_source/drakes-shipyard/x-tie-fighter.yml|Z9GLGFS5bmGEF188|T0oZOu3n7O31Enep",
	"packs/_source/drakes-shipyard/x-wing-starfighter-advanced.yml|1iE0TPVtIaqWPKRH|84AuHAAEtakV33Fj",
	"packs/_source/drakes-shipyard/x-wing-starfighter-advanced.yml|1iE0TPVtIaqWPKRH|zcJKXwbRYxeqqK2I",
	"packs/_source/drakes-shipyard/x-wing-starfighter-advanced.yml|1iE0TPVtIaqWPKRH|IdBlph7sBDurqksG",
	"packs/_source/drakes-shipyard/x-wing-starfighter-advanced.yml|1iE0TPVtIaqWPKRH|9pUBnalOwNMfOurK",
	"packs/_source/drakes-shipyard/x-wing-starfighter-advanced.yml|1iE0TPVtIaqWPKRH|EdTxN59VNhyskz4z",
	"packs/_source/drakes-shipyard/x-wing-starfighter-advanced.yml|1iE0TPVtIaqWPKRH|hClJBQlYiJTmXWR8",
	"packs/_source/drakes-shipyard/x-wing-starfighter-advanced.yml|1iE0TPVtIaqWPKRH|hhZmOEZscONs8cLX",
	"packs/_source/drakes-shipyard/x-wing-starfighter-advanced.yml|1iE0TPVtIaqWPKRH|7BgpD2POeqJkxtkI",
	"packs/_source/drakes-shipyard/x-wing-starfighter-advanced.yml|1iE0TPVtIaqWPKRH|tvDfOg52wvlwe8UL",
	"packs/_source/drakes-shipyard/x-wing-starfighter-advanced.yml|1iE0TPVtIaqWPKRH|3nXFozusI5Jjj4d0",
	"packs/_source/drakes-shipyard/x-wing-starfighter-advanced.yml|1iE0TPVtIaqWPKRH|LFPMwbeLk6imYznT",
	"packs/_source/drakes-shipyard/x-wing-starfighter-advanced.yml|1iE0TPVtIaqWPKRH|orWtrxT3iqkIc0hG",
	"packs/_source/drakes-shipyard/y-tie-fighter.yml|2TkLW4TUmB9mulsx|2cozGFISISyBfy7I",
	"packs/_source/drakes-shipyard/y-tie-fighter.yml|2TkLW4TUmB9mulsx|9o3e3r2LK2RGEghb",
	"packs/_source/drakes-shipyard/y-tie-fighter.yml|2TkLW4TUmB9mulsx|4VwD409FNLfTalA3",
	"packs/_source/drakes-shipyard/y-tie-fighter.yml|2TkLW4TUmB9mulsx|HV2RBb7rqkOyIyVk",
	"packs/_source/drakes-shipyard/y-tie-fighter.yml|2TkLW4TUmB9mulsx|1K7ur8taaVhPGfA3",
	"packs/_source/drakes-shipyard/y-wing-starfighter-btl-b-s3.yml|lHFf29mWBxshx6HO|D6EDVJbOtSXTBQvf",
	"packs/_source/drakes-shipyard/y-wing-starfighter-btl-b-s3.yml|lHFf29mWBxshx6HO|43yoew0TIBbRHi1e",
	"packs/_source/drakes-shipyard/y-wing-starfighter-btl-b-s3.yml|lHFf29mWBxshx6HO|EaCmBrm9fYJb8BPJ",
	"packs/_source/drakes-shipyard/y-wing-starfighter-btl-b-s3.yml|lHFf29mWBxshx6HO|FAjjz842DXdwMi21",
	"packs/_source/drakes-shipyard/y-wing-starfighter-btl-b-s3.yml|lHFf29mWBxshx6HO|2QXJlRthtAIh2Xlh",
	"packs/_source/drakes-shipyard/y-wing-starfighter-btl-b-s3.yml|lHFf29mWBxshx6HO|PccFigJ1MOswLVcz",
	"packs/_source/drakes-shipyard/y-wing-starfighter-btl-b-s3.yml|lHFf29mWBxshx6HO|XgpAGNZ7ptrEWE61",
	"packs/_source/drakes-shipyard/y-wing-starfighter-btl-b-s3.yml|lHFf29mWBxshx6HO|skuWIdCRS90FR4hL",
	"packs/_source/drakes-shipyard/y-wing-starfighter-btl-b-s3.yml|lHFf29mWBxshx6HO|1IDDpe40oYNvRdTQ",
	"packs/_source/drakes-shipyard/y-wing-starfighter-btl-b-s3.yml|lHFf29mWBxshx6HO|HracsCMXwxeWy8Fa",
	"packs/_source/drakes-shipyard/y-wing-starfighter-btl-b-s3.yml|lHFf29mWBxshx6HO|HdWxyHfOf07lwGcV",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|bNzLrppHuRKWiVAX",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|3JFcGHSof5LczmvF",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|oIYySOeZn7RRlC8w",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|XJML619RBZIg6FvR",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|O0OjCtQ7IqKUe5TE",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|dNxVo3m0URWc5mnI",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|Y4SkOCtVhJqYd3Qr",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|ePCoW2af1tnxaYEE",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|mbDCMRw1mb1LNrzM",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|sZJz6agzD7ryywKU",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|TVSjH97M3AJrFkZW",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|DzuXXkLX3fZOqZUz",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|kBHZ1ZabtXtbnMC8",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|bG0MLZH2VVkMbSMh",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|IX0mgR33a06h8vU2",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|dgNapMWk6tVqyIMe",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|x34A1eCub9qkC6OJ",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|TiyLC0QvmQwZaURl",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|nNV0JCGFLYpG8RiD",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|0rB4tzZbx36oxxCR",
	"packs/_source/drakes-shipyard/yt-1300-heavily-modified.yml|QqgnknDyNxtsaImK|D9wtwGxFTGpbmGFo",
	"packs/_source/drakes-shipyard/yt-1300-modified.yml|t5oz29L2QV5lFlYr|n2RFwZnGRqHIWWCb",
	"packs/_source/drakes-shipyard/yt-1300-modified.yml|t5oz29L2QV5lFlYr|fEMADwrbuUSnypVI",
	"packs/_source/drakes-shipyard/yt-1300-modified.yml|t5oz29L2QV5lFlYr|3f0gXs99DxsGjdk5",
	"packs/_source/drakes-shipyard/yt-1300-modified.yml|t5oz29L2QV5lFlYr|EGgRDaXvMZ45KXXl",
	"packs/_source/drakes-shipyard/yt-1300-modified.yml|t5oz29L2QV5lFlYr|ke84ePLcaCjmjKRr",
	"packs/_source/drakes-shipyard/yt-1300-modified.yml|t5oz29L2QV5lFlYr|MbVc8X6L0DU5wcam",
	"packs/_source/drakes-shipyard/yt-1300-modified.yml|t5oz29L2QV5lFlYr|vpIa0t57FzIpIgZQ",
	"packs/_source/drakes-shipyard/yt-1300-modified.yml|t5oz29L2QV5lFlYr|7Yif62PY4KKGByZI",
	"packs/_source/drakes-shipyard/yt-1300-modified.yml|t5oz29L2QV5lFlYr|uioacvn2TTI8SChk",
	"packs/_source/drakes-shipyard/yt-1300-modified.yml|t5oz29L2QV5lFlYr|dW4llebtKXuOsCwx",
	"packs/_source/drakes-shipyard/yt-1300-modified.yml|t5oz29L2QV5lFlYr|y2eifozyyLk0vjGl",
	"packs/_source/drakes-shipyard/yt-1300f-light-freighter.yml|BZkA48rDJKsKCX3C|PNvm86Qr7RWMOmzv",
	"packs/_source/drakes-shipyard/yt-1300f-light-freighter.yml|BZkA48rDJKsKCX3C|N8HVvF826Y404FTJ",
	"packs/_source/drakes-shipyard/yt-1300f-light-freighter.yml|BZkA48rDJKsKCX3C|804vuEjBOU20IGbR",
	"packs/_source/drakes-shipyard/yt-1300f-light-freighter.yml|BZkA48rDJKsKCX3C|7My7CmIH7Ob93BQq",
	"packs/_source/drakes-shipyard/yt-1300f-light-freighter.yml|BZkA48rDJKsKCX3C|2if3eap1jvL2K1LF",
	"packs/_source/drakes-shipyard/yt-1300f-light-freighter.yml|BZkA48rDJKsKCX3C|000tdG2vzNqSscQB",
	"packs/_source/drakes-shipyard/yt-1300f-light-freighter.yml|BZkA48rDJKsKCX3C|OcPMtS4zgkhmJJbw",
	"packs/_source/drakes-shipyard/yv-929-armed-freighter.yml|LY8lY6F9nVqz7Km1|8BISPbFmMZG7uxpr",
	"packs/_source/drakes-shipyard/yv-929-armed-freighter.yml|LY8lY6F9nVqz7Km1|5mAxzpgJxX4b7EFd",
	"packs/_source/drakes-shipyard/yv-929-armed-freighter.yml|LY8lY6F9nVqz7Km1|L7oIZAJUtG2QswaL",
	"packs/_source/drakes-shipyard/yv-929-armed-freighter.yml|LY8lY6F9nVqz7Km1|E4FHKPxloPjzzjp7",
	"packs/_source/drakes-shipyard/yv-929-armed-freighter.yml|LY8lY6F9nVqz7Km1|LhFCwpKS84jBhXjp",
	"packs/_source/drakes-shipyard/yv-929-armed-freighter.yml|LY8lY6F9nVqz7Km1|8FooIS2ZlzT4T0hC",
	"packs/_source/drakes-shipyard/z-95-headhunter.yml|Y0qIHIctfGjGcgmI|8BwoErkXYcD46i0o",
	"packs/_source/drakes-shipyard/z-95-headhunter.yml|Y0qIHIctfGjGcgmI|umnH1umbjzxE0Mmv",
	"packs/_source/drakes-shipyard/z-95-headhunter.yml|Y0qIHIctfGjGcgmI|89pvvAJcLO2EoLGd",
	"packs/_source/drakes-shipyard/z-95-headhunter.yml|Y0qIHIctfGjGcgmI|og7bv62uww7CQcRv",
	"packs/_source/drakes-shipyard/z-95-headhunter.yml|Y0qIHIctfGjGcgmI|sDo4d54S4NS1EfOD",
	"packs/_source/drakes-shipyard/z-ceptor.yml|pzpo8Hny7SqtrP7C|iQ55TDU2QaSWnqil",
	"packs/_source/drakes-shipyard/z-ceptor.yml|pzpo8Hny7SqtrP7C|dCnqsjiuaSGIZysL",
	"packs/_source/drakes-shipyard/z-ceptor.yml|pzpo8Hny7SqtrP7C|239MXHYmPpAgo9hH",
	"packs/_source/drakes-shipyard/z-ceptor.yml|pzpo8Hny7SqtrP7C|8BKEuA5IAfLhLWID",
	"packs/_source/drakes-shipyard/z-tie-fighter.yml|pzL1SI9raUYuSpv8|tbbQwr8gu1zyDT2A",
	"packs/_source/drakes-shipyard/z-tie-fighter.yml|pzL1SI9raUYuSpv8|RQBduBnpN25T5LAT",
	"packs/_source/drakes-shipyard/z-tie-fighter.yml|pzL1SI9raUYuSpv8|R5r2jMyBiNKRSQCZ",
	"packs/_source/drakes-shipyard/z-tie-fighter.yml|pzL1SI9raUYuSpv8|rbGofxzpM6OUnTFG",
	"packs/_source/drakes-shipyard/z-tie-fighter.yml|pzL1SI9raUYuSpv8|lMIr8nRWTKePEMg6"
];
const EXPECTED_KEY_SET = new Set(EXPECTED_KEYS);


function sameJson(left, right) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function stable(value) {
	if ( Array.isArray(value) ) return value.map(stable);
	if ( value && typeof value === "object" ) {
		const out = {};
		for ( const key of Object.keys(value).sort() ) out[key] = stable(value[key]);
		return out;
	}
	return value ?? null;
}

function manifestKey(file, actorId, effectId) {
	return `${SOURCE_PREFIX}/${file}|${actorId}|${effectId}`;
}

function parseOrigin(origin) {
	const match = String(origin ?? "").match(/^Actor\.([A-Za-z0-9]+)\.Item\.([A-Za-z0-9]+)$/);
	if ( !match ) return null;
	return { actorId: match[1], itemId: match[2] };
}

function normalizeDuration(duration) {
	const out = {};
	for ( const key of Object.keys(duration ?? {}).sort() ) {
		const value = duration[key];
		if ( value === null || value === undefined ) continue;
		if ( key === "startTime" && value === 0 ) continue;
		out[key] = value;
	}
	return out;
}

function normalizeFlags(flags) {
	const copy = stable(flags ?? {});
	if ( copy?.core?.statusId === "" ) delete copy.core.statusId;
	if ( copy.core && Object.keys(copy.core).length === 0 ) delete copy.core;
	return copy;
}

function changeSignature(change) {
	return JSON.stringify([change?.key ?? null, Number(change?.mode), String(change?.value)]);
}

function sortedChanges(effect) {
	return (effect?.changes ?? []).map(changeSignature).sort();
}

function changeView(change) {
	return {
		key: change?.key ?? null,
		mode: Number(change?.mode),
		value: String(change?.value),
		priority: change?.priority ?? null
	};
}

function unexpectedChangeFields(effect) {
	const found = [];
	for ( const change of effect?.changes ?? [] ) {
		for ( const key of Object.keys(change ?? {}) ) {
			if ( !CHANGE_FIELDS.has(key) ) found.push(key);
		}
	}
	return found;
}

function effectIdentity(effect) {
	return {
		name: effect?.name ?? "",
		description: effect?.description ?? "",
		img: effect?.img ?? "",
		tint: effect?.tint ?? "",
		type: effect?.type ?? "",
		system: stable(effect?.system ?? {}),
		activities: stable(effect?.activities ?? null),
		disabled: effect?.disabled ?? false,
		statuses: [...(effect?.statuses ?? [])].sort(),
		duration: normalizeDuration(effect?.duration),
		flags: normalizeFlags(effect?.flags),
		changes: sortedChanges(effect)
	};
}

function sameIdentity(left, right) {
	return sameJson(effectIdentity(left), effectIdentity(right));
}

function prioritiesDiffer(left, right) {
	const rightBySig = new Map((right?.changes ?? []).map(change => [changeSignature(change), change?.priority ?? null]));
	return (left?.changes ?? []).some(change => (change?.priority ?? null) !== rightBySig.get(changeSignature(change)));
}

function isCr90(file, actor, effect) {
	return file === CR90.file && actor?._id === CR90.actorId && effect?._id === CR90.effectId;
}

function plainText(value) {
	return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function itemDescription(item) {
	return [
		item?.system?.description?.value,
		item?.flags?.sw5e?.legacyStarshipMod?.description?.value
	].map(plainText).filter(Boolean).join(" ");
}

function descriptionSupportsPenalty(item, bonusKey) {
	const ability = ABILITY_NAMES[bonusKey];
	const text = itemDescription(item);
	return Boolean(ability) && text.includes(ability) && /decreases by 1/i.test(text);
}

function matchesChange(change, expected) {
	return change?.key === expected.key
		&& Number(change?.mode) === expected.mode
		&& String(change?.value) === expected.value;
}

function newlineOf(text) {
	return text.includes("\r\n") ? "\r\n" : "\n";
}

function joinLines(lines, original) {
	const nl = newlineOf(original);
	const trailingNewline = original.endsWith("\n");
	let next = lines.join(nl);
	if ( trailingNewline && !next.endsWith(nl) ) next += nl;
	if ( !trailingNewline && next.endsWith(nl) ) next = next.slice(0, -nl.length);
	return next;
}

function removeTopLevelEntries(text, ids) {
	const lines = text.split(/\r?\n/);
	const wanted = new Set(ids);
	const found = new Map();
	const kept = [];
	let skipping = false;
	for ( const line of lines ) {
		const match = line.match(/^  - _id: ([A-Za-z0-9]+)$/);
		if ( match ) {
			skipping = wanted.has(match[1]);
			if ( skipping ) {
				found.set(match[1], (found.get(match[1]) ?? 0) + 1);
				continue;
			}
		} else if ( skipping ) {
			if ( /^[A-Za-z_]/.test(line) ) skipping = false;
			else continue;
		}
		kept.push(line);
	}
	return { text: joinLines(kept, text), found };
}

function preserveEmptyCollection(text, key) {
	const lines = text.split(/\r?\n/);
	for ( let index = 0; index < lines.length; index += 1 ) {
		if ( lines[index] !== `${key}:` ) continue;
		let next = index + 1;
		while ( next < lines.length && lines[next] === "" ) next += 1;
		const follower = lines[next] ?? "";
		if ( follower === "" || /^[A-Za-z_]/.test(follower) ) lines[index] = `${key}: []`;
	}
	return joinLines(lines, text);
}

function appendPenalty(text, itemEffectId, penalty) {
	const lines = text.split(/\r?\n/);
	const header = `      - _id: ${itemEffectId}`;
	const starts = lines.reduce((found, line, index) => {
		if ( line === header ) found.push(index);
		return found;
	}, []);
	if ( starts.length !== 1 ) {
		return { error: `item effect ${itemEffectId} header count is ${starts.length}` };
	}
	const start = starts[0];
	let end = lines.length;
	let changesAt = -1;
	for ( let index = start + 1; index < lines.length; index += 1 ) {
		if ( /^      - _id: /.test(lines[index]) || /^    [A-Za-z_]/.test(lines[index]) || /^  - _id: /.test(lines[index]) ) {
			end = index;
			break;
		}
		if ( lines[index] === "        changes:" ) changesAt = index;
	}
	if ( changesAt < 0 ) return { error: `item effect ${itemEffectId} has no changes block` };
	const changeStarts = [];
	for ( let index = changesAt + 1; index < end; index += 1 ) {
		if ( /^          - key: /.test(lines[index]) ) changeStarts.push(index);
	}
	if ( changeStarts.length !== 1 ) {
		return { error: `item effect ${itemEffectId} has ${changeStarts.length} changes` };
	}
	let insertAt = changeStarts[0] + 1;
	while ( insertAt < end && /^            /.test(lines[insertAt]) ) insertAt += 1;
	const priority = penalty.priority === null || penalty.priority === undefined ? "null" : String(penalty.priority);
	const quoted = String(penalty.value).replace(/'/g, "''");
	lines.splice(insertAt, 0,
		`          - key: ${penalty.key}`,
		`            mode: ${Number(penalty.mode)}`,
		`            value: '${quoted}'`,
		`            priority: ${priority}`
	);
	return { text: joinLines(lines, text) };
}

function loadSources() {
	const names = fs.readdirSync(DRAKES).filter(name => name.endsWith(".yml")).sort();
	return names.map(file => {
		const full = path.join(DRAKES, file);
		const resolved = path.resolve(full);
		if ( !resolved.startsWith(path.resolve(DRAKES) + path.sep) ) {
			throw new Error(`Refusing to read outside Drake source: ${file}`);
		}
		const text = fs.readFileSync(full, "utf8");
		let data;
		try {
			data = YAML.load(text);
		} catch (error) {
			throw new Error(`${file} did not parse: ${error.message}`);
		}
		return { file, full, text, data };
	});
}

function preflight(sources) {
	const reasons = [];
	let branch = "";
	try {
		branch = execSync("git rev-parse --abbrev-ref HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
	} catch (error) {
		reasons.push(`git branch check failed: ${error.message}`);
	}
	if ( branch && branch !== "v.next" ) reasons.push(`branch is ${branch}, expected v.next`);
	if ( sources.length !== 87 ) reasons.push(`Drake YAML count is ${sources.length}, expected 87`);
	for ( const source of sources ) {
		const version = source.data?._stats?.systemVersion;
		if ( String(version) !== "5.2.5" ) {
			reasons.push(`${source.file} systemVersion is ${version ?? "missing"}`);
		}
		if ( !source.data?._id ) reasons.push(`${source.file} has no actor id`);
		for ( const id of REMOVED_ROLE_SPEC_IDS ) {
			if ( source.text.includes(`_id: ${id}`) ) reasons.push(`${source.file} still contains Role Spec id ${id}`);
		}
	}
	return { reasons, branch };
}

function findActorEffect(sources, effectId) {
	const hits = [];
	for ( const source of sources ) {
		for ( const effect of source.data?.effects ?? [] ) {
			if ( effect?._id === effectId ) hits.push({ file: source.file, actorId: source.data._id, effect });
		}
	}
	return hits;
}

function validateMakeshift(source, effect, spec) {
	const reasons = [];
	if ( source.data._id !== spec.actorId ) reasons.push(`${spec.effectId} actor is ${source.data._id}`);
	if ( effect.transfer !== false ) reasons.push(`${spec.effectId} transfer is ${effect.transfer}`);
	if ( effect.origin !== `Actor.${spec.actorId}.Item.${spec.itemId}` ) {
		reasons.push(`${spec.effectId} origin is ${effect.origin ?? "missing"}`);
	}
	const item = (source.data.items ?? []).find(entry => entry._id === spec.itemId);
	const itemEffect = (item?.effects ?? []).find(entry => entry._id === spec.itemEffectId);
	if ( !item ) reasons.push(`${spec.effectId} item ${spec.itemId} is absent`);
	if ( !itemEffect ) reasons.push(`${spec.effectId} item effect ${spec.itemEffectId} is absent`);
	if ( !item || !itemEffect ) return reasons;
	if ( itemEffect.transfer !== true ) reasons.push(`${spec.itemEffectId} transfer is ${itemEffect.transfer}`);
	const itemChanges = itemEffect.changes ?? [];
	const actorChanges = effect.changes ?? [];
	if ( itemChanges.length !== 1 || !matchesChange(itemChanges[0], spec.bonus) ) {
		reasons.push(`${spec.itemEffectId} changes are not exactly the +1 bonus`);
	}
	const bonusCopies = actorChanges.filter(change => matchesChange(change, spec.bonus));
	const penaltyCopies = actorChanges.filter(change => matchesChange(change, spec.penalty));
	if ( actorChanges.length !== 2 || bonusCopies.length !== 1 || penaltyCopies.length !== 1 ) {
		reasons.push(`${spec.effectId} is not the +1 bonus plus exactly one recorded penalty`);
	}
	if ( spec.penalty.key === spec.bonus.key ) reasons.push(`${spec.effectId} penalty targets the boosted ability`);
	if ( !descriptionSupportsPenalty(item, spec.bonus.key) ) {
		reasons.push(`${spec.itemId} description does not support the penalty`);
	}
	if ( (itemEffect.disabled ?? false) !== false || (effect.disabled ?? false) !== false ) {
		reasons.push(`${spec.effectId} disabled state is not false`);
	}
	if ( (itemEffect.statuses ?? []).length || (effect.statuses ?? []).length ) {
		reasons.push(`${spec.effectId} carries statuses`);
	}
	if ( !sameJson(normalizeDuration(itemEffect.duration), normalizeDuration(effect.duration)) ) {
		reasons.push(`${spec.effectId} duration does not match the item effect`);
	}
	if ( !sameJson(normalizeFlags(itemEffect.flags), normalizeFlags(effect.flags)) ) {
		reasons.push(`${spec.effectId} flags do not match the item effect`);
	}
	if ( unexpectedChangeFields(itemEffect).length || unexpectedChangeFields(effect).length ) {
		reasons.push(`${spec.effectId} has unexpected change fields`);
	}
	return reasons;
}

function validateOrphan(source, effect, spec) {
	const reasons = [];
	if ( source.data._id !== spec.actorId ) reasons.push(`${spec.effectId} actor is ${source.data._id}`);
	if ( effect.name !== spec.name ) reasons.push(`${spec.effectId} name is ${effect.name}`);
	if ( effect.origin !== spec.origin ) reasons.push(`${spec.effectId} origin is ${effect.origin ?? "missing"}`);
	if ( effect.transfer !== false ) reasons.push(`${spec.effectId} transfer is ${effect.transfer}`);
	const origin = parseOrigin(effect.origin);
	if ( !origin || origin.actorId === source.data._id ) reasons.push(`${spec.effectId} origin actor is not foreign`);
	if ( (source.data.items ?? []).some(item => item._id === spec.originItemId) ) {
		reasons.push(`${spec.effectId} origin item exists on the current actor`);
	}
	const otherShields = (source.data.items ?? []).filter(item => /shield/i.test(item.name ?? "") && item._id !== spec.originItemId);
	if ( !otherShields.length ) reasons.push(`${spec.file} has no different installed shield item`);
	const idHits = source.text.match(new RegExp(spec.effectId, "g")) ?? [];
	const itemHits = source.text.match(new RegExp(spec.originItemId, "g")) ?? [];
	if ( idHits.length !== 2 ) reasons.push(`${spec.effectId} appears ${idHits.length} times, expected 2`);
	if ( itemHits.length !== 1 ) reasons.push(`${spec.originItemId} appears ${itemHits.length} times, expected 1`);
	for ( const other of source.data.effects ?? [] ) {
		if ( other._id === effect._id ) continue;
		if ( String(other.origin ?? "").includes(spec.effectId) || String(other.origin ?? "").includes(spec.originItemId) ) {
			reasons.push(`${spec.effectId} is referenced by actor effect ${other._id}`);
		}
	}
	return reasons;
}

function matchingTransferEffects(item, effect) {
	return (item?.effects ?? []).filter(entry => entry?.transfer === true && sameIdentity(entry, effect));
}

function classify(sources) {
	const manifest = [];
	const problems = [];
	const unclassified = [];
	const priorityNotes = [];
	const seen = new Map();
	const makeshiftIds = new Map(MAKESHIFT.map(spec => [spec.effectId, spec]));
	const orphanIds = new Map(ORPHANS.map(spec => [spec.effectId, spec]));

	for ( const source of sources ) {
		const actor = source.data;
		const items = new Map((actor.items ?? []).map(item => [item._id, item]));
		for ( const effect of actor.effects ?? [] ) {
			const origin = parseOrigin(effect.origin);
			if ( !origin ) continue;
			const key = manifestKey(source.file, actor._id, effect._id);
			if ( isCr90(source.file, actor, effect) ) {
				if ( seen.has(effect._id) ) problems.push(`CR90 effect id also appears in ${seen.get(effect._id)}`);
				seen.set(effect._id, key);
				continue;
			}
			if ( makeshiftIds.has(effect._id) ) {
				const spec = makeshiftIds.get(effect._id);
				if ( spec.file !== source.file || spec.actorId !== actor._id ) {
					problems.push(`Makeshift effect ${effect._id} is on ${source.file} ${actor._id}`);
					continue;
				}
				const reasons = validateMakeshift(source, effect, spec);
				if ( reasons.length ) {
					problems.push(...reasons);
					continue;
				}
				manifest.push(entryFrom(source, effect, origin, "makeshift", spec.itemEffectId, spec));
				continue;
			}
			if ( orphanIds.has(effect._id) && orphanIds.get(effect._id).file === source.file ) {
				const spec = orphanIds.get(effect._id);
				if ( spec.actorId !== actor._id ) {
					problems.push(`Orphan effect ${effect._id} is on ${source.file} ${actor._id}`);
					continue;
				}
				const reasons = validateOrphan(source, effect, spec);
				if ( reasons.length ) {
					problems.push(...reasons);
					continue;
				}
				manifest.push(entryFrom(source, effect, origin, "orphan", null, null));
				continue;
			}
			const item = items.get(origin.itemId);
			if ( !item ) {
				problems.push(`${key} origin item ${origin.itemId} is absent and the effect is not a recorded orphan`);
				continue;
			}
			if ( unexpectedChangeFields(effect).length ) {
				problems.push(`${key} has unexpected change fields`);
				continue;
			}
			const matches = matchingTransferEffects(item, effect);
			if ( effect.transfer !== false || matches.length !== 1 ) {
				unclassified.push(`${key} ${effect.name ?? ""}`);
				continue;
			}
			const match = matches[0];
			if ( unexpectedChangeFields(match).length ) {
				problems.push(`${key} matching item effect has unexpected change fields`);
				continue;
			}
			if ( prioritiesDiffer(effect, match) ) {
				priorityNotes.push(`${key} priority differs from item effect ${match._id}; key, mode, and value match`);
			}
			const empty = (effect.changes ?? []).length === 0;
			let classification = null;
			if ( empty ) {
				const inertReasons = inertProblems(effect, item, match);
				if ( inertReasons.length ) {
					unclassified.push(`${key} ${inertReasons.join("; ")}`);
					continue;
				}
				classification = "inert-lightweight";
			} else if ( origin.actorId === actor._id ) classification = "same-actor-nonempty";
			else classification = "clone-source-nonempty";
			manifest.push(entryFrom(source, effect, origin, classification, match._id, null));
		}
	}

	for ( const [key, entry] of manifest.entries() ) {
		void key;
		if ( seen.has(entry.key) ) problems.push(`duplicate manifest key ${entry.key}`);
		seen.set(entry.key, entry.classification);
	}
	return { manifest, problems, unclassified, priorityNotes };
}

function entryFrom(source, effect, origin, classification, itemEffectId, spec) {
	const changes = (effect.changes ?? []).map(changeView);
	return {
		key: manifestKey(source.file, source.data._id, effect._id),
		file: source.file,
		actorId: source.data._id,
		effectId: effect._id,
		name: effect.name ?? "",
		originActorId: origin.actorId,
		itemId: origin.itemId,
		itemEffectId,
		classification,
		prefix: origin.actorId === source.data._id ? "same-actor" : "clone-source",
		changesBefore: changes,
		changesAfter: spec ? [changeView({ ...spec.bonus, priority: null }), changeView({ ...spec.penalty, priority: null })] : null
	};
}

function inertProblems(effect, item, itemEffect) {
	const reasons = [];
	if ( effect.name !== "Lightweight Armor" || item.name !== "Lightweight Armor" || itemEffect.name !== "Lightweight Armor" ) {
		reasons.push("empty-change pair is not Lightweight Armor");
	}
	if ( (effect.statuses ?? []).length || (itemEffect.statuses ?? []).length ) reasons.push("inert effect has statuses");
	if ( Object.keys(normalizeFlags(effect.flags)).length || Object.keys(normalizeFlags(itemEffect.flags)).length ) {
		reasons.push("inert effect has flags beyond the empty statusId");
	}
	if ( effect.activities || itemEffect.activities ) reasons.push("inert effect has activities");
	if ( (effect.changes ?? []).length || (itemEffect.changes ?? []).length ) reasons.push("inert effect changes are not empty");
	return reasons;
}

function categoryCounts(manifest) {
	const counts = {
		"same-actor-nonempty": 0,
		"clone-source-nonempty": 0,
		"makeshift": 0,
		"orphan": 0,
		"inert-lightweight": 0
	};
	for ( const entry of manifest ) counts[entry.classification] += 1;
	return counts;
}

function makeshiftSnapshot(sources) {
	return MAKESHIFT.map(spec => {
		const source = sources.find(entry => entry.file === spec.file);
		const item = (source?.data?.items ?? []).find(entry => entry._id === spec.itemId);
		const itemEffect = (item?.effects ?? []).find(entry => entry._id === spec.itemEffectId);
		const actorEffect = (source?.data?.effects ?? []).find(entry => entry._id === spec.effectId);
		const itemChanges = itemEffect?.changes ?? [];
		const actorChanges = actorEffect?.changes ?? [];
		return {
			spec,
			itemFound: Boolean(itemEffect),
			actorFound: Boolean(actorEffect),
			descriptionOk: item ? descriptionSupportsPenalty(item, spec.bonus.key) : false,
			itemChanges: itemChanges.map(changeView),
			actorChanges: actorChanges.map(changeView),
			itemBonus: itemChanges.filter(change => matchesChange(change, spec.bonus)).length,
			itemPenalty: itemChanges.filter(change => matchesChange(change, spec.penalty)).length,
			actorBonus: actorChanges.filter(change => matchesChange(change, spec.bonus)).length,
			actorPenalty: actorChanges.filter(change => matchesChange(change, spec.penalty)).length
		};
	});
}

function sentinelState(sources) {
	const reasons = [];
	const shots = makeshiftSnapshot(sources);
	let actorOnly = true;
	let itemOnce = true;
	for ( const shot of shots ) {
		const pre = shot.itemFound && shot.actorFound && shot.itemChanges.length === 1 && shot.itemBonus === 1
			&& shot.itemPenalty === 0 && shot.actorBonus === 1 && shot.actorPenalty === 1 && shot.descriptionOk;
		const post = shot.itemFound && !shot.actorFound && shot.itemChanges.length === 2 && shot.itemBonus === 1
			&& shot.itemPenalty === 1 && shot.descriptionOk;
		if ( !pre ) actorOnly = false;
		if ( !post ) itemOnce = false;
		if ( !pre && !post ) {
			reasons.push(
				`${shot.spec.itemEffectId} is neither pre-repair nor post-repair `
				+ `(item changes ${shot.itemChanges.length}, item penalty ${shot.itemPenalty}, actor present ${shot.actorFound})`
			);
		}
	}
	const orphanHits = ORPHANS.map(spec => ({ spec, hits: findActorEffect(sources, spec.effectId) }));
	const orphansPresent = orphanHits.every(hit => hit.hits.some(entry => entry.file === hit.spec.file && entry.actorId === hit.spec.actorId));
	const orphansAbsent = orphanHits.every(hit => hit.hits.length === 0);
	if ( !orphansPresent && !orphansAbsent ) {
		for ( const hit of orphanHits ) {
			const where = hit.hits.map(entry => `${entry.file} ${entry.actorId}`).join(", ") || "none";
			reasons.push(`${hit.spec.effectId} is not only-on-recorded-actor and not globally absent (${where})`);
		}
	}
	const cr90Hits = findActorEffect(sources, CR90.effectId);
	const cr90Ok = cr90Hits.length === 1 && cr90Hits[0].file === CR90.file && cr90Hits[0].actorId === CR90.actorId
		&& cr90Hits[0].effect.name === CR90.name;
	if ( !cr90Ok ) reasons.push(`CR90 effect ${CR90.effectId} count is ${cr90Hits.length}`);
	let makeshift = "mixed";
	if ( actorOnly && !itemOnce ) makeshift = "actor-only";
	else if ( itemOnce && !actorOnly ) makeshift = "item-once";
	let orphans = "partial";
	if ( orphansPresent ) orphans = "present";
	else if ( orphansAbsent ) orphans = "absent";
	return { shots, makeshift, orphans, cr90Ok, reasons };
}

function evaluateState(scan, sources) {
	const counts = categoryCounts(scan.manifest);
	const total = scan.manifest.length;
	const sum = Object.values(counts).reduce((left, right) => left + right, 0);
	const reasons = [];
	if ( sum !== total ) reasons.push(`category sum ${sum} does not equal manifest ${total}`);
	reasons.push(...scan.problems);
	if ( scan.unclassified.length ) {
		reasons.push(...scan.unclassified.map(entry => `unclassified item-origin effect ${entry}`));
	}
	const sentinels = sentinelState(sources);
	reasons.push(...sentinels.reasons);
	const inertSame = scan.manifest.filter(entry => entry.classification === "inert-lightweight" && entry.prefix === "same-actor").length;
	const inertClone = scan.manifest.filter(entry => entry.classification === "inert-lightweight" && entry.prefix === "clone-source").length;
	const countsMatch = Object.entries(EXPECTED_PRE).every(([key, value]) => counts[key] === value);
	const keyDiff = expectedKeyDiff(scan.manifest, sources);
	const pre = total === EXPECTED_TOTAL && countsMatch && sentinels.makeshift === "actor-only"
		&& sentinels.orphans === "present" && sentinels.cr90Ok && inertSame === EXPECTED_INERT_SAME
		&& inertClone === EXPECTED_INERT_CLONE && keyDiff.missing.length === 0 && keyDiff.extra.length === 0
		&& keyDiff.remaining.length === EXPECTED_TOTAL && reasons.length === 0;
	const post = total === 0 && sentinels.makeshift === "item-once" && sentinels.orphans === "absent"
		&& sentinels.cr90Ok && keyDiff.extra.length === 0 && keyDiff.remaining.length === 0
		&& reasons.length === 0;
	if ( pre ) return { state: "pre-repair", counts, total, sentinels, inertSame, inertClone, reasons: [] };
	if ( post ) return { state: "post-repair", counts, total, sentinels, inertSame, inertClone, reasons: [] };
	if ( !countsMatch && total !== 0 ) {
		reasons.push(`candidate total ${total} is not ${EXPECTED_TOTAL} and not a clean post-repair state`);
	}
	if ( total !== 0 && total !== EXPECTED_TOTAL ) {
		reasons.push(`partial candidate total ${total}; expected ${EXPECTED_TOTAL} or 0`);
	}
	return { state: "invalid", counts, total, sentinels, inertSame, inertClone, reasons, keyDiff };
}

function actorEffectKeys(sources) {
	const keys = new Set();
	for ( const source of sources ) {
		for ( const effect of source.data?.effects ?? [] ) {
			keys.add(manifestKey(source.file, source.data._id, effect._id));
		}
	}
	return keys;
}

function expectedKeyDiff(manifest, sources) {
	const present = actorEffectKeys(sources);
	const found = new Set(manifest.map(entry => entry.key));
	return {
		missing: EXPECTED_KEYS.filter(key => !present.has(key)),
		remaining: EXPECTED_KEYS.filter(key => present.has(key)),
		extra: [...found].filter(key => !EXPECTED_KEY_SET.has(key))
	};
}

function printScan(scan, state, sources, dryRun) {
	console.log("Category counts:");
	for ( const [name, value] of Object.entries(state.counts) ) console.log(`  ${name}: ${value}`);
	console.log(`Manifest total: ${state.total}`);
	console.log(`Inert prefix: same-actor ${state.inertSame}, clone-source ${state.inertClone}`);
	console.log(`Makeshift penalties: ${state.sentinels.makeshift}`);
	console.log(`Orphans: ${state.sentinels.orphans}`);
	console.log(`CR90 exclusion present: ${state.sentinels.cr90Ok}`);
	console.log(`State: ${state.state}`);
	console.log(`Writes: ${dryRun || state.state !== "pre-repair" ? "no" : "yes"}`);
	if ( scan.priorityNotes.length ) {
		console.log("Priority-only differences (key, mode, and value match):");
		for ( const note of scan.priorityNotes ) console.log(`  ${note}`);
	}
	console.log("Per-file actor effects:");
	for ( const source of sources ) {
		const removing = scan.manifest.filter(entry => entry.file === source.file).length;
		console.log(`  ${source.file} ${source.data._id}: ${source.data.effects?.length ?? 0} -> ${(source.data.effects?.length ?? 0) - removing}`);
	}
	console.log("Manifest keys:");
	for ( const entry of scan.manifest ) {
		console.log(`  ${entry.classification} ${entry.key} item ${entry.itemId} itemEffect ${entry.itemEffectId ?? "-"} ${entry.name}`);
	}
	console.log("Makeshift item effects:");
	for ( const shot of state.sentinels.shots ) {
		console.log(`  ${shot.spec.file} itemEffect ${shot.spec.itemEffectId}`);
		console.log(`    before: ${JSON.stringify(shot.itemChanges)}`);
		console.log(`    actor: ${JSON.stringify(shot.actorChanges)}`);
		const after = state.state === "post-repair"
			? shot.itemChanges
			: [...shot.itemChanges, changeView({ ...shot.spec.penalty, priority: null })];
		console.log(`    after: ${JSON.stringify(after)}`);
	}
}

function withoutEffectChanges(value, effectId) {
	const copy = JSON.parse(JSON.stringify(value));
	const effect = (copy.effects ?? []).find(entry => entry._id === effectId);
	if ( effect ) effect.changes = [];
	return copy;
}

function verifyEdited(before, after, entries) {
	const reasons = [];
	const removed = new Set(entries.map(entry => entry.effectId));
	const beforeItems = new Map((before.items ?? []).map(item => [item._id, item]));
	const afterItems = new Map((after.items ?? []).map(item => [item._id, item]));
	if ( beforeItems.size !== (before.items ?? []).length || afterItems.size !== (after.items ?? []).length ) {
		reasons.push("item ids are not unique");
	}
	if ( afterItems.size !== beforeItems.size ) reasons.push(`item count ${afterItems.size}, expected ${beforeItems.size}`);
	const makeshiftByItemEffect = new Map(entries.filter(entry => entry.classification === "makeshift").map(entry => [entry.itemEffectId, entry]));
	for ( const [id, item] of beforeItems ) {
		const next = afterItems.get(id);
		if ( !next ) {
			reasons.push(`item ${id} was removed`);
			continue;
		}
		const itemEffectId = [...makeshiftByItemEffect.keys()].find(effectId => (item.effects ?? []).some(effect => effect._id === effectId));
		if ( !itemEffectId ) {
			if ( !sameJson(next, item) ) reasons.push(`item ${id} changed`);
			continue;
		}
		if ( !sameJson(withoutEffectChanges(next, itemEffectId), withoutEffectChanges(item, itemEffectId)) ) {
			reasons.push(`item ${id} changed outside the Makeshift penalty insertion`);
		}
		const spec = MAKESHIFT.find(entry => entry.itemEffectId === itemEffectId);
		const nextEffect = (next.effects ?? []).find(effect => effect._id === itemEffectId);
		const priorEffect = (item.effects ?? []).find(effect => effect._id === itemEffectId);
		const nextChanges = nextEffect?.changes ?? [];
		if ( !priorEffect || !nextEffect ) reasons.push(`item effect ${itemEffectId} disappeared`);
		if ( nextChanges.length !== 2 || !matchesChange(nextChanges[0], spec.bonus) || !matchesChange(nextChanges[1], spec.penalty) ) {
			reasons.push(`item effect ${itemEffectId} changes are ${JSON.stringify((nextChanges).map(changeView))}`);
		}
		if ( nextChanges.filter(change => matchesChange(change, spec.penalty)).length !== 1 ) {
			reasons.push(`item effect ${itemEffectId} does not contain the penalty exactly once`);
		}
		if ( !sameJson(sortedChanges(priorEffect), [changeSignature(spec.bonus)].sort()) ) {
			reasons.push(`item effect ${itemEffectId} no longer contains its original bonus`);
		}
	}
	for ( const id of afterItems.keys() ) {
		if ( !beforeItems.has(id) ) reasons.push(`item ${id} was added`);
	}
	const beforeEffects = new Map((before.effects ?? []).map(effect => [effect._id, effect]));
	const afterEffects = new Map((after.effects ?? []).map(effect => [effect._id, effect]));
	if ( afterEffects.size !== beforeEffects.size - removed.size ) {
		reasons.push(`actor effect count ${afterEffects.size}, expected ${beforeEffects.size - removed.size}`);
	}
	for ( const id of removed ) {
		if ( afterEffects.has(id) ) reasons.push(`targeted actor effect ${id} remains`);
		if ( !beforeEffects.has(id) ) reasons.push(`targeted actor effect ${id} was not present before editing`);
	}
	for ( const [id, effect] of beforeEffects ) {
		if ( removed.has(id) ) continue;
		if ( !afterEffects.has(id) ) reasons.push(`non-targeted actor effect ${id} was removed`);
		else if ( !sameJson(afterEffects.get(id), effect) ) reasons.push(`non-targeted actor effect ${id} changed`);
	}
	for ( const id of afterEffects.keys() ) {
		if ( !beforeEffects.has(id) ) reasons.push(`actor effect ${id} was added`);
	}
	for ( const entry of entries ) {
		if ( entry.classification === "orphan" ) continue;
		const item = afterItems.get(entry.itemId);
		const itemEffect = (item?.effects ?? []).find(effect => effect._id === entry.itemEffectId);
		if ( !item ) reasons.push(`originating item ${entry.itemId} is absent`);
		if ( !itemEffect ) reasons.push(`transfer item effect ${entry.itemEffectId} is absent`);
		else if ( itemEffect.transfer !== true ) reasons.push(`item effect ${entry.itemEffectId} transfer is ${itemEffect.transfer}`);
	}
	for ( const entry of entries.filter(candidate => candidate.classification === "orphan") ) {
		if ( afterEffects.has(entry.effectId) ) reasons.push(`orphan ${entry.effectId} remains`);
	}
	return reasons;
}

function editSource(source, entries) {
	let text = source.text;
	for ( const entry of entries.filter(candidate => candidate.classification === "makeshift") ) {
		const spec = MAKESHIFT.find(candidate => candidate.effectId === entry.effectId && candidate.file === entry.file);
		const actorEffect = (source.data.effects ?? []).find(effect => effect._id === entry.effectId);
		const penalty = (actorEffect?.changes ?? []).find(change => matchesChange(change, spec.penalty));
		const inserted = appendPenalty(text, spec.itemEffectId, penalty);
		if ( inserted.error ) return { error: inserted.error };
		text = inserted.text;
	}
	const removed = removeTopLevelEntries(text, entries.map(entry => entry.effectId));
	const missing = entries.filter(entry => removed.found.get(entry.effectId) !== 1);
	if ( missing.length ) {
		return { error: `block removal counts: ${missing.map(entry => `${entry.effectId}=${removed.found.get(entry.effectId) ?? 0}`).join(", ")}` };
	}
	if ( newlineOf(text) !== newlineOf(removed.text) ) return { error: "newline style changed" };
	const preserved = preserveEmptyCollection(removed.text, "effects");
	if ( newlineOf(text) !== newlineOf(preserved) ) return { error: "newline style changed" };
	let after;
	try {
		after = YAML.load(preserved);
	} catch (error) {
		return { error: `edited YAML did not parse: ${error.message}` };
	}
	if ( !Array.isArray(after?.effects) || !Array.isArray(after?.items) ) {
		return { error: "edited actor items or effects did not remain arrays" };
	}
	const reasons = verifyEdited(source.data, after, entries);
	if ( reasons.length ) return { error: reasons.join("; ") };
	return { text: preserved, after };
}

function printFailure(state, scan) {
	const keyDiff = state.keyDiff ?? { missing: [], remaining: [], extra: [] };
	console.log("Reconciliation failed. No files written.");
	console.log(`State: ${state.state}. Candidates: ${state.total}.`);
	for ( const reason of state.reasons ) console.log(`  - ${reason}`);
	console.log(`Remaining candidate keys (${scan.manifest.length}):`);
	if ( !scan.manifest.length ) console.log("  (none)");
	for ( const entry of scan.manifest ) console.log(`  ${entry.key}`);
	console.log(`Missing pre-repair keys (${keyDiff.missing.length}):`);
	if ( !keyDiff.missing.length ) console.log("  (none)");
	for ( const key of keyDiff.missing ) console.log(`  ${key}`);
	console.log(`Unexpected candidate keys (${keyDiff.extra.length}):`);
	if ( !keyDiff.extra.length ) console.log("  (none)");
	for ( const key of keyDiff.extra ) console.log(`  ${key}`);
}

function main() {
	const dryRun = process.argv.includes("--dry-run");
	let sources;
	try {
		sources = loadSources();
	} catch (error) {
		console.log(`Preflight failed: ${error.message}`);
		process.exitCode = 1;
		return;
	}
	const flight = preflight(sources);
	if ( flight.reasons.length ) {
		console.log("Preflight failed. No files written.");
		for ( const reason of flight.reasons ) console.log(`  - ${reason}`);
		process.exitCode = 1;
		return;
	}
	console.log(`Preflight: branch ${flight.branch}, ${sources.length} files, systemVersion 5.2.5, removed Role Spec ids absent.`);
	const scan = classify(sources);
	const state = evaluateState(scan, sources);
	printScan(scan, state, sources, dryRun);
	if ( state.state === "invalid" ) {
		printFailure(state, scan);
		process.exitCode = 1;
		return;
	}
	if ( state.state === "post-repair" ) {
		console.log(dryRun
			? "Post-repair dry run passed. No files written."
			: "Already post-repair. No files written.");
		return;
	}
	const edits = [];
	for ( const source of sources ) {
		const entries = scan.manifest.filter(entry => entry.file === source.file);
		if ( !entries.length ) continue;
		const edited = editSource(source, entries);
		if ( edited.error ) {
			console.log(`${source.file}: ABORT`);
			console.log(`  - ${edited.error}`);
			console.log("No files written.");
			process.exitCode = 1;
			return;
		}
		edits.push({ source, entries, text: edited.text });
	}
	if ( edits.length === 0 ) {
		console.log("Pre-repair state produced no edits. No files written.");
		process.exitCode = 1;
		return;
	}
	if ( dryRun ) {
		console.log(`Dry run passed. ${edits.length} files would be written. No files written.`);
		return;
	}
	for ( const edit of edits ) fs.writeFileSync(edit.source.full, edit.text, "utf8");
	let written;
	try {
		written = loadSources();
	} catch (error) {
		console.log(`Post-write parse failed: ${error.message}`);
		process.exitCode = 1;
		return;
	}
	const afterScan = classify(written);
	const afterState = evaluateState(afterScan, written);
	if ( afterState.state !== "post-repair" ) {
		console.log("POST-WRITE MISMATCH.");
		printFailure(afterState, afterScan);
		process.exitCode = 1;
		return;
	}
	console.log(`Done. ${edits.length} files written. Post-repair state confirmed.`);
}

main();
