/**
 * Simplifies Natural Earth's public-domain 110m land outline (via the
 * `world-atlas` package, a standard, widely-used pre-built distribution of
 * Natural Earth data — not fetched live, not re-derived from scratch) into
 * the bundled assets/world.geo.json the Chart's globe renders (DESIGN §11.2,
 * §5). world-atlas/topojson-client are devDependencies only: this script
 * runs at build time, and the app itself never imports either — it just
 * reads the plain GeoJSON this script writes.
 *
 * Usage: node scripts/build-worldmap.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { feature } from 'topojson-client'

const DEFAULT_PRECISION = 3

function roundRing(ring, precision) {
  const factor = 10 ** precision
  return ring.map(([lon, lat]) => [Math.round(lon * factor) / factor, Math.round(lat * factor) / factor])
}

/**
 * Converts a land topology (a TopoJSON Topology whose `objects.land` is a
 * GeometryCollection wrapping a single MultiPolygon — world-atlas's actual
 * shape, confirmed against the real package, not assumed) into a bare
 * MultiPolygon GeoJSON Feature, coordinates rounded to `precision` decimal
 * degrees. Rounding is the "simplifies" part: full float64 precision is
 * meaningless for a globe rendered at phone-screen size, and it roughly
 * halves the bundled file size.
 */
export function topologyToLandGeoJson(topology, precision = DEFAULT_PRECISION) {
  const collection = feature(topology, topology.objects.land)
  const [landFeature] = collection.features
  if (!landFeature) {
    throw new Error('topology has no land geometry')
  }
  return {
    ...landFeature,
    geometry: {
      ...landFeature.geometry,
      coordinates: landFeature.geometry.coordinates.map((polygon) =>
        polygon.map((ring) => roundRing(ring, precision)),
      ),
    },
  }
}

function main() {
  const topologyPath = new URL('../node_modules/world-atlas/land-110m.json', import.meta.url)
  const topology = JSON.parse(readFileSync(topologyPath, 'utf8'))
  const geojson = topologyToLandGeoJson(topology)

  writeFileSync(new URL('../assets/world.geo.json', import.meta.url), JSON.stringify(geojson))
  const ringCount = geojson.geometry.coordinates.reduce((sum, polygon) => sum + polygon.length, 0)
  console.error(`wrote assets/world.geo.json (${geojson.geometry.coordinates.length} polygons, ${ringCount} rings)`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
