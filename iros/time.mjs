export const ZONE='America/New_York';
export const DATES=['2026-09-28','2026-09-29','2026-09-30','2026-10-01'];
export function dateKey(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function stamp(date,time){return new Date(`${date}T${time}:00-04:00`).getTime();}
export function state(item,now=new Date()){const n=+now;return n<stamp(item.date,item.start)?'upcoming':n>=stamp(item.date,item.end)?'past':'live';}
export function initialDay(now=new Date()){const key=dateKey(now);return DATES.includes(key)?key:key<DATES[0]?DATES[0]:DATES.at(-1);}
export function nextItem(items,now=new Date()){return items.filter(x=>stamp(x.date,x.start)>+now).sort((a,b)=>stamp(a.date,a.start)-stamp(b.date,b.start))[0]||null;}
export function minutesUntil(date,time,now=new Date()){return Math.max(0,Math.ceil((stamp(date,time)-+now)/60000));}
export function relativeStart(item,now=new Date()){const m=minutesUntil(item.date,item.start,now);return m<60?`In ${m} min`:m<1440?`In ${Math.floor(m/60)}h ${m%60}m`:new Intl.DateTimeFormat('en-US',{timeZone:ZONE,weekday:'short',month:'short',day:'numeric'}).format(new Date(stamp(item.date,item.start)));}
