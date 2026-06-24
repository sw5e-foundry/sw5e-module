/**
 * One-shot Phase 1 avatar restoration for Drake's Shipyard source YAML.
 * Updates top-level actor `img` only.
 */
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const moduleRoot = path.resolve(import.meta.dirname, "..");
const shipyardDir = path.join(moduleRoot, "packs/_source/drakes-shipyard");
const tokenDir = path.join(moduleRoot, "icons/packs/Starship");
const TOKEN_PREFIX = "modules/sw5e-module/icons/packs/Starship/";

const tokenFiles = new Set(
  fs.readdirSync(tokenDir).filter((f) => f.endsWith(".Token.webp"))
);

function normalizeTokenSrc(src) {
  if (!src || typeof src !== "string") return null;
  const noQuery = src.split("?")[0];
  const match = noQuery.match(/\/Starship\/([^/]+\.Token\.webp)$/i);
  if (!match) return null;
  return match[1];
}

function localTokenPath(filename) {
  return `${TOKEN_PREFIX}${filename}`;
}

function isBlankImg(img) {
  return img == null || img === "" || (typeof img === "string" && img.trim() === "");
}

function isImgur(img) {
  return typeof img === "string" && /i\.imgur\.com/i.test(img);
}

function isWikia(img) {
  return typeof img === "string" && /wikia|fandom|nocookie/i.test(img);
}

function isLocalAvatar(img) {
  return typeof img === "string" && /\.Avatar\.webp/i.test(img.split("?")[0]);
}

function isLocalToken(img) {
  return typeof img === "string" && /\.Token\.webp/i.test(img.split("?")[0]);
}

function resolveTokenFilename(doc) {
  const fromToken = normalizeTokenSrc(doc?.prototypeToken?.texture?.src);
  if (fromToken && tokenFiles.has(fromToken)) return fromToken;

  const yamlBase = path.basename(doc._yamlFile, ".yml");
  const slugGuess = yamlBase.replace(/-/g, "_") + ".Token.webp";
  if (tokenFiles.has(slugGuess)) return slugGuess;

  const slugGuess2 = yamlBase + ".Token.webp";
  if (tokenFiles.has(slugGuess2)) return slugGuess2;

  return null;
}

function shouldUpdate(doc) {
  const img = doc.img;
  if (isLocalAvatar(img)) return { update: false, reason: "local-avatar-unchanged" };
  if (isWikia(img)) return { update: false, reason: "wikia-not-restored" };
  if (isLocalToken(img) && !isImgur(img) && !isBlankImg(img)) {
    const fn = normalizeTokenSrc(img);
    if (fn && img.split("?")[0] === localTokenPath(fn)) {
      return { update: false, reason: "already-local-token" };
    }
  }
  if (!isBlankImg(img) && !isImgur(img)) {
    return { update: false, reason: "other-img-unchanged" };
  }
  const tokenFile = resolveTokenFilename(doc);
  if (!tokenFile) return { update: false, reason: "no-matching-token-file" };
  return { update: true, tokenFile, reason: isImgur(img) ? "imgur-replaced" : "blank-restored" };
}

const mapping = [];
let updatedBlank = 0;
let updatedImgur = 0;
let skipped = 0;

for (const file of fs.readdirSync(shipyardDir).filter((f) => f.endsWith(".yml")).sort()) {
  const filePath = path.join(shipyardDir, file);
  const raw = fs.readFileSync(filePath, "utf8");
  const doc = yaml.load(raw);
  doc._yamlFile = file;

  const tokenSrc = doc?.prototypeToken?.texture?.src ?? "";
  const decision = shouldUpdate(doc);
  const tokenFile = decision.tokenFile ?? resolveTokenFilename(doc);

  const entry = {
    file,
    name: doc.name,
    currentImg: doc.img ?? "",
    prototypeTokenSrc: tokenSrc,
    inferredToken: tokenFile,
    tokenExists: tokenFile ? tokenFiles.has(tokenFile) : false,
    action: decision.update ? decision.reason : `skipped:${decision.reason}`,
  };
  mapping.push(entry);

  if (!decision.update) {
    skipped++;
    continue;
  }

  const newImg = localTokenPath(decision.tokenFile);
  if (decision.reason === "imgur-replaced") updatedImgur++;
  else updatedBlank++;

  // Surgical replace of top-level img only (preserve nested item img fields)
  const lines = raw.split(/\r?\n/);
  let outLines;
  const imgLineIdx = lines.findIndex((l, i) => i < 20 && /^img:\s*/.test(l));
  if (imgLineIdx === -1) {
    // insert after type line
    const typeIdx = lines.findIndex((l) => /^type:\s*/.test(l));
    outLines = [...lines];
    outLines.splice(typeIdx + 1, 0, `img: ${newImg}`);
  } else {
    const imgLine = lines[imgLineIdx];
    if (/^img:\s*>-/.test(imgLine) || /^img:\s*\|/.test(imgLine)) {
      // multiline block — replace block with single line
      let end = imgLineIdx + 1;
      while (end < lines.length && /^\s+\S/.test(lines[end]) && !/^\s*\w+:/.test(lines[end])) end++;
      outLines = [...lines.slice(0, imgLineIdx), `img: ${newImg}`, ...lines.slice(end)];
    } else {
      outLines = [...lines];
      outLines[imgLineIdx] = `img: ${newImg}`;
    }
  }

  fs.writeFileSync(filePath, outLines.join("\n"), "utf8");
  entry.newImg = newImg;
}

const report = {
  updatedBlank,
  updatedImgur,
  skipped,
  total: mapping.length,
  mapping,
};
fs.writeFileSync(
  path.join(moduleRoot, "ai/sessions/_phase1-avatar-restore-mapping.json"),
  JSON.stringify(report, null, 2),
  "utf8"
);
console.log(JSON.stringify({ updatedBlank, updatedImgur, skipped, total: mapping.length }, null, 2));
