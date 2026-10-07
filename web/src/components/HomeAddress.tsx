import type { Lang } from '../i18n'
import { homeAddressCopy, searchCopy } from '../lib/addressCopy'
import { routes } from '../lib/routes'
import { AddressSearch } from './AddressSearch'
import s from './address.module.css'

/**
 * The address box on the home page: the most useful thing on the site, where
 * everyone lands. Picking an address goes straight to its page.
 */
export function HomeAddress({ lang }: { lang: Lang }) {
  const c = homeAddressCopy(lang)
  return (
    <section className={`${s.hero} ${s.homeAddress}`} aria-labelledby="home-address">
      <div className={s.homeText}>
        <span className={s.kicker}>{c.kicker}</span>
        <h2 id="home-address" className={s.title} style={{ fontSize: 'clamp(28px,5vw,46px)' }}>
          {c.title}
        </h2>
        <p className={s.lead}>{c.lead}</p>
        <a href={routes.address(lang)} className={s.homeMapLink}>
          🗺️ {lang === 'es' ? 'VER EL MAPA DEL CONDADO' : 'SEE THE COUNTY MAP'} →
        </a>
      </div>
      <AddressSearch lang={lang} copy={searchCopy(lang)} />
    </section>
  )
}
