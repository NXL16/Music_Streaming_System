use aes::Aes256;
use ctr::cipher::{KeyIvInit, StreamCipher, StreamCipherSeek};

#[allow(dead_code)]
type Aes256Ctr = ctr::Ctr128BE<Aes256>;

#[allow(dead_code)]
pub fn encrypt_aes_in_place_from_offset(data: &mut [u8], key: &[u8], iv: &[u8], offset: usize) {
    if offset >= data.len() {
        return;
    }
    let mut cipher = Aes256Ctr::new_from_slices(key, iv).expect("invalid key/iv length");
    cipher.seek(offset as u128);
    cipher.apply_keystream(&mut data[offset..]);
}
