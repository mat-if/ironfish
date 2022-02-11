import net from 'net'
import { ThreadPoolHandler } from 'ironfish-rust-nodejs'
import { Meter } from 'ironfish'

// TODO: Once this is started via CLI, we can probably use that to listen for graffiti changes, etc.
// TODO: Handle disconnects, etc.
export class Miner {
    // TODO: Send hash rate up to pool
    readonly hashRate: Meter
    readonly threadPool: ThreadPoolHandler
    readonly stratum: StratumClient

    // TODO: Think about best way to store data at each level, miner, pool, server, client
    graffiti: string
    graffitiBuffer: Buffer
    miningRequestId: number
    // TODO: LRU
    miningRequestPayloads: {[index: number]: Buffer} = {}
    target: Buffer

    private constructor(threadPool: ThreadPoolHandler, graffiti: string) {
        this.hashRate = new Meter()
        this.threadPool = threadPool
        this.stratum = new StratumClient(this)
        this.miningRequestId = 0
        this.graffiti = graffiti
        this.graffitiBuffer = Buffer.alloc(32)
        this.graffitiBuffer.write(graffiti)
        this.target = Buffer.alloc(32)
        this.target.writeUInt32BE(65535)
    }

    static async init(graffiti: string): Promise<Miner> {
        // TODO: Confirm that this can't be set via config or anything
        // TODO: Bring this in from CLI arg or something
        const threadCount = 1

        const threadPool = new ThreadPoolHandler(threadCount)

        return new Miner(
            threadPool,
            graffiti
        )
    }

    async mine() {
        this.hashRate.start()
        this.stratum.start(this.graffiti)

        while (true) {
            // TODO: Turn this into an AsyncGenerator type thing on the JS side?
            let blockResult = this.threadPool.getFoundBlock()
            if (blockResult != null) {
                let { miningRequestId, randomness, blockHash} = blockResult
                console.log("Found block:", randomness, miningRequestId, blockHash)
                this.stratum.submit(miningRequestId, randomness, this.graffiti)
            }

            let hashRate = this.threadPool.getHashRateSubmission()
            this.hashRate.add(hashRate)

            await sleep(10)
        }

        this.hashRate.stop()
    }

    setTarget(target: string) {
        this.target = Buffer.from(target, 'hex')
    }

    newWork(miningRequestId: number, headerHex: string) {
        let headerBytes = Buffer.from(headerHex, 'hex')
        headerBytes.set(this.graffitiBuffer, 176)
        this.miningRequestPayloads[miningRequestId] = Buffer.from(headerHex, 'hex')
        console.log('new work', this.target.toString('hex'), miningRequestId)
        this.threadPool.newWork(headerBytes, this.target, miningRequestId)
    }
}

class StratumClient {
    readonly socket: net.Socket
    readonly miner: Miner

    requestsSent: {[index: number]: any}
    nextMessageId: number

    constructor(miner: Miner) {
        this.miner = miner
        this.requestsSent = {}
        this.nextMessageId = 0

        this.socket = net.connect(1234, 'localhost')

        this.socket.on('connect', () => {
            console.log('connection established with pool')
        })

        this.socket.on('data', (data) => {
            let splitData = data.toString().trim().split('\n')
            for (const dataString of splitData) {
                const payload = JSON.parse(dataString)
                // request
                if (payload.method != null) {
                    switch (payload.method) {
                        case 'mining.set_target':
                            console.log('set_target received')
                            this.miner.setTarget(payload.params[0])
                            break
                        case 'mining.notify':
                            console.log('mining notify received')
                            this.miner.newWork(payload.params[0], payload.params[1])
                            break
                        default:
                            console.log('unrecognized method', payload.method)
                    }
                }
                // TODO: add response handling
                // response
                else {
                    console.log('response received')
                }
            }
        })
    }

    start(graffiti: string) {
        let subscribe = {
            id: this.nextMessageId++,
            method: 'mining.subscribe',
            params: graffiti,
        }
        this.send(subscribe)
    }

    submit(miningRequestId: number, randomness: number, graffiti: string) {
        this.send({
            id: this.nextMessageId++,
            method: 'mining.submit',
            params: [miningRequestId, randomness, graffiti]
        })
    }

    private send(message: object) {
        this.socket.write(JSON.stringify(message) + '\n')
        // TODO log requests sent to match responses
    }
}

async function init() {
    let miner = await Miner.init("hello")
    miner.mine()
}

function sleep(ms: number) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

init()