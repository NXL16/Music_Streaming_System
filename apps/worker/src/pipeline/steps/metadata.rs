use crate::pipeline::context::PipelineContext;
use crate::metadata::client; 
use crate::proto::metadata_service::SeekPoint;

pub struct MetadataExtractor;

impl MetadataExtractor {
    pub fn extract_seek_points(data: &[u8]) -> Vec<SeekPoint> {
        let mut seek_points = Vec::new();
        let mut current_pos = 0;
        let fragment_duration = 5.0; 
        let mut current_time = 0.0;

        while current_pos < data.len() - 8 {
            if &data[current_pos + 4..current_pos + 8] == b"moof" {
                seek_points.push(SeekPoint {
                    timestamp: current_time,
                    byte_offset: current_pos as i64,
                });
                current_time += fragment_duration;
            }
            current_pos += 1;
        }
        seek_points
    }

    pub fn generate_waveform(_data: &[u8]) -> Vec<f32> {
        (0..100).map(|i| (i as f32 * 0.1).sin().abs()).collect()
    }
}

pub async fn process(ctx: &mut PipelineContext) -> anyhow::Result<()> {
    println!("--- Step: Metadata Extraction ---");

    // Lấy dữ liệu từ Option<Vec<u8>> trong context
    let data = ctx.data.as_ref()
        .ok_or_else(|| anyhow::anyhow!("Metadata Step: No data found in context"))?;

    let seek_points = MetadataExtractor::extract_seek_points(data);
    let waveform = MetadataExtractor::generate_waveform(data);
    
    // Đảm bảo bạn đã thêm trường duration vào PipelineContext như đã bàn
    let duration = ctx.duration.unwrap_or(0.0);

    // Gọi trực tiếp hàm từ module client (kiểu static gRPC)
    client::update_technical_meta(
        ctx.job.song_id.clone(),
        duration,
        seek_points,
        waveform,
    ).await?;

    println!("Successfully pushed metadata to Go service!");
    Ok(())
}