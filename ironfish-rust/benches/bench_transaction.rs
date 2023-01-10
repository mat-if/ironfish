use bls12_381::Scalar;
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use ironfish_rust::{
    assets::asset::{Asset, NATIVE_ASSET_GENERATOR},
    witness::{Witness, WitnessNode},
    MerkleNoteHash, Note, ProposedTransaction, SaplingKey,
};
use ironfish_zkp::constants::TREE_DEPTH;
use rand::{thread_rng, Rng};

fn make_fake_witness(note: &Note) -> Witness {
    let mut rng = thread_rng();
    let mut buffer = [0u8; 64];
    thread_rng().fill(&mut buffer[..]);

    let mut witness_auth_path = vec![];
    for _ in 0..TREE_DEPTH {
        witness_auth_path.push(match rng.gen() {
            false => WitnessNode::Left(Scalar::from(rng.gen::<u64>())),
            true => WitnessNode::Right(Scalar::from(rng.gen::<u64>())),
        })
    }
    let root_hash = auth_path_to_root_hash(&witness_auth_path, note.commitment_point());
    Witness {
        auth_path: witness_auth_path,
        root_hash,
        tree_size: 1400,
    }
}

pub(crate) fn auth_path_to_root_hash(
    auth_path: &[WitnessNode<Scalar>],
    child_hash: Scalar,
) -> Scalar {
    let mut cur = child_hash;

    for (i, node) in auth_path.iter().enumerate() {
        cur = match node {
            WitnessNode::Left(ref sibling_hash) => {
                MerkleNoteHash::combine_hash(i, &cur, &sibling_hash.clone())
            }
            WitnessNode::Right(ref sibling_hash) => {
                MerkleNoteHash::combine_hash(i, &sibling_hash.clone(), &cur)
            }
        }
    }

    cur
}

fn transaction_simple(_n: u64) {
    let key = SaplingKey::generate_key();
    let spend_note = Note::new(
        key.public_address(),
        10,
        "",
        NATIVE_ASSET_GENERATOR,
        key.public_address(),
    );
    let witness = make_fake_witness(&spend_note);

    let out_note = Note::new(
        key.public_address(),
        9,
        "",
        NATIVE_ASSET_GENERATOR,
        key.public_address(),
    );

    let mut ptx = ProposedTransaction::new(key);
    ptx.add_spend(spend_note, &witness).unwrap();
    ptx.add_output(out_note).unwrap();

    let tx = ptx.post(None, 1).unwrap();
    tx.verify().unwrap();
}

fn transaction_multiasset(_n: u64) {
    let key = SaplingKey::generate_key();
    let spend_note = Note::new(
        key.public_address(),
        10,
        "",
        NATIVE_ASSET_GENERATOR,
        key.public_address(),
    );
    let witness = make_fake_witness(&spend_note);

    let out_note = Note::new(
        key.public_address(),
        9,
        "",
        NATIVE_ASSET_GENERATOR,
        key.public_address(),
    );

    let asset = Asset::new(key.public_address(), "foocoin", "").unwrap();

    let mut ptx = ProposedTransaction::new(key);
    ptx.add_spend(spend_note, &witness).unwrap();
    ptx.add_output(out_note).unwrap();
    ptx.add_mint(asset, 10).unwrap();
    ptx.add_burn(*asset.id(), 8).unwrap();

    let tx = ptx.post(None, 1).unwrap();
    tx.verify().unwrap();
}

fn benchmark_transactions(c: &mut Criterion) {
    let mut group = c.benchmark_group("transactions");
    group.sample_size(30);

    group.bench_function("simple", |b| b.iter(|| transaction_simple(black_box(20))));

    group.bench_function("multiasset", |b| {
        b.iter(|| transaction_multiasset(black_box(20)))
    });
}

criterion_group!(benches, criterion_benchmark);
criterion_main!(benches);
