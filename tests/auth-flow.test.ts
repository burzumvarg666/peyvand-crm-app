import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signupSchema,authRedirect} from '../lib/auth-flow';
import {readEmailCallback,cleanEmailCallbackUrl} from '../lib/email-callback';
import {authFailure} from '../lib/auth-errors';

test('signup validates name and repeat, normalizes email and rejects short passwords',()=>{
 const v={name:'کاربر نمونه',email:' TEST@Example.com ',password:'StrongPass12!',password_confirmation:'StrongPass12!'};
 assert.equal(signupSchema.parse(v).email,'test@example.com');
 for(const p of [{...v,password:'123'},{...v,password_confirmation:'different'},{...v,name:''},{...v,email:'not an email'}])assert.equal(signupSchema.safeParse(p).success,false);
});
test('callbacks handle verification, invitation, recovery and token-hash links',()=>{
 assert.deepEqual(readEmailCallback('#access_token=a&refresh_token=r&type=signup',''),{refreshToken:'r',type:'signup'});
 assert.deepEqual(readEmailCallback('#access_token=a&refresh_token=r&type=magiclink','?auth=invite'),{refreshToken:'r',type:'invite'});
 assert.deepEqual(readEmailCallback('#access_token=a&refresh_token=r&type=recovery',''),{refreshToken:'r',type:'recovery'});
 assert.deepEqual(readEmailCallback('','?token_hash=h&type=signup'),{tokenHash:'h',type:'signup'});
 assert.ok('error' in readEmailCallback('#error=access_denied&error_code=otp_expired','')!);
 assert.ok('error' in readEmailCallback('#access_token=a','')!);
 assert.equal(readEmailCallback('','?auth=signup&email=user@example.com'),null);
});
test('callback credentials are removed from the address before network operations',()=>{
 const clean=cleanEmailCallbackUrl('https://app.example/?token_hash=secret&type=recovery&error_description=secret&auth=recovery#refresh_token=secret');
 assert.equal(clean,'/?auth=recovery');assert.ok(!clean.includes('secret'));
});
test('redirect is server controlled, not taken from browser input',()=>{
 const before=process.env.APP_URL;try{delete process.env.APP_URL;assert.equal(new URL(authRedirect()).hostname,'burzumvarg666-farhad-telegram-bot.vercel.app');assert.equal(new URL(authRedirect('invite')).searchParams.get('auth'),'invite');process.env.APP_URL='https://app.example/other?injected=yes#hash';assert.equal(authRedirect('recovery'),'https://app.example/?auth=recovery');process.env.APP_URL='http://unsafe.example';assert.throws(()=>authRedirect());}finally{if(before===undefined)delete process.env.APP_URL;else process.env.APP_URL=before;}
});
test('expired or malformed tokens trigger refresh, mail restrictions are distinct',()=>{
 assert.equal(authFailure('bad_jwt',403).status,401);assert.equal(authFailure('refresh_token_already_used',400).status,401);
 assert.equal(authFailure('email_address_not_authorized',403).status,503);assert.equal(authFailure('over_email_send_rate_limit',429).status,429);
 assert.ok(!authFailure(undefined,500).message.includes('SMTP'));
});
