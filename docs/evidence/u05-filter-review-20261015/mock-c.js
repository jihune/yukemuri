const p=document.querySelector('.desktop-filters .filter-content');
const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:4px 0 14px';
const chips=[['내 기준 9.0+',true,'#f3d77a','#4a3b06'],['천연온천',false],['노천탕',true],['전세탕',false],['객실탕',false],['카케나가시',false],['니고리유',false]];
chips.forEach(([t,on,bg,fg],i)=>{const b=document.createElement('span');b.textContent=(on?'✓ ':'')+t;b.style.cssText=`display:flex;align-items:center;min-height:40px;padding:0 10px;border-radius:6px;font-size:14px;font-weight:600;border:1px solid ${on?(bg||'#0a6670'):'#d9e0e1'};background:${on?(bg||'#0a6670'):'#fff'};color:${on?(fg||'#fff'):'#14272b'};${i===0?'grid-column:1/-1;':''}`;grid.appendChild(b)});
const title=p.querySelector('.filter-title');title.after(grid);
const groups=[...p.querySelectorAll('.filter-group h3')];const names={'온천수와 사용 방식':'온천수 세부','공용·전세 목욕 시설':'공용·전세탕 세부','객실 목욕 시설':'객실탕 세부'};groups.forEach(h=>{if(names[h.textContent])h.textContent=names[h.textContent]});
