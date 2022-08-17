/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use std::{mem::ManuallyDrop, ops::DerefMut};

use ironfish_rust::nacl::{
    self, box_message, bytes_to_secret_key, get_random_byte, new_secret_key, unbox_message,
};
use napi::{
    bindgen_prelude::*, noop_finalize, CallContext, ContextlessResult, JsBuffer, JsBufferValue,
    JsNumber, JsUndefined, Ref,
};
use napi_derive::{contextless_function, js_function, napi};

#[napi]
pub const KEY_LENGTH: u32 = nacl::KEY_LENGTH as u32;

#[napi]
pub const NONCE_LENGTH: u32 = nacl::NONCE_LENGTH as u32;

#[napi]
mod bar {
    #[napi]
    pub struct Barbar {}
}

#[napi(constructor)]
pub struct Foo {}

#[napi(object)]
pub struct FooObj {}

#[napi]
pub struct BoxKeyPair {
    public_key: Vec<u8>,
    secret_key: Vec<u8>,
    // public_key: String,
    // secret_key: String,
}

#[napi]
impl BoxKeyPair {
    #[napi(constructor)]
    #[allow(clippy::new_without_default)]
    pub fn new(mut env: Env) -> BoxKeyPair {
        // let size = std::mem::size_of::<BoxKeyPair>();
        // env.adjust_external_memory(size as i64).unwrap();
        let secret_key = new_secret_key();

        // let mut v = env.create_buffer(bytes_length as usize).unwrap();
        // let public_key = env
        //     .create_buffer_with_data(secret_key.public_key().as_bytes().to_vec())
        //     .unwrap()
        //     .into_raw();

        // let secret_key = env
        //     .create_buffer_with_data(secret_key.as_bytes().to_vec())
        //     .unwrap()
        //     .into_raw();

        // let public_key = hex::encode(secret_key.public_key());
        // let secret_key = hex::encode(secret_key.as_bytes());
        // let public_key = "".to_string();
        // let secret_key = "".to_string();

        BoxKeyPair {
            public_key: secret_key.public_key().as_bytes().to_vec(),
            secret_key: secret_key.as_bytes().to_vec(),
            // public_key: secret_key.public_key().as_bytes().to_vec().into(),
            // secret_key: secret_key.as_bytes().to_vec().into(),
            // public_key,
            // secret_key,
        }
    }

    #[napi(factory)]
    pub fn from_hex(secret_hex: String) -> napi::Result<BoxKeyPair> {
        let byte_vec = hex::decode(secret_hex)
            .map_err(|_| Error::from_reason("Unable to decode secret key".to_owned()))?;

        let bytes: [u8; nacl::KEY_LENGTH] = byte_vec
            .try_into()
            .map_err(|_| Error::from_reason("Unable to convert secret key".to_owned()))?;

        let secret_key = bytes_to_secret_key(bytes);

        // let public_key = env
        //     .create_buffer_with_data(secret_key.public_key().as_bytes().to_vec())
        //     .unwrap()
        //     .into_raw();

        // let secret_key = env
        //     .create_buffer_with_data(secret_key.as_bytes().to_vec())
        //     .unwrap()
        //     .into_raw();
        // let public_key = hex::encode(secret_key.public_key().as_bytes());
        // let secret_key = hex::encode(secret_key.as_bytes());
        // let public_key = "".to_string();
        // let secret_key = "".to_string();

        Ok(BoxKeyPair {
            public_key: secret_key.public_key().as_bytes().to_vec(),
            secret_key: secret_key.as_bytes().to_vec(),
            // public_key: secret_key.public_key().as_bytes().to_vec().into(),
            // secret_key: secret_key.as_bytes().to_vec().into(),
            // public_key,
            // secret_key,
        })
    }

    #[napi(getter)]
    pub fn public_key(&self) -> Buffer {
        // self.public_key.into_raw()
        // Buffer::from(self.public_key.as_ref())
        // Buffer::from(vec![0u8; 32])
        vec![].into()
    }

