import { ThreadPoolHandler } from 'ironfish-rust-nodejs'
import { BigIntUtils, IronfishSdk, NewBlocksStreamResponse, SuccessfullyMinedRequest } from 'ironfish'

async function init() {
    // TODO: Add IPC support for slightly improved speed
    const configOverrides = {
        enableRpcTcp: true,
        rpcTcpHost: 'localhost',
        rpcTcpPort: 8001
    }

    const sdk = await IronfishSdk.init({
        configOverrides: configOverrides,
    })

    const rpc = await sdk.connectRpc()

    processNewBlocks(rpc.newBlocksStream().contentStream())

    while (true) {
        await sleep(100)
    }
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

async function processNewBlocks(
    contentStream: AsyncGenerator<NewBlocksStreamResponse, void, unknown>
) {
    for await (const payload of contentStream) {
        const headerBytes = Buffer.alloc(payload.bytes.data.length + 8)
        headerBytes.set(payload.bytes.data, 8)
        // TODO: Send as buffer? hex? same goes for headerbytes
        let target = BigIntUtils.toBytesBE(BigInt(payload.target), 32)
        let miningRequestId = payload.miningRequestId
    }
}