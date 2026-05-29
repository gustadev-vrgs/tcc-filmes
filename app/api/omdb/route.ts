import { NextResponse } from "next/server";

type OmdbSearchItem = {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster: string;
};

type OmdbSearchSuccess = {
  Response: "True";
  Search: OmdbSearchItem[];
  totalResults: string;
};

type OmdbDetailsSuccess = OmdbSearchItem & {
  Response: "True";
  Plot?: string;
  Genre?: string;
  Director?: string;
  Actors?: string;
  imdbRating?: string;
};

type OmdbError = {
  Response: "False";
  Error: string;
};

type OmdbResponse = OmdbSearchSuccess | OmdbDetailsSuccess | OmdbError;

const OMDB_URL = "https://www.omdbapi.com/";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const apiKey = process.env.OMDB_API_KEY;

  if (!apiKey) {
    return jsonError("A chave da OMDb não está configurada no servidor.", 500);
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const q = searchParams.get("q")?.trim();
  const id = searchParams.get("id")?.trim();
  const page = searchParams.get("page") ?? "1";

  const omdbParams = new URLSearchParams({ apikey: apiKey });

  if (type === "search") {
    if (!q) {
      return jsonError("Informe um título para buscar usando o parâmetro q.", 400);
    }

    const pageNumber = Number(page);

    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      return jsonError("Informe uma página válida maior ou igual a 1.", 400);
    }

    omdbParams.set("s", q);
    omdbParams.set("page", String(pageNumber));
  } else if (type === "details") {
    if (!id) {
      return jsonError("Informe um IMDb ID usando o parâmetro id.", 400);
    }

    omdbParams.set("i", id);
    omdbParams.set("plot", "full");
  } else {
    return jsonError("Tipo de busca inválido. Use type=search ou type=details.", 400);
  }

  try {
    const response = await fetch(`${OMDB_URL}?${omdbParams.toString()}`, {
      next: { revalidate: 60 * 60 }
    });

    if (!response.ok) {
      return jsonError("Não foi possível consultar a OMDb no momento.", response.status);
    }

    const data = (await response.json()) as OmdbResponse;

    if (data.Response === "False") {
      const status = data.Error.toLowerCase().includes("not found") ? 404 : 400;
      return jsonError(data.Error, status);
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Erro ao consultar a OMDb:", error);
    return jsonError("Erro inesperado ao consultar a OMDb.", 500);
  }
}
