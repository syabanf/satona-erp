/** A lookup by id found nothing. Pages show a "not found" state instead of a crash. */
export class NotFoundError extends Error {
  constructor(what: string, id: string) {
    super(`No ${what} with id "${id}"`)
    this.name = 'NotFoundError'
  }
}

/** Finds by id or throws NotFoundError, so every detail use case fails the same way. */
export function findById<T extends { id: string }>(list: readonly T[], id: string, what: string): T {
  const found = list.find((item) => item.id === id)
  if (!found) throw new NotFoundError(what, id)
  return found
}

/** The current role may not do this. */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForbiddenError'
  }
}

/** The values failed the record schema; `fields` maps each field to its message. */
export class ValidationError extends Error {
  readonly fields: Record<string, string>
  constructor(fields: Record<string, string>) {
    super(Object.values(fields)[0] ?? 'Check the highlighted fields')
    this.name = 'ValidationError'
    this.fields = fields
  }
}
