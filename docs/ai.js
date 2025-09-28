// 간단한 상태기반 AI: 라인 유지 + 침투 + 압박
export function updateAI(dt, world){
  const { players, ball, field } = world;

  const homeHasBall = ball.owner?.team === 'home';
  const awayHasBall = ball.owner?.team === 'away';

  players.forEach(p=>{
    if (p.isUser) return; // 사용자 조종자 제외
    p.intent.ax = p.intent.ay = 0;

    // GK는 골키퍼 박스 내에서만 이동 + 골문 중심 라인 앵커링
    if (p.role === 'GK') {
      const box = field.gkBox[p.team === 'home' ? 'left':'right'];
      const goalY = field.worldH/2;
      // 수비: 공과 수직 정렬, 박스 내부 제한
      const targetX = p.team === 'home' ? box.x + box.w*0.75 : box.x + box.w*0.25;
      const clampY = Math.max(box.y+20, Math.min(box.y+box.h-20, ball.y));
      steerTo(p, targetX, clampY, 0.9);
      clampInside(p, box);
      // GK의 패스: 절대 터치라인/골라인 밖으로 패스하지 않기
      p.aiPassTarget = safePassTarget(p, world);
      return;
    }

    // 같은 팀이 볼 소유 → 침투/폭넓게 벌려주기, 아군 공 탈취 금지
    if ((homeHasBall && p.team==='home') || (awayHasBall && p.team==='away')) {
      // 포지션 기준점 + 침투
      const base = p.homeSpot;
      // 공 소유자를 향해 '각도 유리한 측면'으로 곡선 러닝
      const owner = ball.owner;
      if (owner && owner !== p) {
        const ahead = owner.x + (owner.team==='home' ? 220 : -220); // 앞 공간
        const side  = (p.role==='LW'||p.role==='LB') ? -140 : (p.role==='RW'||p.role==='RB'? 140 : (p.idx%2? 120:-120));
        steerTo(p, clampX(world, ahead), clampY(world, owner.y + side), 0.7);
      } else {
        steerTo(p, base.x, base.y, 0.6);
      }
      p.noTackleTeammate = true;
      return;
    }

    // 상대가 볼 소유 → 압박/커버
    const o = ball.owner;
    if (o && o.team !== p.team) {
      const markDist = p.role==='CB'||p.role==='LB'||p.role==='RB' ? 110 : 160;
      // 직접 압박 or 패스코스 차단
      const tx = o.x + (o.team==='home' ? 50 : -50);
      const ty = o.y + (p.role==='CB'? 0 : (p.idx%2? 70:-70));
      steerTo(p, tx, ty, 0.85);
      // 금지존/골문 침범 금지
      keepOutGoalForbidden(p, world);
      return;
    }

    // 볼이 무주공 → 최근접 선수 달리기
    const dx = ball.x - p.x, dy = ball.y - p.y;
    const d2 = dx*dx + dy*dy;
    if (d2 < 300*300) {
      steerTo(p, ball.x, ball.y, 0.9);
    } else {
      // 기본 포지션 복귀
      steerTo(p, p.homeSpot.x, p.homeSpot.y, 0.6);
    }
    keepOutGoalForbidden(p, world);
  });
}

function steerTo(p, tx, ty, gain=1){
  const vx = (tx - p.x), vy = (ty - p.y);
  const len = Math.hypot(vx, vy) || 1;
  p.intent.ax += (vx/len) * gain;
  p.intent.ay += (vy/len) * gain;
}

// GK/선수 골문 금지존 회피
function keepOutGoalForbidden(p, world){
  const zones = world.field.goalForbidden;
  const z = p.team==='home' ? zones.right : zones.left; // 공격 시 상대 골문
  if (rectContains(z, p.x, p.y)){
    // 밀어내기
    if (p.team==='home') p.intent.ax -= 1.2; else p.intent.ax += 1.2;
  }
}

function clampInside(p, rect){
  p.x = Math.max(rect.x+12, Math.min(rect.x+rect.w-12, p.x));
  p.y = Math.max(rect.y+12, Math.min(rect.y+rect.h-12, p.y));
}

function rectContains(r, x, y){ return x>=r.x && y>=r.y && x<=r.x+r.w && y<=r.y+r.h; }

// GK 안전 패스 목표 (필드 내로만)
function safePassTarget(p, world){
  const { field } = world;
  const tx = p.team==='home' ? p.x + 260 : p.x - 260;
  const ty = Math.max(40, Math.min(field.worldH-40, p.y + (p.idx%2? 90:-90)));
  return { x: Math.max(40, Math.min(field.worldW-40, tx)), y: ty };
}

// 필드 경계 유틸
function clampX(world, v){ return Math.max(40, Math.min(world.field.worldW-40, v)); }
function clampY(world, v){ return Math.max(40, Math.min(world.field.worldH-40, v)); }
