/** Quantities between a material's own unit and tonnes, the unit the plant plans, weighs and costs in. */

const n = (v: unknown) => Number(v) || 0

/** Tonnes per one unit of `uom`; volume units go through the material's density in tonnes per cubic metre. */
function tonnesPer(uom: unknown, density: unknown) {
  const d = n(density) || 1
  if (uom === 'kg') return 0.001
  if (uom === 'm³') return d
  if (uom === 'L') return d / 1000
  return 1
}

/** A quantity in the material's unit as tonnes. */
export const toTonnes = (qty: number, material?: { values: Record<string, unknown> }) => Math.round(qty * tonnesPer(material?.values.uom, material?.values.density) * 1000) / 1000

/** Tonnes as a quantity in the material's unit. */
export const fromTonnes = (tonnes: number, material?: { values: Record<string, unknown> }) => Math.round((tonnes / tonnesPer(material?.values.uom, material?.values.density)) * 1000) / 1000
