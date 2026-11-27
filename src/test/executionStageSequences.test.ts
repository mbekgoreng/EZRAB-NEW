/**
 * executionStageSequences.test — pengujian urutan tahap pacing
 * minimum-display Chat AI (program pacing, 2026-11-28).
 *
 * Gaya plain-tsx (tanpa vitest — vitest tidak terinstal di sandbox):
 * jalankan dari ROOT repo: `npx --yes tsx src/test/executionStageSequences.test.ts`
 *
 * Yang diuji: stageSequenceForReply mengembalikan urutan fase pipeline
 * NYATA (bukan label karangan) per jenis balasan, setiap tahap punya
 * label di EXECUTION_STAGE_LABELS, dan setiap urutan dimulai dari
 * 'preparing' dan berakhir di 'validating'.
 */
import {
  stageSequenceForReply,
  EXECUTION_STAGE_LABELS,
  type ExecutionStage,
} from '../ai-tools/ezrab-ai/executionRuntime';

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  PASS ${name}`);
    })
    .catch((e: any) => {
      failed += 1;
      console.log(`  FAIL ${name}: ${e?.message ?? e}`);
    });
}
const assert = (cond: unknown, msg: string) => {
  if (!cond) throw new Error(msg);
};
const eq = <T>(a: T, b: T, msg: string) => {
  assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: dapat ${JSON.stringify(a)}, harap ${JSON.stringify(b)}`);
};

function assertSequenceShape(kind: 'questionnaire' | 'local' | 'rab', seq: ExecutionStage[]): void {
  assert(seq.length > 0, `${kind}: urutan tidak boleh kosong`);
  assert(seq[0] === 'preparing', `${kind}: tahap pertama harus 'preparing', dapat '${seq[0]}'`);
  assert(seq[seq.length - 1] === 'validating', `${kind}: tahap terakhir harus 'validating', dapat '${seq[seq.length - 1]}'`);
  for (const stage of seq) {
    assert(
      Object.prototype.hasOwnProperty.call(EXECUTION_STAGE_LABELS, stage),
      `${kind}: tahap '${stage}' tidak ada di EXECUTION_STAGE_LABELS`,
    );
    assert(typeof EXECUTION_STAGE_LABELS[stage] === 'string' && EXECUTION_STAGE_LABELS[stage].length > 0, `${kind}: tahap '${stage}' tidak punya label`);
  }
  assert(new Set(seq).size === seq.length, `${kind}: urutan tidak boleh berisi tahap ganda`);
}

async function main(): Promise<void> {
  console.log('executionStageSequences.test');

  await check("1. questionnaire -> ['preparing', 'identifying-items', 'validating']", () => {
    eq(stageSequenceForReply('questionnaire'), ['preparing', 'identifying-items', 'validating'], 'urutan questionnaire');
  });

  await check("2. local -> ['preparing', 'identifying-items', 'validating']", () => {
    eq(stageSequenceForReply('local'), ['preparing', 'identifying-items', 'validating'], 'urutan local');
  });

  await check("3. rab -> ['preparing', 'identifying-items', 'calculating-quantities', 'mapping-ahsp', 'checking-prices', 'validating']", () => {
    eq(
      stageSequenceForReply('rab'),
      ['preparing', 'identifying-items', 'calculating-quantities', 'mapping-ahsp', 'checking-prices', 'validating'],
      'urutan rab',
    );
  });

  await check('4. semua tahap di ketiga urutan ada di EXECUTION_STAGE_LABELS', () => {
    for (const kind of ['questionnaire', 'local', 'rab'] as const) {
      for (const stage of stageSequenceForReply(kind)) {
        assert(
          Object.prototype.hasOwnProperty.call(EXECUTION_STAGE_LABELS, stage),
          `${kind}: tahap '${stage}' tidak ada di EXECUTION_STAGE_LABELS`,
        );
      }
    }
  });

  await check("5. tidak ada urutan kosong; pertama 'preparing', terakhir 'validating'", () => {
    for (const kind of ['questionnaire', 'local', 'rab'] as const) {
      assertSequenceShape(kind, stageSequenceForReply(kind));
    }
  });

  await check('6. urutan rab lebih panjang dari questionnaire/local (rantai RAB penuh)', () => {
    const rab = stageSequenceForReply('rab');
    const q = stageSequenceForReply('questionnaire');
    const l = stageSequenceForReply('local');
    assert(rab.length === 6, `rab harus 6 tahap, dapat ${rab.length}`);
    assert(q.length === 3 && l.length === 3, `questionnaire/local harus 3 tahap, dapat ${q.length}/${l.length}`);
    assert(rab.length > q.length && rab.length > l.length, 'rab harus lebih panjang');
  });

  console.log(`\nexecutionStageSequences.test: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
