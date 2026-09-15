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

export type MovieDetails = OmdbSearchItem & {
  Rated?: string;
  Released?: string;
  Runtime?: string;
  Genre?: string;
  Director?: string;
  Writer?: string;
  Actors?: string;
  Plot?: string;
  imdbRating?: string;
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
