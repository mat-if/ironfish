/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#[macro_use]
extern crate lazy_static;

use bellman::groth16;
use bls12_381::Bls12;

mod serializing;

pub mod errors;
pub mod keys;
pub mod merkle_note;
pub mod merkle_note_hash;
pub mod mining;
pub mod nacl;
pub mod note;
pub mod receiving;
pub mod sapling_bls12;
pub mod spending;
pub mod transaction;
pub mod witness;
pub use {
    keys::{IncomingViewKey, OutgoingViewKey, PublicAddress, SaplingKey, ViewKeys},
    merkle_note::MerkleNote,
    merkle_note_hash::MerkleNoteHash,
    note::Note,
    receiving::{ReceiptParams, ReceiptProof},
    spending::{SpendParams, SpendProof},
    transaction::{ProposedTransaction, RustFoo, Transaction},
};

#[cfg(test)]
pub(crate) mod test_util; // I'm not sure if this is the right way to publish the utility library.

// The main entry-point to the sapling API. Construct this with loaded parameters, and then call
// methods on it to do the actual work.
//
// spend and output are two arithmetic circuits for use in zksnark calculations provided by Bellman.
// Though the *_params have a verifying key on them, they are not the prepared verifying keys,
// so we store the prepared keys separately at the time of loading the params.
//
// The values are all loaded from a file in serialized form.
pub struct Sapling {
    spend_params: groth16::Parameters<Bls12>,
    receipt_params: groth16::Parameters<Bls12>,
    spend_verifying_key: groth16::PreparedVerifyingKey<Bls12>,
    receipt_verifying_key: groth16::PreparedVerifyingKey<Bls12>,
}

impl Sapling {
    /// Initialize a Sapling instance and prepare for proving. Load the parameters from a config file
    /// at a known location (`./sapling_params`, for now).
    pub fn load() -> Self {
        // TODO: We'll need to build our own parameters using a trusted set up at some point.
        // These params were borrowed from zcash
        let spend_bytes = include_bytes!("sapling_params/sapling-spend.params");
        let receipt_bytes = include_bytes!("sapling_params/sapling-output.params");

        let spend_params = Sapling::load_params(&spend_bytes[..]);
        let receipt_params = Sapling::load_params(&receipt_bytes[..]);

        let spend_vk = groth16::prepare_verifying_key(&spend_params.vk);
        let receipt_vk = groth16::prepare_verifying_key(&receipt_params.vk);

        Sapling {
            spend_verifying_key: spend_vk,
            receipt_verifying_key: receipt_vk,
            spend_params,
            receipt_params,
        }
    }

    /// Load sapling parameters from a provided filename. The parameters are huge and take a
    /// couple seconds to load. They primarily contain the "toxic waste" for a specific sapling
    /// curve.
    ///
    /// NOTE: If this is stupidly slow for you, try compiling in --release mode
    fn load_params(bytes: &[u8]) -> groth16::Parameters<Bls12> {
        groth16::Parameters::read(bytes, false).unwrap()
    }
}

#[cfg(test)]
mod test {
    use std::{collections::hash_map::DefaultHasher, time::Instant};

    use crypto_box::rand_core::OsRng;
    use cuckoofilter::CuckooFilter;
    use rand::RngCore;

    #[test]
    fn test_cuckoo() {
        let capacity = 5_000_000;

        let iterations = 5_000_000;

        let mut false_positive = 0;
        let mut false_negative = 0;

        let mut cf = CuckooFilter::<DefaultHasher>::with_capacity(capacity);

        let mut hash = [0u8; 32];

        let start = Instant::now();

        for i in 0..iterations {
            if i % (iterations / 10) == 0 {
                println!("Execution #: {}", i);
            }
            OsRng.fill_bytes(&mut hash);

            if cf.contains(&hash) {
                false_positive += 1;
            }

            let _ = cf.add(&hash);

            if !cf.contains(&hash) {
                false_negative += 1;
            }
        }

        let duration = start.elapsed().as_millis();

        let fp_percent = (false_positive as f32 / iterations as f32) * 100.0;
        println!("Mem used: {}", cf.memory_usage());
        println!("Time took: {}", duration);
        println!("False positives: {}: {}%", false_positive, fp_percent);
        println!("False negatives: {}", false_negative);
    }
}
