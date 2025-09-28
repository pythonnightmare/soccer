export class Field {
  constructor(cfg){
    // 기본 뷰포트 1280x720 기준, 월드 스케일은 가변
    const baseW = 1800, baseH = 900; // 기존 크기라 가정
    this.worldW = Math.round(baseW * (cfg.fieldWidthScale ?? 1));
    this.worldH = baseH;

    // 라인/골대/골키퍼 박스
    this.outline = { x:0, y:0, w:this.worldW, h:this.worldH };
    const goalDepth = 80; // 골대 안쪽 깊이
    const goalWidth = 220; // 골대 폭
    this.goals = {
      left:  { x:-goalDepth, y:this.worldH/2 - goalWidth/2, w:goalDepth, h:goalWidth, side:'home' },
      right: { x:this.worldW, y:this.worldH/2 - goalWidth/2, w:goalDepth, h:goalWidth, side:'away' }
    };

    // 골키퍼 라인(금지/제한 영역) — 길이 -30%, 폭 +20%
    const gkBoxLenBase = 300, gkBoxWideBase = 360;
    const len  = Math.round(gkBoxLenBase * 0.7);
    const wide = Math.round(gkBoxWideBase * 1.2);
    this.gkBox = {
      left:  { x:0, y:this.worldH/2 - wide/2, w:len, h:wide },
      right: { x:this.worldW - len, y:this.worldH/2 - wide/2, w:len, h:wide }
    };

    // 골문 침범 금지존(모두 금지, GK 제외)
    this.goalForbidden = {
      left:  { x:-goalDepth, y:this.worldH/2 - goalWidth/2, w:goalDepth+4, h:goalWidth },
      right: { x:this.worldW-4, y:this.worldH/2 - goalWidth/2, w:goalDepth+4, h:goalWidth }
    };
  }

  draw(ctx, cam) {
    const { x, y, w, h } = this.outline;
    ctx.save();
    ctx.translate(-cam.x, -cam.y);

    // 잔디
    ctx.fillStyle = '#0b5a3e';
    ctx.fillRect(x, y, w, h);

    // 라인
    ctx.strokeStyle = '#e5f4ee';
    ctx.lineWidth = 4;
    ctx.strokeRect(x+10, y+10, w-20, h-20);

    // 센터라인/서클
    ctx.beginPath();
    ctx.moveTo(w/2, y+10);
    ctx.lineTo(w/2, y+h-10);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w/2, h/2, 90, 0, Math.PI*2);
    ctx.stroke();

    // 페널티/골키퍼 박스(여기선 GK 박스만 시각화)
    ctx.setLineDash([10,8]);
    ['left','right'].forEach(side => {
      const b = this.gkBox[side];
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    });
    ctx.setLineDash([]);

    // 골대
    Object.values(this.goals).forEach(g=>{
      ctx.fillStyle = '#d8e6ff';
      ctx.fillRect(g.x, g.y, g.w, g.h);
      ctx.strokeStyle='#6b7280';
      ctx.strokeRect(g.x, g.y, g.w, g.h);
    });

    ctx.restore();
  }

  drawMinimap(ctx, players, ball){
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#0a2c22';
    ctx.fillRect(0,0,W,H);

    const scaleX = W / this.worldW;
    const scaleY = H / this.worldH;

    // 아웃라인
    ctx.strokeStyle = '#88f0cc';
    ctx.lineWidth = 2;
    ctx.strokeRect(4,4, W-8, H-8);

    // 골대
    Object.values(this.goals).forEach(g=>{
      ctx.fillStyle = '#b3d4ff';
      ctx.fillRect((g.x)*scaleX, (g.y)*scaleY, g.w*scaleX, g.h*scaleY);
    });

    // 선수
    players.forEach(p=>{
      ctx.fillStyle = p.team === 'home' ? '#60a5fa' : '#f87171';
      ctx.beginPath();
      ctx.arc(p.x*scaleX, p.y*scaleY, 4, 0, Math.PI*2);
      ctx.fill();
    });

    // 볼
    ctx.fillStyle='#fde68a';
    ctx.beginPath();
    ctx.arc(ball.x*scaleX, ball.y*scaleY, 3, 0, Math.PI*2);
    ctx.fill();
  }

  // 유틸
  contains(x,y){
    return x>=0 && y>=0 && x<=this.worldW && y<=this.worldH;
  }
}
