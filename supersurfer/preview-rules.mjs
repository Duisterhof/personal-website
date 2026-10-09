// Local demonstration only. This never authorizes or submits an actual job.
export function checkLaunch(rules, request) {
 const missing=[];
 if(rules.authorization&&!request.authorized)missing.push('Record user authorization.');
 if(rules.commit&&!/^[a-f0-9]{40}$/i.test(request.commit.trim()))missing.push('Specify the exact 40-character source commit.');
 if(rules.pr&&!request.verifiedPR)missing.push('Record PR verification.');
 // Decimal syntax excludes blank, hexadecimal, Infinity, and deferred estimates.
 const numeric=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(request.mfu.trim());
 if(rules.mfu&&(!numeric||!Number.isFinite(Number(request.mfu))||!['percent','fraction'].includes(request.units)))missing.push('Supply a finite numeric MFU estimate, with percent or fraction units.');
 return missing;
}
export function validateRange(start,end,max) {
 return Number.isFinite(start)&&Number.isFinite(end)&&start>=0&&end>start&&end<=max;
}
