// A few line icons (Lucide shapes), one size and stroke. Decorative: the button text or aria-label names the action.
const paths = {
  plus: 'M5 12h14M12 5v14',
  minus: 'M5 12h14',
  back: 'm15 18-6-6 6-6',
  next: 'm9 18 6-6-6-6',
  down: 'm6 9 6 6 6-6',
  up: 'm18 15-6-6-6 6',
  alert: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01',
}

export function Icon({ name }: { name: keyof typeof paths }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  )
}
