import { requireMember } from "@/lib/auth/require-member";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { InboxFeed } from "@/components/inbox/inbox-feed";
import { getInbox } from "@/lib/inbox/queries";

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
  const items = await getInbox(person.id);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Inbox"
        title="What's new for you"
        description="Updates we've sent — request decisions, waitlist promotions, refunds and so on."
      />
      <Section title="Recent notifications">
        <InboxFeed items={items} basePath="/portal" />
      </Section>
    </div>
  );
}
