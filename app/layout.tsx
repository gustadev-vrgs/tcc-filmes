import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartSeek AI",
  description: "Protótipo web para busca de filmes e recomendações com IA"
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
