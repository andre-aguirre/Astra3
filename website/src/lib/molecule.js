// Hero visual: the Cα trace of a real structure (see trace-data.json and
// scripts/make-trace.mjs), drawn as a depth-sorted tube on a 2D canvas.
import TRACE from './trace-data.json';

/* Centred and scaled to a unit sphere. ss: 1 helix, 2 strand, 0 coil. */
function makeTrace(){
  const pts = TRACE.ca.map((p, i) => ({ p: [...p], ss: TRACE.ss[i] || 0 }));
  const c = [0,1,2].map(k => pts.reduce((s,q)=>s+q.p[k],0)/pts.length);
  pts.forEach(q => q.p = q.p.map((x,k)=>x-c[k]));
  const R = Math.max(...pts.map(q => Math.hypot(...q.p)));
  pts.forEach(q => q.p = q.p.map(x => x/R));
  return pts;
}
export function initMolecule(cv, label, reduceMotion){
  const ctx = cv.getContext('2d'); const pts = makeTrace(); const N = pts.length;
  let W=0, H=0, raf=0, t0 = performance.now(), mx = 0, my = 0, visible = true;
  const dpr = Math.min(2, devicePixelRatio || 1);
  function size(){ const r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W*dpr; cv.height = H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0); }
  size(); const ro = new ResizeObserver(size); ro.observe(cv);
  const lerp = (a,b,t) => a + (b-a)*t;
  const colAt = i => { const t = i/(N-1); // accent purple → violet blue along N→C
    return [lerp(171,110,t)|0, lerp(122,142,t)|0, lerp(223,232,t)|0]; };
  function frame(now){
    const t = reduceMotion ? 0.6 : (now - t0)/1000;
    const ay = t*0.16 + scrollY*0.0022 + mx*0.35, ax = -0.35 + my*0.25 + Math.sin(t*0.1)*0.08;
    const cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax);
    const S = Math.min(W,H)*0.46, ox = W/2, oy = H/2;
    const P = pts.map((q,i) => { let [x,y,z] = q.p; let x1 = x*cy + z*sy, z1 = -x*sy + z*cy; let y1 = y*cx - z1*sx, z2 = y*sx + z1*cx;
      const f = 1/(1.9 - z2*0.55); return { x: ox + x1*S*f*1.6, y: oy + y1*S*f*1.6, z: z2, i }; });
    ctx.clearRect(0,0,W,H);
    // smooth tube: a quadratic from the midpoint before each Cα to the midpoint after it, depth-sorted
    const mid = (a,b) => ({ x:(a.x+b.x)/2, y:(a.y+b.y)/2, z:(a.z+b.z)/2 });
    const segs = [];
    for (let i=1;i<N-1;i++) segs.push({ a: mid(P[i-1],P[i]), c: P[i], b: mid(P[i],P[i+1]), i, z: P[i].z });
    segs.sort((u,v) => u.z - v.z);
    ctx.lineCap = 'round';
    for (const g of segs){
      const d = (g.z+1)/2; const [r,gg,bb] = colAt(g.i);
      const ss = pts[g.i].ss;
      ctx.strokeStyle = `rgba(${r},${gg},${bb},${(0.2 + d*0.8).toFixed(3)})`;
      ctx.lineWidth = (ss === 1 ? 4.4 : ss === 2 ? 3.4 : 1.8) + d*3;
      ctx.beginPath(); ctx.moveTo(g.a.x,g.a.y); ctx.quadraticCurveTo(g.c.x,g.c.y,g.b.x,g.b.y); ctx.stroke();
    }
    // Cα beads, faint
    for (const q of P){ const d=(q.z+1)/2; ctx.fillStyle = `rgba(237,239,242,${(d*0.35).toFixed(3)})`; ctx.beginPath(); ctx.arc(q.x,q.y,0.8+d*1.2,0,7); ctx.fill(); }
    // termini, in gold, with labels
    [[P[0],'N'],[P[N-1],'C']].forEach(([q,l]) => {
      ctx.fillStyle = 'rgba(240,195,97,.18)'; ctx.beginPath(); ctx.arc(q.x,q.y,11,0,7); ctx.fill();
      ctx.fillStyle = '#F0C361'; ctx.beginPath(); ctx.arc(q.x,q.y,4.2,0,7); ctx.fill();
      ctx.font = '500 11px "IBM Plex Mono", monospace'; ctx.fillStyle = '#FFD98A'; ctx.fillText(l, q.x+10, q.y-9);
    });
    label.textContent = 'θ ' + String(Math.round(((ay*180/Math.PI)%360+360)%360)).padStart(3,'0') + '°';
    if (!reduceMotion && visible) raf = requestAnimationFrame(frame);
  }
  const vis = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !reduceMotion){ cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); } });
  vis.observe(cv);
  const fine = matchMedia('(pointer:fine)').matches;
  const mm = e => { mx = (e.clientX/innerWidth - .5); my = (e.clientY/innerHeight - .5); };
  if (fine && !reduceMotion) addEventListener('pointermove', mm, { passive:true });
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); ro.disconnect(); vis.disconnect(); removeEventListener('pointermove', mm); };
}

