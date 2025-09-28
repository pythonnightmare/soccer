// 간단/가벼운 미페: 이모지 기반 8종 + 링/배경 스타일
// type: 'poodle' | 'cat' | 'alien' | 'robot' | 'fox' | 'bear' | 'ghost' | 'dragon'
export function buildAllAvatarOptions(){
  return [
    { type:'poodle', label:'토이푸들 🐩' },
    { type:'cat',    label:'고양이 🐱' },
    { type:'alien',  label:'외계인 👽' },
    { type:'robot',  label:'로봇 🤖' },
    { type:'fox',    label:'여우 🦊' },
    { type:'bear',   label:'곰 🐻' },
    { type:'ghost',  label:'유령 👻' },
    { type:'dragon', label:'용 🐲' },
  ];
}

const EMOJIS = {
  poodle:'🐩', cat:'🐱', alien:'👽', robot:'🤖',
  fox:'🦊', bear:'🐻', ghost:'👻', dragon:'🐲'
};

export function drawAvatarOn(ctx, type='poodle', cx=32, cy=32, r=28, clear=false){
  if(clear){ ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height); }
  // 링 배경
  const ring = {
    poodle:'#f9a8d4', cat:'#facc15', alien:'#34d399', robot:'#60a5fa',
    fox:'#fb923c', bear:'#a78bfa', ghost:'#cbd5e1', dragon:'#22d3ee'
  }[type] || '#60a5fa';

  ctx.save();
  ctx.shadowColor = '#0008';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI*2);
  ctx.fillStyle = '#0b1220';
  ctx.fill(); 
  ctx.lineWidth = 6;
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.restore();

  ctx.font = `${Math.floor(r*1.3)}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(EMOJIS[type] || '⭐', cx, cy+2);
}
