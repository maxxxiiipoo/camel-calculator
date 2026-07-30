import type { Metadata } from "next";
import "./globals.css";
import "./visual.css";

export const metadata: Metadata = {
  title: "Camel Calculator — Count the Camels",
  description:
    "A privacy-first visual attraction game for consenting adults, scored by a deterministic fictional camel rubric.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Camel Calculator",
    description: "Upload. Observe. Reveal an unreasonable number of fictional camels.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
