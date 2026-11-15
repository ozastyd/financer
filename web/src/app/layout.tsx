import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppProvider } from "@/components/app-provider";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const DESCRIPTION = "Uangmu, tujuanmu, masa depanmu.";

// Icons come from the file conventions in this folder (favicon.ico, icon.png,
// apple-icon.png, opengraph-image.png, twitter-image.png) and manifest.ts.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "https://financer.my.id"),
  title: "Financer",
  applicationName: "Financer",
  description: DESCRIPTION,
  appleWebApp: { capable: true, title: "Financer", statusBarStyle: "default" },
  openGraph: { title: "Financer", description: DESCRIPTION, siteName: "Financer", locale: "id_ID", type: "website" },
  twitter: { card: "summary_large_image", title: "Financer", description: DESCRIPTION },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F6F2" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1220" },
  ],
};

// Applies the saved theme before first paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('fo-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <AppProvider>
          <div className="app-col">{children}</div>
        </AppProvider>
      </body>
    </html>
  );
}
