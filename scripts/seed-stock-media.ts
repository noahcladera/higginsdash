/**
 * Import curated marketing + facility stock photos from drive migrations
 * into Supabase Storage + stock_media table.
 *
 * Source manifest: brain/reports/catalog.json
 * Files live under workspace root: drive nl/, drive california/
 *
 * SAFETY
 *   - DRY-RUN by default. Pass --confirm to upload + insert.
 *   - Idempotent: skips rows where source_path already exists.
 *
 * Run:
 *   npm run seed:stock-media
 *   npm run seed:stock-media -- --confirm
 *   npm run seed:stock-media -- --confirm --org higgins-nl
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const prisma = new PrismaClient();
const BUCKET = "org-media";
const MAX_DIMENSION = 1600;

const EXCLUDE_PATH_FRAGMENTS = [
  "Human Resources",
  "Job Applicants",
  "Passport",
  "W-4",
  "I-9",
  "DL-Front",
  "Screenshot",
  "Resume",
  "Contracts",
] as const;

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
]);

interface CatalogEntry {
  path: string;
  name: string;
  ext: string;
  category: string;
  region?: string;
  domain?: string;
  sensitivity?: string;
}

function parseArgs() {
  const confirm = process.argv.includes("--confirm");
  const orgIdx = process.argv.indexOf("--org");
  const orgSlug =
    orgIdx >= 0 && process.argv[orgIdx + 1]
      ? process.argv[orgIdx + 1]
      : "higgins-nl";
  return { confirm, orgSlug };
}

function isIncluded(entry: CatalogEntry): boolean {
  if (entry.category !== "image") return false;
  if (entry.sensitivity === "sensitive") return false;

  const ext = entry.ext.toLowerCase();
  if (ext === ".gif" || ext === ".webp" || ext === ".svg") return false;
  if (!IMAGE_EXTENSIONS.has(ext)) return false;

  for (const frag of EXCLUDE_PATH_FRAGMENTS) {
    if (entry.path.includes(frag)) return false;
  }

  const p = entry.path;
  if (p.includes("Stock Photos")) return true;
  if (p.includes("3. Marketing")) return true;
  if (p.includes("Marketing 2026")) return true;
  if (entry.domain === "Marketing") return true;
  if (entry.domain === "Facilities") return true;
  if (p.includes("4. Facilities, Schools, Programs")) return true;

  return false;
}

function titleFromPath(filePath: string, name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  if (base && !/^IMG_|^image\d|^Screenshot/i.test(base)) {
    return base.replace(/[_-]+/g, " ").trim();
  }
  const parent = path.basename(path.dirname(filePath));
  if (parent && parent !== "." && !parent.startsWith("drive ")) {
    return parent;
  }
  return base || "Stock photo";
}

function requireSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function processImage(bytes: Buffer) {
  const pipeline = sharp(bytes, { failOn: "error" })
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 });
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

async function main() {
  const { confirm, orgSlug } = parseArgs();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const workspaceRoot = path.resolve(here, "../..");
  const catalogPath = path.join(
    workspaceRoot,
    "brain/reports/catalog.json",
  );

  if (!existsSync(catalogPath)) {
    throw new Error(`Catalog not found: ${catalogPath}`);
  }

  const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as CatalogEntry[];
  const candidates = catalog.filter(isIncluded);

  const org = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { slug: true },
  });
  if (!org) {
    throw new Error(`Organization not found: ${orgSlug}`);
  }

  const existing = await prisma.stockMedia.findMany({
    where: { orgSlug },
    select: { sourcePath: true },
  });
  const existingPaths = new Set(existing.map((r) => r.sourcePath));

  const supabase = confirm ? requireSupabase() : null;

  let uploaded = 0;
  let skipped = 0;
  let missing = 0;
  let failed = 0;

  console.log(
    `${confirm ? "WRITING" : "DRY-RUN"} stock media import for org=${orgSlug}\n` +
      `  catalog entries: ${catalog.length}\n` +
      `  candidates: ${candidates.length}\n` +
      `  already in DB: ${existingPaths.size}`,
  );

  for (let i = 0; i < candidates.length; i++) {
    const entry = candidates[i];
    if (existingPaths.has(entry.path)) {
      skipped++;
      continue;
    }

    const absPath = path.join(workspaceRoot, entry.path);
    if (!existsSync(absPath)) {
      missing++;
      console.warn(`  [missing] ${entry.path}`);
      continue;
    }

    if (!confirm) {
      uploaded++;
      continue;
    }

    try {
      const bytes = readFileSync(absPath);
      const processed = await processImage(bytes);
      const storagePath = `${orgSlug}/stock/${randomUUID()}.webp`;

      const { error: uploadError } = await supabase!.storage
        .from(BUCKET)
        .upload(storagePath, processed.buffer, {
          contentType: "image/webp",
          upsert: false,
          cacheControl: "31536000",
        });
      if (uploadError) {
        failed++;
        console.warn(`  [upload failed] ${entry.path}: ${uploadError.message}`);
        continue;
      }

      const { data: publicData } = supabase!.storage
        .from(BUCKET)
        .getPublicUrl(storagePath);

      await prisma.stockMedia.create({
        data: {
          orgSlug,
          url: publicData.publicUrl,
          storagePath,
          title: titleFromPath(entry.path, entry.name),
          sourcePath: entry.path,
          region: entry.region ?? null,
          domain: entry.domain ?? null,
          width: processed.width,
          height: processed.height,
          displayOrder: i,
        },
      });

      existingPaths.add(entry.path);
      uploaded++;
      if (uploaded % 25 === 0) {
        console.log(`  uploaded ${uploaded}…`);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  [failed] ${entry.path}: ${msg}`);
    }
  }

  console.log(
    `\nDone (${confirm ? "written" : "dry-run, nothing written"}):\n` +
      `  candidates: ${candidates.length}\n` +
      `  uploaded: ${uploaded}\n` +
      `  skipped (already in DB): ${skipped}\n` +
      `  missing on disk: ${missing}\n` +
      `  failed: ${failed}`,
  );

  if (!confirm) {
    console.log("\nRe-run with --confirm to upload and insert.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
