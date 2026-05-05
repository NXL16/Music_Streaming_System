use crate::pipeline::context::PipelineContext;
use aws_sdk_s3::primitives::ByteStream;
use anyhow::{Context, Result};
use std::env;

pub async fn upload(ctx: &mut PipelineContext) -> Result<()> {
    // 1. Lấy dữ liệu từ context (dùng take để tránh copy dữ liệu lớn)
    let data = ctx.data.take().context("No processed data found in context to upload")?;

    // 2. Khởi tạo R2 client
    // Lưu ý: Trong thực tế bạn nên để client này trong context để dùng lại
    let client = crate::r2::client::create_r2_client().await;

    // 3. Đọc cấu hình từ env
    let bucket = env::var("R2_BUCKET").context("R2_BUCKET env is not set")?;
    
    // 4. Đặt tên file đúng định dạng .m4a (vì đã transcode sang AAC/fMP4)
    // Đường dẫn này tùy thuộc vào cách bạn quản lý trên R2
    let key = format!("processed/{}.m4a", ctx.job.song_id);

    println!("☁️ Uploading processed song to R2: {}", key);

    // 5. Thực hiện upload
    client
        .put_object()
        .bucket(&bucket)
        .key(&key)
        .body(ByteStream::from(data))
        .content_type("audio/mp4") // Quan trọng: Browser cần cái này để biết là fMP4
        .send()
        .await
        .context("Failed to upload object to R2")?;

    // In ra URL để bạn tiện test/check
    let endpoint = env::var("R2_ENDPOINT").unwrap_or_default();
    println!("✅ Upload successful! URL: {}/{}/{}", endpoint, bucket, key);

    Ok(())
}