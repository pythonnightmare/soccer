// physics.js (ES Module)
// 공통 설정/유틸 + Vec2 + Ball/Player/Team 정의 (AI 로직은 ai.js에서 주입)

export const Config = {
  W:1100, H:680, GOAL_W:120,
  FIELD_PAD:20, SAFE:28,
  PLAYER_RADIUS:12, BALL_RADIUS:6, GRAB_DIST:16,
  MAX_DT:1/30, STEP:1/60,
  // Tunables (속도 +30%)
  FRICTION:0.982,
  ACCEL_BASE:0.234,
  MAXSPD_SCALE:1.30,
  PASS_SPEED_NORM:0.39,
  PASS_SPEED_THROUGH:0.624,
  PASS_HOLD_THROUGH:0.35,
  PASS_HOLD_MAX:0.8,
  CURVE_DECAY:0.982,
  SHOT_DECAY:0.988,
  SHOT_SPEED_SCALE:1.30,
  SHOT_CHARGE_MAX:0.9,
  // Debug
  DBG_OFFSIDE:false, DBG_LANES:false
};

export const TAU = Math.PI*2;
export const clamp = (v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const lerp = (a,b,t)=>a+(b-a)*t;
export const rand = (a=0,b=1)=>Math.random()*(b-a)+a;

export function getCSSVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function Vec2(x=0,y=0){ this.x=x; this.y=y; }
Vec2.prototype.set=function(x,y){ this.x=x; this.y=y; return this; };
Vec2.prototype.copy=function(b){ this.x=b.x; this.y=b.y; return this; };
Vec2.prototype.add=function(b){ this.x+=b.x; this.y+=b.y; return this; };
Vec2.prototype.sub=function(b){ this.x-=b.x; this.y-=b.y; return this; };
Vec2.prototype.mul=function(s){ this.x*=s; this.y*=s; return this; };
Vec2.prototype.len=function(){ return Math.hypot(this.x,this.y); };
Vec2.prototype.norm=function(){ const l=this.len()||1; this.x/=l; this.y/=l; return this; };

export const FIELD={ MINX:Config.FIELD_PAD, MAXX:Config.W-Config.FIELD_PAD, MINY:Config.FIELD_PAD, MAXY:Config.H-Config.FIELD_PAD, SAFE:Config.SAFE };
export const GOAL_LEFT_X=14, GOAL_RIGHT_X=Config.W-20, GOAL_TOP=Config.H/2-Config.GOAL_W/2, GOAL_BOT=Config.H/2+Config.GOAL_W/2;

export function clampPoint(p){ p.x=clamp(p.x,FIELD.MINX+FIELD.SAFE,FIELD.MAXX-FIELD.SAFE); p.y=clamp(p.y,FIELD.MINY+FIELD.SAFE,FIELD.MAXY-FIELD.SAFE); return p; }
function segmentsIntersectYRange(x1,y1,x2,y2,goalX,top,bottom){
  if((x1<goalX && x2<goalX)||(x1>goalX && x2>goalX)) return false;
  if(x1===x2) return (x1===goalX && Math.min(y1,y2)<=bottom && Math.max(y1,y2)>=top);
  const t=(goalX-x1)/(x2-x1); if(t<0||t>1) return false;
  const y=y1+(y2-y1)*t; return (y>=top && y<=bottom);
}

// 포지션 기본 능력치
export const RoleProfile={
  GK:{spd:0.95,shot:0.5,tackle:0.95},
  CB:{spd:1.10,shot:0.6,tackle:1.28}, LCB:{spd:1.10,shot:0.6,tackle:1.28}, RCB:{spd:1.10,shot:0.6,tackle:1.28},
  LB:{spd:1.16,shot:0.7,tackle:1.10}, RB:{spd:1.16,shot:0.7,tackle:1.10},
  CDM:{spd:1.00,shot:1.00,tackle:1.15}, CM:{spd:1.05,shot:1.02,tackle:1.05}, CAM:{spd:1.08,shot:1.12,tackle:0.95},
  LW:{spd:1.30,shot:1.12,tackle:0.80}, RW:{spd:1.30,shot:1.12,tackle:0.80},
  ST:{spd:1.18,shot:1.22,tackle:0.75}
};

export const jerseyNumberMap = {
  GK:1, LB:3, LCB:4, RCB:5, RB:2, CDM:6, CM:8, CAM:10, LW:11, ST:9, RW:7
};

// 전역 game 핸들 (ai.js / main.js간 연결용)
export const G = ()=>globalThis._game;

// 공
export class Ball{
  constructor(){
    this.pos=new Vec2(Config.W/2,Config.H/2);
    this.prev=new Vec2(this.pos.x,this.pos.y);
    this.vel=new Vec2(0,0);
    this.r=Config.BALL_RADIUS;
    this.owner=null;
    this.curve=new Vec2(0,0);
    this.curveDecay=Config.CURVE_DECAY;
    this.pk=0;               // pickup cooldown
    this.assistTo=null; this.assistT=0;
    this.lastTouchTeam=null; this.lastKickInfo=null;
    this.specialFriction=1.0;
    // 쓰로인 보호: 일정 시간 상대 픽업 금지
    this.protectTeam=null; this.protectUntil=0;
  }
  resetAt(left){
    this.pos.set(Config.W/2+(left?-40:40), Config.H/2);
    this.prev.copy(this.pos); this.vel.set(0,0);
    this.owner=null; this.curve.set(0,0); this.curveDecay=Config.CURVE_DECAY;
    this.pk=0; this.assistTo=null; this.assistT=0; this.specialFriction=1.0;
    this.protectTeam=null; this.protectUntil=0;
  }
  update(){
    this.pk=Math.max(0,this.pk-Config.STEP);
    this.assistT=Math.max(0,this.assistT-Config.STEP);
    const game=G(); if(!game) return;

    if(this.owner){
      const f=new Vec2(this.owner.facing.x,this.owner.facing.y).norm().mul(10);
      this.prev.copy(this.pos); this.pos.set(this.owner.pos.x+f.x,this.owner.pos.y+f.y);
      this.vel.mul(0); this.curve.mul(0); this.curveDecay=Config.CURVE_DECAY;
      this.assistTo=null; this.assistT=0; this.specialFriction=1.0; return;
    }
    this.prev.copy(this.pos); this.pos.add(this.vel);
    if(this.curve.x||this.curve.y){ this.vel.add(this.curve); this.curve.mul(this.curveDecay); }
    this.vel.mul(Config.FRICTION * this.specialFriction);
    this.boundaryAndGoalsSweep();
  }
  boundaryAndGoalsSweep(){
    const x1=this.prev.x,y1=this.prev.y,x2=this.pos.x,y2=this.pos.y;
    const game=G(); if(!game) return;
    if(segmentsIntersectYRange(x1,y1,x2,y2,GOAL_LEFT_X,GOAL_TOP,GOAL_BOT)){ game?.goal('B'); return; }
    if(segmentsIntersectYRange(x1,y1,x2,y2,GOAL_RIGHT_X,GOAL_TOP,GOAL_BOT)){ game?.goal('A'); return; }

    let outSide=null;
    if(this.pos.y<FIELD.MINY+this.r) outSide='TOP';
    else if(this.pos.y>FIELD.MAXY-this.r) outSide='BOT';
    else if(this.pos.x<FIELD.MINX+this.r) outSide='LEFT';
    else if(this.pos.x>FIELD.MAXX-this.r) outSide='RIGHT';

    if(outSide){
      if(!game._outCooldown || game.t>game._outCooldown){
        const endLine=(outSide==='LEFT'||outSide==='RIGHT');
        if(endLine){
          const defend=(this.lastTouchTeam===game.teamA)?game.teamB:game.teamA;
          const attack=defend.oppo;
          if(this.lastTouchTeam===defend) game.queueCorner(outSide,attack);
          else game.queueGoalKick(defend,outSide);
        }else{
          game.queueThrowIn(outSide);
        }
        game._outCooldown=game.t+0.25;
      }
    }
  }
  kick(to,s,opts){
    this.owner=null; this.pk=0.25; this.assistTo=null; this.assistT=0;
    const dir=new Vec2(to.x-this.pos.x,to.y-this.pos.y).norm();
    this.vel=dir.mul(s); this.specialFriction=(opts&&opts.fric)||1.0;
  }
  knock(dir,s){ this.owner=null; this.pk=0.2; this.vel=new Vec2(dir.x,dir.y).norm().mul(s); this.specialFriction=1.0; }
  draw(g){
    g.save();
    g.globalAlpha=0.15; g.fillStyle='#fff'; g.beginPath(); g.arc(this.prev.x,this.prev.y,this.r*0.9,0,TAU); g.fill();
    g.globalAlpha=1; g.fillStyle='#f3f3f3'; g.beginPath(); g.arc(this.pos.x,this.pos.y,this.r,0,TAU); g.fill();
    g.restore();
  }
}

// 선수
export class Player{
  constructor(team,role,x,y,color,number){
    this.team=team; this.role=role; this.home=new Vec2(x,y);
    this.pos=new Vec2(x,y); this.vel=new Vec2(0,0);
    this.r=Config.PLAYER_RADIUS; this.color=color; this.number=number||0;
    this.controlled=0; this.facing=new Vec2(team.side==='L'?1:-1,0);
    this.tackleCd=0; this.frozen=false; this.name=role;
    this.baseProf=RoleProfile[role]||RoleProfile.CM; this.prof={...this.baseProf}; // 실제 적용치는 팀 강화에 따라 갱신
  }
  hasBall(){ const game=G(); return game && game.ball.owner===this; }
  distBall(){ const game=G(); return Math.hypot(game.ball.pos.x-this.pos.x, game.ball.pos.y-this.pos.y); }

  // 골대 침투 방지(강화): 골문 내부 + 포스트 뒤쪽 진입 금지
  applyGoalKeepOut(){
    const margin=18;
    if(this.pos.y>=GOAL_TOP && this.pos.y<=GOAL_BOT){
      if(this.pos.x<GOAL_LEFT_X+margin){ this.pos.x=GOAL_LEFT_X+margin; this.vel.x=Math.max(0,this.vel.x); }
      if(this.pos.x>GOAL_RIGHT_X-margin){ this.pos.x=GOAL_RIGHT_X-margin; this.vel.x=Math.min(0,this.vel.x); }
    }
  }

  // 방향 입력(휴먼/AI 공통)
  _currentDir(which){
    const game=G(); const input=(which===1)?game.input1:game.input2;
    const dir=new Vec2((input.right?1:0)-(input.left?1:0),(input.down?1:0)-(input.up?1:0));
    if(dir.len()>0){ this.facing.copy(dir).norm(); return this.facing; }
    return this.facing;
  }

  // 시각 리디자인: 유니폼(라운드 직사각형) + 머리 + 등번호
  draw(g){
    g.save();
    // 몸통
    const w=this.r*2.2, h=this.r*2.6, x=this.pos.x-w/2, y=this.pos.y-h/2;
    const grd=g.createLinearGradient(x,y,x,y+h);
    grd.addColorStop(0, this.color);
    grd.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle=grd;
    g.strokeStyle='#0b0f16'; g.lineWidth=2;
    roundRect(g,x,y,w,h,8,true,true);

    // 어깨 스트라이프
    g.globalAlpha=0.35; g.fillStyle='#fff';
    g.fillRect(x+4,y+4,w-8,4);
    g.globalAlpha=1;

    // 머리
    g.fillStyle='#222'; g.beginPath(); g.arc(this.pos.x,this.pos.y-h/2-4,this.r*0.7,0,TAU); g.fill();
    // 방향 화살표(미세)
    const fx=this.facing.x, fy=this.facing.y, rx=-fy, ry=fx;
    g.beginPath(); g.moveTo(this.pos.x+fx*this.r*1.2, this.pos.y+fy*this.r*1.2);
    g.lineTo(this.pos.x+rx*this.r*0.7, this.pos.y+ry*this.r*0.7);
    g.lineTo(this.pos.x-rx*this.r*0.7, this.pos.y-ry*this.r*0.7);
    g.closePath(); g.globalAlpha=0.18; g.fillStyle='#000'; g.fill(); g.globalAlpha=1;

    // 등번호
    g.fillStyle='rgba(255,255,255,.95)';
    g.font='bold 10px ui-sans-serif,system-ui';
    g.textAlign='center'; g.fillText(String(this.number||''), this.pos.x, this.pos.y+4);

    // 컨트롤 표시
    if(this.controlled>0){
      g.strokeStyle='#fff'; g.lineWidth=2; g.setLineDash([4,4]);
      g.beginPath(); g.arc(this.pos.x,this.pos.y,this.r+8,0,TAU); g.stroke(); g.setLineDash([]);
    }
    // 볼 보유 표시
    if(this.hasBall()){ g.fillStyle='#ffd84d'; g.beginPath(); g.arc(this.pos.x,this.pos.y-this.r-8,3.8,0,TAU); g.fill(); }

    g.restore();
  }
}

// 둥근 사각형 유틸
function roundRect(g,x,y,w,h,r,fill,stroke){
  g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r);
  g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath();
  if(fill) g.fill(); if(stroke) g.stroke();
}

