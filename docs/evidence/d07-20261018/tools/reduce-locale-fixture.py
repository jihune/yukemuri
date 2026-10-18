import re,sys
src,out,n=sys.argv[1],sys.argv[2],int(sys.argv[3])
t=open(src,encoding='utf-8',errors='replace').read()
head=re.search(r'<title>[^<]*</title>',t)[0]
count=re.search(r'<div class="list-contents-right">.{0,200}?</div>|[^<>]{0,40}검색된 호텔 [\d,]+개[^<>]{0,40}|[^<>]{0,10}[\d,]+ Hotels[^<>]{0,40}',t,re.S)
parts=t.split('jsc-cassette-container')
blocks=['jsc-cassette-container'+b for b in parts[1:n+1]]
# cut the trailing part of the last block at its closing list item
blocks[-1]=blocks[-1][:blocks[-1].find('</ul> </div> </li>')+len('</ul> </div> </li>')] if '</ul> </div> </li>' in blocks[-1] else blocks[-1][:6000]
start=t.find('<!-- ページング -->');last=t.rfind('selectNextPage(');pager=[t[start:t.find('</a>',last)+4]+'</div>'] if start>=0 and last>start else None
js=re.search(r'function selectNextPage.*?submitForm\.submit\(\);\s*}',t,re.S)
doc='<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">'+head+'</head><body>\n<!-- Reduced from a page retrieved 2026-10-18 for D07: count, '+str(n)+' stay blocks, pager. -->\n'+(count[0] if count else '')+'\n<ul><li class="cf '+'\n<li class="cf '.join(b for b in blocks)+'</ul>\n'+(pager[0] if pager else '')+'\n<script>'+(js[0] if js else '')+'</script></body></html>\n'
open(out,'w',encoding='utf-8').write(doc)
print(out,len(doc))
