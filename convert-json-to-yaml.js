import fs from 'fs-extra';
import yaml from 'js-yaml';
import path from 'path';

async function convertDirectory(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await convertDirectory(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const jsonData = await fs.readJson(fullPath);
      const yamlData = yaml.dump(jsonData, {
        sortKeys: false,
        lineWidth: -1,
        noRefs: true,
      });
      const newFile = fullPath.replace(/\.json$/i, '.yml');
      await fs.writeFile(newFile, yamlData, 'utf8');
      console.log(`Converted ${fullPath} → ${newFile}`);
    }
  }
}

const rootDir = path.join(process.cwd(), 'packs/_source');
convertDirectory(rootDir).catch((err) => console.error(err));
