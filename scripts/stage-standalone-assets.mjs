/**
 * After `next build`, copy `public` and `.next/static` into `.next/standalone`.
 * Next leaves those folders out; without them standalone is unstyled raw HTML.
 * Always copy (never symlink) so Windows and a copied standalone both work.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyStandaloneWebAssets } from "./standalone-link.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = copyStandaloneWebAssets(root);
const copied = [result.public.method === "copy" ? "public" : null, result.static.method === "copy" ? ".next/static" : null]
  .filter(Boolean);

if (copied.length) {
  console.log(`Copied ${copied.join(" and ")} into .next/standalone (no symlink).`);
} else if (result.static.method === "skip") {
  console.warn(
    "Did not copy .next/static into standalone. After build, missing CSS/JS means unstyled raw HTML (default blue links).",
  );
}
