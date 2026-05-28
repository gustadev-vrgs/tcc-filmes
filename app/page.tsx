export default function Home() {
  return (
    <main className="page">
      <section className="card">
        <h1>SmartSeek AI</h1>
        <p>Estrutura base pronta para deploy na Vercel.</p>
        <p className="notice">
          Configure as variáveis <code>OMDB_API_KEY</code> e <code>OPENAI_API_KEY</code> para habilitar a
          integração completa.
        </p>
      </section>
    </main>
  );
}
