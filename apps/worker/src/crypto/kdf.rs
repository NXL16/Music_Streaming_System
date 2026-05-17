use anyhow::Result;
use hkdf::Hkdf;
use sha2::Sha256;

const KEY_INFO: &[u8] = b"music-stream:v1:key";
const IV_INFO: &[u8] = b"music-stream:v1:iv";
const KEY_LEN: usize = 32;
const IV_LEN: usize = 16;

pub fn derive_song_key(master_secret: &[u8], song_id: &str) -> Result<(Vec<u8>, Vec<u8>)> {
    let hk = Hkdf::<Sha256>::new(Some(song_id.as_bytes()), master_secret);

    let mut key = vec![0_u8; KEY_LEN];
    hk.expand(KEY_INFO, &mut key)
        .map_err(|_| anyhow::anyhow!("HKDF expand failed for encryption key"))?;

    let mut iv = vec![0_u8; IV_LEN];
    hk.expand(IV_INFO, &mut iv)
        .map_err(|_| anyhow::anyhow!("HKDF expand failed for IV"))?;

    Ok((key, iv))
}
