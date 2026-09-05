// Thin data-access layer over the local JSON files.
//
// Every route/controller should go through this instead of calling fs
// directly. That keeps a single seam to swap in a real database later
// without touching the rest of the app.
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

function fileFor(collection) {
  return path.join(DATA_DIR, `${collection}.json`);
}

// Reads a collection file and returns the array stored under the key
// matching the collection name, e.g. reading "tenders" returns the
// `tenders` array inside tenders.json.
export async function readCollection(collection) {
  const raw = await readFile(fileFor(collection), "utf-8");
  const parsed = JSON.parse(raw);
  return parsed[collection] ?? [];
}

export async function writeCollection(collection, items) {
  const current = JSON.parse(await readFile(fileFor(collection), "utf-8"));
  current[collection] = items;
  await writeFile(fileFor(collection), JSON.stringify(current, null, 2));
}