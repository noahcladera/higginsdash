import { v5 as uuidv5 } from "uuid";

/**
 * `organizations` rows are keyed by `slug` (text), but `audit_log.row_id` is
 * `@db.Uuid`. Use a deterministic v5 UUID per slug so audits stay valid and
 * queryable (same slug → same synthetic id).
 */
const ORG_SLUG_AUDIT_NAMESPACE = "a3b8f920-5c1d-4f2e-9b0a-7e8d6c5b4a39";

export function auditRowIdForOrganizationSlug(slug: string): string {
  return uuidv5(slug.trim(), ORG_SLUG_AUDIT_NAMESPACE);
}
