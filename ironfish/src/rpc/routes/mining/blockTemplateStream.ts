/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferSet } from 'buffer-map'
import * as yup from 'yup'
import { Assert, AsyncUtils, BigIntUtils, Block, GraffitiUtils, Transaction } from '../../..'
import { Target } from '../../../primitives/target'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type SerializedBlockTemplate = {
  header: {
    sequence: number
    previousBlockHash: string
    noteCommitment: {
      commitment: string
      size: number
    }
    nullifierCommitment: {
      commitment: string
      size: number
    }
    target: string
    // TODO: Skip sending this? or easier this way?
    randomness: number
    timestamp: number
    // TODO: do we want to keep this as a string? big int > buffer > hex?
    minersFee: string
    graffiti: string
  }
  transactions: string[]
}
function serializeBlockTemplate(block: Block): SerializedBlockTemplate {
  const header = {
    sequence: block.header.sequence,
    previousBlockHash: block.header.previousBlockHash.toString('hex'),
    noteCommitment: {
      commitment: block.header.noteCommitment.commitment.toString('hex'),
      size: block.header.noteCommitment.size,
    },
    nullifierCommitment: {
      commitment: block.header.nullifierCommitment.commitment.toString('hex'),
      size: block.header.nullifierCommitment.size,
    },
    target: BigIntUtils.toBytesBE(block.header.target.asBigInt(), 32).toString('hex'),
    randomness: 0,
    timestamp: block.header.timestamp.getTime(),
    minersFee: BigIntUtils.toBytesBE(block.header.minersFee, 8).toString('hex'),
    graffiti: block.header.graffiti.toString('hex'),
  }

  const transactions = block.transactions.map((t) => t.serialize().toString('hex'))
  return {
    header,
    transactions,
  }
}

export const serializedBlockTemplateSchema = yup
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

export type BlockTemplateStreamRequest = Record<string, never> | undefined
export type BlockTemplateStreamResponse = SerializedBlockTemplate

export const BlockTemplateStreamRequestSchema: yup.MixedSchema<BlockTemplateStreamRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

// TODO: can share shape between the commitments
// TODO: define a specific type for hex strings?
// TODO: set expected lengths on hex string fields
export const BlockTemplateStreamResponseSchema: yup.ObjectSchema<BlockTemplateStreamResponse> =
  serializedBlockTemplateSchema

router.register<typeof BlockTemplateStreamRequestSchema, BlockTemplateStreamResponse>(
  `${ApiNamespace.miner}/blockTemplateStream`,
  BlockTemplateStreamRequestSchema,
  async (request, node): Promise<void> => {
    const onConnectBlock = async (block: Block) => {
      console.log('NEW BLOCK, NEAT')

      // TODO: find a good place to put this, not really mining specific
      // TODO: or find other places that do similar and see if there's code duplication
      // mempool maybe?
      // Fetch transactions for the block
      const blockTransactions: Transaction[] = []
      const nullifiers = new BufferSet()
      for (const transaction of node.memPool.get()) {
        const isExpired = node.chain.verifier.isExpiredSequence(
          transaction.expirationSequence(),
          block.header.sequence + 1,
        )

        console.log('expired?')
        if (isExpired) {
          continue
        }

        const conflicted = await AsyncUtils.find(transaction.spends(), (spend) => {
          return nullifiers.has(spend.nullifier)
        })

        console.log('conflicted?')
        if (conflicted) {
          continue
        }

        const { valid } = await node.chain.verifier.verifyTransactionSpends(transaction)
        console.log('valid?')
        if (!valid) {
          continue
        }

        for (const spend of transaction.spends()) {
          nullifiers.add(spend.nullifier)
        }

        blockTransactions.push(transaction)
      }

      // Sum the transaction fees
      let totalTransactionFees = BigInt(0)
      const transactionFees = await Promise.all(blockTransactions.map((t) => t.fee()))
      for (const transactionFee of transactionFees) {
        totalTransactionFees += transactionFee
      }
      console.log('tx fees', totalTransactionFees)

      const newSequence = block.header.sequence + 1

      const account = node.accounts.getDefaultAccount()
      console.log('account', account != null)
      if (account == null) {
        return
      }
      Assert.isNotNull(
        account,
        'should not be able to create a block template without an account',
      )

      const minersFee = await node.strategy.createMinersFee(
        totalTransactionFees,
        newSequence,
        account.spendingKey,
      )
      console.log('miners fee', minersFee != null)

      const newBlock = await node.chain.newBlock(
        blockTransactions,
        minersFee,
        GraffitiUtils.fromString(node.config.get('blockGraffiti')),
      )
      console.log('new block', newBlock != null)

      // const serializedBlock = node.strategy.blockSerde.serialize(newBlock)
      const serializedBlock = serializeBlockTemplate(block)
      // console.log('serialized block', serializedBlock)
      request.stream(serializedBlock)
    }

    const wrappedFn = (block: Block) => {
      setTimeout(() => {
        void onConnectBlock(block)
      })
    }

    console.log('asdfasdfadf')
    // TODO: we'll still want equivalent of director.force flag
    if (!node.chain.synced) {
      // TODO: Inform the requester with an error
      return
    }

    // node.chain.onConnectBlock.on((block) => {
    //   setTimeout(() => {
    //     onConnectBlock(block)
    //   })
    // })
    // node.chain.onConnectBlock.on(onConnectBlock)
    node.chain.onConnectBlock.on(wrappedFn)
    const block = await node.chain.getBlock(node.chain.head)
    if (block != null) {
      await onConnectBlock(block)
    }

    request.onClose.once(() => {
      console.log('unhooking event listener')
      node.chain.onConnectBlock.off(onConnectBlock)
    })
  },
)

// Director flow
// onChainHeadChange
//  generateBlockToMine
//    constructTransactionsAndFees DONE
//      getTransactions DONE
//    constructAndMineBlockWithRetry
//      constructAndMineBlock
