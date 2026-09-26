import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CineStream — Watch Movies & Series Free",
  description:
    "CineStream is a free streaming hub for movies and TV series. Browse trending titles, search across genres, and watch instantly in HD — no ads, no popups, no app downloads.",
  keywords: [
    "CineStream",
    "free movies online",
    "watch series online",
    "stream movies free",
    "HD streaming",
    "no ads streaming",
  ],
  authors: [{ name: "CineStream" }],
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: "CineStream — Watch Movies & Series Free",
    description:
      "Browse trending titles, search across genres, and watch instantly in HD.",
    siteName: "CineStream",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CineStream — Watch Movies & Series Free",
    description: "Free HD streaming, no ads, no popups.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
