/**
 * Pure dnd5e 6.0.0 chat-card shape helpers for Maneuver items.
 * Keep subtitle as an array and property entries as descriptors with a required type.
 */

/**
 * @param {object} [context]
 * @param {{ typeLabel?: string, extraProperties?: object[] }} [options]
 * @returns {object}
 */
export function adaptManeuverCardContext(context={}, { typeLabel="", extraProperties=[] }={}) {
	const next = context && typeof context === "object" ? context : {};
	next.isManeuver = true;

	const subtitle = Array.isArray(next.subtitle) ? [...next.subtitle] : [];
	if ( typeLabel && !subtitle.includes(typeLabel) ) subtitle.push(typeLabel);
	next.subtitle = subtitle;

	const properties = Array.isArray(next.properties) ? [...next.properties] : [];
	for ( const prop of extraProperties ) {
		if ( prop && typeof prop === "object" && prop.type ) properties.push(prop);
	}
	next.properties = properties;
	return next;
}

/**
 * Map legacy string tags (or already-typed descriptors) to 6.0 card-property descriptors.
 * @param {Array<string|object>} [tags]
 * @returns {object[]}
 */
export function maneuverChatPropertyDescriptors(tags=[]) {
	if ( !Array.isArray(tags) ) return [];
	const out = [];
	for ( const tag of tags ) {
		if ( tag && typeof tag === "object" && tag.type ) {
			out.push(tag);
			continue;
		}
		if ( tag == null || tag === "" ) continue;
		out.push({ type: "text", text: String(tag) });
	}
	return out;
}
