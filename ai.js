// ai.js (ES Module)
// Player의 AI 관련 메서드 주입 + 분산/프레싱/라인 블록 로직 개선

import { Config, Vec2, clamp, lerp, rand, FIELD, G, Player } from './physics.js';

// --- 팀메이트 간 분산(겹침 방지) ---
Player.prototype._separateTeammates = function(radius=36, gain=0.12){
  const mates=this.team.players; const steer=new Vec2(0,0); let cnt=0;
  for(const m of mates){
    if(m===this) continue;
    const dx=this.pos.x-m.pos.x, dy=this.pos.y-m.pos.y; const d=Math.hypot(dx,dy);
    if(d>0 && d<radius){
      steer.x += dx/(d*d); steer.y += dy/(d*d); cnt++;
    }
  }
  if(cnt>0){
    this.vel.x += steer.x*gain; this.vel.y += steer.y*gain;
  }
};

// 오프사이드 라인 근처에서 살짝 뒤로 당기기(공격수의 골대 침투 욕심 완화)
Player.prototype.stayOnside = function(t){
  const line=this.team.computeOffsideLine();
  if(this.team.side==='L' && t.x>line-10) t.x=line-10;
  if(this.team.side==='R' && t.x<line+10) t.x=line+10;
};

Player.prototype.zoneHold = function(){
  const t=this.team.shapeTarget(this);
  this._separateTeammates();
  this.seek(t,0.11*this.prof.spd*Config.ACCEL_BASE/0.18);
};

Player.prototype.supportRun = function(){
  const game=G(); const dir=this.team.side==='L'?1:-1; const b=game.ball.pos;
  const t=new Vec2(this.home.x, this.home.y);
  if(this.role==='ST'){ t.x=b.x+110*dir; t.y=lerp(t.y,b.y,0.30);}
  else if(this.role==='LW'){ t.x=b.x+90*dir; t.y=this.team.side==='L'?Config.H*0.22:Config.H*0.78;}
  else if(this.role==='RW'){ t.x=b.x+90*dir; t.y=this.team.side==='L'?Config.H*0.78:Config.H*0.22;}
  else if(this.role==='CAM'){ t.x=b.x+34*dir; t.y=lerp(t.y,b.y,0.30);}
  else if(this.role==='CM'){ t.x=b.x+16*dir; t.y=lerp(t.y,b.y,0.22);}
  else if(this.role==='CDM'){ t.x=b.x-10*dir; t.y=lerp(t.y,b.y,0.20);}
  else if(this.role==='CB' || this.role==='LCB' || this.role==='RCB'){ t.x=lerp(t.x,this.team.side==='L'?200:Config.W-200,0.85); t.y=lerp(t.y,Config.H*0.5,0.12);}
  else if(this.role==='LB' || this.role==='RB'){ t.x=lerp(t.x,this.team.side==='L'?220:Config.W-220,0.85); t.y=lerp(t.y,(this.role==='LB'?Config.H*0.72:Config.H*0.28),0.12);}
  this.stayOnside(t); this._separateTeammates();
  this.seek(t,0.13*this.prof.spd*Config.ACCEL_BASE/0.18);
};

Player.prototype.blockLane = function(owner){
  const game=G();
  // 공-소유자 사이의 중간에서 살짝 골문 쪽으로 이동 → 패스 차단
  const mid={x:(owner.pos.x+game.ball.pos.x)/2, y:(owner.pos.y+game.ball.pos.y)/2};
  this._separateTeammates();
  this.seek(mid,0.13*this.prof.spd*Config.ACCEL_BASE/0.18);
};

