/**
 * Admin maps load tiles through the traveler site's first-party tile proxy
 * (cached, Philippine bounds, z5–18), not straight from the OpenStreetMap
 * volunteer servers (OSM Tile Usage Policy; see AGENTS.md "Maps").
 */
const travelerUrl = import.meta.env.VITE_TRAVELER_URL;
const tileOrigin = travelerUrl && /^https?:\/\//.test(travelerUrl) ? travelerUrl.replace(/\/+$/, '') : 'https://juanderquest.app';

export const MAP_TILE_URL = `${tileOrigin}/map-tiles/{z}/{x}/{y}.png?style=osm-standard-v1`;
/** The proxy serves up to z18; Leaflet upscales beyond it. */
export const MAP_TILE_MAX_NATIVE_ZOOM = 18;
