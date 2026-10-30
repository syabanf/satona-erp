/** Resolves a theme token such as `--color-accent` to a colour three.js can use. */
export const cssColor = (token: string) => getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#888'
