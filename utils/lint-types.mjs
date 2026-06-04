import path from "node:path";
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const syntaxRoots = ["applications", "scripts", "utils"];
const jsonFiles = [
	"module.json",
	"package.json",
	"languages/en.json",
	"languages/de.json",
	"languages/es.json",
	"languages/fr.json",
	"languages/it.json",
	"languages/pt_BR.json"
];

async function walkMjsFiles(targetDir) {
	const fullDir = path.resolve(rootDir, targetDir);
	const entries = await fs.readdir(fullDir, { withFileTypes: true });
	const files = [];
	for ( const entry of entries ) {
		if ( entry.name === "node_modules" || entry.name.startsWith(".") ) continue;
		const fullPath = path.join(fullDir, entry.name);
		if ( entry.isDirectory() ) files.push(...await walkMjsFiles(path.relative(rootDir, fullPath)));
		else if ( entry.isFile() && fullPath.endsWith(".mjs") ) files.push(fullPath);
	}
	return files;
}

async function lintSyntax() {
	const files = [];
	for ( const dir of syntaxRoots ) files.push(...await walkMjsFiles(dir));
	for ( const file of files ) {
		const result = spawnSync(process.execPath, ["--check", file], {
			cwd: rootDir,
			encoding: "utf8"
		});
		if ( result.status !== 0 ) {
			process.stderr.write(result.stdout || "");
			process.stderr.write(result.stderr || "");
			throw new Error(`Syntax check failed: ${path.relative(rootDir, file)}`);
		}
	}
	console.log(`Syntax OK (${files.length} files)`);
}

async function lintJson() {
	for ( const file of jsonFiles ) {
		const raw = await fs.readFile(path.resolve(rootDir, file), "utf8");
		JSON.parse(raw);
	}
	console.log(`JSON OK (${jsonFiles.length} files)`);
}

async function main() {
	await lintSyntax();
	await lintJson();
}

main().catch(error => {
	console.error(error.message || error);
	process.exitCode = 1;
});
