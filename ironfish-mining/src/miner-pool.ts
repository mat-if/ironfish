import net from 'net'
import bufio from 'bufio'
import { ThreadPoolHandler } from 'ironfish-rust-nodejs'
import { GraffitiUtils, IronfishRpcClient, IronfishSdk, Meter, SerializedBlockTemplate, } from 'ironfish'

export class Miner {
    readonly hashRate: Meter
    readonly threadPool: ThreadPoolHandler
    readonly stratum: StratumClient

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
        // this.processNewBlocks()

        while (true) {
            // TODO: Turn this into an AsyncGenerator type thing on the JS side?
            let blockResult = this.threadPool.getFoundBlock()
            if (blockResult != null) {
                let { miningRequestId, randomness, blockHash} = blockResult
                console.log("Found block:", randomness, miningRequestId, blockHash)
                // let partialHeader = minedPartialHeader(Buffer.from(blockHash, 'hex'))
                // let block = {
                //     header: partialHeader,
                //     transactions: this.miningRequestPayloads[miningRequestId].transactions,
                // }
                // TODO: communicate with pool
                // let resp = await this.nodeClient.submitWork(block)
                // console.log('submitted block', resp)

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

    private async processNewBlocks() {
        // for await (const payload of this.nodeClient.blockTemplateStream().contentStream()) {
        //     payload.header.graffiti = GraffitiUtils.fromString('thisisatest').toString('hex')
        //     let headerBytes = mineableHeaderString(payload.header)
        //     let target = Buffer.from(payload.header.target, 'hex')
        //     // // TODO: Send as buffer? hex? same goes for headerbytes
        //     // let target = BigIntUtils.toBytesBE(BigInt(payload.target), 32)
        //     // let miningRequestId = payload.miningRequestId

        //     let miningRequestId = this.miningRequestId++
        //     this.miningRequestPayloads[miningRequestId] = payload
        //     this.threadPool.newWork(headerBytes, target, miningRequestId)
        // }
    }

    newWork(miningRequestId: number, headerHex: string) {
        let headerBytes = Buffer.from(headerHex, 'hex')
        headerBytes.set(this.graffitiBuffer, 176)
        this.miningRequestPayloads[miningRequestId] = Buffer.from(headerHex, 'hex')
        console.log('new work', headerBytes, this.target, miningRequestId)
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
            // console.log('data received')
            let splitData = data.toString().trim().split('\n')
            // console.log('splitData', splitData)
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
function mineableHeaderString(header: PartialHeader): Buffer {
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
function minedPartialHeader(data: Buffer): PartialHeader {
    const br = bufio.read(data)
    const randomness = br.readDoubleBE() // 8
    const sequence = br.readU64() // 8
    const previousBlockHash = br.readHash() // 32
    const noteCommitment = br.readHash() // 32
    const noteCommitmentSize = br.readU64() // 8
    const nullifierCommitment = br.readHash() // 32
    const nullifierCommitmentSize = br.readU64() // 8
    const target = br.readBytes(32) // 32
    const timestamp = br.readU64() // 8
    const minersFee = br.readBytes(8) // 8
    const graffiti = br.readBytes(32) // 32

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

init()