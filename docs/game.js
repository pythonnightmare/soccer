import { Field } from './field.js';
import { updateAI } from './ai.js';
import { drawAvatarOn } from './assets.js';

export class Game {
  constructor(canvas, minimapCanvas, cfg={}){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.mini = minimapCanvas;
    this.mctx = minimapCanvas.getContext('2d');

    this.speedScale = cfg.speedScale ?? 1;
    this.field = new Field({ fieldWidthScale: cfg.fieldWidthScale ?? 1 });

    // 월드/엔티티
    this.players = [];
    this.ball = new Ball(this.field.worldW/2, this.field.worldH/2);

    // 팀 구성(6v6 예시)
    this.makeTeams();

    // 입력/카메라
    this.keys = new Set();
    this.aim = {x:1, y:0}; // 방향키 기반 조준
    this.camera = { x: 0, y: 0, w: canvas.width, h: canvas.height };

    // 이벤트
    this._onScore = ()=>{};
    this.time = performance.now();
    this.isPaused = false;

    this.bindInput();
  }

  onScore(fn){ this._onScore = fn; }

  getSelectedPlayer(){
    return this.players.find(p=>p.isUser && p.selected) ?? this.players.find(p=>p.isUser);
  }

  start(){
    const loop = (t)=>{
      const dt = Math.min(0.033, (t - this.time)/1000) * this.speedScale;
      this.time = t;
      if(!this.isPaused) this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  makeTeams(){
    const fw = this.field.worldW, fh = this.field.worldH;
    const spotsHome = [
      {role:'GK', x: 80, y: fh/2},
      {role:'CB', x: fw*0.22, y: fh*0.40},
      {role:'CB', x: fw*0.22, y: fh*0.60},
      {role:'CM', x: fw*0.40, y: fh*0.50},
      {role:'LW', x: fw*0.50, y: fh*0.28},
      {role:'RW', x: fw*0.50, y: fh*0.72},
    ];
    const spotsAway = spotsHome.map(s=>({role:s.role, x: (fw - s.x), y:s.y}));

    let idx=0;
    spotsHome.forEach((s,i)=> this.players.push(makePlayer('home', ++idx, s)));
    spotsAway.forEach((s,i)=> this.players.push(makePlayer('away', ++idx, s)));

    // 사용자: 홈 CM 기본 선택
    const user = this.players.find(p=>p.team==='home' && p.role==='CM');
    user.isUser = true; user.selected = true; user.avatarType='poodle';
    // 기본 아바타
    this.players.forEach((p,i)=> p.avatarType = p.avatarType || (p.team==='home' ? 'fox':'bear'));
  }

  bindInput(){
    window.addEventListener('keydown', (e)=>{
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code==='ArrowLeft')  this.aim = {x:-1,y:0};
      if (e.code==='ArrowRight') this.aim = {x: 1,y:0};
      if (e.code==='ArrowUp')    this.aim = {x: 0,y:-1};
      if (e.code==='ArrowDown')  this.aim = {x: 0,y: 1};

      if (e.code==='KeyP') this.isPaused = !this.isPaused;

      // 패스/슛
      if (e.code==='KeyX') this.tryPass();
      if (e.code==='KeyZ') this.tryShoot();

      // 방향 전환 + Q : 조준 방향 기준 최근접 선수 선택
      if (e.code==='KeyQ') this.switchToDirectional();

      // 디버그 토글
      if (e.code==='F1') this.debug = !this.debug;
    });
    window.addEventListener('keyup', (e)=> this.keys.delete(e.code));
  }

  switchToDirectional(){
    const me = this.getSelectedPlayer(); if(!me) return;
    const dir = this.aim;
    const teamMates = this.players.filter(p=>p.team===me.team && p!==me);
    let best=null, bestScore=-1;
    teamMates.forEach(p=>{
      const vx = p.x - me.x, vy = p.y - me.y;
      const len = Math.hypot(vx,vy) || 1;
      const dot = (vx/len)*dir.x + (vy/len)*dir.y; // 방향 정합(1에 가까울수록 좋음)
      const distScore = Math.max(0, 1 - (len/900)); // 너무 멀면 감점
      const score = dot*0.8 + distScore*0.2;
      if (score>bestScore){ bestScore=score; best=p; }
    });
    if (best){
      this.players.forEach(p=>p.selected=false);
      best.isUser = true; best.selected=true;
      // 이전 사용자는 AI로
      if(me!==best){ me.isUser = true; me.selected=false; }
    }
  }

  tryPass(){
    const me = this.getSelectedPlayer(); if(!me) return;
    // 조준 방향 근거로 '흡착 타겟' 선택 (가중 최근접 + 시야각)
    const mates = this.players.filter(p=>p.team===me.team && p!==me);
    const dir = this.aim;
    const angleOK = (vx,vy)=>{
      const len = Math.hypot(vx,vy)||1;
      const dot = (vx/len)*dir.x + (vy/len)*dir.y;
      return dot > 0.35; // 정면 130도 이내
    };
    let target = null, best=-1;
    mates.forEach(p=>{
      const vx=p.x-me.x, vy=p.y-me.y;
      if(!angleOK(vx,vy)) return;
      const d = Math.hypot(vx,vy);
      const dot = (vx/d)*dir.x + (vy/d)*dir.y;
      const score = dot*0.8 + Math.max(0, 1-(d/900))*0.2;
      if(score>best){ best=score; target=p; }
    });

    // 타겟 없으면 전방 스루
    const fallback = { x: clamp( me.x + dir.x*320, 40, this.field.worldW-40 ),
                       y: clamp( me.y + dir.y*220, 40, this.field.worldH-40 ) };

    const aim = target ? {x:target.x, y:target.y} : fallback;

    // 커브 제거: 직선 패스 (각속도/스핀 0), 속도 상수
    const speed = 750;
    const vx = aim.x - this.ball.x, vy = aim.y - this.ball.y;
    const len = Math.hypot(vx,vy) || 1;
    this.ball.kick( (vx/len)*speed, (vy/len)*speed, me );
  }

  tryShoot(){
    const me = this.getSelectedPlayer(); if(!me) return;
    // 상대 골 중앙을 향한 직선 슛
    const goal = me.team==='home' ? this.field.goals.right : this.field.goals.left;
    const gx = goal.x + (goal.w>0 ? 1 : goal.w-1); // 골문 안쪽
    const gy = goal.y + goal.h/2;
    const speed = 980;
    const vx = gx - this.ball.x, vy = gy - this.ball.y;
    const len = Math.hypot(vx,vy)||1;
    this.ball.kick( (vx/len)*speed, (vy/len)*speed, me, /*isShot=*/true );
  }

  update(dt){
    // 입력에 따른 사용자 이동 (WASD + 대시)
    const me = this.getSelectedPlayer();
    if (me) {
      const ax = (this.keys.has('KeyD')?1:0) - (this.keys.has('KeyA')?1:0);
      const ay = (this.keys.has('KeyS')?1:0) - (this.keys.has('KeyW')?1:0);
      const dash = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 1.5 : 1;
      me.intent.ax += ax * 1.1 * dash;
      me.intent.ay += ay * 1.1 * dash;
    }

    // AI
    updateAI(dt, this);

    // 물리
    stepPhysics(this, dt);

    // 카메라: 공 소유자(없으면 공) 추적 이징
    const tx = (this.ball.owner?.x ?? this.ball.x) - this.camera.w/2;
    const ty = (this.ball.owner?.y ?? this.ball.y) - this.camera.h/2;
    this.camera.x += (tx - this.camera.x) * 0.12;
    this.camera.y += (ty - this.camera.y) * 0.12;
    // 경계
    this.camera.x = clamp(this.camera.x, -40, this.field.worldW - this.camera.w + 40);
    this.camera.y = clamp(this.camera.y, -40, this.field.worldH - this.camera.h + 40);

    // 득점/아웃/쓰로인
    this.checkGoals();
    this.checkOuts();
  }

  render(){
    const ctx = this.ctx, cam = this.camera;
    ctx.clearRect(0,0, this.canvas.width, this.canvas.height);

    // 필드
    this.field.draw(ctx, cam);

    // 선수
    this.players.forEach(p=>{
      drawPlayer(ctx, cam, p, this.debug);
    });

    // 볼
    drawBall(ctx, cam, this.ball);

    // 미니맵
    this.field.drawMinimap(this.mctx, this.players, this.ball);
  }

  checkGoals(){
    const b = this.ball;
    const gLeft  = this.field.goals.left;
    const gRight = this.field.goals.right;

    const inRect = (r)=> b.x>=r.x && b.y>=r.y && b.x<=r.x+r.w && b.y<=r.y+r.h;

    if (inRect(gLeft)) {
      this.score('away');
      this.kickoff('away');
    } else if (inRect(gRight)) {
      this.score('home');
      this.kickoff('home');
    }
  }

  score(side){
    if (side==='home') this.homeScore=(this.homeScore||0)+1;
    else this.awayScore=(this.awayScore||0)+1;
    this._onScore(this.homeScore||0, this.awayScore||0);
  }

  kickoff(side){
    // 중앙에서 재개, 상대가 킥오프
    const fw = this.field.worldW, fh = this.field.worldH;
    this.ball.reset(fw/2, fh/2);
    this.ball.owner = null;
    // 라인 정렬
    this.players.forEach(p=>{
      p.x = p.homeSpot.x + (Math.random()*6-3);
      p.y = p.homeSpot.y + (Math.random()*6-3);
      p.vx = p.vy = 0;
    });
  }

  checkOuts(){
    const { x, y } = this.ball;
    if (this.field.contains(x,y)) return;

    // 아웃 판정 → 쓰로인: 마지막 터치 팀의 상대에게 유리
    const lastTeam = this.ball.lastTouch?.team;
    const throwTeam = lastTeam==='home' ? 'away' : 'home';

    // 쓰로인 위치: 경계에 클램프
    const tx = clamp(x, 10, this.field.worldW-10);
    const ty = clamp(y, 10, this.field.worldH-10);
    this.ball.reset(tx, ty);
    this.ball.owner = null;
    this.ball.isThrowIn = true;
    this.ball.throwTeam = throwTeam;
    this.ball.throwTimer = 0;

    // 같은 팀에게만 패스되도록 0.8초간 상대 인터셉트 무효
    this.ball.noInterceptionUntil = performance.now() + 800;
  }
}

// ===== Helpers / Entities =====

function makePlayer(team, idx, spot){
  const name = `${team.toUpperCase()}-${spot.role}-${idx}`;
  return {
    idx, name, team,
    role: spot.role,
    x: spot.x, y: spot.y,
    vx:0, vy:0,
    speed: 220, // 기본 이동 속도 (전역 스케일로 곱해짐)
    radius: 16,
    isUser:false, selected:false,
    homeSpot: { x: spot.x, y: spot.y },
    avatarType: 'fox',
    intent:{ax:0,ay:0},
    noTackleTeammate:false
  };
}

class Ball{
  constructor(x,y){
    this.x=x; this.y=y; this.vx=0; this.vy=0;
    this.r=7; this.owner=null; this.lastTouch=null;
  }
  kick(vx,vy, by, isShot=false){
    this.owner = null;
    this.vx=vx; this.vy=vy;
    this.lastTouch = by||null;
    this.isShot = !!isShot;
  }
  reset(x,y){
    this.x=x; this.y=y; this.vx=this.vy=0;
    this.isShot=false; this.isThrowIn=false;
  }
}

// ===== Physics / Rules =====
function stepPhysics(game, dt){
  const { players, ball, field } = game;

  // 선수 이동 + 회피(겹침 방지)
  players.forEach(p=>{
    // 의도 -> 속도
    const max = p.speed * 1.0 * game.speedScale;
    p.vx += p.intent.ax * 700 * dt;
    p.vy += p.intent.ay * 700 * dt;

    // 감쇠
    p.vx *= 0.86; p.vy *= 0.86;

    // 속도 제한
    const sp = Math.hypot(p.vx,p.vy);
    if (sp>max){ p.vx = p.vx/sp*max; p.vy = p.vy/sp*max; }

    // 위치 업데이트
    p.x += p.vx*dt; p.y += p.vy*dt;

    // 필드 경계
    p.x = clamp(p.x, 12, field.worldW-12);
    p.y = clamp(p.y, 12, field.worldH-12);

    // 금지존: 상대 골문 내부 진입 금지
    const forb = field.goalForbidden[p.team==='home' ? 'right' : 'left'];
    if (rectContains(forb, p.x, p.y)){
      if (p.team==='home') p.x = Math.min(p.x, forb.x-2);
      else                 p.x = Math.max(p.x, forb.x+forb.w+2);
    }

    // 의도 초기화
    p.intent.ax = p.intent.ay = 0;
  });

  // 선수-선수 겹침 분리
  for (let i=0;i<players.length;i++){
    for (let j=i+1;j<players.length;j++){
      const a=players[i], b=players[j];
      const dx=b.x-a.x, dy=b.y-a.y;
      const dist = Math.hypot(dx,dy) || 1;
      const min = a.radius + b.radius - 2;
      if (dist<min){
        const nx=dx/dist, ny=dy/dist;
        const push = (min - dist)*0.5;
        a.x -= nx*push; a.y -= ny*push;
        b.x += nx*push; b.y += ny*push;
      }
    }
  }

  // 볼 이동
  if (!ball.owner){
    ball.x += ball.vx*dt;
    ball.y += ball.vy*dt;
    // 마찰(직선 유지, 커브 방지용 각감쇠 0)
    ball.vx *= 0.985; ball.vy *= 0.985;

    // 벽 반사(아웃은 별개로 처리하므로 경계 내부만)
    if (ball.x<0 || ball.x>field.worldW || ball.y<0 || ball.y>field.worldH){
      // 바깥은 checkOuts에서 처리
    }
  } else {
    // 소유자 드리블 — 발 앞에 부착
    const o = ball.owner;
    const lead = 18;
    const dirx = norm(o.vx), diry = norm(o.vy);
    ball.x = o.x + dirx*lead;
    ball.y = o.y + diry*lead;
    ball.vx = o.vx; ball.vy = o.vy;
  }

  // 볼-선수 상호작용 (인터셉트/태클)
  const now = performance.now();
  let nearest=null, best=1e9;
  players.forEach(p=>{
    const dx = ball.x - p.x, dy = ball.y - p.y;
    const d = Math.hypot(dx,dy);
    if (d < best){ best=d; nearest=p; }
    if (d < p.radius + ball.r + 2){
      // 소유 판정: 아군끼리 뺏지 않음
      if (ball.noInterceptionUntil && now < ball.noInterceptionUntil){
        if (p.team !== ball.throwTeam) return;
      }
      if (p.noTackleTeammate && ball.lastTouch && ball.lastTouch.team===p.team) return;
      // GK 금지: 골문 밖에서만 막으려는 문제 → GK는 박스 안 우선, 밖이면 감점
      if (p.role==='GK'){
        const box = field.gkBox[p.team==='home' ? 'left':'right'];
        if (!rectContains(box, p.x, p.y)) {
          // 박스 밖이면 50% 확률로 미스(막지 못함) → 자연스러움
          if (Math.random()<0.5) return;
        }
      }
      ball.owner = p;
      ball.lastTouch = p;
    }
  });

  // 쓰로인 처리
  if (ball.isThrowIn){
    ball.throwTimer += dt;
    if (ball.throwTimer>0.15 && !ball.owner){
      // 같은 팀 최가까운 선수에게 바로 전달
      const team = ball.throwTeam;
      const cand = players.filter(p=>p.team===team)
                          .sort((a,b)=>dist2(a,ball)-dist2(b,ball))[0];
      if (cand){
        ball.owner = cand; ball.lastTouch=cand;
        ball.isThrowIn=false;
        ball.noInterceptionUntil = now + 400; // 살짝 더 보호
      }
    }
  }
}

function drawPlayer(ctx, cam, p, debug=false){
  const sx = p.x - cam.x, sy = p.y - cam.y;
  // 본체
  ctx.save();
  ctx.translate(sx, sy);
  ctx.beginPath();
  ctx.arc(0,0, p.radius, 0, Math.PI*2);
  ctx.fillStyle = p.team==='home' ? '#1f7ae0' : '#d93b3b';
  ctx.fill();
  // 테두리/선택
  ctx.lineWidth = p.selected ? 5 : 2;
  ctx.strokeStyle = p.selected ? '#fcd34d' : '#111827';
  ctx.stroke();

  // 아바타
  const avSize = 22;
  const tmp = getTmpCanvas(avSize*2, avSize*2);
  const tctx = tmp.getContext('2d');
  drawAvatarOn(tctx, p.avatarType, avSize, avSize, avSize-4, true);
  ctx.drawImage(tmp, -avSize, -avSize-28);

  // 포지션 라벨
  ctx.font = '12px ui-sans-serif,system-ui,Segoe UI,Roboto';
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle='#000a'; ctx.lineWidth=3;
  ctx.strokeText(p.role, 0, p.radius+6);
  ctx.fillText(p.role, 0, p.radius+6);

  if (debug){
    ctx.fillStyle='#fff';
    ctx.fillText(`${Math.round(p.x)},${Math.round(p.y)}`, 0, -p.radius-46);
  }
  ctx.restore();
}

function drawBall(ctx, cam, b){
  const sx = b.x - cam.x, sy = b.y - cam.y;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.beginPath();
  ctx.arc(0,0, b.r, 0, Math.PI*2);
  ctx.fillStyle = '#fde68a';
  ctx.fill();
  ctx.strokeStyle = '#111827';
  ctx.stroke();
  ctx.restore();
}

function rectContains(r,x,y){ return x>=r.x && y>=r.y && x<=r.x+r.w && y<=r.y+r.h; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function norm(v){ const a=Math.abs(v); return a<1? 0 : (v/a); }
function dist2(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return dx*dx+dy*dy; }

// ===== 외부에서 쓸 수 있는 보조 =====
export function getTmpCanvas(w,h){
  if (!getTmpCanvas.c) getTmpCanvas.c = document.createElement('canvas');
  const c = getTmpCanvas.c; c.width=w; c.height=h; return c;
}
