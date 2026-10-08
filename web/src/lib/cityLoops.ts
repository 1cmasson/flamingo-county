/**
 * Cities with an animated backdrop: each city's hero photo, animated with FAL
 * (Kling image-to-video, static camera) and played forward-then-back so it
 * loops without a seam. Files in public/assets/cities/: <slug>.mp4 + <slug>.jpg.
 * Shown behind a mascot (the card page's city tiles, a listing's crew panel),
 * faded over the city's colour, and never under reduced motion.
 */
export const CITY_LOOPS = new Set(['hialeah', 'lakes', 'havana'])

export function cityLoop(slug: string | null | undefined): { src: string; poster: string } | null {
  return slug && CITY_LOOPS.has(slug) ? { src: `/assets/cities/${slug}.mp4`, poster: `/assets/cities/${slug}.jpg` } : null
}
