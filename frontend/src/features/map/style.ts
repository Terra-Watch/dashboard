import { layers as basemapLayers, namedFlavor, type Flavor } from '@protomaps/basemaps';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { MapColors } from './colors';

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

/** Satellite basemap style from a raster tile URL. Used when VITE_SATELLITE_BASEMAP is enabled. */
export function satelliteStyle(tileUrl: string, attribution: string, origin: string = window.location.origin): StyleSpecification {
  return {
    version: 8,
    glyphs: `${origin}/map/glyphs/{fontstack}/{range}.pbf`,
    sprite: `${origin}/map/sprites/light`,
    sources: { satellite: { type: 'raster', tiles: [tileUrl], tileSize: 256, attribution } },
    layers: [{ id: 'satellite', type: 'raster', source: 'satellite', minzoom: 0, maxzoom: 22 }],
  };
}
