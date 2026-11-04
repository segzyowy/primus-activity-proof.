import { PrimusNetwork } from '@primuslabs/network-js-sdk';
import { TEMPLATE, CONDITIONS, stringify, classifyError, inspect } from './verification.js';
const $=id=>document.getElementById(id);
const KEY='activity-proof-pending-v2';
let provider, sdk, address, context, bundle, busy=false, storageOK=true;
try{context=JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{storageOK=false;}
function save(){try{const metadata=context?{...context}:null;if(metadata)delete metadata.raw;sessionStorage.setItem(KEY,stringify(metadata));}catch{storageOK=false;}}
function status(title,detail='',kind='info'){$('status-title').textContent=title;$('status-detail').textContent=detail;$('status').dataset.kind=kind;}
function render(){
 $('connect').disabled=busy;$('start').disabled=busy||!address||!!context?.attempted||!storageOK;
 $('retry').disabled=busy||!context?.submitted?.taskId;
 $('retry').hidden=!context?.submitted?.taskId;
 $('reset').disabled=busy;$('reset').hidden=!context?.attempted;
 $('wallet').textContent=address?address.slice(0,6)+'…'+address.slice(-4)+' · Base Sepolia':'Not connected';
 $('task').textContent=context?.submitted?.taskId?String(context.submitted.taskId):context?.attempted?'Submission attempted — check your wallet before retrying.':'None';
 const hash=context?.submitted?.taskTxHash;
 $('tx').hidden=!(typeof hash==='string'&&/^0x[0-9a-f]{64}$/i.test(hash));
 if(!$('tx').hidden)$('tx').href='https://sepolia.basescan.org/tx/'+hash;
}
async function guard(){
 const chain=BigInt(await provider.request({method:'eth_chainId'}));
 const accounts=await provider.request({method:'eth_accounts'});
 if(chain!==84532n)throw new Error('Switch this site’s wallet to Base Sepolia (84532).');
 if(!accounts?.[0]||accounts[0].toLowerCase()!==address?.toLowerCase())throw new Error('Wallet changed. Reconnect before continuing.');
 if(context?.submitted&&address.toLowerCase()!==context.address.toLowerCase())throw new Error('Reconnect the wallet that submitted this task.');
}
function report(e){
 const failure=classifyError(e);
 status(failure.title,failure.detail+(context?.attempted?' A submission was attempted. Check its transaction before creating another task; fees may have been used.':' No task was submitted.'),failure.kind);
 $('diagnostics').textContent=stringify({appVersion:'0.2.0',chainId:84532,templateId:TEMPLATE,condition:CONDITIONS,stage:context?.stage||'connection',errorCode:failure.code,subcode:String(e?.subcode??e?.subCode??''),outcome:failure.kind});
 $('support').hidden=false;
 if(context){context.lastOutcome=failure.kind;save();}
}
async function execute(fn){if(busy)return;busy=true;render();try{await fn();}catch(e){report(e);}finally{busy=false;render();}}
$('connect').onclick=()=>execute(async()=>{
 provider=window.ethereum;
 if(!provider)throw new Error('No browser wallet detected. Use a desktop wallet-enabled browser.');
 const accounts=await provider.request({method:'eth_requestAccounts'});
 if(!accounts?.[0])throw new Error('No account selected.');
 if(BigInt(await provider.request({method:'eth_chainId'}))!==84532n){
  try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x14a34'}]});}
  catch(e){if(Number(e.code)!==4902)throw e;
   await provider.request({method:'wallet_addEthereumChain',params:[{chainId:'0x14a34',chainName:'Base Sepolia',nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:['https://sepolia.base.org'],blockExplorerUrls:['https://sepolia.basescan.org']}]});
   await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x14a34'}]});
  }
 }
 address=accounts[0];await guard();
 status('Wallet connected','No task submitted by connecting. Review the condition and notice before starting.');
});
async function init(){await guard();sdk=new PrimusNetwork();await sdk.init(provider,84532);}
async function verify(){
 status('Checking existing task','Retrieving contract results. This action does not create a new task or rerun Binance attestation.');
 const rows=await sdk.verifyAndPollTaskResult({taskId:context.submitted.taskId,reportTxHash:context.raw?.[0]?.reportTxHash,intervalMs:3000,timeoutMs:120000});
 bundle={format:'primus-activity-review-v2',chainId:84532,templateId:TEMPLATE,requestedConditions:CONDITIONS,task:context.submitted,rawAttestations:context.raw||[],contractTaskResults:rows,eligibility:'undecided'};
 try{bundle.assessment=inspect(rows,context);bundle.bindingChecks='passed';}
 catch(e){bundle.assessment='NOT ACCEPTED: '+e.message;bundle.bindingChecks='failed';}
 $('assessment').textContent=bundle.assessment;$('output').textContent=stringify(bundle);$('result').hidden=false;
 status(bundle.bindingChecks==='passed'?'Attestation received for review':'Attestation checks did not pass',bundle.assessment,bundle.bindingChecks==='passed'?'review':'technical-error');
 context.stage='review';save();
}
$('start').onclick=()=>execute(async()=>{
 if(context?.attempted)throw new Error('A previous submission attempt is recorded. Do not blindly resubmit.');
 if(!storageOK)throw new Error('Session storage is unavailable. Enable it so task progress can be recorded before submission.');
 if(!$('consent').checked)throw new Error('Accept the testnet fee and disclosure notice before submitting.');
 await init();
 context={address,nonce:crypto.randomUUID(),attempted:true,stage:'submitting'};save();
 if(!storageOK)throw new Error('Could not save task progress. No submission was made.');
 $('support').hidden=true;$('result').hidden=true;bundle=null;
 status('Review the task transaction','This is the paid testnet step. Reject the request if its network or transaction details are unexpected.');
 const params={templateId:TEMPLATE,address};
 context.submitted=await sdk.submitTask(params);save();
 if(context.submitted?.taskId==null)throw new Error('No task ID returned. Check your wallet transaction before retrying.');
 context.stage='attesting';save();render();
 status('Complete the Primus flow','Log in only on the genuine Binance website. Do not give credentials to this app.');
 context.raw=await sdk.attest({...params,...context.submitted,attConditions:CONDITIONS,additionParams:JSON.stringify({nonce:context.nonce,purpose:'activity-proof-demo'}),allJsonResponseFlag:'false'});
 // Do not persist the raw attestation: it can include sensitive metadata.
 context.stage='verifying';
 const raw=context.raw;delete context.raw;save();context.raw=raw;
 await verify();
});
$('retry').onclick=()=>execute(async()=>{if(!address)throw new Error('Connect the original wallet first.');await init();await verify();});
$('reset').onclick=()=>{
 if(busy||!confirm('This does not refund or cancel a task. Confirm you checked the prior transaction and understand a new task can consume fees. Clear the local record?'))return;
 context=null;bundle=null;try{sessionStorage.removeItem(KEY);}catch{}$('result').hidden=true;$('support').hidden=true;$('consent').checked=false;render();status('Local record cleared','No new task submitted. The requirement remains greater than 100.');
};
$('download').onclick=()=>{if(!bundle||!confirm('This bundle may contain your wallet address and other sensitive metadata. Download for private review, not public sharing?'))return;const u=URL.createObjectURL(new Blob([stringify(bundle)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='primus-attestation-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
render();
if(context?.attempted)status('Previous submission attempt restored','Connect the original wallet to check existing results. Reloading this tab does not submit another task.');
if(!storageOK)status('Session storage unavailable','Task submission is disabled to prevent accidental repeated submissions.');
