import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Camel Calculator — Count the Camels",
  description:
    "A ludicrously overproduced, fictional attraction and compatibility quiz for consenting adults.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "Camel Calculator",
    description: "Two minutes. One desert. An unreasonable number of camels.",
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
