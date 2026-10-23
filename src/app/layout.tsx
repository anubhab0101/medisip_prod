import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/provider";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://127.0.0.1:3000"),
  title: {
    default: "MediShop · Simple pharmacy management",
    template: "%s · MediShop",
  },
  openGraph: {
    title: "MediShop · Simple pharmacy management",
    description:
      "Manage pharmacy billing, medicine stock, doctor appointments and customer messages.",
    type: "website",
  },
  twitter: { card: "summary", title: "MediShop · Simple pharmacy management" },
  description: "Simple billing, stock, appointments and customer messages.",
};
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
