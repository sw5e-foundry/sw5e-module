export const BASE_CURRENCY_KEY = "gc";

const CURRENCY_ALIASES = Object.freeze({
	credit: BASE_CURRENCY_KEY,
	credits: BASE_CURRENCY_KEY,
	gc: BASE_CURRENCY_KEY,
	gp: BASE_CURRENCY_KEY,
	ic: BASE_CURRENCY_KEY,
	imperialcredit: BASE_CURRENCY_KEY,
	imperialcredits: BASE_CURRENCY_KEY,
	"imperial-credit": BASE_CURRENCY_KEY
});

function toFiniteNumber(value, fallback=null) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : fallback;
}

export function getBaseCurrencyKey() {
	return BASE_CURRENCY_KEY;
}

export function normalizeSwCurrencyKey(key) {
	if ( typeof key !== "string" ) return key;
	const normalized = key.trim().toLowerCase();
	return CURRENCY_ALIASES[normalized] ?? normalized;
}

export function normalizeSwPriceDenomination(denomination, { fallbackToBase=true }={}) {
	const normalized = normalizeSwCurrencyKey(denomination);
	if ( CONFIG.DND5E?.currencies?.[normalized] ) return normalized;
	return fallbackToBase ? BASE_CURRENCY_KEY : normalized;
}

/**
 * Merge legacy gp/credit wallet keys into gc without removing other denominations or amounts.
 */
export function normalizeSwCurrencyWallet(wallet={}) {
	const normalized = { ...(wallet ?? {}) };
	let gcTotal = toFiniteNumber(normalized[BASE_CURRENCY_KEY], 0) ?? 0;

	for ( const [key, value] of Object.entries(wallet ?? {}) ) {
		if ( key === BASE_CURRENCY_KEY ) continue;
		if ( normalizeSwCurrencyKey(key) !== BASE_CURRENCY_KEY ) continue;
		gcTotal += toFiniteNumber(value, 0) ?? 0;
		delete normalized[key];
	}

	normalized[BASE_CURRENCY_KEY] = gcTotal;
	return normalized;
}

/**
 * Ensure Galactic Credits exists on CONFIG.DND5E.currencies without replacing other currencies.
 * Third-party modules may patch labels, rates, icons, or additional denominations afterward.
 */
export function applySw5eGalacticCreditsDefault(config) {
	config.currencies ??= {};
	const existing = config.currencies[BASE_CURRENCY_KEY] ?? {};
	config.currencies[BASE_CURRENCY_KEY] = {
		label: "SW5E.CurrencyGC",
		abbreviation: "SW5E.CurrencyAbbrGC",
		conversion: 1,
		...existing
	};
}
