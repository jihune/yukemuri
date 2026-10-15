const p=document.querySelector('.desktop-filters');
const short={'니고리유 · 탁한 온천':'니고리유','카케나가시 · 흘려보내는 온천':'카케나가시','전세탕 / 가족탕':'전세탕'};
p.querySelectorAll('.filter-toggle-label').forEach(l=>{const t=l.firstChild?.textContent?.trim();if(short[t])l.firstChild.textContent=short[t]});
const sub=['공용 대욕장 노천탕','전세·가족 노천탕','객실 실내 온천탕','객실 노천 온천탕'];
const rows=[...p.querySelectorAll('[role=switch]')].filter(t=>sub.includes(t.querySelector('.filter-toggle-label')?.firstChild?.textContent?.trim()));
rows.forEach(r=>r.style.display='none');
const last=rows.at(-1)?.parentElement;if(last){const m=document.createElement('div');m.textContent='▸ 세부 조건 4개 더 보기';m.style.cssText='color:#0a6670;font-size:14px;font-weight:650;padding:10px 0';last.appendChild(m)}
