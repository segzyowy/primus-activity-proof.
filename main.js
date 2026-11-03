import { PrimusNetwork } from '@primuslabs/network-js-sdk';
const $ = id => document.getElementById(id);
const TEMPLATE = 'ad7d29c8-d820-495a-8bf1-02b8f236a1ae';
const SOURCE = 'https://www.binance.com/bapi/accounts/v1/private/vip/vip-portal/vip-fee/vip-programs-and-fees';
const CONDITIONS = [[{field:'spotVolume30d',op:'>',value:'100'}]];
let sdk, context, bundle, busy=false;
const stringify = x => JSON.stringify(x, (_,v)=>typeof v==='bigint'?v.toString():v, 2);
function status(s){$('status').textContent=s;}
function lock(b){busy=b;$('start').disabled=b;$('retry').disabled=b;}
function parse(x){return typeof x==='string'?JSON.parse(x):x;}
function inspect(rows){
 if(!Array.isArray(rows)||!rows.length) throw new Error('No contract task results returned. No eligibility decision made.');
 for(const row of rows){
  if(String(row.taskId)!==String(context.submitted.taskId)) throw new Error('Returned task ID differs from the submitted task.');
  const a=row.attestation;
  if(!a || String(a.recipient).toLowerCase()!==context.address.toLowerCase()) throw new Error('Recipient mismatch.');
  const requests=Array.isArray(a.request)?a.request:[a.request];
  if(!requests.some(r=>r?.url===SOURCE)) throw new Error('Unexpected data source in returned attestation.');
  const c=parse(a.attConditions);
  if(JSON.stringify(c)!==JSON.stringify(CONDITIONS)) throw new Error('Unexpected condition or unrecognized condition encoding. Manual review required.');
  const extra=parse(a.additionParams);
  if(extra?.nonce!==context.nonce) throw new Error('Session binding mismatch.');
  const t=Number(a.timestamp); const ms=t<1e12?t*1000:t;
  if(!Number.isFinite(ms)||Math.abs(Date.now()-ms)>15*60*1000) throw new Error('Attestation timestamp outside the 15-minute review window.');
 }
 return 'Contract task results received; source, recipient, task ID, condition, session binding, and timestamp checks passed. Eligibility remains undecided: the returned condition output must be reviewed against the real template response schema. A completed task does not by itself mean the threshold passed.';
}
async function verify(){
 status('Waiting for Primus contract task results…');
 const rows=await sdk.verifyAndPollTaskResult({taskId:context.submitted.taskId,reportTxHash:context.raw?.[0]?.reportTxHash,intervalMs:3000,timeoutMs:120000});
 bundle={format:'primus-activity-review-v1',chainId:84532,templateId:TEMPLATE,requestedConditions:CONDITIONS,task:context.submitted,rawAttestations:context.raw||[],contractTaskResults:rows,eligibility:'undecided'};
 let assessment;
 try{assessment=inspect(rows);bundle.bindingChecks='passed';}catch(e){assessment='NOT ACCEPTED: '+e.message;bundle.bindingChecks='failed';}
 bundle.assessment=assessment;
 $('assessment').textContent=assessment;$('output').textContent=stringify(bundle);$('result').hidden=false;
 status(bundle.bindingChecks==='passed'?'Attestation available for inspection. No automatic eligibility decision.':'Returned result needs investigation. Do not use it to grant access.');
 $('retry').hidden=true;
}
$('start').onclick=async()=>{
 if(busy)return;
 if(!$('consent').checked){status('Read and accept the testnet transaction and disclosure notice first.');return;}
 if(context?.submitted){status('A task was already submitted. Retry verification instead of creating another paid task. Reload only if you deliberately want a new task.');return;}
 lock(true);$('result').hidden=true;
 try{
  const provider=window.ethereum;
  if(!provider)throw new Error('No injected wallet found. Open in a desktop wallet-enabled browser.');
  const accounts=await provider.request({method:'eth_requestAccounts'});
  if(!accounts?.[0])throw new Error('No wallet account selected.');
  const chain=BigInt(await provider.request({method:'eth_chainId'}));
  if(chain!==84532n)throw new Error('Switch the wallet connected to this site to Base Sepolia (84532). No task submitted.');
  sdk=new PrimusNetwork(); status('Initializing Primus SDK. Allow the official Primus extension if prompted.');
  await sdk.init(provider,84532);
  context={address:accounts[0],nonce:crypto.randomUUID()};
  status('Review the task transaction in your wallet. Test ETH fees may apply.');
  const params={templateId:TEMPLATE,address:context.address};
  context.submitted=await sdk.submitTask(params);
  if(!context.submitted?.taskId)throw new Error('SDK returned no task ID. Check your wallet transaction before trying again.');
  $('retry').hidden=false;
  status('Task submitted: '+context.submitted.taskId+'. Complete the official Primus/Binance flow. Do not share credentials here.');
  context.raw=await sdk.attest({...params,...context.submitted,attConditions:CONDITIONS,additionParams:JSON.stringify({nonce:context.nonce,purpose:'activity-proof-demo'}),allJsonResponseFlag:'false'});
  await verify();
 }catch(e){status((e?.message||String(e))+(context?.submitted?' A task may already have consumed fees. Do not blindly resubmit.':' No verified attestation available.'));}
 finally{lock(false);}
};
$('retry').onclick=async()=>{if(busy||!context?.submitted)return;lock(true);try{await verify();}catch(e){status(e.message||String(e));}finally{lock(false);}};
$('download').onclick=()=>{if(!bundle)return;const u=URL.createObjectURL(new Blob([stringify(bundle)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='primus-attestation-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
