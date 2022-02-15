/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BigIntUtils, GraffitiUtils } from '../../..'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

const HEX_STRING_PATTERN = /^[a-f0-9]+$/

describe('Route miner/blockTemplateStream', () => {
  const routeTest = createRouteTest()

  it('should return an error if the chain is not synced', async () => {
    const response = routeTest.adapter.request('miner/blockTemplateStream')
    await expect(response).rejects.toThrow('Node is not synced')
  })

  it('should return an error if there is no account', async () => {
    const chain = routeTest.node.chain
    const block = await useMinerBlockFixture(chain, 2)
    await expect(chain).toAddBlock(block)

    const response = routeTest.adapter.request('miner/blockTemplateStream')
    await expect(response).rejects.toThrow('Cannot mine without an account')
  })

  it('should send block templates', async () => {
    const node = routeTest.node

    const graffiti = 'testgraffiti'
    node.config.set('blockGraffiti', graffiti)

    const account = await useAccountFixture(node.accounts, 'account')
    await node.accounts.setDefaultAccount(account.name)

    const chain = node.chain
    const block = await useMinerBlockFixture(chain, 2)
    await expect(chain).toAddBlock(block)

    const response = await routeTest.adapter
      .requestStream('miner/blockTemplateStream')
      .waitForRoute()

    const { value } = await response.contentStream().next()
    response.end()
    expect(response.status).toBe(200)
    expect(value).toMatchObject({
      header: {
        sequence: block.header.sequence + 1,
        previousBlockHash: block.header.hash.toString('hex'),
        noteCommitment: {
          commitment: expect.stringMatching(HEX_STRING_PATTERN),
          size: 5,
        },
        nullifierCommitment: {
          commitment: expect.stringMatching(HEX_STRING_PATTERN),
          size: 1,
        },
        target: '0000800000000000000000000000000000000000000000000000000000000000',
        randomness: 0,
        timestamp: expect.any(Number),
        minersFee: '0000000077359400',
        graffiti: GraffitiUtils.fromString(graffiti).toString('hex'),
      },
      transactions: expect.arrayContaining([expect.stringMatching(HEX_STRING_PATTERN)]),
      previousBlockInfo: {
        target: BigIntUtils.toBytesBE(block.header.target.asBigInt(), 32).toString('hex'),
        timestamp: block.header.timestamp.getTime(),
      },
    })
  })
})
