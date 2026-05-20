"use server";

import { randomUUID } from "crypto";
import sharp from "sharp";

import { requireAdmin } from "@/lib/auth/require-admin";
import { requireAuthenticated } from "@/lib/auth/require-authenticated";
import { requireCurrentOrg } from "@/lib/tenant";
import { requireSupabaseAdminClient } from "@/lib/uploads/supabase-admin";

/**
 * Single "upload an image" server action shared by every branding /
 * cover / photo field in the app.
 *
 * Why one action instead of per-entity actions: every upload funnels to
 * the same Supabase Storage bucket, needs the same mime/size/resize
 * guards, and must come from an authenticated request. Centralising it
 * means we can tighten validation (e.g. strip EXIF, enforce webp) once
 * and every caller gets the improvement.
 *
 * Guardrails:
 *   - `requireAdmin` by default. Callers that want non-admin uploads
 *     (coach uploading their own profile photo) call a narrower helper
 *     that also accepts the owner's person id.
 *   - Mime check first (png / jpeg / webp only — no svg, no gif, no
 *     heic passthrough).
 *   - Raw byte cap at 8MB so a malicious client can't stream 500MB
 *     before we reject.
 *   - sharp pipeline decodes, resizes to the kind's max bound, and
 *     re-encodes as webp quality 82. Output is always webp regardless
 *     of input format, which normalises CDN caching and strips EXIF
 *     location data.
 *   - Filename is a server-generated UUID so clients can't probe the
 *     bucket for a predictable path.
 *
 * The bucket (`BUCKET`) is expected to exist and be configured public
 * for read. See `docs` / supabase-storage setup for the one-time
 * `supabase.storage.createBucket("org-media", { public: true })` call.
 */

const BUCKET = "org-media";

/** The kind of image being uploaded — drives resize bounds + storage path. */
export type ImageUploadKind = "logo" | "cover" | "photo";

const KIND_BOUNDS: Record<ImageUploadKind, { max: number }> = {
  logo: { max: 512 },
  cover: { max: 1600 },
  photo: { max: 1024 },
};

const ALLOWED_MIMES: ReadonlySet<string> = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

/** Maximum accepted raw file size, in bytes. 8MB is enough for a phone HEIC. */
const MAX_BYTES = 8 * 1024 * 1024;

export type UploadImageResult =
  | { ok: true; url: string; width: number; height: number }
  | { ok: false; error: string };

/**
 * Upload an image and return its public URL. Throws through the server
 * action boundary (which becomes a 500) only for truly unexpected
 * failures; all validation errors come back as `{ ok: false, error }`
 * so the client can render them inline.
 *
 * FormData contract:
 *   - `file`: the Blob to upload (required).
 *   - `kind`: "logo" | "cover" | "photo" (required).
 *
 * Storage path: `org-media/<orgSlug>/<kind>/<uuid>.webp`.
 */
export async function uploadImage(formData: FormData): Promise<UploadImageResult> {
  const raw = formData.get("file");
  const kindInput = formData.get("kind");
  const kind = String(kindInput ?? "") as ImageUploadKind;
  if (!(kind in KIND_BOUNDS)) {
    return { ok: false, error: "Unknown upload kind." };
  }

  // Guard matches the kind:
  //   - logo / cover are branding / catalog content → admin only.
  //   - photo is a personal profile picture → any signed-in user.
  //     The owning form is responsible for ensuring the URL is stored
  //     against the uploader's own person row.
  try {
    if (kind === "photo") {
      await requireAuthenticated();
    } else {
      await requireAdmin();
    }
  } catch {
    return {
      ok: false,
      error:
        kind === "photo"
          ? "Sign in to upload your photo."
          : "You must be signed in as an admin to upload.",
    };
  }

  const org = await requireCurrentOrg();

  if (!(raw instanceof Blob) || raw.size === 0) {
    return { ok: false, error: "Pick an image to upload." };
  }
  if (raw.size > MAX_BYTES) {
    return { ok: false, error: `Image is too large — max ${MAX_BYTES / (1024 * 1024)}MB.` };
  }
  if (!ALLOWED_MIMES.has(raw.type)) {
    return { ok: false, error: "Only PNG, JPG, and WebP images are supported." };
  }

  const bytes = Buffer.from(await raw.arrayBuffer());

  let processed: { buffer: Buffer; width: number; height: number };
  try {
    const pipeline = sharp(bytes, { failOn: "error" })
      .rotate()
      .resize({
        width: KIND_BOUNDS[kind].max,
        height: KIND_BOUNDS[kind].max,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82 });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    processed = { buffer: data, width: info.width, height: info.height };
  } catch {
    return { ok: false, error: "That file doesn't look like a valid image." };
  }

  const client = requireSupabaseAdminClient();
  const filename = `${org.slug}/${kind}/${randomUUID()}.webp`;
  const { error: uploadError } = await client.storage
    .from(BUCKET)
    .upload(filename, processed.buffer, {
      contentType: "image/webp",
      upsert: false,
      cacheControl: "31536000",
    });
  if (uploadError) {
    return { ok: false, error: `Upload failed: ${uploadError.message}` };
  }

  const { data: publicData } = client.storage.from(BUCKET).getPublicUrl(filename);
  return {
    ok: true,
    url: publicData.publicUrl,
    width: processed.width,
    height: processed.height,
  };
}
