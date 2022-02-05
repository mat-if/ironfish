import { ThreadPoolHandler } from 'ironfish-rust-nodejs'
import { BigIntUtils, IronfishSdk, NewBlocksStreamResponse, SuccessfullyMinedRequest } from 'ironfish'

async function init() {
    const configOverrides = {
        enableRpcTcp: true,
        rpcTcpHost: 'localhost',
        rpcTcpPort: 8001
    }

    const thread_count = 2

    const sdk = await IronfishSdk.init({
        configOverrides: configOverrides,
    })

    const rpc = await sdk.connectRpc()
    const threadpool = new ThreadPoolHandler(thread_count)

    processNewBlocks(rpc.newBlocksStream().contentStream(), threadpool)

    while (true) {
        // TODO: Turn this into an AsyncGenerator type thing on the JS side?
        let blockResult = threadpool.getFoundBlock()
        if (blockResult != null) {
            let { miningRequestId, randomness } = blockResult
            let resp = await rpc.successfullyMined({ miningRequestId, randomness })
            console.log('submitted block', resp)
        }

        await sleep(100)
    }
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

async function processNewBlocks(
    contentStream: AsyncGenerator<NewBlocksStreamResponse, void, unknown>,
    threadpool: ThreadPoolHandler
) {
    for await (const payload of contentStream) {
        console.log('block received')
        const headerBytes = Buffer.alloc(payload.bytes.data.length + 8)
        headerBytes.set(payload.bytes.data, 8)
        // TODO: Send as buffer? hex? same goes for headerbytes
        let target = BigIntUtils.toBytesBE(BigInt(payload.target), 32)
        let miningRequestId = payload.miningRequestId

        threadpool.newWork(headerBytes, target, miningRequestId)
    }
}

init()