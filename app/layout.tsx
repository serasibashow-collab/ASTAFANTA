import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asta Fantacalcio Live",
  description: "Asta real-time per lega Fantacalcio a 10"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
