/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { mineBlockHeader as nativeMineBlockHeader } from 'ironfish-rust-nodejs';
import type { Job } from '../workerPool/job'
import { hashBlockHeader } from '../primitives/blockheader'
import { Target } from '../primitives/target'
import { BigIntUtils } from '../utils/bigint';

export async function mineHeader({
  miningRequestId,
  headerBytesWithoutRandomness,
  initialRandomness,
  targetValue,
  batchSize,
  job,
}: {
  miningRequestId: number
  headerBytesWithoutRandomness: Uint8Array
  initialRandomness: number
  targetValue: string
  batchSize: number
  job?: Job
}): Promise<{ initialRandomness: number; randomness?: number; miningRequestId?: number }> {
  const headerBytes = Buffer.alloc(headerBytesWithoutRandomness.byteLength + 8)
  headerBytes.set(headerBytesWithoutRandomness, 8)

  const { randomness, found_match } = nativeMineBlockHeader(
    initialRandomness, headerBytes, BigIntUtils.toBytes(BigInt(targetValue))
  );
  if (found_match) {
    return { initialRandomness, randomness, miningRequestId }
  } else {
    return { initialRandomness }
  }
}