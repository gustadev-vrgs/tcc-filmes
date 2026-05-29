import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AskFilmX",
  description: "Curadoria audiovisual com busca inteligente e recomendações por IA generativa."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
