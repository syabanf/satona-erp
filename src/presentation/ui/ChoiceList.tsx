import type { Choice } from '@/domain/assessments'
import { cn } from '@/lib/cn'

/**
 * Numbered multiple-choice items as radio groups. After `reveal`, the right option turns green and a wrong pick red.
 */
export function ChoiceList({ items, answers, onAnswer, reveal = false }: { items: readonly Choice[]; answers: readonly (number | undefined)[]; onAnswer: (index: number, option: number) => void; reveal?: boolean }) {
  return (
    <ol className="space-y-4">
      {items.map((item, i) => (
        <li key={i}>
          <p className="text-sm font-medium">
            <span className="mr-2 text-muted tabular">{i + 1}.</span>
            {item.q}
          </p>
          <div role="radiogroup" aria-label={`Soal ${i + 1}`} className="mt-2 grid gap-2 sm:grid-cols-2">
            {item.options.map((option, o) => {
              const picked = answers[i] === o
              const right = reveal && item.answer === o
              const wrong = reveal && picked && item.answer !== undefined && item.answer !== o
              return (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  disabled={reveal}
                  onClick={() => onAnswer(i, o)}
                  className={cn(
                    'min-h-11 cursor-pointer rounded-panel border px-4 py-2 text-left text-sm transition-colors disabled:cursor-default',
                    right ? 'border-success bg-success-soft text-success' : wrong ? 'border-danger bg-danger-soft text-danger' : picked ? 'border-transparent bg-invert text-on-invert' : 'border-line-strong bg-raised hover:bg-control',
                  )}
                >
                  {option}
                </button>
              )
            })}
          </div>
        </li>
      ))}
    </ol>
  )
}
