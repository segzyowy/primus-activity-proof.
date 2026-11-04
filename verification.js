export const TEMPLATE = 'ad7d29c8-d820-495a-8bf1-02b8f236a1ae';
export const SOURCE = 'https://www.binance.com/bapi/accounts/v1/private/vip/vip-portal/vip-fee/vip-programs-and-fees';
export const CONDITIONS = [[{field:'spotVolume30d',op:'>',value:'100'}]];
export const stringify = x => JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
const parse = x => typeof x==='string'?JSON.parse(x):x;
export function classifyError(e) {
 const message = typeof e==='string'?e:(e?.message||e?.msg||'Unknown SDK error');
 const code=String(e?.code??e?.errorCode??e?.data?.code??'');
 const unmet=code==='00104'||code==='104'||/(^|\D)00104(\D|$)/.test(message)||/verification requirements not met/i.test(message);
 if(unmet)return {kind:'requirement-not-met',code:code||'00104',title:'Trading-volume requirement not met',detail:'Primus reported that the requested condition was not satisfied: 30-day Binance spot trading volume must be strictly greater than 100. This is not your wallet balance. No successful attestation is confirmed by this error; it is not a verified negative proof.'};
 if(code==='4001'||code==='00004')return {kind:'cancelled',code,title:'Request cancelled',detail:'You cancelled a wallet or attestation request. If a task was already submitted, cancelling a later step does not undo it.'};
 return {kind:'technical-error',code:code||'not supplied',title:'Verification could not complete',detail:message};
}
export function inspect(rows,context,now=Date.now()) {
 if(!Array.isArray(rows)||!rows.length)throw new Error('No contract task results returned.');
 for(const row of rows){
  if(String(row.taskId)!==String(context.submitted.taskId))throw new Error('Task ID mismatch.');
  const a=row.attestation;
  if(!a||String(a.recipient).toLowerCase()!==context.address.toLowerCase())throw new Error('Recipient mismatch.');
  const requests=Array.isArray(a.request)?a.request:[a.request];
  if(requests.length!==1||requests[0]?.url!==SOURCE)throw new Error('Unexpected data source.');
  const c=parse(a.attConditions);
  if(!Array.isArray(c)||c.length!==1||!Array.isArray(c[0])||c[0].length!==1)throw new Error('Unrecognized condition encoding.');
  const condition=c[0][0];
  if(condition.field!=='spotVolume30d'||condition.op!=='>'||String(condition.value)!=='100')throw new Error('Condition mismatch.');
  const extra=parse(a.additionParams);
  if(extra?.nonce!==context.nonce||extra?.purpose!=='activity-proof-demo')throw new Error('Session binding mismatch.');
  const t=Number(a.timestamp),ms=t<1e12?t*1000:t;
  if(!Number.isFinite(ms)||Math.abs(now-ms)>15*60*1000)throw new Error('Attestation outside the 15-minute review window.');
 }
 return 'Contract results retrieved through the Primus SDK. Local task, recipient, source, condition, session and freshness checks passed. Eligibility remains undecided until the actual condition-result schema has been validated. This page is not an independent proof verifier.';
}
