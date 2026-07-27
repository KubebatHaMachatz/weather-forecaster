import type { LatLon } from './coordinates.js'

/**
 * Just enough of the GeoJSON MultiPolygon shape to type
 * assets/world.geo.json (produced by scripts/build-worldmap.mjs) — not a
 * general-purpose GeoJSON type.
 */
export interface MultiPolygonFeature {
  readonly type: 'Feature'
  readonly geometry: {
    readonly type: 'MultiPolygon'
    /** [polygon][ring][point], each point [lon, lat] per the GeoJSON spec. */
    readonly coordinates: readonly (readonly (readonly (readonly [number, number])[])[])[]
  }
}

/**
 * Flattens a MultiPolygon's polygons/rings into one array of rings (each a
 * closed loop of points), converting GeoJSON's [lon, lat] order to this
 * project's {lat, lon} convention. Polygon nesting (outer ring vs holes)
 * doesn't matter for line-drawing a coastline outline, so it's discarded
 * here rather than threaded through.
 */
export function landRingsFromGeoJson(feature: MultiPolygonFeature): readonly (readonly LatLon[])[] {
  return feature.geometry.coordinates.flatMap((polygon) =>
    polygon.map((ring) => ring.map(([lon, lat]): LatLon => ({ lat, lon }))),
  )
}
