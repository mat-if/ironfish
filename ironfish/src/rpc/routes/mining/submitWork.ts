/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import * as yup from 'yup'
import { BlockHeaderSerde } from '../../../primitives/blockheader'
import PartialBlockHeaderSerde from '../../../serde/PartialHeaderSerde'
import { ApiNamespace, router } from '../router'

export type SubmitWorkRequest = { data: string }
export type SubmitWorkResponse = Record<string, never> | undefined

export const SubmitWorkRequestSchema: yup.ObjectSchema<SubmitWorkRequest> = yup
  .object({
    data: yup.string().defined(),
  })
  .defined()
//   ironfish/src/serde/PartialHeaderSerde.ts
//   ironfish/src/rpc/routes/mining/submitWork.ts
export const SubmitWorkResponseSchema: yup.MixedSchema<SubmitWorkResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

router.register<typeof SubmitWorkRequestSchema, SubmitWorkResponse>(
  `${ApiNamespace.miner}/submitWork`,
  SubmitWorkRequestSchema,
  async (request, node): Promise<void> => {
    console.log('neat', request.data)
    // if (node.miningDirector) {
    //   await node.miningDirector.successfullyMined(
    //     request.data.randomness,
    //     request.data.miningRequestId,
    //   )
    // }

    // const x = PartialBlockHeaderSerde.deser
    // const x = new BlockHeaderSerde().deserialize(request.data)
    // const block = Buffer.from(request.data, 'hex')
    const blockHex = Buffer.from(request.data.data, 'hex')
    console.log('block', blockHex)
    const partial = new PartialBlockHeaderSerde().deserialize(blockHex.subarray(8))
    console.log('x', partial)

    const randomness = bufio.read(blockHex).readDoubleBE()
    console.log('RADNOMNESS', randomness)
    // const block = new BlockHeaderSerde(node.strategy).deserialize(partial)
    // const block = partial as BlockHeader

    // 3.651588617853403e+24
    // 3.651588617853403e+24

    request.end()
  },
)
