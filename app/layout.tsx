import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AskFilmX",
  description: "Encontre filmes e séries com busca por título e recomendações com IA, sem spoilers importantes."
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
