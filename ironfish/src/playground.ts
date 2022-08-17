/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { RollingFilter } from '@ironfish/bfilter'
import {
  BoxKeyPair,
  Foo,
  FooObj,
  generateKey,
  generateNewPublicAddress,
  initializeSapling,
  isValidPublicAddress,
  NativeWrapped,
  randomBytes,
  randomBytesBuffer,
  randomBytesString,
  randomBytesVec,
  TransactionPosted,
} from '@ironfish/rust-nodejs'
import { randomBytes as randomBytesJs } from 'crypto'
import { BenchUtils } from './utils/bench'
import { PromiseUtils } from './utils/promise'

const pauseAndGc = async (milliseconds: number) => {
  await PromiseUtils.sleep(milliseconds)
  for (let i = 0; i < 5; ++i) {
    global.gc && global.gc()
  }
}

const withSegment = async (title: string, fn: () => Promise<void> | void): Promise<string> => {
  const segment = BenchUtils.startSegment()
  await fn()
  const segmentResults = BenchUtils.endSegment(segment)
  return BenchUtils.renderSegment(segmentResults, title, '\n\t')
}

class JsFoo {
  x: Buffer
  constructor(x: Buffer) {
    this.x = x
  }
}

async function testFn(title: string, maxCount: number, fn: () => Promise<void> | void) {
  console.log('GC Exposed?', global.gc != null)
  const test_counts = [1, 25, 10_000, 30_000, 50_000, 75_000, 250_000, 1_000_000, 2_000_000]

  // const results: string[] = []

  const overallSegment = BenchUtils.startSegment()

  await pauseAndGc(10)

  for (const TEST_COUNT of test_counts) {
    if (maxCount > 0 && TEST_COUNT > maxCount) {
      break
    }
    const result = await withSegment(
      `${title} - ${TEST_COUNT.toLocaleString()} iterations`,
      async () => {
        for (let i = 0; i < TEST_COUNT; i += 1) {
          await fn()
          if (i % 5000 === 0) {
            await PromiseUtils.sleep(10)
          }
        }
        await pauseAndGc(10)
      },
    )
    // results.push(result)
    console.info(result)

    await pauseAndGc(10)
  }

  await pauseAndGc(2000)
  await pauseAndGc(2000)

  const endOverall = BenchUtils.endSegment(overallSegment)
  console.info(BenchUtils.renderSegment(endOverall, 'Overall', '\n\t'))

  // console.log(results.join('\n'))
}

async function testRandomBytes(test_count: number) {
  const results = [`Number of iterations: ${test_count.toLocaleString()}`]

  const tests = [
    {
      id: Math.random(),
      title: 'Rust String > Buffer',
      fn: randomBytesString,
    },
    {
      id: Math.random(),
      title: 'Rust JsBuffer',
      fn: randomBytesVec,
    },
    {
      id: Math.random(),
      title: 'NodeJs Buffer',
      fn: randomBytes,
    },
    {
      id: Math.random(),
      title: 'Rust Buffer',
      fn: randomBytesBuffer,
    },
  ]
  tests.sort(() => Math.random() - 0.5)

  await pauseAndGc(10)

  for (const test of tests) {
    const result = await withSegment(test.title, async () => {
      for (let i = 0; i < test_count; i += 1) {
        test.fn(32)
        if (i % 5000 === 0) {
          // await PromiseUtils.sleep(10)
          await pauseAndGc(10)
        }
      }
      await pauseAndGc(10)
    })

    await pauseAndGc(10)

    results.push(result)
  }

  console.log(results.join('\n'))
}

