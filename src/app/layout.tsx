import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NavBar } from "@/components/NavBar";
import { BottomNav } from "@/components/BottomNav";
import { Footer } from "@/components/Footer";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { Providers } from "./Providers";
import { getMyUserInfo } from "@/lib/api";
import { getSession } from "@/lib/session";
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
    { media: "(prefers-color-scheme: light)", color: "#fffaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#14100f" },
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const session = await getSession();

  let pictureUrl: string | undefined;
  let userName: string | undefined;
  if (session) {
    try {
      const user = await getMyUserInfo("picture");
      pictureUrl = user.picture;
      userName = user.name;
    } catch {
      // Session cookie present but the profile fetch failed (e.g. a revoked token
      // middleware hasn't caught yet) — fall back to the icon-only avatar state.
    }
  }

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
        <Providers>
          <NavBar isAuthenticated={Boolean(session)} pictureUrl={pictureUrl} userName={userName} />
          <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-2 pb-6 sm:px-6 sm:py-8">{children}</main>
          <Footer />
          <div className="h-16 lg:hidden" aria-hidden="true" />
          <BottomNav />
        </Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
