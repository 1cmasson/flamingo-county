import type { CountyRoute } from './county'
import type { BusMapDirection } from '../components/BusMap'

/** What the route maps draw of each direction: its line and its stops. */
export function mapDirections(route: CountyRoute): BusMapDirection[] {
  return route.directions.map((d) => ({
    id: d.id,
    toward: d.toward,
    path: d.path,
    stops: d.stations.map((st) => ({ name: st.name, at: st.at })),
  }))
}
