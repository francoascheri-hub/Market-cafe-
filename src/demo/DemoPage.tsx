import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import './demo.css'

// Public URL the classroom QR code points to. Override with ?url=... for testing.
export const DEMO_URL = 'https://market-cafe-preorder.vercel.app/#/'

function getTargetUrl(): string {
  const override = new URLSearchParams(window.location.search).get('url')
  return override || DEMO_URL
}

const LINKS = [
  { label: 'Staff view', href: '#/staff' },
  { label: 'Ready board', href: '#/board' },
  { label: 'Metrics', href: '#/staff/metrics' },
  { label: 'Student app', href: '#/' },
]

export default function DemoPage() {
  const [url] = useState(getTargetUrl)
  const [qrSrc, setQrSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 800,
      color: { dark: '#00543C', light: '#FFFFFF' },
    }).then((src) => {
      if (!cancelled) setQrSrc(src)
    })
    return () => {
      cancelled = true
    }
  }, [url])

  // Readable form under the QR, e.g. "market-cafe-preorder.vercel.app"
  const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/?#\/?$/, '').replace(/\/$/, '')

  return (
    <div className="demo">
      <header className="header">
        <h1>Market Café Pre-Order</h1>
        <span className="demo-tag">Class demo · USF BENI-349</span>
      </header>

      <main className="demo-main">
        <section className="card demo-qr-card">
          {qrSrc ? (
            <img className="demo-qr" src={qrSrc} alt="QR code to open the Market Café Pre-Order app" />
          ) : (
            <div className="demo-qr" aria-hidden="true" />
          )}
          <p className="demo-url">{displayUrl}</p>
        </section>

        <section className="demo-info">
          <span className="label">Pay with your USF ID, skip the line</span>
          <h2 className="demo-title">Scan to order</h2>
          <div className="accent-bar" />
          <ol className="demo-steps">
            <li>Sign in with your USF ID (demo)</li>
            <li>Pick food + a pickup time</li>
            <li>Pay with Dons Dollars or Flexi — watch your number appear on the board</li>
          </ol>

          <nav className="demo-links" aria-label="Demo views">
            {LINKS.map((link) => (
              <a key={link.href} className="btn outline" href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            ))}
          </nav>

          <p className="muted demo-note">Pilot: mock USF sign-in and payment. No real charges.</p>
        </section>
      </main>
    </div>
  )
}