    #[napi(getter)]
    pub fn secret_key(&self) -> Buffer {
        // self.secret_key.into_raw()
        // Buffer::from(self.secret_key.as_ref())
        // Buffer::from(vec![0u8; 32])
        vec![].into()
    }
}

#[napi]
pub fn random_bytes(bytes_length: u32) -> Uint8Array {
    Uint8Array::new(nacl::random_bytes(bytes_length as usize))
}

// #[napi]
// pub fn random_bytes_buffer(env: Env, bytes_length: u32) -> JsBuffer {
//     // nacl::random_bytes(bytes_length as usize).into()
//     let x = nacl::random_bytes(bytes_length as usize);
//     let v = env.create_buffer_copy(x);
//     // let v = env.create_buffer_with_data(x);

//     v.unwrap().into_raw()
//     // Vec::with_capacity(bytes_length as usize).into()
//     // [0u8; 32].to_vec().into()
// }

#[napi]
pub fn random_bytes_buffer(env: Env, bytes_length: u32) -> Buffer {
    nacl::random_bytes(bytes_length as usize).into()
}

#[napi]
pub fn random_bytes_string(bytes_length: u32) -> String {
    hex::encode(nacl::random_bytes(bytes_length as usize))
}

#[napi]
pub fn random_bytes_vec(env: Env, bytes_length: u32) -> JsBuffer {
    let mut v = env.create_buffer(bytes_length as usize).unwrap();

    nacl::random_bytes_fill(v.as_mut());

    v.into_raw()
}

#[napi(object)]
pub struct BoxedMessage {
    pub nonce: String,
    pub boxed_message: String,
}

#[napi(js_name = "boxMessage")]
pub fn native_box_message(
    plaintext: String,
    sender_secret_key: Uint8Array,
    recipient_public_key: String,
) -> Result<BoxedMessage> {
    let sender: [u8; 32] = sender_secret_key
        .to_vec()
        .try_into()
        .map_err(|_| Error::from_reason("Unable to convert sender secret key".to_owned()))?;

    let decoded_recipient = base64::decode(recipient_public_key)
        .map_err(|_| Error::from_reason("Unable to decode recipient public key".to_owned()))?;

    let recipient: [u8; 32] = decoded_recipient
        .try_into()
        .map_err(|_| Error::from_reason("Unable to convert recipient public key".to_owned()))?;

    let (nonce, ciphertext) = box_message(plaintext, sender, recipient)
        .map_err(|_| Error::from_reason("Unable to box message".to_owned()))?;

    Ok(BoxedMessage {
        nonce: base64::encode(nonce),
        boxed_message: base64::encode(ciphertext),
    })
}

#[napi(js_name = "unboxMessage")]
pub fn native_unbox_message(
    boxed_message: String,
    nonce: String,
    sender_public_key: String,
    recipient_secret_key: Uint8Array,
) -> Result<String> {
    let decoded_sender = base64::decode(sender_public_key)
        .map_err(|_| Error::from_reason("Unable to decode sender public key".to_owned()))?;

    let sender: [u8; 32] = decoded_sender
        .try_into()
        .map_err(|_| Error::from_reason("Unable to convert sender public key".to_owned()))?;

    let recipient: [u8; 32] = recipient_secret_key
        .to_vec()
        .try_into()
        .map_err(|_| Error::from_reason("Unable to convert recipient secret key".to_owned()))?;

    let decoded_nonce = base64::decode(nonce)
        .map_err(|_| Error::from_reason("Unable to decode nonce".to_owned()))?;

    let decoded_ciphertext = base64::decode(boxed_message)
        .map_err(|_| Error::from_reason("Unable to decode boxed_message".to_owned()))?;

    unbox_message(&decoded_ciphertext, &decoded_nonce, sender, recipient)
        .map_err(|e| Error::from_reason(format!("Unable to unbox message: {}", e)))
}
