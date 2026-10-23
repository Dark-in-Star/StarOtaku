import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { NavBar, NavBarFallback } from "@/components/NavBar";
import { NavAccount, NavAccountFallback } from "@/components/NavAccount";
import { BottomNav, BottomNavFallback } from "@/components/BottomNav";
import { Footer } from "@/components/Footer";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Starotaku",
    template: "%s · Starotaku",
  },
  description: "Browse, search, stream, and track anime and manga using the MyAnimeList API.",
  icons: {
    icon: "/logo.webp",
    shortcut: "/logo.webp",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fff9f9" },
    { media: "(prefers-color-scheme: dark)", color: "#140f0f" },
  ],
};

const THEME_INIT_SCRIPT = `
  (function () {
    try {
      var stored = localStorage.getItem("theme");
      var theme = stored === "light" || stored === "dark" ? stored : "dark";
      document.documentElement.setAttribute("data-theme", theme);
    } catch (e) {}
  })();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Suspense fallback={<NavBarFallback account={<NavAccountFallback />} />}>
          <NavBar
            account={
              <Suspense fallback={<NavAccountFallback />}>
                <NavAccount />
              </Suspense>
            }
          />
        </Suspense>
        <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-2 pb-6 sm:px-6 sm:py-8">{children}</main>
        <Footer />
        <div className="h-16 lg:hidden" aria-hidden="true" />
        <Suspense fallback={<BottomNavFallback />}>
          <BottomNav />
        </Suspense>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
