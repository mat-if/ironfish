use byteorder::{BigEndian, WriteBytesExt};
use num_bigint::BigUint;

// Javascript's Number.MAX_SAFE_INTEGER
const MAX_SAFE_INTEGER: i64 = 9007199254740991;

pub struct MineHeaderResult {
     pub randomness: f64,
     pub found_match: bool,
}

pub fn slice_to_biguint(slice: &[u8]) -> BigUint {
    BigUint::from_bytes_be(slice)
}

pub fn randomize_header(initial_randomness: i64, i: i64, mut header_bytes: &mut [u8]) -> i64 {
    let randomness = if i > MAX_SAFE_INTEGER + initial_randomness {
        i - (MAX_SAFE_INTEGER - initial_randomness) - 1
    } else {
        initial_randomness + i
    };

    header_bytes.write_f64::<BigEndian>(randomness as f64).unwrap();

    randomness
}

pub fn mine_header_batch(
    header_bytes: &mut [u8], initial_randomness: i64, target: BigUint, batch_size: i64,
) -> MineHeaderResult {
    let mut result = MineHeaderResult {
        randomness: 0.0,
        found_match: false,
    };

    for i in 0..batch_size {
        let randomness = randomize_header(initial_randomness, i, header_bytes);
        let hash = blake3::hash(&header_bytes);
        let new_target = BigUint::from_bytes_be(hash.as_bytes());

        if new_target <= target {
            result.randomness = randomness as f64;
            result.found_match = true;
            break;
        }
    }

    result
}