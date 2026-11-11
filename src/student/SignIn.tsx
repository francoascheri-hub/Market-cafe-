import { useState } from 'react'
import { signIn } from '../store'
import { PhotoCredit } from './photos'

export default function SignIn() {
  // Prefilled demo values so the demo is one tap.
  const [name, setName] = useState('Maya')
  const [usfId, setUsfId] = useState('20481234')
  const valid = name.trim() !== '' && /^\d{8}$/.test(usfId)

  return (
    <form
      className="page stack-lg"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) signIn({ name: name.trim(), usfId })
      }}
    >
      <picture className="st-hero" data-phone-fill>
        <source media="(max-width: 639px)" srcSet="/photos/photo-m61713028-780x975.webp" />
        <img
          src="/photos/photo-m61713028-960.webp"
          srcSet="/photos/photo-m61713028-500.webp 500w, /photos/photo-m61713028-960.webp 960w, /photos/photo-m61713028-1280.webp 1280w"
          sizes="560px"
          width="960"
          height="640"
          alt="Espresso running from a bottomless portafilter at a chrome machine"
          fetchPriority="high"
          decoding="async"
          data-source="library-057"
          data-subject="bar"
          style={{ objectPosition: '60% 50%' }}
        />
      </picture>
      <div>
        <h2 className="st-title">Market Café for USF students</h2>
        <div className="accent-bar" />
        <p className="st-lede">
          Order before class and pick it up from a numbered cubby. The lunch line runs 15–25 minutes.
        </p>
      </div>
      <div className="stack">
        <label className="st-field">
          Name
          <input className="st-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
        </label>
        <label className="st-field">
          USF ID
          <input
            className="st-input"
            value={usfId}
            onChange={(e) => setUsfId(e.target.value.replace(/\D/g, '').slice(0, 8))}
            inputMode="numeric"
            aria-describedby="usf-id-hint"
          />
        </label>
        <p id="usf-id-hint" className="muted st-hint">8 digits</p>
      </div>
      <div className="stack">
        <button className="btn" type="submit" disabled={!valid}>
          Sign in with USF ID
        </button>
        <p className="muted">Demo only: no real USF login, no real charges</p>
      </div>
      <PhotoCredit />
    </form>
  )
}
