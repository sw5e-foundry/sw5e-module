import path from "node:path";
import { promises as fs } from "node:fs";
import less from "less";

const rootDir = process.cwd();
const inputPath = path.resolve(rootDir, "styles/less/module.less");
const outputPath = path.resolve(rootDir, "styles/module.css");

async function buildStyles() {
	const source = await fs.readFile(inputPath, "utf8");
	const { css } = await less.render(source, {
		filename: inputPath,
		javascriptEnabled: false,
		rewriteUrls: "off"
	});
	const banner = "/* Generated from styles/less/module.less. Do not edit styles/module.css directly. */\n";
	await fs.writeFile(outputPath, `${banner}${css}`);
}

buildStyles().catch(error => {
	console.error("SW5E | LESS build failed");
	console.error(error);
	process.exitCode = 1;
});
