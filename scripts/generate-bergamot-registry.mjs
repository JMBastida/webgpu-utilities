import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOZILLA_MODELS_URL =
  'https://storage.googleapis.com/moz-fx-translations-data--303e-prod-translations-data/db/models.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outputPath = path.join(projectRoot, 'public', 'bergamot', 'registry.json');

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return response.json();
};

const buildRegistry = (data) => {
  const baseUrl = data.baseUrl;
  if (!baseUrl) {
    throw new Error('Missing baseUrl in Mozilla models registry.');
  }
  const models = data.models ?? {};
  const registry = {};

  for (const [pair, entries] of Object.entries(models)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const entry = entries.find((item) => item?.releaseStatus === 'Release') ?? entries[0];
    const files = entry?.files;
    if (!files?.model?.path || !files?.vocab?.path || !files?.lexicalShortlist?.path) continue;

    const key = pair.replace('-', '');
    registry[key] = {
      model: {
        name: `${baseUrl}/${files.model.path}`,
        ...(files.model.uncompressedHash
          ? { expectedSha256Hash: files.model.uncompressedHash }
          : {}),
      },
      vocab: {
        name: `${baseUrl}/${files.vocab.path}`,
      },
      lex: {
        name: `${baseUrl}/${files.lexicalShortlist.path}`,
      },
    };
  }

  return registry;
};

const main = async () => {
  const data = await fetchJson(MOZILLA_MODELS_URL);
  const registry = buildRegistry(data);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(registry, null, 2), 'utf-8');
  console.log(`Wrote ${Object.keys(registry).length} entries to ${outputPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
