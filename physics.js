// physics.js
export const Config = {
  W: 1100, H: 680, GOAL_W: 120,
  FIELD_PAD: 20, SAFE: 28,
  PLAYER_RADIUS: 12, BALL_RADIUS: 6, GRAB_DIST: 16,
  STEP: 1/60, MAX_DT: 1/30,
  FRICTION: 0.982,
  ACCEL_BASE: 0.22,
  MAXSPD_SCALE: 1.30,
  PASS_SPEED_NORM: 0.39,
  PASS_SPEED_THROUGH: 0.62,
  CURVE_DECAY: 0.982,
  SHOT_DECAY: 0.988,
  SHOT_SPEED_SCALE: 1.30,
  SHOT_CHARGE_MAX: 0.9,
};

export const TAU = Math.PI * 2;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a,b,t) => a + (b-a)*t;
export const rand = (a=0,b=1)=>Math.random()*(b-a)+a;

export const CENTER = { x: Config.W/2, y: Config.H/2 };
export const FIELD = {
  MINX: Config.FIELD_PAD, MAXX: Config.W-Config.FIELD_PAD,
  MINY: Config.FIELD_PAD, MAXY: Config.H-Config.FIELD_PAD,
  SAFE: Config.SAFE
};
export const GOAL = {
  LEFT_X: 14,
  RIGHT_X: Config.W - 20,
  TOP: Config.H/2 - Config.GOAL_W/2,
  BOT: Config.H/2 + Config.GOAL_W/2,
};

export class Vec2 {
  constructor(x=0,y=0){ this.x=x; this.y=y; }
  set(x,y){ this.x=x; this.y=y; return this; }
  copy(b){ this.x=b.x; this.y=b.y; return this; }
  add(b){ this.x+=b.x; this.y+=b.y; return this; }
  sub(b){ this.x-=b.x; this.y-=b.y; return this; }
  mul(s){ this.x*=s; this.y*=s; return this; }
  len(){ return Math.hypot(this.x, this.y); }
  norm(){ const l=this.len()||1; this.x/=l; this.y/=l; return this; }
}

export function clampPoint(p){
  p.x = clamp(p.x, FIELD.MINX+FIELD.SAFE, FIELD.MAXX-FIELD.SAFE);
  p.y = clamp(p.y, FIELD.MINY+FIELD.SAFE, FIELD.MAXY-FIELD.SAFE);
  return p;
}

