import type { Metadata } from "next";
import { IBM_Plex_Sans, Kalnia } from "next/font/google";
import "./globals.css";

const kalnia = Kalnia({
  subsets: ["latin"],
  variable: "--font-kalnia",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-ibm-plex-sans",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "No Unpleasant Notes — Groove alchemy on a grand staff",
  description:
    "A small music lab: random arpeggios and chords on treble & bass staves, with an optional modern house four-on-the-four groove. Listen, don't drill.",
  icons: {
    icon: [{ url: "/race-li-avatar.jpg", type: "image/jpeg" }],
    apple: "/race-li-avatar.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${kalnia.variable} ${ibmPlexSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
