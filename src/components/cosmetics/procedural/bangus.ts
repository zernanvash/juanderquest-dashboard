import { rgba, type BannerGenerator } from './core';

type Fish = { x: number; y: number; vx: number; vy: number; p: number };
export const bangus: BannerGenerator = { create(rng, W, H, c) {
  const N = Math.round(26 + W / H * 5), s = H * .05;
  const fish: Fish[] = Array.from({ length: N }, () => ({ x: rng() * W, y: H * (.2 + rng() * .6), vx: (rng() - .3) * H * .3, vy: (rng() - .5) * H * .1, p: rng() * 6.28 }));
  const bubbles = Array.from({ length: 16 }, () => [rng() * W, rng() * H, .5 + rng()]);
  const phi = rng() * 6.28, R = H * .24, SR = s * 2.3;
  let T = 0;
  const step = (dt: number) => { T += dt; const tx = W * (.5 + .44 * Math.sin(T * .11 + phi)), ty = H * (.5 + .24 * Math.sin(T * .29 + phi * 2));
    for (const f of fish) { let cx=0,cy=0,ax=0,ay=0,sx=0,sy=0,k=0;
      for (const o of fish) { if (o === f) continue; const dx=o.x-f.x,dy=o.y-f.y,d=Math.hypot(dx,dy); if(d<R){cx+=o.x;cy+=o.y;ax+=o.vx;ay+=o.vy;k++;if(d<SR){sx-=dx/(d+.01);sy-=dy/(d+.01);}} }
      let fx=(tx-f.x)*.25,fy=(ty-f.y)*.4; if(k){fx+=(cx/k-f.x)*.9+(ax/k-f.vx)*1.1;fy+=(cy/k-f.y)*.9+(ay/k-f.vy)*1.1;}
      fx+=sx*H*1.2;fy+=sy*H*1.2;if(f.y<H*.12)fy+=H*2;if(f.y>H*.88)fy-=H*2;
      f.vx+=fx*dt;f.vy+=fy*dt;const sp=Math.hypot(f.vx,f.vy),lo=H*.22,hi=H*.42;if(sp<lo||sp>hi){const m=(sp<lo?lo:hi)/(sp||1);f.vx*=m;f.vy*=m;}
      f.x+=f.vx*dt;f.y+=f.vy*dt;if(f.x>W+s*3)f.x=-s*3;if(f.x<-s*3)f.x=W+s*3;
    }
  };
  for(let i=0;i<240;i++)step(1/30);
  return (ctx,t,dt) => { if(dt)step(dt);let g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,c[0]);g.addColorStop(1,c[1]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.globalCompositeOperation='lighter';
    for(let i=0;i<5;i++){const x=W*(.1+i*.2)+Math.sin(t*.3+i)*W*.04;ctx.fillStyle=rgba(c[4],.05+.03*Math.sin(t*.7+i*2));ctx.beginPath();ctx.moveTo(x-H*.06,0);ctx.lineTo(x+H*.06,0);ctx.lineTo(x+H*.5,H);ctx.lineTo(x+H*.1,H);ctx.fill();}
    for(const b of bubbles){const y=((b[1]-t*H*.12*b[2])%H+H)%H;ctx.strokeStyle=rgba(c[4],.35);ctx.lineWidth=1;ctx.beginPath();ctx.arc(b[0]+Math.sin(t*2+b[2]*9)*3,y,s*.12*b[2],0,7);ctx.stroke();}ctx.globalCompositeOperation='source-over';
    for(const f of fish){ctx.save();ctx.translate(f.x,f.y);ctx.rotate(Math.atan2(f.vy,f.vx));const w=Math.sin(t*11+f.p)*s*.22;ctx.fillStyle=c[2];ctx.beginPath();ctx.moveTo(-s*1.2,0);ctx.lineTo(-s*2.05,-s*.55+w);ctx.lineTo(-s*1.75,w*.5);ctx.lineTo(-s*2.05,s*.55+w);ctx.fill();ctx.fillStyle=c[3];ctx.beginPath();ctx.ellipse(0,0,s*1.35,s*.4,0,0,7);ctx.fill();ctx.fillStyle=c[2];ctx.beginPath();ctx.ellipse(0,0,s*1.35,s*.4,0,Math.PI,Math.PI*2);ctx.fill();ctx.fillStyle='#0b1a22';ctx.beginPath();ctx.arc(s*.95,-s*.08,s*.09,0,7);ctx.fill();ctx.restore();}
  };
} };
