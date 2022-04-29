/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use masp_primitives::{
    constants::VALUE_COMMITMENT_RANDOMNESS_GENERATOR, primitives::ValueCommitment,
};
use masp_proofs::circuit::sapling::Output;

use super::{errors, keys::SaplingKey, merkle_note::MerkleNote, note::Note, Sapling};
use bellman::groth16;
use bls12_381::{Bls12, Scalar};
use group::Curve;
use jubjub::ExtendedPoint;
use rand::{rngs::OsRng, thread_rng, Rng};
// use zcash_primitives::primitives::ValueCommitment;
// use zcash_proofs::circuit::sapling::Output;

use std::{io, sync::Arc};

/// Parameters used when constructing proof that a new note exists. The owner
/// of this note is the recipient of funds in a transaction. The note is signed
/// with the owners public key so only they can read it.
pub struct ReceiptParams {
    /// Parameters for a Jubjub BLS12 curve. This is essentially just a global
    /// value.
    pub(crate) sapling: Arc<Sapling>,

    /// Proof that the output circuit was valid and successful
    pub(crate) proof: groth16::Proof<Bls12>,

    /// Randomness used to create the ValueCommitment point on the Merkle Note
    pub(crate) value_commitment_randomness: jubjub::Fr,

    /// Merkle note containing all the values verified by the proof. These values
    /// are shared on the blockchain and can be snapshotted into a Merkle Tree
    pub(crate) merkle_note: MerkleNote,
}

impl ReceiptParams {
    /// Construct the parameters for proving a new specific note
    pub(crate) fn new(
        sapling: Arc<Sapling>,
        spender_key: &SaplingKey,
        note: &Note,
    ) -> Result<ReceiptParams, errors::SaplingProofError> {
        let diffie_hellman_keys = note.owner.generate_diffie_hellman_keys();

        let mut buffer = [0u8; 64];
        thread_rng().fill(&mut buffer[..]);

        let value_commitment_randomness: jubjub::Fr = jubjub::Fr::from_bytes_wide(&buffer);

        // let value_commitment = ValueCommitment {
        //     value: note.value,
        //     randomness: value_commitment_randomness,
        //     // asset_generator: ExtendedPoint::from(VALUE_COMMITMENT_VALUE_GENERATOR),
        //     asset_generator: VALUE_COMMITMENT_VALUE_GENERATOR.into(),
        // };
        let value_commitment = note
            .asset_type
            .value_commitment(note.value, value_commitment_randomness);

        let merkle_note =
            MerkleNote::new(spender_key, note, &value_commitment, &diffie_hellman_keys);

        let output_circuit = Output {
            value_commitment: Some(value_commitment),
            payment_address: Some(note.owner.sapling_payment_address()),
            commitment_randomness: Some(note.randomness),
            esk: Some(diffie_hellman_keys.0),
            asset_identifier: note.asset_type.identifier_bits(),
        };
        let proof =
            groth16::create_random_proof(output_circuit, &sapling.receipt_params, &mut OsRng)?;

        let receipt_proof = ReceiptParams {
            sapling,
            proof,
            // value_commitment_randomness,
            value_commitment_randomness: note.randomness,
            merkle_note,
        };

        Ok(receipt_proof)
    }

    /// Output the committed ReceiptProof for this receiving calculation.
    ///
    /// The ReceiptProof is the publicly visible form of the new note, not
    /// including any keys or intermediate working values.
    ///
    /// Verifies the proof before returning to prevent posting broken
    /// transactions.
    pub fn post(&self) -> Result<ReceiptProof, errors::SaplingProofError> {
        println!("receipt post 1");
        let receipt_proof = ReceiptProof {
            proof: self.proof.clone(),
            merkle_note: self.merkle_note.clone(),
        };
        println!("receipt post 2");
        receipt_proof.verify_proof(&self.sapling)?;
        println!("receipt post 3");

        Ok(receipt_proof)
    }

    /// Write the signature of this proof to the provided writer.
    ///
    /// The signature is used by the transaction to calculate the signature
    /// hash. Having this data essentially binds the note to the transaction,
    /// proving that it is actually part of that transaction.
    pub(crate) fn serialize_signature_fields<W: io::Write>(&self, mut writer: W) -> io::Result<()> {
        self.proof.write(&mut writer)?;
        self.merkle_note.write(&mut writer)?;
        Ok(())
    }
}

/// The publicly visible values of a received note in a transaction. These
/// values are calculated by the spender using only the public address of the
/// owner of this new note.
///
/// This is the variation of a Receipt that gets serialized to bytes and can
/// be loaded from bytes.
#[derive(Clone)]
pub struct ReceiptProof {
    /// Proof that the output circuit was valid and successful
    pub(crate) proof: groth16::Proof<Bls12>,

    pub(crate) merkle_note: MerkleNote,
}

impl ReceiptProof {
    /// Load a ReceiptProof from a Read implementation( e.g: socket, file)
    /// This is the main entry-point when reconstructing a serialized
    /// transaction.
    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, errors::SaplingProofError> {
        let proof = groth16::Proof::read(&mut reader)?;
        let merkle_note = MerkleNote::read(&mut reader)?;

        Ok(ReceiptProof { proof, merkle_note })
    }

