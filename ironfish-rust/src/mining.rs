use byteorder::{BigEndian, WriteBytesExt};

const MAX_SAFE_INTEGER: i64 = 9007199254740991;

pub type Hash = blake3::Hash;
pub type BigUint = num_bigint::BigUint;

pub fn blake3(serialized_header: &[u8]) -> blake3::Hash {
    blake3::hash(&serialized_header)
}

pub fn randomize_header(initial_randomness: i64, i: i64, mut header_bytes: &mut [u8]) ->  i64 {
    let randomness = if i > MAX_SAFE_INTEGER + initial_randomness {
        i - (MAX_SAFE_INTEGER - initial_randomness) - 1
    } else {
        initial_randomness + i
    };
    header_bytes.write_f64::<BigEndian>(randomness as f64).unwrap();

    randomness
}