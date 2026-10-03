/**
 * Aritmetica de paginas para listados largos. Pura, para poder probarla.
 * `page` es 1-based y se normaliza al rango valido (una URL con
 * `?pagina=999` cae en la ultima pagina en vez de mostrar una lista vacia).
 */
export type PageWindow = {
  page: number;
  pages: number;
  size: number;
  total: number;
  /** Indice (0-based) de la primera fila de la pagina, para `.range()`. */
  offset: number;
  /** Numero (1-based) de la primera y ultima fila mostradas; 0 si no hay. */
  first: number;
  last: number;
  hasPrev: boolean;
  hasNext: boolean;
};

export function pageWindow(
  total: number,
  requestedPage: number,
  size: number,
): PageWindow {
  const safeSize = Math.max(1, Math.floor(size));
  const safeTotal = Math.max(0, Math.floor(total));
  const pages = Math.max(1, Math.ceil(safeTotal / safeSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), pages);
  const offset = (page - 1) * safeSize;
  const shown = Math.max(0, Math.min(safeSize, safeTotal - offset));
  return {
    page,
    pages,
    size: safeSize,
    total: safeTotal,
    offset,
    first: shown === 0 ? 0 : offset + 1,
    last: offset + shown,
    hasPrev: page > 1,
    hasNext: page < pages,
  };
}

/** Lee `?pagina=` como entero >= 1 (cualquier otra cosa es la pagina 1). */
export function parsePageParam(value: string | undefined): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}
