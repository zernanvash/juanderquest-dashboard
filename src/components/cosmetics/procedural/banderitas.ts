import { rgba, type BannerGenerator } from './core';

export const banderitas: BannerGenerator = { create(rng, W, H, c) {
  const strings = Array.from({ length: 3 }, (_, s) => ({ yl: H*(.04+s*.16+rng()*.05), yr:H*(.04+s*.16+rng()*.05), sag:H*(.18+rng()*.1), ph:rng()*6.28, shape:s%2 }));
  const k=1.7,cat=(u:number)=>(Math.cosh(k*(2*u-1))-1)/(Math.cosh(k)-1),fw=H*.09;
  return (ctx,t) => { let g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,c[0]);g.addColorStop(1,c[1]);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.globalCompositeOperation='lighter';ctx.save();ctx.translate(W*.5,H*1.15);ctx.rotate(t*.03);for(let i=0;i<18;i++){ctx.rotate(Math.PI/9);ctx.fillStyle='rgba(255,255,255,.05)';ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(W,-H*.12);ctx.lineTo(W,H*.12);ctx.fill();}ctx.restore();ctx.globalCompositeOperation='source-over';
    const gust=.6+.4*Math.sin(t*.37)+.2*Math.sin(t*1.3);
    strings.forEach((s,si)=>{const sag=s.sag*(1+.05*Math.sin(t*.8+s.ph)),Y=(u:number)=>s.yl+(s.yr-s.yl)*u+sag*(1-cat(u));ctx.strokeStyle='rgba(30,30,40,.55)';ctx.lineWidth=Math.max(1,H*.005);ctx.beginPath();for(let x=0;x<=W;x+=8){const y=Y(x/W);x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();const nf=Math.max(6,Math.round(W/(fw*1.25)));
      for(let f=0;f<nf;f++){const u=(f+.5)/nf,x=u*W,y=Y(u),ang=Math.atan2(Y(u+.01)-Y(u-.01),W*.02)+Math.sin(t*2.1+f*.7+si)*.22*gust;ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.fillStyle=c[2+(f+si)%4];ctx.beginPath();if(s.shape){ctx.moveTo(-fw/2,0);ctx.lineTo(fw/2,0);ctx.lineTo(fw/2,fw*1.1);ctx.lineTo(0,fw*.8);ctx.lineTo(-fw/2,fw*1.1);}else{ctx.moveTo(-fw/2,0);ctx.lineTo(fw/2,0);ctx.lineTo(0,fw*1.2);}ctx.fill();ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(-fw/2,0,fw/5,fw*.7);ctx.restore();}
    });
  };
} };
