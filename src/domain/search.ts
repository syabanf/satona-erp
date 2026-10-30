/** Ranking for the global search: every word must match; ids and titles that start with the query rank first. */
export interface SearchDoc {
  id: string
  title: string
  text: string
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

/** Higher is better; 0 means no match. */
export function score(doc: SearchDoc, query: string): number {
  const q = norm(query.trim())
  if (!q) return 0
  const id = norm(doc.id)
  const title = norm(doc.title)
  const all = `${id} ${title} ${norm(doc.text)}`
  if (!q.split(/\s+/).every((w) => all.includes(w))) return 0
  if (id === q) return 100
  if (id.startsWith(q) || id.endsWith(q)) return 80
  if (title === q) return 70
  if (title.startsWith(q)) return 60
  if (title.includes(q)) return 40
  return 10
}

export function search<T extends SearchDoc>(docs: readonly T[], query: string, limit = 8): T[] {
  return docs
    .map((d) => ({ d, s: score(d, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.d.title.localeCompare(b.d.title))
    .slice(0, limit)
    .map((x) => x.d)
}
