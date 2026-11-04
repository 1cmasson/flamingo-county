import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { isLang } from '../../../../../../i18n'
import { routes } from '../../../../../../lib/routes'
import { busCopy } from '../../../../../../lib/busCopy'
import { placeCards, placesOnRoute } from '../../../../../../lib/busPlaces'
import {
  getCountyRoute,
  routeName,
  routeNameInline,
  routeTimes,
  scheduleCurrent,
} from '../../../../../../lib/county'
import { mapDirections } from '../../../../../../lib/busMapData'
import { BusMapScreen } from '../../../../../../components/BusMapScreen'

/**
 * The full map of a county route: its buses live, its stops (tap one for the
 * next bus), and places from the directory a short walk from a stop.
 *
 * Not indexed: everything it says is on the route page, which it points back
 * to as canonical. The map is a tool, not a page to land on from a search.
 */

type Props = { params: Promise<{ lang: string; route: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, route: slug } = await params
  const route = getCountyRoute(slug)
  if (!isLang(lang) || !route) return {}
  const c = busCopy(lang)
  const inline = routeNameInline(route, lang)
  return {
    title: c.mapMetaTitle(inline),
    description: c.mapMetaDescription(inline),
    robots: { index: false, follow: true },
    alternates: { canonical: routes.busRoute(lang, slug) },
  }
}

export default async function BusRouteMap({ params }: Props) {
  const { lang, route: slug } = await params
  if (!isLang(lang)) notFound()
  const route = getCountyRoute(slug)
  if (!route) notFound()
  const places = placeCards(await placesOnRoute(route, lang), (p) =>
    routes.business(lang, p.citySlug, p.listing.slug),
  )
  return (
    <BusMapScreen
      slug={route.slug}
      label={routeName(route, lang)}
      number={route.number ?? route.short}
      lang={lang}
      times={routeTimes(route)}
      directions={mapDirections(route)}
      live={route.kind === 'bus'}
      schedule={scheduleCurrent(route)}
      places={places}
      backHref={routes.busRoute(lang, slug)}
    />
  )
}