// 팀
export class Team{
  constructor(name,side,color){
    this.name=name; this.side=side; this.color=color; this.players=[];
    this.score=0; this.oppo=null;
    // 강화 모드(팀 전체 보정)
    this.mods={ spd:1.0, shot:1.0, tackle:1.0,
      tiers:{spd:0,shot:0,tackle:0} // 0~5
    };
  }
  formation(){
    const L=this.side==='L', sx=x=>L?x:(Config.W-x), H=Config.H;
    return [
      ['GK', sx(60), H/2],
      ['LB', sx(180), H*0.76], ['LCB', sx(220), H*0.60], ['RCB', sx(220), H*0.40], ['RB', sx(180), H*0.24],
      ['CDM', sx(300), H*0.50], ['CM', sx(340), H*0.35], ['CAM', sx(360), H*0.65],
      ['LW', sx(520), H*0.22], ['ST', sx(560), H*0.50], ['RW', sx(520), H*0.78]
    ];
  }
  spawn(){
    this.players=[];
    const f=this.formation();
    for(let i=0;i<f.length;i++){
      const r=f[i]; const role=r[0];
      const num=jerseyNumberMap[role] || (i+1);
      this.players.push(new Player(this,role,r[1],r[2],this.color,num));
    }
    this.applyModsToTeam();
  }
  applyModsToTeam(){
    for(const p of this.players){
      const b=p.baseProf;
      p.prof={
        spd: b.spd * this.mods.spd,
        shot: b.shot * this.mods.shot,
        tackle: b.tackle * this.mods.tackle
      };
    }
  }
  // 포메 유지 추적용
  shapeTarget(p){
    const game=G(); const t={x:p.home.x,y:p.home.y};
    const has=(game.ball.owner&&game.ball.owner.team===this); const dir=this.side==='L'?1:-1;
    if(has){
      if(p.role==='ST')t.x+=34*dir;
      if(p.role==='LW'||p.role==='RW')t.x+=28*dir;
      if(p.role==='CAM')t.x+=18*dir;
      if(p.role==='CM')t.x+=10*dir;
      if(p.role==='CDM')t.x+=6*dir;
    } else {
      if(p.role==='CB'||p.role==='LCB'||p.role==='RCB')t.x-=24*dir;
      if(p.role==='CDM')t.x-=10*dir;
    }
    t.y=lerp(t.y, G().ball.pos.y, 0.08);
    return t;
  }
  nearestForSwitch(){
    const game=G(); let best=null,sc=-1e9;
    for(const pl of this.players){
      const d=Math.hypot(game.ball.pos.x-pl.pos.x, game.ball.pos.y-pl.pos.y);
      const tow=this.side==='L'?(game.ball.pos.x-pl.pos.x):(pl.pos.x-game.ball.pos.x);
      const s= -d + tow*0.4 + (pl.role==='ST'?10:0) + (pl.role==='CAM'?4:0);
      if(s>sc){ sc=s; best=pl; }
    }
    return best;
  }
  pickPressers(){
    const ball=G().ball;
    const arr=this.players.slice().sort((a,b)=> Math.hypot(ball.pos.x-a.pos.x,ball.pos.y-a.pos.y) - Math.hypot(ball.pos.x-b.pos.x,ball.pos.y-b.pos.y));
    return {primary:arr[0], secondary:arr[1]};
  }
  computeOffsideLine(){ const xs=this.oppo.players.map(p=>p.pos.x).sort((a,b)=>a-b); return this.side==='L' ? xs[xs.length-2] : xs[1]; }
  isOffsidePos(p){
    const bx=G().ball.pos.x; const line=this.computeOffsideLine();
    if(this.side==='L'){ return (p.pos.x>Math.max(line,bx) && p.pos.x>Config.W/2); }
    return (p.pos.x<Math.min(line,bx) && p.pos.x<Config.W/2);
  }
}
