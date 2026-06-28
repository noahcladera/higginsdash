/**
 * Generate PWA app icons from a single source image.
 *
 * Crops the source to a centered square, then emits the standard icon set
 * into `public/`. Re-run after replacing the source if the brand mark
 * changes. Source path can be overridden with the first CLI arg.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const SOURCE =
  process.argv[2] ??
  "/Users/noah/.cursor/projects/Users-noah-calednar-migration/assets/higgins-icon-source.png";

const PUBLIC = path.resolve(process.cwd(), "public");
const ICONS = path.join(PUBLIC, "icons");
const CREAM = { r: 251, g: 249, b: 243, alpha: 1 }; // --background light (#fbf9f3)

async function squareSource() {
  const img = sharp(SOURCE);
  const meta = await img.metadata();
  const size = Math.min(meta.width, meta.height);
  const left = Math.round((meta.width - size) / 2);
  const top = Math.round((meta.height - size) / 2);
  return sharp(SOURCE)
    .extract({ left, top, width: size, height: size })
    .png()
    .toBuffer();
}

async function main() {
  await mkdir(ICONS, { recursive: true });
  const square = await squareSource();

  // Plain (any-purpose) icons — full-bleed square.
  await sharp(square).resize(192, 192).png().toFile(path.join(ICONS, "icon-192.png"));
  await sharp(square).resize(512, 512).png().toFile(path.join(ICONS, "icon-512.png"));

  // Apple touch icon — 180x180, flattened onto cream (iOS adds its own mask).
  await sharp(square)
    .resize(180, 180)
    .flatten({ background: CREAM })
    .png()
    .toFile(path.join(PUBLIC, "apple-touch-icon.png"));

  // Maskable — scale the mark to ~78% inside a cream square so Android's
  // circular safe-zone crop never clips the "H".
  const inner = Math.round(512 * 0.78);
  const innerBuf = await sharp(square).resize(inner, inner).png().toBuffer();
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: CREAM,
    },
  })
    .composite([{ input: innerBuf, gravity: "centre" }])
    .png()
    .toFile(path.join(ICONS, "icon-maskable-512.png"));

  // Favicon (32) for browser tabs.
  await sharp(square).resize(32, 32).png().toFile(path.join(PUBLIC, "favicon.png"));

  console.log("PWA icons written to public/icons and public/.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
