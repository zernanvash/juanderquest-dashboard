import type { BannerGenerator, GeneratorId } from './core';
import { sunset } from './sunset';
import { islands } from './islands';
import { bangus } from './bangus';
import { banderitas } from './banderitas';
import { asin } from './asin';
import { topo } from './topo';
import { habi } from './habi';
import { alitaptap } from './alitaptap';

export * from './core';
export const generators: Record<GeneratorId, BannerGenerator> = {
  sunset, islands, bangus, banderitas, asin, topo, habi, alitaptap,
};
