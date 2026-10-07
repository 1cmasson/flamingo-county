declare module 'vt-pbf' {
  /** Encodes geojson-vt tiles (one per layer name) as a Mapbox Vector Tile. */
  export function fromGeojsonVt(layers: Record<string, unknown>, options?: { version?: number; extent?: number }): Uint8Array
  const vtpbf: { fromGeojsonVt: typeof fromGeojsonVt }
  export default vtpbf
}
