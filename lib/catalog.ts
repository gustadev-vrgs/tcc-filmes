export type Language = "pt-BR" | "en";

export type CatalogKind = "Filme" | "Série";

export type OmdbSearchItem = {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster: string;
};

export type CatalogItem = {
  id: string;
  title: string;
  year: string;
  type: CatalogKind;
  poster: string;
};

export type MovieDetails = {
  id: string;
  ids: { imdb: string | null; tmdb: number | null };
  mediaType: "movie" | "series";
  title: string;
  year: string | null;
  poster: string | null;
  source: "omdb" | "tmdb";
  plot: string | null;
  runtime: string | null;
  genre: string | null;
  director: string | null;
  writer: string | null;
  actors: string | null;
  imdbRating: string | null;
  partial: boolean;
};

export function mapOmdbItem(item: OmdbSearchItem): CatalogItem {
  return {
    id: item.imdbID,
    title: item.Title,
    year: item.Year,
    type: item.Type === "series" ? "Série" : "Filme",
    poster: item.Poster
  };
}