export class Ball{
  constructor(){
    this.pos = new Vec2(CENTER.x, CENTER.y);
    this.prev= new Vec2(CENTER.x, CENTER.y);
    this.vel = new Vec2(0,0);
    this.r = Config.BALL_RADIUS;
    this.owner = null;
    this.curve = new Vec2(0,0);
    this.curveDecay = Config.CURVE_DECAY;
    this.pk = 0;
    this.assistTo = null; this.assistT = 0;
    this.lastTouchTeam = null;
    this.specialFriction = 1.0;
  }
  resetAt(left){
    this.pos.set(CENTER.x + (left?-40:40), CENTER.y);
    this.prev.copy(this.pos);
    this.vel.set(0,0);
    this.owner=null; this.curve.set(0,0); this.curveDecay=Config.CURVE_DECAY;
    this.assistTo=null; this.assistT=0; this.pk=0; this.specialFriction=1.0;
  }
  kick(to, s, opts){
    this.owner=null; this.pk=0.25;
    const dir = new Vec2(to.x-this.pos.x, to.y-this.pos.y); if(dir.len()>0) dir.norm();
    this.vel = dir.mul(s);
    this.specialFriction = (opts && opts.fric) || 1.0;
  }
  knock(dir, s){
    this.owner=null; this.pk=0.2;
    this.vel = new Vec2(dir.x, dir.y).norm().mul(s); this.specialFriction=1.0;
  }
  update(game){
    this.pk = Math.max(0, this.pk-Config.STEP);
    this.assistT = Math.max(0, this.assistT-Config.STEP);
    if(this.owner){
      const f = new Vec2(this.owner.facing.x, this.owner.facing.y).norm().mul(10);
      this.prev.copy(this.pos);
      this.pos.set(this.owner.pos.x+f.x, this.owner.pos.y+f.y);
      this.vel.mul(0); this.curve.mul(0); this.curveDecay=Config.CURVE_DECAY;
      this.assistTo=null; this.assistT=0; this.specialFriction=1.0;
      return;
    }
    this.prev.copy(this.pos);
    this.pos.add(this.vel);
    if(this.curve.x || this.curve.y){
      this.vel.add(this.curve);
      this.curve.mul(this.curveDecay);
    }
    this.vel.mul(Config.FRICTION*this.specialFriction);
    this.boundarySweep(game);
  }
  draw(g){
    g.save();
    g.globalAlpha=0.15; g.fillStyle='#fff';
    g.beginPath(); g.arc(this.prev.x,this.prev.y,this.r*0.9,0,TAU); g.fill();
    g.globalAlpha=1; g.fillStyle='#f3f3f3';
    g.beginPath(); g.arc(this.pos.x,this.pos.y,this.r,0,TAU); g.fill();
    g.restore();
  }
  boundarySweep(game){
    const x1=this.prev.x,y1=this.prev.y,x2=this.pos.x,y2=this.pos.y;
    // 간단한 골 판정(선분-세로선 교차)
    const segHit = (goalX, top, bot)=>{
      if( (x1<goalX && x2<goalX) || (x1>goalX && x2>goalX) ) return false;
      if(x1===x2) return (x1===goalX && Math.min(y1,y2)<=bot && Math.max(y1,y2)>=top);
      const t=(goalX-x1)/(x2-x1); if(t<0||t>1) return false;
      const y=y1+(y2-y1)*t; return (y>=top && y<=bot);
    };
    if(segHit(GOAL.LEFT_X, GOAL.TOP, GOAL.BOT)){ game.goal('B'); return; }
    if(segHit(GOAL.RIGHT_X, GOAL.TOP, GOAL.BOT)){ game.goal('A'); return; }

    let out=null;
    if(this.pos.y<FIELD.MINY+this.r) out='TOP';
    else if(this.pos.y>FIELD.MAXY-this.r) out='BOT';
    else if(this.pos.x<FIELD.MINX+this.r) out='LEFT';
    else if(this.pos.x>FIELD.MAXX-this.r) out='RIGHT';
    if(out){
      if(!game._outCooldown || game.t>game._outCooldown){
        const endLine=(out==='LEFT'||out==='RIGHT');
        if(endLine){
          const defend = (this.lastTouchTeam===game.teamA)?game.teamB:game.teamA;
          const attack = defend.oppo;
          if(this.lastTouchTeam===defend) game.queueCorner(out, attack);
          else game.queueGoalKick(defend, out);
        }else{
          game.queueThrowIn(out);
        }
        game._outCooldown = game.t+0.25;
      }
    }
  }
}

export const RoleProfile = {
  GK:{spd:0.95, shot:0.5, tackle:0.95},
  LCB:{spd:1.10, shot:0.6, tackle:1.28},
  RCB:{spd:1.10, shot:0.6, tackle:1.28},
  LB:{spd:1.16, shot:0.7, tackle:1.10},
  RB:{spd:1.16, shot:0.7, tackle:1.10},
  CDM:{spd:1.00, shot:1.00, tackle:1.15},
  CM:{spd:1.05, shot:1.02, tackle:1.05},
  CAM:{spd:1.08, shot:1.12, tackle:0.95},
  LW:{spd:1.30, shot:1.12, tackle:0.80},
  RW:{spd:1.30, shot:1.12, tackle:0.80},
  ST:{spd:1.18, shot:1.22, tackle:0.75},
};

