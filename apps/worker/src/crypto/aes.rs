use aes::Aes256;
use ctr::cipher::{KeyIvInit, StreamCipher};

type Aes256Ctr = ctr::Ctr128BE<Aes256>;

// Hàm mã hóa dùng key/iv truyền vào (lấy từ KMS)
pub fn encrypt_aes_with_key(data: &[u8], key: &[u8], iv: &[u8]) -> Vec<u8> {
    let mut cipher = Aes256Ctr::new_from_slices(key, iv).unwrap();
    let mut buffer = data.to_vec();
    cipher.apply_keystream(&mut buffer);
    buffer
}