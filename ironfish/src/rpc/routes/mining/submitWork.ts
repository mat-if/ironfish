/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import * as yup from 'yup'
import { BlockHeaderSerde } from '../../../primitives/blockheader'
import PartialBlockHeaderSerde from '../../../serde/PartialHeaderSerde'
import { ApiNamespace, router } from '../router'
import { SerializedBlockTemplate, serializedBlockTemplateSchema } from '.'

export enum MINED_RESULT {
  UNKNOWN_REQUEST = 'UNKNOWN_REQUEST',
  CHAIN_CHANGED = 'CHAIN_CHANGED',
  INVALID_BLOCK = 'INVALID_BLOCK',
  ADD_FAILED = 'ADD_FAILED',
  FORK = 'FORK',
  SUCCESS = 'SUCCESS',
}

export type SubmitWorkRequest = SerializedBlockTemplate
export type SubmitWorkResponse = Record<string, never> | undefined

export const SubmitWorkRequestSchema: yup.ObjectSchema<SubmitWorkRequest> =
  serializedBlockTemplateSchema
export const SubmitWorkResponseSchema: yup.MixedSchema<SubmitWorkResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

router.register<typeof SubmitWorkRequestSchema, SubmitWorkResponse>(
  `${ApiNamespace.miner}/submitWork`,
  SubmitWorkRequestSchema,
  async (request, node): Promise<void> => {
    console.log('work submitted neat', request)
    // deserialize payload
    // const blockHeader = node.strategy.blockHeaderSerde.deserializeFromPartialHex(
    //   request.data.data,
    // )

    request.end()
  },
)