export class Player{
  constructor(team, role, x, y, color){
    this.team=team; this.role=role;
    this.home=new Vec2(x,y); this.pos=new Vec2(x,y); this.vel=new Vec2(0,0);
    this.r=Config.PLAYER_RADIUS; this.color=color; this.controlled=0;
    this.facing=new Vec2(team.side==='L'?1:-1,0);
    this.tackleCd=0; this.prof={...RoleProfile[role]};
    this.frozen=false; this.name=role;
    this.boost={spd:0, shot:0, tackle:0}; // 개인 강화 티어
  }
  hasBall(game){ return game.ball.owner===this; }
  distBall(game){ return Math.hypot(game.ball.pos.x-this.pos.x, game.ball.pos.y-this.pos.y); }
  applyGoalKeepOut(){
    if(this.pos.y>=GOAL.TOP && this.pos.y<=GOAL.BOT){
      if(this.pos.x<GOAL.LEFT_X+10){ this.pos.x=GOAL.LEFT_X+10; this.vel.x=Math.max(0,this.vel.x); }
      if(this.pos.x>GOAL.RIGHT_X-10){ this.pos.x=GOAL.RIGHT_X-10; this.vel.x=Math.min(0,this.vel.x); }
    }
  }
  draw(g, outline='#0b0f16'){
    g.save();
    g.lineWidth=2; g.fillStyle=this.color; g.strokeStyle=outline;
    g.beginPath(); g.arc(this.pos.x, this.pos.y, this.r, 0, TAU); g.fill(); g.stroke();
    // 방향 화살표
    const fx=this.facing.x, fy=this.facing.y, rx=-fy, ry=fx;
    const noseX=this.pos.x+fx*this.r, noseY=this.pos.y+fy*this.r;
    g.beginPath(); g.moveTo(noseX,noseY);
    g.lineTo(this.pos.x+rx*this.r*0.7, this.pos.y+ry*this.r*0.7);
    g.lineTo(this.pos.x-rx*this.r*0.7, this.pos.y-ry*this.r*0.7);
    g.closePath(); g.globalAlpha=0.18; g.fillStyle='#000'; g.fill(); g.globalAlpha=1;

    // 컨트롤 표시/볼 소유
    if(this.controlled>0){
      g.strokeStyle='#fff'; g.setLineDash([4,4]); g.beginPath();
      g.arc(this.pos.x,this.pos.y,this.r+6,0,TAU); g.stroke(); g.setLineDash([]);
    }
    if(this.hasBall(window.game)){ g.fillStyle='#ffd84d'; g.beginPath(); g.arc(this.pos.x,this.pos.y-this.r-6,3.5,0,TAU); g.fill(); }
    g.restore();
  }
}

export class Team{
  constructor(name, side, color){ this.name=name; this.side=side; this.color=color; this.players=[]; this.score=0; this.oppo=null; }
  formation(){
    const L=this.side==='L', sx=x=>L?x:(Config.W-x), H=Config.H;
    return [
      ['GK', sx(60), H/2],
      ['LB', sx(180), H*0.76], ['LCB', sx(220), H*0.60], ['RCB', sx(220), H*0.40], ['RB', sx(180), H*0.24],
      ['CDM', sx(300), H*0.50], ['CM', sx(340), H*0.35], ['CAM', sx(360), H*0.65],
      ['LW', sx(520), H*0.22], ['ST', sx(560), H*0.50], ['RW', sx(520), H*0.78],
    ];
  }
  spawn(){
    this.players=[]; const f=this.formation();
    for(const r of f){ const p=new Player(this, r[0], r[1], r[2], this.color); this.players.push(p); }
  }
  nearestForSwitch(ball){
    let best=null, sc=-1e9;
    for(const pl of this.players){
      const d=Math.hypot(ball.pos.x-pl.pos.x, ball.pos.y-pl.pos.y);
      const toward=this.side==='L' ? (ball.pos.x-pl.pos.x) : (pl.pos.x-ball.pos.x);
      const s=-d + toward*0.4 + (pl.role==='ST'?10:0) + (pl.role==='CAM'?4:0);
      if(s>sc){ sc=s; best=pl; }
    }
    return best;
  }
}
