export function patchProperties() {
	Hooks.on("renderItemSheet5e", (app, html, data) => {
		for (const type of ["equipment", "weapon"]) {
			const tag = `${type}-properties`;
			html.find(`.${tag}`).each(async (idx, el) => {
				const properties = new Set(Object.keys((await app.getData()).properties));
				const numericProperties = new Set([...properties].filter(key => CONFIG.DND5E.itemProperties[key]?.type === "Number"));
				const boolProperties = properties.difference(numericProperties);

				const boolNode = document.createElement("div");
				boolNode.setAttribute("class", `form-group stacked ${tag}`);
				boolNode.appendChild(el.firstElementChild.cloneNode(true));
				for (const prop of boolProperties) {
					const config = CONFIG.DND5E.itemProperties[prop];
					const path = `system.properties.${prop}`;
					const value = app.item.system.properties.has(prop);
					const labelNode = document.createElement("label");
					labelNode.setAttribute("class", "checkbox");
					const inputNode = document.createElement("input");
					inputNode.setAttribute("type", "checkbox");
					inputNode.setAttribute("name", path);
					if (value) inputNode.setAttribute("checked", true);
					labelNode.appendChild(inputNode);
					const textNode = document.createTextNode(config.label);
					labelNode.appendChild(textNode);
					boolNode.appendChild(labelNode);
				}

				const numericNode = document.createElement("div");
				numericNode.setAttribute("class", `form-group grid ${tag}`);
				for (const prop of numericProperties) {
					const config = CONFIG.DND5E.itemProperties[prop];
					const path = `flags.sw5e-module-test.properties.${prop}`;
					const value = foundry.utils.getProperty(app.item, path) ?? config.default;
					const labelNode = document.createElement("label");
					labelNode.setAttribute("class", "number");
					const textNode = document.createTextNode(config.label);
					labelNode.appendChild(textNode);
					const inputNode = document.createElement("input");
					inputNode.setAttribute("type", "text");
					inputNode.setAttribute("name", path);
					inputNode.setAttribute("value", value ?? "");
					inputNode.setAttribute("data-dtype", "Number");
					labelNode.appendChild(inputNode);
					numericNode.appendChild(labelNode);
				}

				const parentNode = el.parentNode;
				parentNode.insertBefore(boolNode, el);
				parentNode.insertBefore(numericNode, el);
				el.remove();
			});
		}
	});
}
