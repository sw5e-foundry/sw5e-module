import { getFlag } from "../utils.mjs";

import { patchKeen } from "./properties/keen.mjs";
import { patchReload } from "./properties/reload.mjs";

function addHelper() {
  dnd5e.dataModels.ItemDataModel.prototype.getProperty = function (prop) {
    return getFlag(this?.parent, `properties.${prop}`);
  };
}

function patchSheet() {
  Hooks.on("renderItemSheet5e", (app, html, data) => {
    if (app.item.type !== "weapon" && app.item.type !== "equipment") return;
    const tabDetails = html.find(".tab.details")[0];
    const fieldset = tabDetails.firstElementChild;
    const wpDiv = fieldset.lastElementChild;
    const wpLabel = wpDiv.firstElementChild;

    const properties = new Set(data.properties.options.map((p) => p.value));
    const numericProperties = new Set(
      [...properties].filter((key) => CONFIG.DND5E.itemProperties[key]?.type === "Number")
    );
    const boolProperties = properties.difference(numericProperties);
    const itemProperties = app.item.system.properties;

    const boolNode = document.createElement("div");
    {
      boolNode.setAttribute("class", `form-group stacked checkbox-grid`);
      boolNode.appendChild(wpDiv.firstElementChild.cloneNode(true));
      const formFields = document.createElement("div");
      formFields.setAttribute("class", `form-fields`);
      boolNode.appendChild(formFields);
      for (const prop of boolProperties) {
        const config = CONFIG.DND5E.itemProperties[prop];
        const path = `system.properties.${prop}`;
        const value = itemProperties.has(prop);

        const labelNode = document.createElement("label");
        labelNode.setAttribute("class", "checkbox");

        const inputNode = document.createElement("dnd5e-checkbox");
        inputNode.setAttribute("name", path);
        inputNode.setAttribute("tabindex", 0);
        if (value) inputNode.setAttribute("checked", null);
        labelNode.appendChild(inputNode);

        const spanNode = document.createElement("span");
        const textNode = document.createTextNode(config.label);
        spanNode.appendChild(textNode);
        labelNode.appendChild(spanNode);
        formFields.appendChild(labelNode);
      }
    }

    const numericNode = document.createElement("div");
    {
      numericNode.setAttribute("class", `form-group grid checkbox-grid`);
      const formFields = document.createElement("div");
      formFields.setAttribute("class", `form-fields`);
      numericNode.appendChild(formFields);
      for (const prop of numericProperties) {
        const config = CONFIG.DND5E.itemProperties[prop];
        const path = `flags.sw5e.properties.${prop}`;
        const value = foundry.utils.getProperty(app.item, path) ?? config.default;

        const labelNode = document.createElement("label");
        labelNode.setAttribute("class", "number");

        const spanNode = document.createElement("span");
        const textNode = document.createTextNode(config.label);
        spanNode.appendChild(textNode);
        labelNode.appendChild(spanNode);

        const inputNode = document.createElement("input");
        inputNode.setAttribute("type", "text");
        inputNode.setAttribute("name", path);
        inputNode.setAttribute("value", value ?? "");
        inputNode.setAttribute("data-dtype", "Number");
        inputNode.addEventListener("input", () => {
          const oldVal = itemProperties.has(prop);
          const newVal = inputNode.value !== "";
          if (oldVal !== newVal) {
            if (oldVal) itemProperties.delete(prop);
            else itemProperties.add(prop);
            app.item.update(
              { "system.properties": Array.from(itemProperties) },
              { recursive: false }
            );
            app.item.update({ [path]: newVal ? inputNode.value : null });
          }
        });
        labelNode.appendChild(inputNode);
        formFields.appendChild(labelNode);
      }
    }

    fieldset.insertBefore(boolNode, wpDiv);
    fieldset.insertBefore(numericNode, wpDiv);
    wpDiv.remove();
  });
}

export function patchProperties() {
  addHelper();
  patchSheet();

  // patchReload();
  patchKeen();
}
