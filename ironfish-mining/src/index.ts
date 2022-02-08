import { ThreadPoolHandler } from 'ironfish-rust-nodejs'
import { BigIntUtils, IronfishRpcClient, IronfishSdk, Meter, NewBlocksStreamResponse, SuccessfullyMinedRequest } from 'ironfish'

export class Miner {
    readonly sdk: IronfishSdk
    readonly nodeClient: IronfishRpcClient
    readonly hashRate: Meter
    readonly threadPool: ThreadPoolHandler

    private constructor(sdk: IronfishSdk, nodeClient: IronfishRpcClient, threadPool: ThreadPoolHandler) {
        this.sdk = sdk
        this.nodeClient = nodeClient
        this.hashRate = new Meter()
        this.threadPool = threadPool
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
        const threadCount = 2

        const sdk = await IronfishSdk.init({
            configOverrides: configOverrides,
        })

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
                // let { miningRequestId, randomness, blockHash, fii} = blockResult
                let { miningRequestId, randomness, blockHash} = blockResult
                this.sdk.logger.log("Found block:", randomness, miningRequestId, blockHash)
                // let resp = await this.nodeClient.successfullyMined({ miningRequestId, randomness })
                let resp = await this.nodeClient.submitWork({ data: blockHash })
                // console.log('submitted block', resp)
            }

            let hashRate = this.threadPool.getHashRateSubmission()
            this.hashRate.add(hashRate)

            await sleep(10)
        }

        this.hashRate.stop()
    }

    private async processNewBlocks() {
        for await (const payload of this.nodeClient.newBlocksStream().contentStream()) {
            const headerBytes = Buffer.alloc(payload.bytes.data.length + 8)
            headerBytes.set(payload.bytes.data, 8)
            // TODO: Send as buffer? hex? same goes for headerbytes
            let target = BigIntUtils.toBytesBE(BigInt(payload.target), 32)
            let miningRequestId = payload.miningRequestId

            this.threadPool.newWork(headerBytes, target, miningRequestId)
        }
    }
}

async function init() {
    let x = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < 10; i++) {
        const headerBytes = Buffer.alloc(8)
        headerBytes.writeDoubleBE(x + i)
        console.log("HEADER::", headerBytes)
    }

    let y = BigInt(Number.MAX_SAFE_INTEGER);
    for (let i = BigInt(0); i < 10; i++) {
        const headerBytes = Buffer.alloc(8)
        headerBytes.writeDoubleBE(Number(y + i))
        console.log("HEADER::", headerBytes)
    }

    let z = BigInt(Number.MAX_SAFE_INTEGER);
    for (let i = BigInt(0); i < 10; i++) {
        const headerBytes = Buffer.alloc(8)
        headerBytes.writeBigUInt64BE(z + i)
        console.log("HEADER::", headerBytes)
    }

    let miner = await Miner.init()
    miner.mine()
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

init()