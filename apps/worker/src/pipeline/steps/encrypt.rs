use crate::pipeline::context::PipelineContext;
use crate::cloudflare::kv::put_song_key;
use crate::crypto::aes::encrypt_aes_with_key;
use crate::kms::client::generate_song_key;

pub async fn encrypt(ctx: &mut PipelineContext) -> anyhow::Result<()> {
    println!("🔐 Encrypting");

    let data = ctx.data.take().unwrap();
    let (key, iv) = generate_song_key(&ctx.job.song_id).await?;
    put_song_key(&ctx.job.song_id, &key, &iv).await?;
    let encrypted = encrypt_aes_with_key(&data, &key, &iv);

    ctx.data = Some(encrypted);

    Ok(())
}