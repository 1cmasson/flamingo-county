import type { Lang } from '../i18n'
import { ballotNote, CITY_MAYORS, COUNTY_MAYOR, selectionText, sourceHost, type CityMayor, type Mayor } from '../lib/mayors'
import { areaName, longDay } from '../lib/voteCopy'
import { municSlug } from '../lib/civicSync'
import { routes } from '../lib/routes'
import { absUrl } from '../lib/site'
import s from './civic.module.css'

/**
 * Mayors, always printed with where they come from: the official page they
 * were checked on, and the day (src/data/civic/mayors.json).
 */

export const mayorCopy = (lang: Lang) =>
  lang === 'es'
    ? {
        checked: (host: string, date: string) => `${host} · consultado el ${date}`,
        countyLabel: 'Alcaldía del condado Miami-Dade',
        countyNote: 'Es la alcaldía de todo Miami-Dade: vale para cada dirección del condado, esté dentro de una ciudad o no.',
        cityLabel: (city: string) => `Alcaldía de ${city}`,
        mayorsTitle: 'LOS ALCALDES DE MIAMI-DADE',
        city: 'Ciudad',
        mayor: 'Alcaldía',
        namesChange: (date: string) =>
          `Los nombres cambian tras las elecciones; la próxima es el 3 de noviembre de 2026. Cada nombre se consultó en el sitio oficial de su gobierno el ${date}.`,
      }
    : {
        checked: (host: string, date: string) => `${host} · checked ${date}`,
        countyLabel: 'Miami-Dade County Mayor',
        countyNote: 'Mayor of Miami-Dade County, for every address in the county, inside a city or not.',
        cityLabel: (city: string) => `Mayor of ${city}`,
        mayorsTitle: 'MIAMI-DADE’S MAYORS',
        city: 'City',
        mayor: 'Mayor',
        namesChange: (date: string) =>
          `Names change after elections; the next is November 3, 2026. Each name was checked on its government’s official site on ${date}.`,
      }

/** Name, how the mayor is chosen, the source with its date, and any ballot note. */
export function MayorBlock({ m, lang, today, note }: { m: Mayor | CityMayor; lang: Lang; today: string; note?: string }) {
  const c = mayorCopy(lang)
  const ballot = 'munic' in m ? ballotNote(m, lang, today) : null
  return (
    <>
      <strong style={{ display: 'block', fontSize: 17 }}>{m.name}</strong>
      <span style={{ display: 'block', fontWeight: 600, fontSize: 14 }}>{note ?? selectionText(m.selection, lang)}.</span>
      <a href={m.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>
        {c.checked(sourceHost(m.sourceUrl), longDay(m.checked, lang))} ↗
      </a>
      {ballot ? (
        <span
          style={{
            display: 'block',
            marginTop: 6,
            padding: '4px 8px 3px',
            background: 'var(--yellow)',
            border: '2px solid var(--ink)',
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          {ballot}
        </span>
      ) : null}
    </>
  )
}

/** The hub's table: the county mayor first, then the 34 cities. */
export function MayorsTable({ lang, today }: { lang: Lang; today: string }) {
  const c = mayorCopy(lang)
  const rows = [...CITY_MAYORS].sort((a, b) => a.munic.localeCompare(b.munic))
  return (
    <>
      <table className={s.data}>
        <thead>
          <tr>
            <th scope="col">{c.city}</th>
            <th scope="col">{c.mayor}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Miami-Dade</th>
            <td>
              <MayorBlock m={COUNTY_MAYOR} lang={lang} today={today} note={c.countyNote.replace(/\.$/, '')} />
            </td>
          </tr>
          {rows.map((m) => (
            <tr key={m.munic}>
              <th scope="row">
                <a href={routes.place(lang, municSlug(m.munic))}>{areaName({ munic: m.munic, district: null }, lang)}</a>
              </th>
              <td>
                <MayorBlock m={m} lang={lang} today={today} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{c.namesChange(longDay(COUNTY_MAYOR.checked, lang))}</p>
    </>
  )
}

/**
 * A city's government as structured data: the city, its mayor as a Person,
 * and the county as the parent organization with its own mayor. Nothing the
 * page doesn't show.
 */
export function cityGovernmentJsonLd(m: CityMayor, lang: Lang, path: string) {
  const person = (x: Mayor) => ({ '@type': 'Person', name: x.name, jobTitle: 'Mayor' })
  return {
    '@context': 'https://schema.org',
    '@type': 'GovernmentOrganization',
    name: areaName({ munic: m.munic, district: null }, lang),
    url: new URL(m.sourceUrl).origin,
    areaServed: { '@type': 'AdministrativeArea', name: `${areaName({ munic: m.munic, district: null }, 'en')}, Florida` },
    member: person(m),
    subjectOf: { '@id': `${absUrl(path)}#webpage` },
    parentOrganization: {
      '@type': 'GovernmentOrganization',
      name: 'Miami-Dade County',
      url: 'https://www.miamidade.gov',
      member: person(COUNTY_MAYOR),
    },
  }
}
