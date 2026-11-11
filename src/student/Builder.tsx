import { useState } from 'react'
import { formatPrice, menu } from '../menu'
import type { OrderLine } from '../types'
import { Icon } from './icons'

const B = menu.burritoBuilder
export const BUILDER_ITEM_ID = 'build-your-own'

interface Props {
  onBack: () => void
  onAdd: (line: OrderLine) => void
}

// Starts empty on purpose: the student picks every required choice.
export default function Builder({ onBack, onAdd }: Props) {
  const [type, setType] = useState<string | null>(null)
  const [proteinId, setProteinId] = useState<string | null>(null)
  const [beans, setBeans] = useState<boolean | null>(null)
  const [rice, setRice] = useState<boolean | null>(null)
  const [guac, setGuac] = useState(false)
  const [toppings, setToppings] = useState<string[]>([])

  const protein = B.proteins.find((p) => p.id === proteinId)
  const missing = !type
    ? 'Choose burrito or bowl'
    : !protein
      ? 'Choose a protein'
      : beans === null
        ? 'Beans or no beans?'
        : rice === null
          ? 'Rice or no rice?'
          : null
  const price = B.basePrice + (protein?.price ?? 0) + (guac ? B.guacamole.price : 0)

  const add = () => {
    if (!type || !protein || beans === null || rice === null) return
    const picked = B.toppings.filter((t) => toppings.includes(t)) // keep menu order
    const details = [
      protein.name,
      beans ? 'Beans' : 'No beans',
      rice ? 'Rice' : 'No rice',
      guac && 'Guacamole',
      picked.length > 0 && picked.join(', '),
    ]
      .filter(Boolean)
      .join(' · ')
    onAdd({
      itemId: BUILDER_ITEM_ID,
      name: type,
      price,
      priceSource: protein.priceSource === 'example' ? 'example' : 'listed',
      qty: 1,
      details,
    })
  }

  const choice = (selected: boolean) => `choice${selected ? ' selected' : ''}`
  const yesNo = (label: string, value: boolean | null, set: (v: boolean) => void) => (
    <section className="stack">
      <h3 className="label">{label}</h3>
      <div className="st-grid two">
        <button className={choice(value === true)} aria-pressed={value === true} aria-label={`${label}: Yes`} onClick={() => set(true)}>
          Yes
        </button>
        <button className={choice(value === false)} aria-pressed={value === false} aria-label={`${label}: No`} onClick={() => set(false)}>
          No
        </button>
      </div>
    </section>
  )

  return (
    <>
      <main className="page stack-lg">
        <div>
          <button className="st-link" onClick={onBack}>
            <Icon name="back" />
            Back to menu
          </button>
          <h2 className="st-title">Build your own burrito or bowl</h2>
          <div className="accent-bar" />
        </div>

        <section className="stack">
          <h3 className="label">Burrito or bowl</h3>
          <div className="st-grid two">
            {B.types.map((t) => (
              <button key={t} className={choice(type === t)} aria-pressed={type === t} onClick={() => setType(t)}>
                {t}
              </button>
            ))}
          </div>
        </section>

        <section className="stack">
          <h3 className="label">Protein</h3>
          {B.proteins.map((p) => (
            <button
              key={p.id}
              className={`${choice(proteinId === p.id)} st-option`}
              aria-pressed={proteinId === p.id}
              onClick={() => setProteinId(p.id)}
            >
              <span>
                {p.name}
                {p.kind === 'special' && <span className="st-small">Daily special</span>}
              </span>
              <span>
                +{formatPrice(p.price)}
                {p.priceSource === 'example' && <span className="example-price">example price</span>}
              </span>
            </button>
          ))}
        </section>

        {yesNo('Beans', beans, setBeans)}
        {yesNo('Rice', rice, setRice)}

        <section className="stack">
          <h3 className="label">Extra</h3>
          <button className={`${choice(guac)} st-option`} aria-pressed={guac} onClick={() => setGuac((g) => !g)}>
            <span>Guacamole</span>
            <span>+{formatPrice(B.guacamole.price)}</span>
          </button>
        </section>

        <section className="stack">
          <h3 className="label">
            Toppings{' '}<span className="label-note">free</span>
          </h3>
          <div className="st-grid two">
            {B.toppings.map((t) => {
              const on = toppings.includes(t)
              return (
                <button
                  key={t}
                  className={choice(on)}
                  aria-pressed={on}
                  onClick={() => setToppings((ts) => (ts.includes(t) ? ts.filter((x) => x !== t) : [...ts, t]))}
                >
                  {t}
                </button>
              )
            })}
          </div>
        </section>
      </main>
      <div className="bottom-bar">
        <button className="btn" disabled={missing !== null} onClick={add}>
          {missing ?? `Add to order · ${formatPrice(price)}`}
        </button>
      </div>
    </>
  )
}
