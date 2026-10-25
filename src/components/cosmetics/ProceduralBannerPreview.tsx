import { useEffect, useRef } from 'react';
import type { GeneratorId } from './procedural';

type BannerAsset = { style?: string; generator?: GeneratorId; palette?: string; colors?: string[]; angle?: number; pattern?: string };
type Props = { asset: BannerAsset; seed?: number; motion?: 'auto' | 'still'; aspect?: number; className?: string };

export function ProceduralBannerPreview({ asset, seed = 0, motion = 'auto', aspect = 3, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const generator = asset.generator;
  const colors = asset.colors ?? [];
  const colorKey = colors.join('|');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || asset.style !== 'procedural' || !generator) return;
    let active = true;
    let dispose: (() => void) | undefined;
    void import('./procedural/runtime').then(({ animateProceduralBanner }) => {
      if (active && canvasRef.current) dispose = animateProceduralBanner(canvasRef.current, { ...asset, colors }, seed, motion, aspect);
    });
    return () => { active = false; dispose?.(); };
  }, [asset.style, generator, asset.palette, colorKey, seed, motion, aspect]);

  return <div aria-label="Procedural banner preview" className={`relative mt-2 overflow-hidden rounded-lg ${className}`} style={{ aspectRatio: String(aspect), background: `linear-gradient(${asset.angle ?? 160}deg,${colors.slice(0, 2).join(',') || '#0f5e72,#06283a'})` }}>
    <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
  </div>;
}
