// Loaded only into the Circle subprocess. Observe real paid HTTP bytes without logging credentials.
import { writeFile } from 'node:fs/promises';
import { lookup } from 'node:dns';
import { Agent } from 'undici';
import ipaddr from 'ipaddr.js';
import { keccak256 } from 'viem';

const publicAddress = (value) => {
  const parsed = ipaddr.process(value);
  return parsed.range() === 'unicast';
};
const dispatcher = new Agent({connect:{lookup(hostname, options, callback) {
  lookup(hostname,{all:true,verbatim:true},(error,addresses)=>{
    if(error) return callback(error);
    if(!addresses.length || addresses.some(a=>!publicAddress(a.address))) return callback(new Error('SSRF_BLOCKED'));
    if(options.all) callback(null,addresses);
    else callback(null,addresses[0].address,addresses[0].family);
  });
}}});
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if(url.protocol !== 'https:' || url.username || url.password) throw new Error('SSRF_BLOCKED');
  if(ipaddr.isValid(url.hostname.replace(/^\[|\]$/g,'')) && !publicAddress(url.hostname.replace(/^\[|\]$/g,''))) throw new Error('SSRF_BLOCKED');
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
  const paid = url.href === process.env.XYX_OBSERVE_URL && (headers.has('payment-signature') || headers.has('x-payment'));
  const start = performance.now();
  const response = await originalFetch(input,{...init,dispatcher,redirect:'error'});
  if((paid || (process.env.XYX_OBSERVE_MODE==='inspect' && url.href === process.env.XYX_OBSERVE_URL)) && process.env.XYX_OBSERVE_FILE) {
    const reader=response.body?.getReader(); const chunks=[];let size=0;
    if(reader) {
      for(;;) {
        const {done,value}=await reader.read();if(done)break;
        size+=value.length;
        if(size>2*1024*1024){await reader.cancel();throw new Error('RESPONSE_TOO_LARGE');}
        chunks.push(value);
      }
    }
    const bytes=Buffer.concat(chunks);
    const record={httpStatus:response.status,contentType:response.headers.get('content-type'),
      responseHash:keccak256(bytes),body:bytes.toString('base64'),
      requestHash:keccak256(Buffer.from(typeof init.body==='string'?init.body:'')),
      settlement:response.headers.get('payment-response')??response.headers.get('x-payment-response'),
      paymentRequired:response.headers.get('payment-required'),
      latencyMs:Math.ceil(performance.now()-start),observedAt:Math.floor(Date.now()/1000)};
    await writeFile(process.env.XYX_OBSERVE_FILE,JSON.stringify(record),{mode:0o600,flag:'wx'});
    return new Response(bytes,{status:response.status,statusText:response.statusText,headers:response.headers});
  }
  return response;
};
