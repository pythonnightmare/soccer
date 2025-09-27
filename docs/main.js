// main.js
import { Config, TAU, CENTER, FIELD, GOAL, Vec2, clamp, lerp, rand,
         clampPoint, Ball, Player, Team, RoleProfile } from './physics.js';
import { Keys, makeInput, handlePassKey, handleShootKey, inputUpdateCharges,
         separation, supportTarget, seek, placeForRestart } from './ai.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let dpr=1, pitchBuf=null, pitchCtx=null;

function drawPitch(g, W=Config.W, H=Config.H){
  g.clearRect(0,0,canvas.width,canvas.height);
  const stripeH=34;
  for(let y=0;y<Config.H;y+=stripeH){
    g.fillStyle=((y/stripeH)%2===0?'#0b612c':'#095827'); g.fillRect(0,y,Config.W,stripeH);
  }
  const grd=g.createRadialGradient(Config.W/2,Config.H*0.4,80, Config.W/2,Config.H*0.4,Math.max(Config.W,Config.H));
  grd.addColorStop(0,'rgba(255,255,255,0.06)'); grd.addColorStop(1,'rgba(0,0,0,0)'); g.fillStyle=grd; g.fillRect(0,0,Config.W,Config.H);

  g.strokeStyle='#e7f5e9'; g.globalAlpha=0.6; g.lineWidth=2;
  g.strokeRect(FIELD.MINX,FIELD.MINY,FIELD.MAXX-FIELD.MINX,FIELD.MAXY-FIELD.MINY);
  g.beginPath(); g.moveTo(Config.W/2,FIELD.MINY); g.lineTo(Config.W/2,FIELD.MAXY); g.stroke();
  g.beginPath(); g.arc(Config.W/2,Config.H/2,70,0,TAU); g.stroke();
  g.strokeRect(FIELD.MINX,Config.H/2-Config.H*0.25,70,Config.H*0.5);
  g.strokeRect(Config.W-90,Config.H/2-Config.H*0.25,70,Config.H*0.5); g.globalAlpha=1;

  // 골대(빛 반사)
  const y1=Config.H/2-Config.GOAL_W/2, y2=Config.H/2+Config.GOAL_W/2, lw=6;
  g.fillStyle='rgba(255,255,255,0.9)'; g.fillRect(14,y1,lw,Config.GOAL_W); g.fillRect(14, y1-6, 50, 6);
  g.globalAlpha=0.25; g.fillStyle='#fff'; g.fillRect(14+lw, y1, 12, Config.GOAL_W); g.globalAlpha=0.15; g.fillRect(14, y1, 50, 2); g.fillRect(14, y2-2, 50, 2);
  g.globalAlpha=1; g.fillStyle='rgba(255,255,255,0.9)'; g.fillRect(Config.W-20-lw,y1,lw,Config.GOAL_W); g.fillRect(Config.W-20-50, y1-6, 50, 6);
  g.globalAlpha=0.25; g.fillStyle='#fff'; g.fillRect(Config.W-20-lw-12, y1, 12, Config.GOAL_W); g.globalAlpha=0.15; g.fillRect(Config.W-20-50, y1, 50, 2); g.fillRect(Config.W-20-50, y2-2, 50, 2); g.globalAlpha=1;
}
function resize(){
  dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.floor(Config.W*dpr);
  canvas.height=Math.floor(Config.H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  pitchBuf=document.createElement('canvas'); pitchBuf.width=canvas.width; pitchBuf.height=canvas.height;
  pitchCtx=pitchBuf.getContext('2d'); pitchCtx.setTransform(dpr,0,0,dpr,0,0);
  drawPitch(pitchCtx);
}

// DOM refs
const sbA = document.getElementById('sbA');
const sbB = document.getElementById('sbB');
const sbTime = document.getElementById('sbTime');
const toast = document.getElementById('toast');
const goalBanner = document.getElementById('goalBanner');
const menu = document.getElementById('menu');
const mode1Btn=document.getElementById('mode1'), mode2Btn=document.getElementById('mode2');
const startBtn=document.getElementById('startBtn'), openMgrFromMenu=document.getElementById('openMgrFromMenu');
const g1_fill=document.getElementById('g1_fill'), g2_fill=document.getElementById('g2_fill');
const g1_mode=document.getElementById('g1_mode'), g2_mode=document.getElementById('g2_mode');
const g1_pct=document.getElementById('g1_pct'), g2_pct=document.getElementById('g2_pct');

const colorA=document.getElementById('colorA'), colorB=document.getElementById('colorB');
const mgrBtn=document.getElementById('mgrBtn'), mgr=document.getElementById('mgr'), mgrClose=document.getElementById('mgrClose');
const tabA=document.getElementById('tabA'), tabB=document.getElementById('tabB'), plist=document.getElementById('plist');
const pdetail=document.getElementById('pdetail'), pdTitle=document.getElementById('pdTitle'), pdSub=document.getElementById('pdSub');
const spdTier=document.getElementById('spdTier'), shotTier=document.getElementById('shotTier'), tacTier=document.getElementById('tacTier');
const spdUp=document.getElementById('spdUp'), shotUp=document.getElementById('shotUp'), tacUp=document.getElementById('tacUp'), pdRate=document.getElementById('pdRate');
const pdReset=document.getElementById('pdReset');

// Touch
const touchpad=document.getElementById('touchpad'), joy=document.getElementById('joy'), knob=document.getElementById('knob');
const tpPass=document.getElementById('tpPass'), tpShoot=document.getElementById('tpShoot');
const touch={active:false,cx:0,cy:0,knobX:0,knobY:0};

// ================= Game class =================
class Game{
  constructor(){
    this.state='menu'; this.mode='1P'; this.t=0; this.timeLeft=3*60;
    this.W=Config.W; this.H=Config.H;
    this.ball=new Ball();

    // 팀/색상(로컬 저장 불러오기)
    const savedColors=JSON.parse(localStorage.getItem('sf_colors')||'{}');
    const teamColorA=savedColors.A || getComputedStyle(document.documentElement).getPropertyValue('--teamA').trim() || '#2aa1ff';
    const teamColorB=savedColors.B || getComputedStyle(document.documentElement).getPropertyValue('--teamB').trim() || '#ff7b54';

    this.teamA=new Team('A','L',teamColorA);
    this.teamB=new Team('B','R',teamColorB);
    this.teamA.oppo=this.teamB; this.teamB.oppo=this.teamA;

    this.input1=makeInput(); this.input2=makeInput();
    this.humanTeam1=this.teamA; this.humanTeam2=null;
    this.kickoffSide='L'; this.restart=null; this.acc=0; this.lastRAF=0; this._outCooldown=0; this.lastFocused=false;

    // per-player upgrades 저장 로드
    this.upgrades = JSON.parse(localStorage.getItem('sf_upgrades')||'{}'); // key: A|B-role
  }
  allPlayers(){ return this.teamA.players.concat(this.teamB.players); }
  updateHUD(){
    sbA.textContent=`TEAM A · ${this.teamA.score}`;
    sbB.textContent=`TEAM B · ${this.teamB.score}`;
  }
  formatTime(t){ const m=Math.floor(t/60), s=Math.floor(t%60); return `${('0'+m).slice(-2)}:${('0'+s).slice(-2)}`; }

  start(){
    this.state='play'; menu.style.display='none';
    this.teamA.spawn(); this.teamB.spawn(); this.applySavedUpgrades();
    this.humanTeam1=this.teamA; this.humanTeam2=(this.mode==='2P')?this.teamB:null;
    this.resetAfterGoal(this.kickoffSide==='L'); this.updateHUD();
    toast.style.display='block'; canvas.focus();
  }
  applySavedUpgrades(){
    for(const t of [this.teamA,this.teamB]){
      for(const p of t.players){
        const key = `${t.name}-${p.role}`;
        const u = this.upgrades[key] || {spd:0, shot:0, tackle:0};
        p.boost = {...u};
      }
    }
  }
  saveUpgrades(){ localStorage.setItem('sf_upgrades', JSON.stringify(this.upgrades)); }
  saveColors(){ localStorage.setItem('sf_colors', JSON.stringify({A:this.teamA.color, B:this.teamB.color})); }

  goal(who){
    if(this.state!=='play') return;
    if(who==='A') this.teamA.score++; else this.teamB.score++; this.updateHUD();
    goalBanner.textContent='GOAL!'; goalBanner.style.display='grid'; setTimeout(()=>goalBanner.style.display='none',850);
    setTimeout(()=>{ const leftKick=(who==='B'); this.resetAfterGoal(leftKick); this.input1=makeInput(); this.input2=makeInput(); canvas.focus(); toast.style.display='none'; },900);
  }
  resetAfterGoal(leftKick){
    this.ball.resetAt(leftKick);
    this.teamA.spawn(); this.teamB.spawn(); this.applySavedUpgrades();
    const kicker=(leftKick?this.teamA:this.teamB).players.find(p=>p.role==='CDM') || (leftKick?this.teamA:this.teamB).players[0];
    this.ball.owner=kicker; this.assignControllers(); this.restart=null; this.state='play'; this.updateHUD();
  }
  assignControllers(){
    this.teamA.players.forEach(p=>p.controlled=0);
    this.teamB.players.forEach(p=>p.controlled=0);
    const p1=this.humanTeam1.nearestForSwitch(this.ball); p1.controlled=1;
    if(this.mode==='2P'){ const p2=this.teamB.nearestForSwitch(this.ball); p2.controlled=2; }
  }
  manualSwitch(which){
    const team=which===1?this.humanTeam1:this.teamB;
    const n=team.nearestForSwitch(this.ball);
    team.players.forEach(p=>{ if(p.controlled===which) p.controlled=0; });
    n.controlled=which;
  }
  possessionChanged(){
    const o=this.ball.owner; if(!o) return;
    if(o.team===this.humanTeam1){ this.humanTeam1.players.forEach(p=>{ if(p.controlled===1)p.controlled=0; }); o.controlled=1; }
    else if(this.mode==='2P'&&o.team===this.teamB){ this.teamB.players.forEach(p=>{ if(p.controlled===2)p.controlled=0; }); o.controlled=2; }
  }

  // ---- restarts
  queueThrowIn(side){
    if(this.state!=='play') return;
    const award=(this.ball.lastTouchTeam===this.teamA)?this.teamB:this.teamA;
    const pos={ x:(side==='LEFT'? FIELD.MINX+8 : side==='RIGHT'? FIELD.MAXX-8 : clamp(this.ball.pos.x,40,Config.W-40)),
                y:(side==='TOP'? FIELD.MINY+8 : FIELD.MAXY-8) };
    const taker = award.players.filter(p=>p.role!=='GK')
      .sort((a,b)=> Math.hypot(a.pos.x-pos.x,a.pos.y-pos.y) - Math.hypot(b.pos.x-pos.x,b.pos.y-pos.y) )[0] || award.players[0];
    this.startRestart('THROW-IN', award, taker, pos);
  }
  queueCorner(outSide, attackTeam){
    if(this.state!=='play') return;
    const x=(outSide==='LEFT')? FIELD.MINX+4 : FIELD.MAXX-4;
    const y=(this.ball.pos.y<Config.H/2)? FIELD.MINY+4 : FIELD.MAXY-4;
    const pos={x,y};
    const taker=attackTeam.players.filter(p=>p.role!=='GK')
      .sort((a,b)=> Math.hypot(a.pos.x-x,a.pos.y-y) - Math.hypot(b.pos.x-x,b.pos.y-y))[0] || attackTeam.players[0];
    this.startRestart('CORNER',attackTeam,taker,pos);
  }
  queueGoalKick(defendTeam){
    if(this.state!=='play') return;
    const taker=defendTeam.players.find(p=>p.role==='GK')||defendTeam.players[0];
    const x=(defendTeam.side==='L')?60:Config.W-60; const y=Config.H/2;
    this.startRestart('GOAL-KICK',defendTeam,taker,{x,y});
  }
  startRestart(kind,team,taker,pos){
    this.state='restart'; this.restart={kind,team,taker,pos:new Vec2(pos.x,pos.y)};
    taker.pos.set(pos.x,pos.y); this.ball.owner=taker; this.ball.pos.set(pos.x,pos.y);
    placeForRestart(this); this.assignControllers();
    // 휴먼이 아니면 잠시 뒤 자동 킥
    const isHuman = (team===this.humanTeam1) || (this.mode==='2P' && team===this.teamB);
    this.restart.isHuman=isHuman; if(!isHuman){ this.restart.aiKickTime=this.t+rand(0.5,1.1); this.restart._aiActed=false; }
  }
  freezeForRestart(){
    const r=this.restart; if(!r||!r.taker) return;
    this.allPlayers().forEach(p=>{ if(!(r.allies.includes(p)||r.opps.includes(p)||p===r.taker)){ p.frozen=true; p.vel.mul(0); }});
    r.taker.frozen=true; r.taker.vel.mul(0); this.ball.owner=r.taker; this.ball.pos.set(r.pos.x,r.pos.y);
  }
  updateRestartMovers(){
    const r=this.restart; if(!r||!r.taker) return;
    for(const m of r.allies){
      const t={x:m.home.x + (m.team.side==='L'?30:-30), y: clamp(r.pos.y, FIELD.MINY+40, FIELD.MAXY-40)};
      seek(m,t,0.12*m.prof.spd*Config.ACCEL_BASE/0.18);
    }
    for(const m of r.opps){ seek(m,r.taker.pos,0.11*m.prof.spd*Config.ACCEL_BASE/0.18); }
  }
  maybeAIRestart(){
    const r=this.restart; if(!r || r.isHuman || r._aiActed) return;
    if(this.t>=r.aiKickTime){
      const k=r.taker;
      // 간단: 코너는 스루, 나머지는 짧패
      if(r.kind==='CORNER'){ this.passToBest(k,'through',(k.controlled===1)?1:2,true); }
      else{ this.passToBest(k,'normal',(k.controlled===1)?1:2,true); }
      r._aiActed=true; this.state='play'; this.restart=null;
      this.allPlayers().forEach(p=>p.frozen=false);
    }
  }
  endRestartIfKicked(){
    if(this.state!=='restart'||!this.restart||!this.restart.taker) return;
    const k=this.restart.taker; const i=(k.team===this.teamA)?this.input1:this.input2; if(!i) return;
    let acted=false;
    if(i.shootRelease){ this.shootSmart(k, clamp(i.shotCharge,0,1), k.facing); acted=true; i.shootRelease=false; i.shotCharge=0; }
    if(i.passTrigger){ const type=i.passIsThrough?'through':'normal'; this.passToBest(k,type,(k.controlled===1)?1:2,true); i.passTrigger=false; acted=true; }
    if(acted){ this.state='play'; this.restart=null; this.allPlayers().forEach(p=>p.frozen=false); }
  }

  // ---- passing/shooting helpers
  nearestMateOf(p){ let best=null,bd=1e9; for(const m of p.team.players){ if(m===p) continue; const d=Math.hypot(m.pos.x-p.pos.x, m.pos.y-p.pos.y); if(d<bd){ bd=d; best=m; } } return best; }
  passToBest(p, type, which, restart=false){
    const from=this.ball.pos;
    const mates=p.team.players.filter(m=>m!==p);
    let best=null, sc=-1e9;
    const dir=(p.facing.x||p.facing.y)? new Vec2(p.facing.x,p.facing.y).norm() : new Vec2(p.team.side==='L'?1:-1,0);
    for(const m of mates){
      const dvx=m.pos.x-from.x, dvy=m.pos.y-from.y; const dist=Math.hypot(dvx,dvy); if(dist<26||dist> (type==='through'?360:300)) continue;
      const vnX=dvx/dist, vnY=dvy/dist; const dot=vnX*dir.x+vnY*dir.y; if(dot<=Math.cos(35*Math.PI/180)) continue;
      const forward=(p.team.side==='L')?(m.pos.x>p.pos.x):(m.pos.x<p.pos.x);
      const score=dot*100 + (forward?12:0) + ((m.role==='ST')?14:0);
      if(score>sc){ sc=score; best=m; }
    }
    if(!best) best=this.nearestMateOf(p);
    this.passTo(p, best, type, which);
  }
  passTo(fromPlayer, target, type, which){
    if(!target) return;
    const from=this.ball.pos;
    const dirTo=new Vec2(target.pos.x-from.x, target.pos.y-from.y);
    const dist=dirTo.len(); const dir=(dist>0?dirTo.norm():new Vec2(fromPlayer.facing.x,fromPlayer.facing.y));
    const lead=(type==='through')?clamp(dist*0.22,20,44):clamp(dist*0.11,8,18);
    const leadDir=(target.facing.x||target.facing.y)?new Vec2(target.facing.x,target.facing.y).norm():dir;
    const aim=new Vec2(target.pos.x+leadDir.x*lead, target.pos.y+leadDir.y*lead); clampPoint(aim);
    const baseDist=Math.hypot(aim.x-from.x, aim.y-from.y);
    const speed=clamp(baseDist/0.6, 4.2, 9.2) * (type==='through'? Config.PASS_SPEED_THROUGH : Config.PASS_SPEED_NORM);
    this.ball.kick(aim, speed, {fric:(type==='through'?0.992:0.987)});
    this.ball.assistTo=target; this.ball.assistT=(type==='through')?1.2:0.8;
    this.ball.lastTouchTeam=fromPlayer.team;
  }
  _goalTargetY(p, inputDir){
    const mid=Config.H/2, pad=Config.GOAL_W/2 - 8, top=mid - pad, bot=mid + pad;
    if(!inputDir || (!inputDir.x && !inputDir.y)) return mid;
    if(inputDir.y < -0.2) return lerp(mid, top, 0.85);
    if(inputDir.y > 0.2) return lerp(mid, bot, 0.85);
    return mid;
  }
  shootSmart(p, pow, inputDir){
    const left=(p.team.side==='L'); const gx=left? (Config.W-16) : 16;
    const dGoal=Math.abs(gx-p.pos.x); const gy=this._goalTargetY(p,inputDir); const aim=new Vec2(gx,gy);
    let speed=(3.2 + (6.1-3.2)*pow) * p.prof.shot * (1+0.04*(p.boost.shot||0)) * Config.SHOT_SPEED_SCALE;
    speed=Math.min(speed,6.1*Config.SHOT_SPEED_SCALE*1.02);
    let useCurve=false, curveK=0, fr=1.0;
    if(dGoal<120){ fr=0.986; useCurve=false; }
    else if(dGoal<260){ fr=0.987; useCurve=false; speed*=1.06; }
    else { fr=0.988; useCurve=true; curveK=(0.36+0.22*pow)*(0.8+p.prof.shot*0.5)*0.5*(left?1:-1); }
    this.ball.kick(aim, speed, {fric:fr});
    if(useCurve){ const dir=new Vec2(left?1:-1,0); const perp=new Vec2(-dir.y,dir.x); this.ball.curve=perp.mul(curveK); this.ball.curve.y+=0.01*(rand(0.8,1.2)); }
    else { this.ball.curve.set(0,0); }
  }

  // ---- tick / render
  tick(ts){
    const ms=(ts||0);
    const dt=Math.min(Config.MAX_DT,(ms-this.lastRAF)/1000||0);
    this.lastRAF=ms; this.acc+=dt;
    const foc=(document.activeElement===canvas); if(foc!==this.lastFocused){ toast.style.display = foc? 'none':'block'; this.lastFocused=foc; }

    let steps=0;
    while(this.acc>=Config.STEP && steps<8){
      this.updateFixed(); this.acc-=Config.STEP; steps++;
    }
    this.render();
    requestAnimationFrame(this.tick.bind(this));
  }
  updateFixed(){
    this.t+=Config.STEP;
    this.timeLeft=Math.max(0,this.timeLeft-Config.STEP); sbTime.textContent=this.formatTime(this.timeLeft);
    if(this.timeLeft<=0){ this.timeLeft=3*60; }

    // 메뉴/재시작 상태
    if(this.state==='restart'){ this.freezeForRestart(); this.updateRestartMovers(); this.maybeAIRestart(); this.updateGauges(); return; }

    this.updateGauges();
    inputUpdateCharges(this.input1, this.t);
    inputUpdateCharges(this.input2, this.t);

    // 모바일 조이스틱 → 1P 입력
    if(touchpad.style.display==='flex'){ const i=this.input1; i.left=(touch.knobX<-0.2); i.right=(touch.knobX>0.2); i.up=(touch.knobY<-0.2); i.down=(touch.knobY>0.2); }

    // 플레이어 업데이트
    const all=this.allPlayers();
    for(const p of all){
      if(p.frozen){ p.vel.mul(0); continue; }

      // 컨트롤러/AI 선택
      const input = (p.controlled===1)?this.input1 : (p.controlled===2)?this.input2 : null;

      if(input){ // 휴먼
        const rawX=(input.right?1:0)-(input.left?1:0), rawY=(input.down?1:0)-(input.up?1:0);
        const accel=Config.ACCEL_BASE*p.prof.spd*(1+0.04*(p.boost.spd||0))*(p.hasBall?.(this)?1.2:1.0);
        p.vel.x = p.vel.x*0.84 + rawX*accel;
        p.vel.y = p.vel.y*0.84 + rawY*accel;

        if(input.tackleTap){ if(p.tackleCd<=0 && this.ball.owner && this.ball.owner.team!==p.team && p.distBall(this)<24){ this.ball.knock({x:this.ball.pos.x-p.pos.x,y:this.ball.pos.y-p.pos.y}, 7.0*(p.prof.tackle*(1+0.04*(p.boost.tackle||0)))); p.tackleCd=0.5; } input.tackleTap=false; }
        if(input.shootRelease){ if(this.ball.owner===p){ const pow=clamp(input.shotCharge,0,1); this.shootSmart(p, pow, {x:(input.right?1:0)-(input.left?1:0), y:(input.down?1:0)-(input.up?1:0)}); } input.shootRelease=false; input.shotCharge=0; }
        if(input.passTrigger){ if(this.ball.owner===p){ const type=input.passIsThrough?'through':'normal'; if(this.state==='restart'){ this.passToBest(p,type,(p.controlled===1)?1:2,true); } else { this.passToBest(p,type,(p.controlled===1)?1:2,false); } } input.passTrigger=false; }
        if(input.switch){ this.manualSwitch(p.controlled); input.switch=false; }
      } else { // AI
        this.updateAIFor(p);
      }

      // 속도 제한 & 이동
      const baseMax=(2.5+1.5)*0.2*p.prof.spd*(1+0.04*(p.boost.spd||0)) * Config.MAXSPD_SCALE;
      let maxSpd=baseMax; if(this.ball.owner===p) maxSpd*=0.9;
      const L=Math.hypot(p.vel.x,p.vel.y); if(L>maxSpd){ p.vel.x*=maxSpd/L; p.vel.y*=maxSpd/L; }
      p.pos.add(p.vel);

      // 경계 + 골문 금지
      p.pos.x=clamp(p.pos.x,FIELD.MINX+p.r,FIELD.MAXX-p.r);
      p.pos.y=clamp(p.pos.y,FIELD.MINY+p.r,FIELD.MAXY-p.r);
      p.applyGoalKeepOut();

      // 볼 소유
      if(!this.ball.owner && (this.ball.pk||0)<=0 && p.distBall(this)<Config.GRAB_DIST){
        this.ball.owner=p; this.ball.vel.mul(0); this.ball.curve.set(0,0);
        this.ball.lastTouchTeam=p.team; this.possessionChanged();
      }
    }

    // 팀 뭉침 방지
    separation(all, 0.35, 28);
    // 감속
    for(const p of all){ p.vel.mul(0.92); p.tackleCd=Math.max(0,p.tackleCd-Config.STEP); }

    // 볼
    const prevOwner=this.ball.owner; this.ball.update(this); if(prevOwner!==this.ball.owner) this.possessionChanged();

    // 게이지충전 끝
  }
  updateAIFor(p){
    const ball=this.ball;
    if(this.state==='restart'){ p.vel.mul(0); return; }
    if(p.role==='GK'){ return this.updateGK(p); }
    const haveBall=(ball.owner===p);

    if(!ball.owner){
      // 볼 프리 → 가까운 2명만 강하게 추격
      const pressers = p.team.players.slice().sort((a,b)=> Math.hypot(ball.pos.x-a.pos.x, ball.pos.y-a.pos.y) - Math.hypot(ball.pos.x-b.pos.x, ball.pos.y-b.pos.y));
      const primary=pressers[0], secondary=pressers[1];
      if(p===primary || p===secondary) seek(p, ball.pos, 0.95*p.prof.spd*Config.ACCEL_BASE/0.18);
      else seek(p, supportTarget(p,this), 0.11*p.prof.spd*Config.ACCEL_BASE/0.18);
      if(p.distBall(this)<Config.GRAB_DIST && (ball.pk||0)<=0){ ball.owner=p; ball.vel.mul(0); ball.curve.set(0,0); ball.lastTouchTeam=p.team; this.possessionChanged(); }
      return;
    }
    if(ball.owner.team===p.team){ // 우리팀 볼
      if(haveBall){
        // 간단: 윙은 쓰루, 수미/수비는 짧패, 공격진은 슛 or 패스
        if(p.role==='LW'||p.role==='RW'){ this.passToBest(p,'through', (p.controlled===1)?1:2,false); return; }
        if(p.role==='CDM'||p.role==='CM'||p.role==='LCB'||p.role==='RCB'||p.role==='LB'||p.role==='RB'){ this.passToBest(p,'normal',(p.controlled===1)?1:2,false); return; }
        const dGoal=Math.abs((p.team.side==='L'?Config.W-40:40)-p.pos.x);
        if(dGoal<260){ this.shootSmart(p, rand(0.5,0.9), p.facing); return; }
        const t=supportTarget(p,this); seek(p,t,0.13*p.prof.spd*Config.ACCEL_BASE/0.18);
      } else {
        const t=supportTarget(p,this); seek(p,t,0.12*p.prof.spd*Config.ACCEL_BASE/0.18);
      }
    } else { // 상대 볼
      if(p.role==='LCB'||p.role==='RCB'){ const mid={x:(ball.owner.pos.x+ball.pos.x)/2, y:(ball.owner.pos.y+ball.pos.y)/2}; seek(p,mid,0.14*p.prof.spd*Config.ACCEL_BASE/0.18); if(p.distBall(this)<26) { this.ball.knock({x:ball.pos.x-p.pos.x,y:ball.pos.y-p.pos.y}, 7.0*(p.prof.tackle*(1+0.04*(p.boost.tackle||0)))); } return; }
      if(p.role==='CDM'||p.role==='CM'||p.role==='LB'||p.role==='RB'){ seek(p,ball.pos,0.98*p.prof.spd*Config.ACCEL_BASE/0.18); if(p.distBall(this)<27){ this.ball.knock({x:ball.pos.x-p.pos.x,y:ball.pos.y-p.pos.y}, 7.0*(p.prof.tackle*(1+0.04*(p.boost.tackle||0)))); } return; }
      const pressers = p.team.players.slice().sort((a,b)=> Math.hypot(ball.pos.x-a.pos.x, ball.pos.y-a.pos.y) - Math.hypot(ball.pos.x-b.pos.x, ball.pos.y-b.pos.y));
      const primary=pressers[0], secondary=pressers[1];
      if(p===primary) seek(p,ball.pos,1.0*p.prof.spd*Config.ACCEL_BASE/0.18+0.15);
      else if(p===secondary) { const mid={x:(ball.owner.pos.x+ball.pos.x)/2,y:(ball.owner.pos.y+ball.pos.y)/2}; seek(p,mid,0.13*p.prof.spd*Config.ACCEL_BASE/0.18); }
      else seek(p, supportTarget(p,this), 0.11*p.prof.spd*Config.ACCEL_BASE/0.18);
    }
  }
  updateGK(p){
    const left=p.team.side==='L', gx=left?26:Config.W-26, goalY=clamp(this.ball.pos.y,Config.H/2-Config.GOAL_W/2+10,Config.H/2+Config.GOAL_W/2-10);
    const target={x:gx+(left?10:-10), y:goalY}; seek(p, target, 0.18*p.prof.spd*Config.ACCEL_BASE/0.18);
    const d=p.distBall(this);
    if(!this.ball.owner){
      const towardGoal = left? (this.ball.pos.x<80) : (this.ball.pos.x>Config.W-80);
      const speed=Math.hypot(this.ball.vel.x, this.ball.vel.y);
      if(towardGoal && d<30 && speed>3.4){
        const away = left? {x:1,y:rand(-0.4,0.4)} : {x:-1,y:rand(-0.4,0.4)};
        this.ball.lastTouchTeam=p.team; this.ball.knock(away, rand(3.8,5.2)); return;
      }
    }
    if(d<Config.GRAB_DIST+4 && (this.ball.pk||0)<=0){ this.ball.owner=p; this.ball.vel.mul(0); this.ball.curve.set(0,0); this.ball.lastTouchTeam=p.team; this._gkHoldT=this.t; this.possessionChanged(); return; }
    if(this.ball.owner===p){ if((this.t - (this._gkHoldT||0))>0.28){ const t=this.nearestMateOf(p)||p.team.players[1]; this.passToBest(p,'normal',(p.controlled===1)?1:2,false); } }
  }

  render(){
    const g=ctx;
    g.clearRect(0,0,canvas.width,canvas.height);
    g.drawImage(pitchBuf,0,0);
    this.ball.draw(g);
    this.teamA.players.forEach(p=>p.draw(g));
    this.teamB.players.forEach(p=>p.draw(g));

    if(this.state==='restart' && this.restart && this.restart.taker){
      const k=this.restart.taker;
      g.save(); g.strokeStyle='#ffe38a'; g.setLineDash([6,4]); g.lineWidth=2; g.beginPath();
      g.arc(k.pos.x,k.pos.y,k.r+10,0,TAU); g.stroke(); g.setLineDash([]); g.restore();
    }
  }

  updateGauges(){
    const i1=this.input1, i2=this.input2;
    let m1='IDLE', p1=0; if(i1.shootHeld||i1.shootRelease){ m1='SHOOT'; p1=i1.shotCharge; } else if(i1.passHeld||i1.passTrigger){ m1='PASS'; p1=i1.passCharge; }
    g1_mode.textContent=m1; g1_fill.style.width=(p1*100).toFixed(0)+'%'; g1_pct.textContent=((p1*100)|0)+'%';
    let m2='IDLE', p2=0; if(i2.shootHeld||i2.shootRelease){ m2='SHOOT'; p2=i2.shotCharge; } else if(i2.passHeld||i2.passTrigger){ m2='PASS'; p2=i2.passCharge; }
    g2_mode.textContent=m2; g2_fill.style.width=(p2*100).toFixed(0)+'%'; g2_pct.textContent=((p2*100)|0)+'%';
  }
}

// expose for debugging
window.game = null;

// ================= boot / inputs / UI =================
function init(){
  if(window.game) return;
  resize();
  const game = new Game();
  window.game = game;

  requestAnimationFrame(ts=>game.tick(ts));
  setupTouch(game);
}
function setupTouch(game){
  if(!('ontouchstart' in window)) return; touchpad.style.display='flex';
  const rectOf=el=>el.getBoundingClientRect(); const maxR=48;
  const onStart=e=>{ const r=rectOf(joy); touch.active=true; touch.cx=r.left+r.width/2; touch.cy=r.top+r.height/2; move(e); };
  const move=(e)=>{ if(!touch.active) return; const t=e.touches?e.touches[0]:e; const dx=t.clientX-touch.cx, dy=t.clientY-touch.cy; const L=Math.hypot(dx,dy); const k=L>maxR?maxR/L:1; const nx=dx*k, ny=dy*k; knob.style.transform=`translate(${nx}px,${ny}px)`; touch.knobX=nx/maxR; touch.knobY=ny/maxR; e.preventDefault(); };
  const end=()=>{ touch.active=false; knob.style.transform='translate(-50%,-50%)'; touch.knobX=0; touch.knobY=0; };
  joy.addEventListener('touchstart',onStart); joy.addEventListener('touchmove',move); joy.addEventListener('touchend',end); joy.addEventListener('touchcancel',end);
  tpPass.addEventListener('touchstart',()=>{ handlePassKey(game.input1,true,game.t); });
  tpPass.addEventListener('touchend',()=>{ handlePassKey(game.input1,false,game.t); });
  tpShoot.addEventListener('touchstart',()=>{ handleShootKey(game.input1,true,game.t); });
  tpShoot.addEventListener('touchend',()=>{ handleShootKey(game.input1,false,game.t); });
}

// keyboard
function setKey(e,down){
  const k=e.code; const game=window.game; if(!game) return;
  if(document.activeElement!==canvas) return;
  const now=game.t; const i1=game.input1, i2=game.input2; if(!i1||!i2) return;
  if(k===Keys.W)i1.up=down; if(k===Keys.S)i1.down=down; if(k===Keys.A)i1.left=down; if(k===Keys.D)i1.right=down;
  if(k===Keys.PASS1){ handlePassKey(i1,down,now); if(game) game.endRestartIfKicked(); }
  if(k===Keys.SHOOT1){ handleShootKey(i1,down,now); if(game) game.endRestartIfKicked(); }
  if(k===Keys.SWITCH1 && down) i1.switch=true; if(k===Keys.CURVE1) i1.curveHeld=down; if(k===Keys.TACKLE1 && down) i1.tackleTap=true;

  if(k===Keys.UP)i2.up=down; if(k===Keys.DOWN)i2.down=down; if(k===Keys.LEFT)i2.left=down; if(k===Keys.RIGHT)i2.right=down;
  if([Keys.PASS2,'Numpad1'].includes(k)){ handlePassKey(i2,down,now); if(game) game.endRestartIfKicked(); }
  if([Keys.SHOOT2,'Numpad2'].includes(k)){ handleShootKey(i2,down,now); if(game) game.endRestartIfKicked(); }
  if([Keys.SWITCH2,'Numpad3'].includes(k) && down) i2.switch=true; if([Keys.CURVE2,'Numpad4'].includes(k)) i2.curveHeld=down; if([Keys.TACKLE2,'Numpad5'].includes(k) && down) i2.tackleTap=true;

  e.preventDefault();
}

// UI hooks
window.addEventListener('resize', resize);
window.addEventListener('keydown', e=>setKey(e,true), {passive:false});
window.addEventListener('keyup',   e=>setKey(e,false), {passive:false});
document.getElementById('mode1').addEventListener('click',()=>{ if(!window.game) return; mode1Btn.classList.add('active'); mode2Btn.classList.remove('active'); window.game.mode='1P'; });
document.getElementById('mode2').addEventListener('click',()=>{ if(!window.game) return; mode2Btn.classList.add('active'); mode1Btn.classList.remove('active'); window.game.mode='2P'; });
document.getElementById('startBtn').addEventListener('click',()=>{ if(!window.game) init(); window.game.start(); });
document.getElementById('openMgrFromMenu').addEventListener('click',()=>{ showMgr('A'); });

canvas.addEventListener('pointerdown',()=>{ canvas.focus(); toast.style.display='none'; });

// 색상 변경
colorA?.addEventListener('input',()=>{ if(!window.game) return; window.game.teamA.color=colorA.value; window.game.saveColors(); drawPitch(pitchCtx); });
colorB?.addEventListener('input',()=>{ if(!window.game) return; window.game.teamB.color=colorB.value; window.game.saveColors(); drawPitch(pitchCtx); });

// 선수관리
mgrBtn?.addEventListener('click',()=>showMgr('A'));
mgrClose?.addEventListener('click',()=>{ mgr.style.display='none'; pdetail.style.display='none'; });
tabA?.addEventListener('click',()=>showMgr('A'));
tabB?.addEventListener('click',()=>showMgr('B'));

function showMgr(teamName){
  if(!window.game){ init(); }
  const g=window.game;
  tabA.classList.toggle('active', teamName==='A'); tabB.classList.toggle('active', teamName==='B');
  mgr.style.display='grid'; plist.textContent='';
  const team = teamName==='A' ? g.teamA : g.teamB;
  // 팀 스폰/적용(메뉴에서 바로 열었을 때 대비)
  if(team.players.length===0){ g.teamA.spawn(); g.teamB.spawn(); g.applySavedUpgrades(); }

  const addItem=(p)=>{
    const key=`${team.name}-${p.role}`; const u=g.upgrades[key] || {spd:0,shot:0,tackle:0};
    const el=document.createElement('div'); el.className='pitem';
    el.innerHTML=`<div><b>${p.role}</b> <span class="tiny">(${team.name})</span><div class="tiny">SPD +${u.spd} · SHOT +${u.shot} · TACKLE +${u.tackle}</div></div>
      <button class="btn">강화</button>`;
    el.querySelector('button').onclick=()=>openPlayerDetail(team, p);
    plist.appendChild(el);
  };
  team.players.forEach(addItem);
  pdetail.style.display='none';
}

function openPlayerDetail(team, p){
  const g=window.game; const key=`${team.name}-${p.role}`;
  const u=g.upgrades[key] || (g.upgrades[key]={spd:0,shot:0,tackle:0});
  pdTitle.textContent=`${team.name} · ${p.role}`;
  pdSub.textContent='확률형 강화(성공시 +1, 3강부터 실패 시 -1)';
  const refresh=()=>{
    spdTier.textContent='+'+u.spd; shotTier.textContent='+'+u.shot; tacTier.textContent='+'+u.tackle;
    const next = Math.max(u.spd,u.shot,u.tackle);
    const rates=[80,60,40,20,10]; const rate = rates[Math.min(next,4)];
    pdRate.textContent=`성공률: ${rate}%`;
  };
  const doUpg=(stat)=>{
    const cur=u[stat]; const rates=[80,60,40,20,10]; const rate=rates[Math.min(cur,4)];
    const ok = Math.random()*100 < rate;
    if(ok){ u[stat]=Math.min(5, cur+1); }
    else if(cur>=3){ u[stat]=Math.max(0, cur-1); }
    g.upgrades[key]=u; g.saveUpgrades();
    // 실제 선수 객체에도 반영
    p.boost={...u};
    refresh();
  };
  spdUp.onclick=()=>doUpg('spd');
  shotUp.onclick=()=>doUpg('shot');
  tacUp.onclick=()=>doUpg('tackle');
  pdReset.onclick=()=>{ u.spd=u.shot=u.tackle=0; g.upgrades[key]=u; g.saveUpgrades(); p.boost={...u}; refresh(); };
  refresh();
  pdetail.style.display='block';
}

// kick-off 자동 부트
if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',init,{once:true}); } else { init(); }

