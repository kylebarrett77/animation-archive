import { readFileSync } from 'fs';
const { tmdbFindImdb } = await import('/Users/kyle/Code/animation-archive-site/scripts/lib/tmdb.js');
const { titleSimilarity } = await import('/Users/kyle/Code/animation-archive-site/scripts/lib/title-match.js');
const file=process.argv[2]; const b=JSON.parse(readFileSync(file,'utf8'));
const UA='GlobalAnimationArchive/1.0 (https://animationarchive.netlify.app)';
for(const f of b.films){
  const p=f.properties; const id=(p.IMDB.match(/tt\d+/)||[])[0];
  const t=id?await tmdbFindImdb(id):null;
  let wiki='—';
  if(p.Wikipedia&&p.Wikipedia!=='N/A'){const title=decodeURIComponent(p.Wikipedia.split('/wiki/')[1]);const r=await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(title),{headers:{'User-Agent':UA}});const j=r.ok?await r.json():null;wiki=j?`${j.type} "${j.title}" — ${(j.description||'').slice(0,60)}`:`HTTP ${r.status}`;}
  const missing=['Title (English)','Year','Country','Director','Studio','Format','Runtime','Synopsis','Confidence','Research Sources','IMDB'].filter(k=>!p[k]&&p[k]!==0);
  console.log(`${p['Title (English)']} (${p.Year}, ${p.Format}) | IMDb ${id} → TMDB: ${t?`${t.title} (${t.year}) sim=${titleSimilarity(p['Title (English)'],t.title).toFixed(2)}`:'NOT FOUND'} | Wiki: ${wiki} | sources ${f.sources.length} | content ${f.content.length} chars | missing: ${missing.join(',')||'none'} | dirs ${JSON.stringify(f.directors)} studios ${JSON.stringify(f.studios)}`);
}
if(b.series)console.log('SERIES',JSON.stringify(b.series).slice(0,300));
if(b.entities)console.log('ENTITIES',JSON.stringify(b.entities).slice(0,600));
