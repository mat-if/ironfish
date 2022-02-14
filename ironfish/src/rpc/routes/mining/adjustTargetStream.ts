/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferSet } from 'buffer-map'
import * as yup from 'yup'
import {
  Assert,
  AsyncUtils,
  BigIntUtils,
  Block,
  BlockHeader,
  GraffitiUtils,
  Strategy,
  Transaction,
} from '../../..'
import { Target } from '../../../primitives/target'
import { ApiNamespace, router } from '../router'

// TODO: this probably should be pulled from the same place that block time is set
const ADJUST_TARGET_INTERVAL = 10_000

export type AdjustTargetStreamRequest = Record<string, never> | undefined
export type AdjustTargetStreamResponse = {
  sequence: number
  target: string
}

export const AdjustTargetStreamRequestSchema: yup.MixedSchema<AdjustTargetStreamRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

export const AdjustTargetStreamResponseSchema: yup.ObjectSchema<AdjustTargetStreamResponse> =
  yup
    .object({
      sequence: yup.number().required(),
      target: yup.string().required(),
    })
    .required()
    .defined()

router.register<typeof AdjustTargetStreamRequestSchema, AdjustTargetStreamResponse>(
  `${ApiNamespace.miner}/adjustTargetStream`,
  AdjustTargetStreamRequestSchema,
  async (request, node): Promise<void> => {
    const adjustTargetFn = (currentHeader: BlockHeader) => {
      const target = Target.calculateTarget(
        new Date(),
        currentHeader.timestamp,
        currentHeader.target,
      )
      const serializedPayload = {
        sequence: currentHeader.sequence + 1,
        // TODO: BigIntUtils etcetc
        target: BigIntUtils.toBytesBE(target.asBigInt(), 32).toString('hex'),
      }
      request.stream(serializedPayload)
    }

    let adjustTargetIntervalHandle: NodeJS.Timer
    // start the timer with the current head so there isn't a ~1 block waiting period
    const block = await node.chain.getBlock(node.chain.head)
    if (block != null) {
      adjustTargetIntervalHandle = setInterval(
        adjustTargetFn,
        ADJUST_TARGET_INTERVAL,
        block.header,
      )
    }

    const onConnectBlock = (block: Block) => {
      // TODO: do we need the block here?
      clearInterval(adjustTargetIntervalHandle)
      adjustTargetIntervalHandle = setInterval(
        adjustTargetFn,
        ADJUST_TARGET_INTERVAL,
        block.header,
      )
    }

    node.chain.onConnectBlock.on(onConnectBlock)

    request.onClose.once(() => {
      node.chain.onConnectBlock.off(onConnectBlock)
      clearInterval(adjustTargetIntervalHandle)
    })
  },
)
