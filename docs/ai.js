// ai.js
import { Config, Vec2, clamp, lerp, rand, clampPoint } from './physics.js';

// ---- 입력 핸들러(두 사람 공용) ----
export const Keys = {
  W:'KeyW',A:'KeyA',S:'KeyS',D:'KeyD',
  PASS1:'KeyK', SHOOT1:'KeyJ', SWITCH1:'KeyL', CURVE1:'KeyU', TACKLE1:'KeyH',
  UP:'ArrowUp',DOWN:'ArrowDown',LEFT:'ArrowLeft',RIGHT:'ArrowRight',
  PASS2:'Digit1', SHOOT2:'Digit2', SWITCH2:'Digit3', CURVE2:'Digit4', TACKLE2:'Digit5'
};

export function makeInput(){
  return {
    up:false,down:false,left:false,right:false,
    passHeld:false, passStart:0, passCharge:0, passTrigger:false, passIsThrough:false,
    shootHeld:false, shootStart:0, shotCharge:0, shootRelease:false,
    curveHeld:false, tackleTap:false, switch:false, mode:'IDLE'
  };
}
export function handlePassKey(input, down, now){
  if(down){ if(!input.passHeld){ input.passHeld=true; input.passStart=now; input.mode='PASS'; } }
  else{ if(input.passHeld){ const dur=now-input.passStart; input.passIsThrough = dur>=0.35; input.passTrigger=true; }
    input.passHeld=false; if(!input.shootHeld) input.mode='IDLE'; }
}
export function handleShootKey(input, down, now){
  if(down){ if(!input.shootHeld){ input.shootHeld=true; input.shootStart=now; input.mode='SHOOT'; } }
  else{ if(input.shootHeld){ input.shootHeld=false; input.shootRelease=true; }
    if(!input.passHeld) input.mode='IDLE'; }
}
export function inputUpdateCharges(i, t){
  i.passCharge = i.passHeld ? clamp((t - i.passStart)/0.8,0,1) : i.passCharge*0.9;
  i.shotCharge = i.shootHeld ? clamp((t - i.shootStart)/Config.SHOT_CHARGE_MAX,0,1) : i.shotCharge*0.9;
}

// ---- AI 유틸 ----
export function separation(players, k=0.45, radius=28){
  // 같은 팀끼리 겹치면 벌어지기
  for(let i=0;i<players.length;i++){
    for(let j=i+1;j<players.length;j++){
      const a=players[i], b=players[j]; if(a.team!==b.team) continue;
      const dx=a.pos.x-b.pos.x, dy=a.pos.y-b.pos.y; const d=Math.hypot(dx,dy); if(d>0 && d<radius){
        const nx=dx/d, ny=dy/d; const push=(radius-d)*k;
        a.pos.x+=nx*push; a.pos.y+=ny*push; b.pos.x-=nx*push; b.pos.y-=ny*push;
      }
    }
  }
}

export function supportTarget(p, game){
  const dir = p.team.side==='L'?1:-1;
  const b = game.ball.pos;
  const t = new Vec2(p.home.x, p.home.y);
  if(p.role==='ST'){ t.x=b.x+110*dir; t.y=lerp(t.y,b.y,0.30); }
  else if(p.role==='LW'){ t.x=b.x+90*dir; t.y=p.team.side==='L'?game.H*0.22:game.H*0.78; }
  else if(p.role==='RW'){ t.x=b.x+90*dir; t.y=p.team.side==='L'?game.H*0.78:game.H*0.22; }
  else if(p.role==='CAM'){ t.x=b.x+34*dir; t.y=lerp(t.y,b.y,0.30); }
  else if(p.role==='CM'){ t.x=b.x+16*dir; t.y=lerp(t.y,b.y,0.22); }
  else if(p.role==='CDM'){ t.x=b.x-10*dir; t.y=lerp(t.y,b.y,0.20); }
  else if(p.role==='LCB' || p.role==='RCB'){ t.x=lerp(t.x, p.team.side==='L'?200:game.W-200, 0.85); t.y=lerp(t.y, game.H*0.5, 0.12); }
  else if(p.role==='LB' || p.role==='RB'){ t.x=lerp(t.x, p.team.side==='L'?220:game.W-220, 0.85); t.y=lerp(t.y, (p.role==='LB'?game.H*0.72:game.H*0.28), 0.12); }
  return t;
}
export function seek(p, t, k){
  const d=new Vec2(t.x-p.pos.x, t.y-p.pos.y); const L=Math.hypot(d.x,d.y);
  if(L>0){ d.x/=L; d.y/=L; }
  p.vel.x += d.x*k; p.vel.y += d.y*k;
  if(d.x || d.y) p.facing = d;
}

// ---- 재시작 보조 ----
export function placeForRestart(game){
  const r=game.restart; if(!r||!r.taker) return;
  const allies=r.team.players.filter(x=>x!==r.taker).sort((a,b)=> (
    Math.hypot(a.pos.x-r.pos.x,a.pos.y-r.pos.y) - Math.hypot(b.pos.x-r.pos.x,b.pos.y-r.pos.y)
  )).slice(0,2);
  const opps=r.team.oppo.players.slice().sort((a,b)=>(
    Math.hypot(a.pos.x-r.pos.x,a.pos.y-r.pos.y) - Math.hypot(b.pos.x-r.pos.x,b.pos.y-r.pos.y)
  )).slice(0,2);
  r.allies=allies; r.opps=opps;
  game.allPlayers().forEach(p=>{ p.frozen=true; p.vel.mul(0); });
  allies.forEach(p=>p.frozen=false); opps.forEach(p=>p.frozen=false);
}
