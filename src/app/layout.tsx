import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "&more Design",
  description: "Your creative operating system",
};

// Every screen reads the live database, so nothing is statically prerendered — this
// also keeps `next build` from opening a database connection before env vars point
// anywhere real.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
