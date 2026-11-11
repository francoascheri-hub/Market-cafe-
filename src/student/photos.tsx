// Stand-in photographs from the taste-skill cafe library. Not the Market Café.
// One credit line for the set. Nothing is written on the pictures.

export function MenuStrip() {
  return (
    <div className="st-strip">
      <figure>
        <img
          src="/photos/photo-m187311853-1200.webp"
          width="1200"
          height="800"
          alt="A barista's hands tamping ground coffee in a portafilter beside an espresso machine"
          loading="lazy"
          decoding="async"
          data-source="library-057"
          data-subject="bar"
          style={{ objectPosition: '58% 50%' }}
        />
      </figure>
      <figure>
        <img
          src="/photos/photo-m201752739-960.webp"
          srcSet="/photos/photo-m201752739-500.webp 500w, /photos/photo-m201752739-960.webp 960w"
          sizes="240px"
          width="960"
          height="1434"
          alt="Milk steamed into a red pitcher at the machine, hands only"
          loading="lazy"
          decoding="async"
          data-source="library-057"
          data-subject="bar"
          style={{ objectPosition: '40% 55%' }}
        />
      </figure>
    </div>
  )
}

export function PhotoCredit() {
  return (
    <p className="photo-credit">
      Photos by{' '}
      <a href="https://commons.wikimedia.org/wiki/File:Latte_in_a_coffee_machine_(Unsplash).jpg">Blake Richard Verdoorn</a>
      , CC0, and{' '}
      <a href="https://commons.wikimedia.org/wiki/File:Barista_prepares_espresso_at_coffee_shop.jpg">Shixart1985</a>
      , CC BY 2.0, via Wikimedia Commons
    </p>
  )
}
