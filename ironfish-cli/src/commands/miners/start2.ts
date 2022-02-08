/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import cli from 'cli-ux'
import {
  AsyncUtils,
  FileUtils,
  // Miner as IronfishMiner,
  MineRequest,
  NewBlocksStreamResponse,
  PromiseUtils,
} from 'ironfish'
import { Miner as IronfishMiner } from 'ironfish-mining'
import os from 'os'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class Miner extends IronfishCommand {
  static description = `Start a miner and subscribe to new blocks for the node`

  static flags = {
    ...RemoteFlags,
    threads: flags.integer({
      char: 't',
      default: 1,
      description:
        'number of CPU threads to use for mining. -1 will auto-detect based on number of CPU cores.',
    }),
  }

  async start(): Promise<void> {
    const { flags } = this.parse(Miner)

    if (flags.threads === 0 || flags.threads < -1) {
      throw new Error('--threads must be a positive integer or -1.')
    }

    if (flags.threads === -1) {
      flags.threads = os.cpus().length
    }

    const client = this.sdk.client
    const batchSize = this.sdk.config.get('minerBatchSize')
    // const miner = await IronfishMiner.init()

    // await miner.mine()
  }
}
