/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { NoteEncryptedHash } from '../primitives/noteEncrypted'
import { NullifierHash } from '../primitives/nullifier'
import { Target } from '../primitives/target'
import { BigIntUtils } from '../utils'
import { Serde } from '.'

export default class PartialBlockHeaderSerde implements Serde<PartialBlockHeader, Buffer> {
  serialize(header: PartialBlockHeader): Buffer {
    const bw = bufio.write(200)
    bw.writeU64(header.sequence)
    bw.writeHash(header.previousBlockHash)
    bw.writeHash(header.noteCommitment.commitment)
    bw.writeU64(header.noteCommitment.size)
    bw.writeHash(header.nullifierCommitment.commitment)
    bw.writeU64(header.nullifierCommitment.size)
    bw.writeBytes(BigIntUtils.toBytesBE(header.target.asBigInt(), 32))
    bw.writeU64(header.timestamp.getTime())
    bw.writeBytes(BigIntUtils.toBytesBE(header.minersFee, 8))
    bw.writeBytes(header.graffiti)
    return bw.render()
  }

  deserialize(data: Buffer): PartialBlockHeader {
    const br = bufio.read(data)
    console.log('yup', br)
    const sequence = br.readU64()
    console.log('sequence', sequence)
    const previousBlockHash = br.readHash()
    console.log('prev block hash', previousBlockHash)
    const noteCommitment = br.readHash()
    console.log('note commitment', noteCommitment)
    const noteCommitmentSize = br.readU64()
    console.log('note commitment size', noteCommitmentSize)
    const nullifierCommitment = br.readHash()
    console.log('nullifier commitment', nullifierCommitment)
    const nullifierCommitmentSize = br.readU64()
    console.log('nullifier commitment size', nullifierCommitmentSize)
    const target = br.readBytes(32)
    console.log('target', target)
    const timestamp = br.readU64()
    console.log('timestamp', timestamp)
    const minersFee = br.readBytes(8)
    console.log('minersFee', minersFee)
    const graffiti = br.readBytes(32)
    console.log('graffiti', graffiti)

    return {
      sequence: sequence,
      previousBlockHash: previousBlockHash,
      target: new Target(target),
      timestamp: new Date(timestamp),
      minersFee: BigIntUtils.fromBytes(minersFee),
      graffiti: graffiti,
      noteCommitment: {
        commitment: noteCommitment,
        size: noteCommitmentSize,
      },
      nullifierCommitment: {
        commitment: nullifierCommitment,
        size: nullifierCommitmentSize,
      },
    }
  }

  equals(): boolean {
    throw new Error('You should never use this')
  }
}

type PartialBlockHeader = {
  sequence: number
  previousBlockHash: Buffer
  noteCommitment: {
    commitment: NoteEncryptedHash
    size: number
  }
  nullifierCommitment: {
    commitment: NullifierHash
    size: number
  }
  target: Target
  timestamp: Date
  minersFee: bigint
  graffiti: Buffer
}
