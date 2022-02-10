/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { deserializeBlockTemplate, SerializedBlockTemplate } from '.'

export enum MINED_RESULT {
  UNKNOWN_REQUEST = 'UNKNOWN_REQUEST',
  CHAIN_CHANGED = 'CHAIN_CHANGED',
  INVALID_BLOCK = 'INVALID_BLOCK',
  ADD_FAILED = 'ADD_FAILED',
  FORK = 'FORK',
  SUCCESS = 'SUCCESS',
}

// TODO: Clean this up, if we can't find a way to make this re-usable
export const serializedBlockTemplateSchema2 = yup
  .object({
    header: yup
      .object({
        sequence: yup.number().required(),
        previousBlockHash: yup.string().required(),
        noteCommitment: yup
          .object({
            commitment: yup.string().required(),
            size: yup.number().required(),
          })
          .required()
          .defined(),
        nullifierCommitment: yup
          .object({
            commitment: yup.string().required(),
            size: yup.number().required(),
          })
          .required()
          .defined(),
        target: yup.string().required(),
        randomness: yup.number().required(),
        timestamp: yup.number().required(),
        minersFee: yup.string().required(),
        graffiti: yup.string().required(),
      })
      .required()
      .defined(),
    transactions: yup.array().of(yup.string().required()).required().defined(),
  })
  .required()
  .defined()
export type SubmitWorkRequest = SerializedBlockTemplate
export type SubmitWorkResponse = Record<string, never> | undefined

export const SubmitWorkRequestSchema: yup.ObjectSchema<SubmitWorkRequest> =
  serializedBlockTemplateSchema2
export const SubmitWorkResponseSchema: yup.MixedSchema<SubmitWorkResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

router.register<typeof SubmitWorkRequestSchema, SubmitWorkResponse>(
  `${ApiNamespace.miner}/submitWork`,
  SubmitWorkRequestSchema,
  async (request, node): Promise<void> => {
    const block = deserializeBlockTemplate(node.strategy, request.data)

    const blockDisplay = `${block.header.hash.toString('hex')} (${block.header.sequence})`
    if (!node.chain.head || !block.header.previousBlockHash.equals(node.chain.head.hash)) {
      console.log(
        `Discarding mined block ${blockDisplay} that no longer attaches to heaviest head`,
      )

      console.log(MINED_RESULT.CHAIN_CHANGED)
      return
    }

    const validation = await node.chain.verifier.verifyBlock(block)

    if (!validation.valid) {
      console.log(`Discarding invalid mined block ${blockDisplay}`, validation.reason)
      console.log(MINED_RESULT.INVALID_BLOCK)
      return
    }

    const { isAdded, reason, isFork } = await node.chain.addBlock(block)

    if (!isAdded) {
      console.log(
        `Failed to add mined block ${blockDisplay} to chain with reason ${String(reason)}`,
      )
      console.log(MINED_RESULT.ADD_FAILED)
      return
    }

    if (isFork) {
      console.log(
        `Failed to add mined block ${blockDisplay} to main chain. Block was added as a fork`,
      )
      console.log(MINED_RESULT.FORK)
      return
    }
    console.log(
      `Successfully mined block ${blockDisplay} with ${block.transactions.length} transactions`,
    )

    node.miningDirector.onNewBlock.emit(block)
    request.end()
  },
)
