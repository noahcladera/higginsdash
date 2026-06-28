/**
 * Re-mounts portal page content on each navigation with a soft fade-in
 * so route changes feel like a transition rather than a hard cut.
 */
export default function PortalTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="fade-in">{children}</div>;
}
