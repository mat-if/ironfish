import bufio from 'bufio'
import { ThreadPoolHandler } from 'ironfish-rust-nodejs'
import { GraffitiUtils, IronfishRpcClient, IronfishSdk, Meter, SerializedBlockTemplate, } from 'ironfish'

export class Miner {
    readonly sdk: IronfishSdk
    readonly nodeClient: IronfishRpcClient
    readonly hashRate: Meter
    readonly threadPool: ThreadPoolHandler

    miningRequestId: number

    // TODO: LRU
    miningRequestPayloads: {[index: number]: SerializedBlockTemplate} = {}

    private constructor(sdk: IronfishSdk, nodeClient: IronfishRpcClient, threadPool: ThreadPoolHandler) {
        this.sdk = sdk
        this.nodeClient = nodeClient
        this.hashRate = new Meter()
        this.threadPool = threadPool
        this.miningRequestId = 0
    }

    static async init(): Promise<Miner> {
        // TODO: Miner needs to be able to modify graffiti - we can't do this until new endpoints
        // TODO: Hashrate
        // TODO: Add IPC support for slightly improved speed
        const configOverrides = {
            enableRpcTcp: true,
            rpcTcpHost: 'localhost',
            rpcTcpPort: 8001
        }

        // TODO: Confirm that this can't be set via config or anything
        const threadCount = 1

        const sdk = await IronfishSdk.init({ configOverrides: configOverrides })

        const nodeClient = await sdk.connectRpc()
        const threadPool = new ThreadPoolHandler(threadCount)

        return new Miner(
            sdk,
            nodeClient,
            threadPool,
        )
    }

    async mine() {
        this.hashRate.start()
        this.processNewBlocks()

        while (true) {
            // TODO: Turn this into an AsyncGenerator type thing on the JS side?
            let blockResult = this.threadPool.getFoundBlock()
            if (blockResult != null) {
                let { miningRequestId, randomness, blockHash} = blockResult
                this.sdk.logger.log("Found block:", randomness, miningRequestId, blockHash)
                let partialHeader = minedPartialHeader(Buffer.from(blockHash, 'hex'))
                let block = {
                    header: partialHeader,
                    transactions: this.miningRequestPayloads[miningRequestId].transactions,
                }
                let resp = await this.nodeClient.submitWork(block)
                // console.log('submitted block', resp)
            }

            let hashRate = this.threadPool.getHashRateSubmission()
            this.hashRate.add(hashRate)

            await sleep(10)
        }

        this.hashRate.stop()
    }

    private async processNewBlocks() {
        for await (const payload of this.nodeClient.blockTemplateStream().contentStream()) {
            payload.header.graffiti = GraffitiUtils.fromString('thisisatest').toString('hex')
            let headerBytes = mineableHeaderString(payload.header)
            let target = Buffer.from(payload.header.target, 'hex')
            // // TODO: Send as buffer? hex? same goes for headerbytes
            // let target = BigIntUtils.toBytesBE(BigInt(payload.target), 32)
            // let miningRequestId = payload.miningRequestId

            let miningRequestId = this.miningRequestId++
            this.miningRequestPayloads[miningRequestId] = payload
            this.threadPool.newWork(headerBytes, target, miningRequestId)
        }
    }
}

async function init() {
    // console.log('orig miner init')
    // let miner = await Miner.init()
    // miner.mine()

    let a = Buffer.alloc(32)
    a.writeBigUInt64BE(BigInt(1))
    let b = Buffer.alloc(32)
    b.writeUInt32BE(256)
    let c = Buffer.alloc(32)
    c.writeUInt32BE(128)
    let d = Buffer.alloc(32)
    d.writeUInt32BE(65535)

    console.log("A<B", a < b)
    console.log("INV", a > b)
    console.log("B>C", b > c)
    console.log("INV", b < c)
    console.log("B<D", b < d)
    console.log("INV", b > d)
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

interface PartialHeader {
    randomness: number
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
    timestamp: number
    minersFee: string
    graffiti: string
}

// "serialize" into a binary format
export function mineableHeaderString(header: PartialHeader): Buffer {
    const bw = bufio.write(208)
    bw.writeDoubleBE(header.randomness)
    bw.writeU64(header.sequence)
    bw.writeHash(header.previousBlockHash)
    bw.writeHash(header.noteCommitment.commitment)
    bw.writeU64(header.noteCommitment.size)
    bw.writeHash(header.nullifierCommitment.commitment)
    bw.writeU64(header.nullifierCommitment.size)
    bw.writeHash(header.target)
    bw.writeU64(header.timestamp)
    // TODO: I think this can just use a writeString fn
    bw.writeBytes(Buffer.from(header.minersFee, 'hex'))
    bw.writeBytes(Buffer.from(header.graffiti, 'hex'))
    return bw.render()
}

// deserialize into a partial header
export function minedPartialHeader(data: Buffer): PartialHeader {
    const br = bufio.read(data)
    const randomness = br.readDoubleBE()
    const sequence = br.readU64()
    const previousBlockHash = br.readHash()
    const noteCommitment = br.readHash()
    const noteCommitmentSize = br.readU64()
    const nullifierCommitment = br.readHash()
    const nullifierCommitmentSize = br.readU64()
    const target = br.readBytes(32)
    const timestamp = br.readU64()
    const minersFee = br.readBytes(8)
    const graffiti = br.readBytes(32)

    return {
      randomness: randomness,
      sequence: sequence,
      previousBlockHash: previousBlockHash.toString('hex'),
      target: target.toString('hex'),
      timestamp: timestamp,
      minersFee: minersFee.toString('hex'),
      graffiti: graffiti.toString('hex'),
      noteCommitment: {
        commitment: noteCommitment.toString('hex'),
        size: noteCommitmentSize,
      },
      nullifierCommitment: {
        commitment: nullifierCommitment.toString('hex'),
        size: nullifierCommitmentSize,
      },
    }
}

if (require.main === module) {
    init()
}