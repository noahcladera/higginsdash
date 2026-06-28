import { requireMember } from "@/lib/auth/require-member";
import { PortalPageHeader } from "@/components/portal/portal-page-header";
import { InboxFeed } from "@/components/inbox/inbox-feed";
import { getMemberInbox } from "@/lib/inbox/queries";

/**
 * Member inbox.
 *
 * Surfaces every in-app notification we've sent to this person —
 * cancellation decisions, refund recordings, waitlist promotions, etc.
 * Crucially this is the *one* place a member can verify "yes, the system
 * heard me" after submitting a request. Notifications are also the
 * row-level proof that emails were queued (or stub-logged in dev).
 */
export default async function PortalInboxPage() {
  const { person } = await requireMember();
  const items = await getMemberInbox(person.id);

  return (
    <div className="space-y-10">
      <PortalPageHeader
        kicker="Inbox"
        title="What's new for you"
        description="Schedule changes, waitlist promotions, refunds, and payment updates — your official channel when rain or holidays affect class."
      />
      <InboxFeed items={items} basePath="/portal" />
    </div>
  );
}
