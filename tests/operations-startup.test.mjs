import test from 'node:test';import assert from 'node:assert/strict';import{spawnSync}from'node:child_process';

test('رفض startup للنواة المطلوبة بإعداد ناقص بدل health أخضر يخفي التعطيل',()=>{
 const result=spawnSync(process.execPath,['server/index.mjs'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,APP_ENV:'staging',LEAD_SINK:'disabled',OPS_ENABLED:'true'},encoding:'utf8',timeout:3000});
 assert.equal(result.status,1);assert.match(result.stderr,/operations_configuration_rejected/);assert.match(result.stderr,/deployment rejected/);assert.equal(result.stdout.includes('Server listening'),false);
});
