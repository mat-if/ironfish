import { blake3 } from '@napi-rs/blake-hash'
import net from 'net'
import { BigIntUtils, IronfishRpcClient, IronfishSdk, Meter, SerializedBlockTemplate } from 'ironfish'
import { mineableHeaderString } from './index'

export class Pool {
    readonly sdk: IronfishSdk
    readonly nodeClient: IronfishRpcClient
    readonly hashRate: Meter
    readonly stratum: StratumServer

    // TODO: Rename to job id or something
    nextMiningRequestId: number
    // TODO: LRU
    miningRequestBlocks: {[index: number]: SerializedBlockTemplate}

    // TODO: Difficulty adjustment!
    // baseTargetValue: number = 1
    target: Buffer = Buffer.alloc(32)

    currentHeadTimestamp: number
    currentHeadDifficulty: string

    // TODO: Disconnects

    private constructor(
        sdk: IronfishSdk, 
        nodeClient: IronfishRpcClient, 
        { timestamp, difficulty }: {timestamp: number, difficulty: string}
    ) {
        this.sdk = sdk
        this.nodeClient = nodeClient
        this.hashRate = new Meter()
        this.stratum = new StratumServer(this)
        this.nextMiningRequestId = 0
        this.miningRequestBlocks = {}
        this.target.writeUInt32BE(65535)
        this.currentHeadTimestamp = timestamp
        this.currentHeadDifficulty = difficulty
    }

    static async init(): Promise<Pool> {
        // TODO: Hashrate
        // TODO: Add IPC support for slightly improved speed?
        const configOverrides = {
            enableRpcTcp: true,
            rpcTcpHost: 'localhost',
            rpcTcpPort: 8001
        }

        const sdk = await IronfishSdk.init({ configOverrides: configOverrides })
        const nodeClient = await sdk.connectRpc()
        const currentBlock = (await nodeClient.getBlockInfo({sequence: -1})).content.block
        return new Pool(
            sdk,
            nodeClient,
            currentBlock
        )
    }

    async start() {
        this.hashRate.start()
        this.stratum.start()
        this.processNewBlocks()

        while (true) {
            await sleep(1000)
        }

        console.log("Stopping, goodbye")
        this.hashRate.stop()
    }

    getTarget(): string {
        return this.target.toString('hex')
    }

    submitWork(miningRequestId: number, randomness: number, graffiti: string) {
        let graffitiBuff = Buffer.alloc(32)
        graffitiBuff.write(graffiti)

        let blockTemplate = this.miningRequestBlocks[miningRequestId]

        blockTemplate.header.graffiti = graffitiBuff.toString('hex')
        blockTemplate.header.randomness = randomness

        let headerBytes = mineableHeaderString(blockTemplate.header)
        let hashedHeader = blake3(headerBytes)

        if (hashedHeader < this.target) {
            console.log("Valid pool share submitted")
        }
        if (hashedHeader < Buffer.from(blockTemplate.header.target, 'hex')) {
            // TODO: this seems to (sometimes?) have significant delay, look into why.
            // is it a socket buffer flush issue or a slowdown on the node side?
            console.log("Valid block, submitting to node")
            this.nodeClient.submitWork(blockTemplate)
        }
    }

    private async processNewBlocks() {
        for await (const payload of this.nodeClient.blockTemplateStream().contentStream()) {
            // TODO: Should we just include this as part of the block template? Seems fairly reasonable
            const currentBlock = (await this.nodeClient.getBlockInfo({hash: payload.header.previousBlockHash})).content.block
            this.currentHeadDifficulty = currentBlock.difficulty
            this.currentHeadTimestamp = currentBlock.timestamp

            let miningRequestId = this.nextMiningRequestId++
            this.miningRequestBlocks[miningRequestId] = payload

            this.stratum.newWork(miningRequestId, payload, this.currentHeadDifficulty, this.currentHeadTimestamp)
        }
    }
}

class StratumServer {
    readonly server: net.Server
    readonly pool: Pool

    // TODO: replace any
    connectedClients: any[]
    // TODO: LRU?
    requestsSent: {[index: number]: any}
    nextMinerId: number
    nextMessageId: number
    
    currentWork: Buffer | null = null
    currentMiningRequestId: number | null = null

    constructor(pool: Pool) {
        this.pool = pool
        this.connectedClients = []
        this.requestsSent = {}
        this.nextMinerId = 0
        this.nextMessageId = 0

        this.server = net.createServer((socket) => {
            console.log('Client connection received')

            socket.on('data', (data) => {
                const splitData = data.toString().trim().split('\n')
                for (const dataString of splitData) {
                    const payload = JSON.parse(dataString)
                    // Request
                    if (payload.method != null) {
                        switch (payload.method) {
                            case 'mining.subscribe':
                                console.log('mining.subscribe request received')
                                let graffiti = payload.params
                                let newMinerId = this.nextMinerId++

                                this.connectedClients[newMinerId] = {
                                    socket,
                                    graffiti,
                                }

                                // TODO: create helper fns / types
                                let response = {
                                    id: this.nextMessageId++,
                                    result: newMinerId,
                                }
                                this.send(socket, response)
                                this.send(socket, this.setTargetMessage())
                                if (this.hasWork()) {
                                    this.send(socket, this.notifyMessage())
                                }
                                break
                            case 'mining.submit':
                                console.log('mining.submit request received')
                                let submittedRequestId = payload.params[0]
                                let submittedRandomness = payload.params[1]
                                let submittedGraffiti = payload.params[2]
                                this.pool.submitWork(submittedRequestId, submittedRandomness, submittedGraffiti)
                                break
                            default:
                                console.log('unexpected method', payload.method)
                        }
                    } 
                    // Response
                    else {
                        console.log('response received')
                    }
                }
            })
        })
    }

    start() {
        this.server.listen(1234, 'localhost')
    }

    newWork(miningRequestId: number, block: SerializedBlockTemplate) { 
        this.currentMiningRequestId = miningRequestId
        this.currentWork = mineableHeaderString(block.header)
        console.log('setting current work', this.currentMiningRequestId, this.currentWork)
        this.broadcast(this.notifyMessage())
    }

    hasWork(): boolean {
        return this.currentWork != null
    }

    // TODO: This and other messages can probably be notifications and not full json rpc requests
    // to minimize resource usage and noise
    private notifyMessage(): object {
        return {
            id: this.nextMessageId++,
            method: 'mining.notify',
            params: [this.currentMiningRequestId, this.currentWork?.toString('hex')]
        }
    }

    // TODO: This may change to targetDifficulty once time adjustment comes into play
    private setTargetMessage(): object {
        return {
            id: this.nextMessageId++,
            method: 'mining.set_target',
            params: [this.pool.getTarget()]
        }
    }

    private broadcast(message: object) {
        const msg = JSON.stringify(message) + '\n'
        for (const client of this.connectedClients) {
            client.socket.write(msg)
        }
    }

    private send(socket: net.Socket, message: object) {
        const msg = JSON.stringify(message) + '\n'
        socket.write(msg)
    }
}

type StratumRequest = {
    id: number
}

type StratumResponse = {
    id: number
}

type StratumNotification = {
    // Technically this wont have an id, but placeholder
    id: number
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}


async function init() {
    console.log('pool init')
    let pool = await Pool.init()
    // pool.start()
}

init()