/**
 * Jerarquia de categorias: padre -> subcategoria, a un solo nivel. Logica
 * pura (sin base de datos) para poder probar las reglas.
 *
 * Reglas:
 *  - Solo hay dos niveles: una subcategoria no puede tener hijas.
 *  - Padre e hija son del mismo tipo (ingreso o gasto).
 *  - Un presupuesto de un padre incluye lo gastado en sus subcategorias, salvo
 *    las que tengan presupuesto propio (se usa el mas especifico, sin doble conteo).
 */

export type CategoryLike = {
  id: string;
  name: string;
  kind: "income" | "expense";
  parent_id: string | null;
  sort_order?: number | null;
};

export type OrderedCategory<T extends CategoryLike> = T & {
  /** 0 = categoria principal, 1 = subcategoria. */
  depth: 0 | 1;
  /** "Padre › Hija" para una subcategoria; el nombre solo para una principal. */
  label: string;
};

export const PATH_SEPARATOR = " › ";

function compare(a: CategoryLike, b: CategoryLike): number {
  const bySort = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  return bySort !== 0 ? bySort : a.name.localeCompare(b.name, "es");
}

/**
 * Ordena para mostrar: cada principal seguida de sus subcategorias. Una
 * subcategoria cuyo padre no esta en la lista (p. ej. porque se filtro por
 * tipo) se trata como principal.
 */
export function orderCategories<T extends CategoryLike>(
  categories: T[],
): OrderedCategory<T>[] {
  const ids = new Set(categories.map((c) => c.id));
  const byParent = new Map<string, T[]>();
  const roots: T[] = [];

  for (const c of categories) {
    if (c.parent_id && ids.has(c.parent_id)) {
      const list = byParent.get(c.parent_id) ?? [];
      list.push(c);
      byParent.set(c.parent_id, list);
    } else {
      roots.push(c);
    }
  }

  const out: OrderedCategory<T>[] = [];
  for (const root of roots.sort(compare)) {
    out.push({ ...root, depth: 0, label: root.name });
    for (const child of (byParent.get(root.id) ?? []).sort(compare)) {
      out.push({
        ...child,
        depth: 1,
        label: `${root.name}${PATH_SEPARATOR}${child.name}`,
      });
    }
  }
  return out;
}

/** id -> etiqueta ("Padre › Hija"), para rotular montos y reportes. */
export function categoryLabels(categories: CategoryLike[]): Map<string, string> {
  return new Map(orderCategories(categories).map((c) => [c.id, c.label]));
}

/** El id de la categoria y los de sus subcategorias directas. */
export function withDescendants(categories: CategoryLike[], id: string): string[] {
  return [id, ...categories.filter((c) => c.parent_id === id).map((c) => c.id)];
}

/**
 * Valida colgar `childId` de `parentId` (o crearla con ese padre si childId es
 * null). Devuelve el mensaje de error o null si esta bien. `parentId` null
 * (dejarla como principal) siempre es valido.
 */
export function checkParent(
  categories: CategoryLike[],
  childId: string | null,
  parentId: string | null,
  kind: "income" | "expense",
): string | null {
  if (parentId === null) return null;
  if (childId !== null && childId === parentId) {
    return "Una categoría no puede ser subcategoría de sí misma.";
  }
  const parent = categories.find((c) => c.id === parentId);
  if (!parent) return "No encontramos la categoría principal elegida.";
  if (parent.kind !== kind) {
    return "La subcategoría debe ser del mismo tipo (ingreso o gasto) que su principal.";
  }
  if (parent.parent_id !== null) {
    return "Solo hay dos niveles: no se puede crear una subcategoría dentro de otra.";
  }
  if (childId !== null && categories.some((c) => c.parent_id === childId)) {
    return "Esta categoría ya tiene subcategorías: muévelas o bórralas antes de convertirla en subcategoría.";
  }
  return null;
}

/**
 * Cambia el nombre de la categoria embebida en cada fila por su etiqueta
 * completa ("Padre › Hija"), para que los reportes y presupuestos muestren la
 * ruta sin tocar la logica que agrupa por id. No muta las filas originales.
 */
export function withCategoryLabels<
  T extends {
    category_id?: string | null;
    category?: { id: string; name: string } | null;
  },
>(rows: T[], labels: Map<string, string>): T[] {
  return rows.map((row) => {
    const id = row.category_id;
    const label = id ? labels.get(id) : undefined;
    return label && row.category
      ? { ...row, category: { ...row.category, name: label } }
      : row;
  });
}

/**
 * Para presupuestos: reasigna cada gasto a la categoria con presupuesto que
 * lo cubre. Si su propia categoria tiene presupuesto, se queda; si no, pero su
 * padre si, pasa al padre; en otro caso queda igual (sin presupuesto).
 */
export function rollUpToBudgeted<T extends { category_id?: string | null }>(
  expenses: T[],
  categories: CategoryLike[],
  budgetedCategoryIds: Set<string>,
): T[] {
  const parentOf = new Map(categories.map((c) => [c.id, c.parent_id]));
  return expenses.map((e) => {
    const id = e.category_id;
    if (!id || budgetedCategoryIds.has(id)) return e;
    const parent = parentOf.get(id);
    return parent && budgetedCategoryIds.has(parent) ? { ...e, category_id: parent } : e;
  });
}
