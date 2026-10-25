import { fbm, makeNoise, mix, clamp, smoothstep, rgb, offscreenCanvas, type BannerGenerator } from './core';

export const islands: BannerGenerator = { create(rng,W,H,c){const noise=makeNoise(rng),LH=Math.max(90,Math.round(H/2)),LW=Math.round(LH*W/H),buf=offscreenCanvas(LW,LH),bx=buf.getContext('2d')!,img=bx.createImageData(LW,LH),height=new Float32Array(LW*LH),fq=3.6+rng()*1.4;
  for(let y=0;y<LH;y++)for(let x=0;x<LW;x++)height[y*LW+x]=fbm(noise,x/LH*fq,y/LH*fq);
  const threshold=Float32Array.from(height).sort()[Math.floor(height.length*(.74+rng()*.06))],C=c.map(rgb),D=img.data;
  return(ctx,t)=>{for(let y=0;y<LH;y++)for(let x=0;x<LW;x++){const i=y*LW+x,v=height[i];let col:number[];if(v>threshold){const k=clamp((v-threshold)/.13);if(k<.16)col=C[3];else{col=mix(C[4],C[5],smoothstep(.16,1,k));const sl=(height[i]-(height[i-1]||v))*900;col=mix(col,sl>0?[255,255,240]:[0,0,0],clamp(Math.abs(sl))*.25);}}else{const d=clamp((threshold-v)/.2);col=d<.5?mix(C[2],C[1],d*2):mix(C[1],C[0],(d-.5)*2);const ca=Math.sin(x*.42+t*1.25+v*34)*Math.sin(y*.55-t*1.05+v*26);if(ca>.55)col=mix(col,[255,255,255],(ca-.55)*1.6*(1-d));if(threshold-v<.012)col=mix(col,[255,255,255],.35+.3*Math.sin(t*2.2+x*.25+y*.2));}D[i*4]=col[0];D[i*4+1]=col[1];D[i*4+2]=col[2];D[i*4+3]=255;}bx.putImageData(img,0,0);ctx.imageSmoothingEnabled=true;ctx.drawImage(buf,0,0,W,H);};
} };
