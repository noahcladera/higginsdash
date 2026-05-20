import type { Metadata, Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { getCurrentOrg } from "@/lib/tenant";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz"],
});

// Brand- and terminology-aware metadata. Reads the current tenant's
// brand + terms so a music-school pilot doesn't get "Members and
// coaches of Higgins Tennis NL" in the tab title. Falls back to a
// generic description if the resolver fails (e.g. broken cookie at
// the very edge of the request lifecycle).
export async function generateMetadata(): Promise<Metadata> {
  try {
    const org = await getCurrentOrg();
    const t = org.terms;
    return {
      title: org.brand.displayName,
      description: `${t.member.plural} and ${t.coach.plural.toLowerCase()} of ${org.brand.displayName}`,
    };
  } catch {
    return {
      title: "Members area",
      description: "Sign in to manage your account.",
    };
  }
}

// Mobile browser chrome (Safari notch tint, Android URL bar) follows
// the OS scheme. Hex values mirror the `--background` token in
// globals.css for light + dark.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf9f3" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1d24" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="bg-[var(--background)] text-[var(--foreground)] antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
