/** Pop surfaces: bright Satona feature cards. Each entry pairs the fill with the text colour that passes on it. */
export type Pop = 'red' | 'sun' | 'ink' | 'blush' | 'mist'

export const POP: Record<Pop, string> = {
  red: 'bg-pop-red text-white',
  sun: 'bg-pop-sun text-ink',
  ink: 'bg-pop-ink text-white ring-1 ring-white/10',
  blush: 'bg-pop-blush text-ink',
  mist: 'bg-pop-mist text-ink',
}

/** Order for lists that cycle pops (shortcut tiles, menu, avatars). */
export const POP_ORDER: readonly Pop[] = ['red', 'sun', 'ink', 'blush', 'mist']