    /// Stow the bytes of this ReceiptProof in the given writer.
    pub fn write<W: io::Write>(&self, writer: W) -> io::Result<()> {
        self.serialize_signature_fields(writer)
    }

    /// Verify that the proof demonstrates knowledge that a note exists with
    /// the value_commitment, public_key, and note_commitment on this proof.
    pub fn verify_proof(&self, sapling: &Sapling) -> Result<(), errors::SaplingProofError> {
        if self.merkle_note.value_commitment.is_small_order().into()
            || ExtendedPoint::from(self.merkle_note.ephemeral_public_key)
                .is_small_order()
                .into()
        {
            return Err(errors::SaplingProofError::VerificationFailed);
        }
        let mut public_input = [Scalar::zero(); 5];
        let p = self.merkle_note.value_commitment.to_affine();
        public_input[0] = p.get_u();
        public_input[1] = p.get_v();

        let p = ExtendedPoint::from(self.merkle_note.ephemeral_public_key).to_affine();
        public_input[2] = p.get_u();
        public_input[3] = p.get_v();

        public_input[4] = self.merkle_note.note_commitment;

        match groth16::verify_proof(
            &sapling.receipt_verifying_key,
            &self.proof,
            &public_input[..],
        ) {
            Ok(()) => Ok(()),
            Err(e) => {
                println!("ERR: {:?}", e);
                Err(errors::SaplingProofError::VerificationFailed)
            }
            _ => Err(errors::SaplingProofError::VerificationFailed),
        }
    }
    /// Get a MerkleNote, which can be used as a node in a Merkle Tree.
    pub fn merkle_note(&self) -> MerkleNote {
        self.merkle_note.clone()
    }

    /// Write the signature of this proof to the provided writer.
    ///
    /// The signature is used by the transaction to calculate the signature
    /// hash. Having this data essentially binds the note to the transaction,
    /// proving that it is actually part of that transaction.
    pub(crate) fn serialize_signature_fields<W: io::Write>(&self, mut writer: W) -> io::Result<()> {
        self.proof.write(&mut writer)?;
        self.merkle_note.write(&mut writer)?;
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::{ReceiptParams, ReceiptProof};
    use crate::{
        keys::SaplingKey,
        note::{Memo, Note},
        sapling_bls12,
    };
    use ff::PrimeField;
    use group::Curve;
    use jubjub::ExtendedPoint;
    use masp_primitives::asset_type::AssetType;

    // #[test]
    // fn test_step_by_step() {
    //     let sapling = &*sapling_bls12::SAPLING;
    //     let spender_key: SaplingKey = SaplingKey::generate_key();
    //     let public_address = spender_key.generate_public_address();

    //     let (nsk, ak) = public_address.generate_diffie_hellman_keys();

    //     let asset_type = AssetType::new("foo".as_bytes());

    //     let mut buffer = [0u8; 64];
    //     thread_rng().fill(&mut buffer[..]);
    //     let randomness: jubjub::Fr = jubjub::Fr::from_bytes_wide(&buffer);

    //     let value_commitment = asset_type.value_commitment(5, randomness);

    //     let payment_address = public_address.sapling_payment_address();

    //     assert_eq!(true, true);
    // }

    #[test]
    fn test_receipt_round_trip() {
        let sapling = &*sapling_bls12::SAPLING;
        let spender_key: SaplingKey = SaplingKey::generate_key();
        let note = Note::new(
            spender_key.generate_public_address(),
            42,
            Memo([0; 32]),
            AssetType::new("foo".as_bytes()).unwrap(),
        );

        let receipt = ReceiptParams::new(sapling.clone(), &spender_key, &note)
            .expect("should be able to create receipt proof");
        let proof = receipt
            .post()
            .expect("Should be able to post receipt proof");
        proof.verify_proof(sapling).expect("proof should check out");

        // test serialization
        let mut serialized_proof = vec![];
        proof
            .write(&mut serialized_proof)
            .expect("Should be able to serialize proof");
        let read_back_proof: ReceiptProof = ReceiptProof::read(&mut serialized_proof[..].as_ref())
            .expect("Should be able to deserialize valid proof");

        assert_eq!(proof.proof.a, read_back_proof.proof.a);
        assert_eq!(proof.proof.b, read_back_proof.proof.b);
        assert_eq!(proof.proof.c, read_back_proof.proof.c);
        assert_eq!(
            proof.merkle_note.value_commitment.to_affine(),
            read_back_proof.merkle_note.value_commitment.to_affine()
        );
        assert_eq!(
            proof.merkle_note.note_commitment.to_repr(),
            read_back_proof.merkle_note.note_commitment.to_repr()
        );
        assert_eq!(
            ExtendedPoint::from(proof.merkle_note.ephemeral_public_key).to_affine(),
            ExtendedPoint::from(read_back_proof.merkle_note.ephemeral_public_key).to_affine()
        );
        assert_eq!(
            proof.merkle_note.encrypted_note[..],
            read_back_proof.merkle_note.encrypted_note[..]
        );
        assert_eq!(
            proof.merkle_note.note_encryption_keys[..],
            read_back_proof.merkle_note.note_encryption_keys[..]
        );

        let mut serialized_again = vec![];
        read_back_proof
            .write(&mut serialized_again)
            .expect("should be able to serialize proof again");
        assert_eq!(serialized_proof, serialized_again);
    }
}
