/** Minusculas y sin tildes, para comparar nombres ("Educación" == "educacion"). */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}
