'use client';
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, MapPin, X } from 'lucide-react';
import { normalizeSearch } from '@/lib/hotel-names';
import type { HotelFilters } from '@/lib/hotel-types';
import type { HotelSuggestion } from '@/lib/hotel-suggestions';
import { localHotelSuggestions, type PreparedSearchIndex } from '@/lib/hotel-search-index';

export default function HotelAutocomplete({ value, onChange, onSelect, onClear, filters, savedOnly, favorites, searchIndex, indexReady, indexFailed, dismissKey }: {
  value: string; onChange: (value: string) => void; onSelect: (hotel: HotelSuggestion) => void; onClear: () => void;
  filters: HotelFilters; savedOnly: boolean; favorites: string[]; searchIndex:PreparedSearchIndex; indexReady:boolean; indexFailed:boolean; dismissKey: number;
}) {
  const id = useId(), root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false), [open, setOpen] = useState(false), [composing, setComposing] = useState(false);
  const [active, setActive] = useState(-1);
  const query=useDeferredValue(value);
  const items=useMemo(()=>localHotelSuggestions(searchIndex,query,filters,savedOnly?new Set(favorites):undefined),[searchIndex,query,filters,savedOnly,favorites]);
  const stale=query!==value;
  const visible = focused && open && !!normalizeSearch(value);
  useEffect(() => { setOpen(false); setActive(-1); }, [dismissKey]);
  useEffect(()=>setActive(-1),[query,filters,savedOnly,favorites]);
  useEffect(() => { if (active >= 0) document.getElementById(id + '-option-' + active)?.scrollIntoView({ block: 'nearest' }); }, [active, id]);
  function choose(hotel: HotelSuggestion) { setOpen(false); setActive(-1); onSelect(hotel); }
  return <div className="search-input hotel-autocomplete" ref={root} onBlur={e => {
    if (!root.current?.contains(e.relatedTarget as Node | null)) { setFocused(false); setOpen(false); setActive(-1); }
  }}>
    <Search size={19} />
    <input ref={input} role="combobox" aria-label="지역 또는 숙소 이름 검색" aria-autocomplete="list" aria-expanded={visible}
      aria-controls={id + '-list'} aria-activedescendant={visible && !stale && items[active] ? id + '-option-' + active : undefined}
      autoComplete="off" maxLength={200} placeholder="지역·숙소명 (한국어 / English / 日本語)" value={value}
      onFocus={() => { setFocused(true); setOpen(true); }}
      onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1); }}
      onCompositionStart={() => setComposing(true)} onCompositionEnd={() => { setComposing(false); setOpen(true); }}
      onKeyDown={e => {
        if (composing || e.nativeEvent.isComposing || e.keyCode === 229) { if (e.key === 'Enter') e.preventDefault(); return; }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); setOpen(true);
          if (!stale&&items.length) setActive(previous => e.key === 'ArrowDown' ? (previous + 1) % items.length : previous <= 0 ? items.length - 1 : previous - 1);
        } else if (e.key === 'Enter') {
          if (visible && !stale && items[active]) { e.preventDefault(); choose(items[active]); }
          else { setOpen(false); setActive(-1); }
        } else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setActive(-1); }
      }} />
    {value && <button type="button" aria-label="검색어 지우기" onClick={() => { onClear(); setOpen(false); input.current?.focus(); }}><X size={17} /></button>}
    {visible && <div className="autocomplete-dropdown">
      <div className="autocomplete-heading">예상 숙소 <span>이름·오타·다국어 표기 검색</span></div>
      <div role="listbox" id={id + '-list'} aria-label="예상 숙소" aria-busy={stale||!indexReady&&!indexFailed}>
        {!stale&&items.map((hotel, index) => <button type="button" role="option" tabIndex={-1} aria-selected={active === index}
          id={id + '-option-' + index} key={hotel.id} className={'hotel-suggestion' + (active === index ? ' suggestion-active' : '')}
          onPointerDown={e => e.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(hotel)}>
          <span className="suggestion-icon"><MapPin size={18} /></span>
          <span className="suggestion-copy"><b>{hotel.name}</b><small>{hotel.location}{hotel.matchedName !== hotel.name && <span> · {hotel.matchedName}</span>}</small></span>
          {hotel.similar && <span className="similar-name-tag">유사한 이름</span>}
        </button>)}
      </div>
      <div className="autocomplete-status" role="status" aria-live="polite">
        {stale ? '예상 숙소를 찾는 중…' : !indexReady ? indexFailed?'예상 숙소 정보를 표시하지 못했어요. Enter로 바로 검색할 수 있어요.':'예상 숙소 정보를 불러오는 중… Enter로 바로 검색할 수 있어요.' : (items.length ? '↑ ↓ 선택 · Enter 검색 · Esc 닫기' : '조건에 맞는 예상 숙소가 없어요. 검색어를 조금 바꿔 보세요.')}
      </div>
    </div>}
  </div>;
}
