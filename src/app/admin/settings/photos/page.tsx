import { requireAdmin } from "@/lib/auth/require-admin";
import { getMarketingImages } from "@/lib/uploads/marketing-images";
import { PhotosEditor } from "./photos-editor";

export default async function AdminSettingsPhotosPage() {
  await requireAdmin();
  const images = await getMarketingImages();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Portal photos</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Images for club tiles, enrollment promo strips, and membership cards.
          Program and class covers are set per program/class in their own admin
          forms.
        </p>
      </div>
      <PhotosEditor initial={images} />
    </div>
  );
}
