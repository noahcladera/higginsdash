import { DetailPageSkeleton } from "@/components/ui/skeleton";

export default function CoachAcceptInviteLoading() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <DetailPageSkeleton withBackLink={false} secondaryRows={2} />
    </div>
  );
}
