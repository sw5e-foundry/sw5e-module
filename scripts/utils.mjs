export function fromHTML(str) {
	const div = document.createElement("div");
	div.innerHTML = str;
	return div.firstElementChild;
}

export function getFlag(obj, path, dnd5e=false) {
	const flags = obj?.flags?.[dnd5e ? "dnd5e" : "sw5e"];
	return foundry.utils.getProperty(flags, path);
}

export function makeElement(type, attributes={}) {
	if (type === "text") return document.createTextNode(attributes);

	const el = document.createElement(type);
	for (const [k,v] of Object.entries(attributes)) {
		if (k === "_children") for (const child of v) el.appendChild(makeElement(...child));
		else if (k === "_listeners") for (const [ev, foo] of Object.entries(v)) el.addEventListener(ev, foo);
		else if (k) el.setAttribute(k, v);
	}
	return el;
}
