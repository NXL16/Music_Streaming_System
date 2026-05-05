use aws_sdk_s3::Client;
use aws_sdk_s3::config::{Credentials, Region};

pub async fn create_r2_client() -> Client {
    let access_key = std::env::var("R2_ACCESS_KEY").unwrap();
    let secret_key = std::env::var("R2_SECRET_KEY").unwrap();
    let endpoint = std::env::var("R2_ENDPOINT").unwrap();

    let region = Region::new("auto");

    let creds = Credentials::new(
        access_key,
        secret_key,
        None,
        None,
        "r2",
    );

    let config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(region)
        .credentials_provider(creds)
        .endpoint_url(endpoint)
        .load()
        .await;

    Client::new(&config)
}