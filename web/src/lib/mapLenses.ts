/**
 * The map's layers as the visitor picks them, shared by the page (which reads
 * `?lens=` on the server) and the map (a client component). A value exported
 * from a 'use client' module reaches the server only as a reference, so the
 * list lives here.
 */
export const MAP_LENSES = ['garbage', 'flood', 'surge', 'commission', 'polling', 'elementary', 'places', 'bus'] as const
export type LensId = (typeof MAP_LENSES)[number]

export const isMapLens = (v: string): v is LensId => (MAP_LENSES as readonly string[]).includes(v)