const txHash =
  '00000000000000000100000000000000006cca88ffffffff00000000adca76ee42c928b7e79053f8f3dbf1e8762ddd61b70276fdf8d3762c01ee82c63e04c2f4ea71522ad3df2030fde981e79815c958c251dbcf336140b44aeb724774c6f0032189caaa407287f77c9a7d5ed1aea4f76ea7e47a93098fa91835d0f713e3201cb1ba3b0e7adbf0f9591da7185376f612be0df7a027a0440a4fa47e3234f4ab2125dd6847f1a8ea3a234903499868d6c15546e511388774914307357fac272102bf97ed50f7c78ddddeba31bb8347626c5ae566f815d67211d2fdb84686c5302820fd0acdf173b64bef50a140cd5a0882611d3a8c86bede7ec91898cbed572f878941edd71859c57ffcb231f66f8d86188a4fe1d4ff57b82c3fa8826cb8344cda1188ca13a9d4d825482e9fa0c9498579a842d8e5c4318cbc44fb84b38325cf58759232f6ea3082520e555588c0707ee98aa4f6c1cb8b485809372213d54530217988b977a97d0c8b8db4cb3261a4b4e9c67adb32eafd954946ff30b5e55a56fe3796a5bb53ea375562600d8e8550cfb6956242bca25f67c3b02e3f1cd6ac8a4265616e7374616c6b206e6f746520656e6372797074696f6e206d696e6572206b657930303030303030303030303030303030303030303030303030303030303030303030303030303030303030303042bc2e7bd3f029bffd3fe6e38cc2c781c55ebc3707098619ee5555e8e1621143cd788c5d27df309967de12dab039130dba54e99fb67dffdb1f8074b1cf4d9b0d'
const txBuffer = Buffer.from(txHash, 'hex')

async function main() {
  // Load the sapling parameters in memory prior to any memory benchmarking so
  // we don't confuse the data
  initializeSapling()

  // 2.2 - no leaks? cant remember
  // 2.9 - no leaks
  // 2.9+ - no leaks
  // await testFn('Object', 0, () => {
  //   const x = {} as FooObj
  // })
  //
  // 2.2 - leaks
  // 2.9 - leaks
  // 2.9+ - no leaks
  // await testFn('Object', 0, () => {
  //   const x = new Foo()
  // })
  //
  // 2.2 - JsBuffer leaks
  // 2.9 - no leaks
  // 2.9+ - no leaks
  // await testRandomBytes(1_000_000)
  // await pauseAndGc(100)
  // await testRandomBytes(3_000_000)
  //
  // 2.9+ - don't think this leaks, but only testing up to 50k iterations cause its slow
  // await testFn('bool real fn', 0, () => {
  //   const x = isValidPublicAddress(
  //     '60368175a9b4328f5f692b2b3585845cc05469cb2e4582f781d4fac54e90838a65022dce078dd3a8e3f090',
  //   )
  // })
  //
  // 2.9+ - don't think this leaks
  // await testFn('generate key, returns obj with strings', 75000, () => {
  //   const x = generateKey()
  // })
  //
  // 2.9+ - don't think this leaks
  // await testFn('actual boxkeypair', 75000, () => {
  //   const x = new BoxKeyPair()
  // })
  //
  // 2.9+ - don't think this leaks
  // await testFn('actual boxkeypair from hex', 75000, () => {
  //   const x = BoxKeyPair.fromHex(
  //     'e9cd0c56d0c09e3bfc392039665474ad68438de484363f32087093927812983b',
  //   )
  // })
  //
  // 2.9+ - don't think this leaks
  // await testFn('generate new public address', 75000, () => {
  //   const x = generateNewPublicAddress(
  //     'bd539ecbaa7e28b9e55f7c241b72cfc86c9c708ff58d84b6305fe8775e2c461d',
  //   )
  // })
  //
  // 2.9+ - don't think this leaks
  // await testFn('init sapling', 0, () => {
  //   const x = initializeSapling()
  // })
  //
  // 2.2. - i think this leaks ~50-60mb @ 250_000
  // 2.9+ - leaks, maybe worse than 2.2 60-70mb @ 250_000
  // 2.9+ with jsBuffer - no longer leaks
  await testFn('new TransactionPosted w/ Verify', 50_000, () => {
    const x = new TransactionPosted(txBuffer)
    x.verify()
  })
  //
  // 2.2. - i think this leaks
  // 2.9+ - no leak
  // await testFn('new NativeWrapped', 0, () => {
  //   const x = new NativeWrapped(txBuffer)
  // })
  //
  // await testFn('new JsFoo', 250_000, () => {
  //   const x = new JsFoo(txBuffer)
  // })
  //
}

void main()
