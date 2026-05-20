"use server";

import {
  unlockOrgProfileLock,
  type SaveResult,
} from "@/app/admin/settings/actions";

/**
 * Wrapper for {@link unlockOrgProfileLock} so support UI can use
 * {@link useActionState} without importing the whole settings module from a
 * client file.
 */
export async function unlockOrgProfileFromSupport(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  return unlockOrgProfileLock(formData);
}
