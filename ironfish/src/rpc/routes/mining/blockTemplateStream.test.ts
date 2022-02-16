/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

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
})