Player.prototype.updateGK = function(){
  const game=G(); const left=this.team.side==='L', gx=left?26:Config.W-26;
  const goalY=clamp(game.ball.pos.y,Config.H/2-Config.GOAL_W/2+10,Config.H/2+Config.GOAL_W/2-10);
  const target={x:gx+(left?10:-10),y:goalY};
  this.seek(target,0.18*this.prof.spd*Config.ACCEL_BASE/0.18);
  const d=this.distBall();

  if(!game.ball.owner){
    const towardGoal = left? (game.ball.pos.x<80) : (game.ball.pos.x>Config.W-80);
    const speed=Math.hypot(game.ball.vel.x, game.ball.vel.y);
    if(towardGoal && d<32 && speed>3.2){
      const away = left? {x:1,y:rand(-0.4,0.4)} : {x:-1,y:rand(-0.4,0.4)};
      game.ball.lastTouchTeam=this.team; game.ball.knock(away, rand(3.8,5.2)); return;
    }
  }
  if(d<Config.GRAB_DIST+4 && (game.ball.pk||0)<=0){
    game.ball.owner=this; this._holdT=(game.t||0); return;
  }
  if(this.hasBall()){
    if((game.t - (this._holdT||0))>0.28){
      const t=this.nearestMate()||this.team.players[1];
      this.passTo(t,'normal',(this.controlled===1)?1:2);
    }
  }
};

// 핵심: 겹침·빙글빙글 완화 및 프레싱/무주공 추격 개선
Player.prototype.updateAI = function(){
  const game=G(); if(game.state==='restart'){ this.vel.mul(0); return; }
  if(this.role==='GK'){ this.updateGK(); return; }

  const ball=game.ball; const haveBall=(ball.owner===this);

  // 무주공
  if(!ball.owner){
    const press=this.team.pickPressers();
    if(press.primary===this){
      // 1차 프레서만 직진 추격
      this.seek(ball.pos,0.96*this.prof.spd*Config.ACCEL_BASE/0.18);
    } else if(press.secondary===this){
      // 2차 프레서는 공 예측 위치(0.3s 뒤)로 컷백
      const pred = { x: ball.pos.x + ball.vel.x*18, y: ball.pos.y + ball.vel.y*18 };
      this.blockLane({pos:pred});
    } else {
      this.zoneHold();
    }
    // 겹침 방지
    this._separateTeammates();
    if(this.distBall()<Config.GRAB_DIST && (ball.pk||0)<=0){
      ball.owner=this; return;
    }
    return;
  }

  // 우리 팀 소유
  if(ball.owner.team===this.team){
    if(haveBall){
      if(this.role==='LW'||this.role==='RW'){
        const st=this.team.players.find(p=>p.role==='ST');
        this.passTo(st||this.nearestMate(),'through', (this.controlled===1)?1:2); return;
      }
      if(this.role==='CDM'||this.role==='CM'||this.role==='CB'||this.role==='LCB'||this.role==='RCB'||this.role==='LB'||this.role==='RB'){
        this.passTo(this.nearestMate(),'normal',(this.controlled===1)?1:2); return;
      }
      const dGoal=Math.abs((this.team.side==='L'?Config.W-40:40)-this.pos.x);
      if(dGoal<260){ this.shootSmart(rand(0.5,0.9), this.facing); return; }
      this.supportRun();
    } else {
      this.supportRun();
    }
    this._separateTeammates();
    return;
  }

  // 상대 팀 소유 → 수비
  if(this.role==='CB'||this.role==='LCB'||this.role==='RCB'){
    this.blockLane(ball.owner);
    if(this.distBall()<26) this.tryTackle();
    this._separateTeammates();
    return;
  }
  if(this.role==='CDM'||this.role==='CM'||this.role==='LB'||this.role==='RB'){
    this.seek(ball.pos,1.0*this.prof.spd*Config.ACCEL_BASE/0.18);
    if(this.distBall()<27) this.tryTackle();
    this._separateTeammates();
    return;
  }
  const press2=this.team.pickPressers();
  if(press2.primary===this) this.seek(ball.pos,0.98*this.prof.spd*Config.ACCEL_BASE/0.18+0.15);
  else if(press2.secondary===this) this.blockLane(ball.owner);
  else this.zoneHold();
  if(this.distBall()<24) this.tryTackle();
  this._separateTeammates();
};
