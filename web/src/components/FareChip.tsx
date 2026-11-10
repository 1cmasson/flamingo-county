import b from './bus.module.css'

/**
 * Free or not, on a route or a ride: «GRATIS» stands out in yellow; a fare is
 * said (Metrobus, Metrorail), never how much.
 */
export function FareChip({ free, label }: { free: boolean; label: string }) {
  return <span className={free ? b.fareFree : b.farePaid}>{label}</span>
}
