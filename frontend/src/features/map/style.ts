import { layers as basemapLayers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { MapColors } from './colors';

export type { StyleSpecification };

const SOURCE = 'protomaps';
export const BASEMAP_URL = '/tiles/resq-basemap.pmtiles';

/** The Protomaps basemap, recoloured to be quiet so the data on top is the only saturated thing. Fonts and icons are served from this site. */
export function flavorFor(colors: MapColors, dark: boolean): Flavor {
  const base = namedFlavor(dark ? 'dark' : 'light');
  return {
    ...base,
    background: colors.land, earth: colors.land, park_a: colors.forest, park_b: colors.forest, wood_a: colors.forest, wood_b: colors.forest, scrub_a: colors.forest, scrub_b: colors.forest,
    water: colors.water, glacier: colors.land, sand: colors.land, beach: colors.land, hospital: colors.land, industrial: colors.land, school: colors.land, zoo: colors.land, military: colors.land, buildings: colors.road,
    minor_a: colors.road, minor_b: colors.road, minor_service: colors.road, link: colors.road, other: colors.road, major: colors.roadMajor, highway: colors.roadMajor, railway: colors.boundary, boundaries: colors.boundary,
    minor_casing: colors.land, major_casing_early: colors.land, major_casing_late: colors.land, highway_casing_early: colors.land, highway_casing_late: colors.land, link_casing: colors.land, minor_service_casing: colors.land,
    city_label: colors.label, city_label_halo: colors.halo, subplace_label: colors.label, subplace_label_halo: colors.halo, state_label: colors.boundary, state_label_halo: colors.halo, country_label: colors.boundary,
    roads_label_minor: colors.boundary, roads_label_minor_halo: colors.halo, roads_label_major: colors.label, roads_label_major_halo: colors.halo, ocean_label: colors.boundary, address_label: colors.boundary, address_label_halo: colors.halo,
  } as Flavor;
}

export function basemapStyle(colors: MapColors, dark: boolean, origin: string = window.location.origin): StyleSpecification {
  return {
    version: 8,
    glyphs: `${origin}/map/glyphs/{fontstack}/{range}.pbf`,
    sprite: `${origin}/map/sprites/${dark ? 'dark' : 'light'}`,
    sources: { [SOURCE]: { type: 'vector', url: `pmtiles://${origin}${BASEMAP_URL}`, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · © <a href="https://protomaps.com">Protomaps</a>' } },
    layers: basemapLayers(SOURCE, flavorFor(colors, dark), { lang: 'en' }) as StyleSpecification['layers'],
  };
}

/** Satellite basemap style from raster imagery, optionally with Mapbox terrain-RGB hillshade. */
export function satelliteStyle(tileUrl: string, attribution: string, origin: string = window.location.origin, maxzoom?: number, hillshadeTileUrl?: string): StyleSpecification {
  const sources: StyleSpecification['sources'] = {
    satellite: { type: 'raster', tiles: [tileUrl], tileSize: 256, attribution, ...(maxzoom !== undefined ? { maxzoom } : {}) },
  };
  const layers: StyleSpecification['layers'] = [{ id: 'satellite', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 22 }];
  if (hillshadeTileUrl) {
    sources.terrain = { type: 'raster-dem', tiles: [hillshadeTileUrl], tileSize: 512, maxzoom: 15, encoding: 'mapbox', attribution };
    layers.push({
      id: 'mapbox-hillshade',
      type: 'hillshade',
      source: 'terrain',
      minzoom: 0,
      maxzoom: 22,
      paint: {
        'hillshade-illumination-direction': 315,
        'hillshade-illumination-anchor': 'map',
        'hillshade-exaggeration': 0.28,
        'hillshade-shadow-color': '#24352c',
        'hillshade-highlight-color': '#fff8dc',
        'hillshade-accent-color': '#8b7255',
      },
    });
  }
  return {
    version: 8,
    glyphs: `${origin}/map/glyphs/{fontstack}/{range}.pbf`,
    sprite: `${origin}/map/sprites/light`,
    sources,
    layers,
  };
}

/** Colours for the what-if dark terrain basemap (all from the --tw-wi-* tokens). */
export type TerrainColors = Record<'land' | 'earth' | 'forest' | 'water' | 'road' | 'roadMajor' | 'boundary' | 'label' | 'halo', string>;

/** Protomaps dark flavour with brighter roads, water and labels, for the what-if page. Not used anywhere else; basemapStyle and flavorFor are unchanged. */
export function whatifTerrainStyle(c: TerrainColors, origin: string = window.location.origin): StyleSpecification {
  const base = namedFlavor('dark');
  const flavor = {
    ...base,
    background: c.land, earth: c.earth, park_a: c.forest, park_b: c.forest, wood_a: c.forest, wood_b: c.forest, scrub_a: c.forest, scrub_b: c.forest,
    water: c.water, minor_a: c.road, minor_b: c.road, minor_service: c.road, link: c.road, other: c.road, major: c.roadMajor, highway: c.roadMajor,
    railway: c.boundary, boundaries: c.boundary, buildings: c.road,
    minor_casing: c.land, major_casing_early: c.land, major_casing_late: c.land, highway_casing_early: c.land, highway_casing_late: c.land, link_casing: c.land, minor_service_casing: c.land,
    city_label: c.label, city_label_halo: c.halo, subplace_label: c.label, subplace_label_halo: c.halo, state_label: c.boundary, state_label_halo: c.halo, country_label: c.boundary,
    roads_label_minor: c.label, roads_label_minor_halo: c.halo, roads_label_major: c.label, roads_label_major_halo: c.halo, ocean_label: c.water, address_label: c.boundary, address_label_halo: c.halo,
  } as Flavor;
  return {
    version: 8,
    glyphs: `${origin}/map/glyphs/{fontstack}/{range}.pbf`,
    sprite: `${origin}/map/sprites/dark`,
    sources: { protomaps: { type: 'vector', url: `pmtiles://${origin}${BASEMAP_URL}`, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · © <a href="https://protomaps.com">Protomaps</a>' } },
    layers: basemapLayers('protomaps', flavor, { lang: 'en' }) as StyleSpecification['layers'],
  };
}
