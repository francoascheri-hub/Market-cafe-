import { useState } from 'react'
import { signIn } from '../store'

export default function SignIn() {
  // Prefilled demo values so the demo is one tap.
  const [name, setName] = useState('Maya')
  const [usfId, setUsfId] = useState('20481234')
  const valid = name.trim() !== '' && /^\d{8}$/.test(usfId)

  return (
    <form
      className="page stack"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) signIn({ name: name.trim(), usfId })
      }}
    >
      <div>
        <h2 className="st-title">Market Café Pre-Order</h2>
        <div className="accent-bar" />
        <p>Pay with your USF ID. Skip the line.</p>
      </div>
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
          placeholder="8 digits"
        />
      </label>
      <button className="btn" type="submit" disabled={!valid}>
        Sign in with USF ID
      </button>
      <p className="muted">Demo only — no real USF login.</p>
    </form>
  )
}
