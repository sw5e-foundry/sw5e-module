/**
 * Define a set of template paths to pre-load. Pre-loaded templates are compiled and cached for fast access when
 * rendering. These paths will also be available as Handlebars partials by using the file name
 * (e.g. "sw5e.actor-traits").
 * @returns {Promise}
 */
async function preloadHandlebarsTemplates() {
	const partials = [
		// Item Sheet Partials
		"modules/sw5e/templates/items/details/details-maneuver.hbs",
	];

	const paths = {};
	for ( const path of partials ) {
		paths[path.replace(".hbs", ".html")] = path;
		paths[`sw5e.${path.split("/").pop().replace(".hbs", "")}`] = path;
	}

	return loadTemplates(paths);
}


export function handleTemplates() {
	preloadHandlebarsTemplates();
}