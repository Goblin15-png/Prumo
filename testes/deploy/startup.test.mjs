// Executa o script real com PHP/Apache fictícios: sem Laravel, banco ou serviços.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const script = fileURLToPath(new URL('../../backend/docker/migrate-and-start.sh',import.meta.url));
function run(failure = '') {
  const root = mkdtempSync(join(tmpdir(),'pruma-startup-'));
  try {
    const log = join(root,'calls');
    writeFileSync(join(root,'php'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$STARTUP_TEST_LOG"\ncase "$*" in *"$STARTUP_TEST_FAIL"*) [ -z "$STARTUP_TEST_FAIL" ] || exit 1;; esac\n', {mode:0o700});
    writeFileSync(join(root,'apache2-foreground'), '#!/bin/sh\nprintf "%s\\n" "apache" >> "$STARTUP_TEST_LOG"\n', {mode:0o700});
    const result = spawnSync('sh',[script],{env:{...process.env,PATH:root+':'+process.env.PATH,STARTUP_TEST_LOG:log,STARTUP_TEST_FAIL:failure},encoding:'utf8'});
    assert.equal(result.error,undefined);
    return {status:result.status,calls:readFileSync(log,'utf8').trim().split('\n')};
  } finally { rmSync(root,{recursive:true,force:true}); }
}
test('inicia Apache somente depois de configuração e migrações concluídas', () => {
  assert.deepEqual(run(),{status:0,calls:['artisan config:cache','artisan migrate --force','apache']});
});
test('falha de migração interrompe inicialização sem iniciar servidor', () => {
  assert.deepEqual(run('migrate'),{status:1,calls:['artisan config:cache','artisan migrate --force']});
});
test('falha de configuração não aplica migrações nem inicia servidor', () => {
  assert.deepEqual(run('config:cache'),{status:1,calls:['artisan config:cache']});
});
