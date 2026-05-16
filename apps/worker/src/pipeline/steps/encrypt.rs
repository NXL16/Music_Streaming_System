use crate::crypto::aes::encrypt_aes_in_place_from_offset;
use crate::kms::client::generate_song_key;
use crate::pipeline::context::PipelineContext;
use anyhow::Context;

pub async fn encrypt(ctx: &mut PipelineContext) -> anyhow::Result<()> {
    let data = ctx
        .data
        .take()
        .context("Encrypt step: no transcoded data found in context")?;

    let encryption_start = ctx.encryption_start_offset.unwrap_or(0);
    if encryption_start >= data.len() {
        return Err(anyhow::anyhow!(
            "Encrypt step: invalid encryption_start_offset {} for data length {}",
            encryption_start,
            data.len()
        ));
    }

    let (key, iv) = generate_song_key(&ctx.job.song_id).await?;

    let mut encrypted_data = data;
    encrypt_aes_in_place_from_offset(&mut encrypted_data, &key, &iv, encryption_start);

    ctx.encryption_key = Some(key);
    ctx.encryption_iv = Some(iv);
    ctx.data = Some(encrypted_data);

    Ok(())
}
