import bufio from 'bufio'
import { ThreadPoolHandler } from 'ironfish-rust-nodejs'
import { GraffitiUtils, IronfishRpcClient, IronfishSdk, Meter, SerializedBlockTemplate, } from 'ironfish'


// TODO: Replace all of this with PartialHeaderSerde from SDK
// TODO: Refactor PartialHeaderSerde to have a 3rd-party friendlier API. hex instead of buffer, etc.
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