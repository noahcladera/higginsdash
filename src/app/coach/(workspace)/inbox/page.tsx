import { requireCoach } from "@/lib/auth/require-coach";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { InboxFeed } from "@/components/inbox/inbox-feed";
import { getInbox } from "@/lib/inbox/queries";

/**
 * Coach inbox.
 *
 * For coaches the inbox is mostly: a sub request was filled, a class was
 * cancelled, a member withdrew. The same notify() pipeline that fills
 * the member inbox fills this one — coaches are added as recipients
 * whenever a class-level event happens (see notifications/recipients.ts).
 */
export default async function CoachInboxPage() {
  const { person } = await requireCoach();
  const items = await getInbox(person.id);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Inbox"
        title="What's new"
        description="Class changes, sub decisions and roster updates we've sent your way."
      />
      <Section title="Recent notifications">
        <InboxFeed items={items} basePath="/coach" />
      </Section>
    </div>
  );
}
