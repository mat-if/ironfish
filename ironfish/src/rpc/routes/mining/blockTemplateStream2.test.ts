/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BigIntUtils, GraffitiUtils } from '../../..'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities'
import { flushTimeout } from '../../../testUtilities/helpers/tests'
import { createRouteTest } from '../../../testUtilities/routeTest'

const HEX_STRING_PATTERN = /^[a-f0-9]+$/

// TODO:: RENAME THIS BACK TO test.slow.ts
describe('Route miner/blockTemplateStream', () => {
  const routeTest = createRouteTest()
  const graffiti = 'testgraffiti'

  beforeAll(async () => {
    routeTest.node.config.set('blockGraffiti', graffiti)
    routeTest.node.config.set('miningForce', true)

    const account = await useAccountFixture(routeTest.node.accounts, 'account')
    await routeTest.node.accounts.setDefaultAccount(account.name)
  })

  it('sends a block template on initial request', async () => {
    const node = routeTest.node
    const chain = node.chain
    const block = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block)

    const response = await routeTest.adapter
      .requestStream('miner/blockTemplateStream')
      .waitForRoute()

    const { value } = await response.contentStream().next()
    await flushTimeout()
    chain.onSynced.clear()
    response.end()
    expect(response.status).toBe(200)
    expect(value).toMatchObject({
      header: {
        sequence: block.header.sequence + 1,
        previousBlockHash: block.header.hash.toString('hex'),
        noteCommitment: {
          commitment: expect.stringMatching(HEX_STRING_PATTERN),
          size: expect.any(Number),
        },
        nullifierCommitment: {
          commitment: expect.stringMatching(HEX_STRING_PATTERN),
          size: 1,
        },
        target: expect.stringMatching(HEX_STRING_PATTERN),
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

  it.only('sends a block template when chain head changes', async () => {
    const node = routeTest.node
    const { chain } = routeTest.node

    const response = await routeTest.adapter
      .requestStream('miner/blockTemplateStream')
      .waitForRoute()

    // onConnectBlock can trigger while generating fixtures or if this test is run in isolation,
    // which would call generateBlockToMine twice, so we can clear the listener to ensure it
    // will only be called once.
    await flushTimeout()
    chain.onConnectBlock.clear()

    const getNewBlockTransactionsSpy = jest
      .spyOn(node.memPool, 'getNewBlockTransactions')
      .mockReturnValue(Promise.resolve({ totalFees: BigInt(0), blockTransactions: [] }))


    await flushTimeout()
    const previous = await useMinerBlockFixture(chain, 3)
    await flushTimeout()
    await expect(chain).toAddBlock(previous)
    console.log('previous', previous.header.sequence)
    await flushTimeout()
    await flushTimeout()
    await flushTimeout()
    await flushTimeout()


    expect(getNewBlockTransactionsSpy).toBeCalledTimes(1)
    expect(getNewBlockTransactionsSpy.mock.calls[0][0]).toBe(previous.header.sequence + 1)
    response.end()
  })
})
