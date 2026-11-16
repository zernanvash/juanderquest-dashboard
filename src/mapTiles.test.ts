import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAP_TILE_URL } from './mapTiles';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

describe('admin map tiles', () => {
  it('use the first-party tile proxy', () => {
    expect(MAP_TILE_URL).toMatch(/^https?:\/\/[^/]+\/map-tiles\/\{z\}\/\{x\}\/\{y\}\.png\?style=osm-standard-v1$/);
  });

  it('never load tiles straight from the OpenStreetMap servers', () => {
    const offenders = files('src').filter((f) => /tile\.openstreetmap\.org/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
