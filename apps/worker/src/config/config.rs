use std::env;

pub struct Config {
    pub redis_host: String,
    pub redis_port: String,
    pub redis_password: String,
}

impl Config {
    pub fn load() -> Self {
        Self {
            redis_host: env::var("REDIS_HOST").unwrap(),
            redis_port: env::var("REDIS_PORT").unwrap(),
            redis_password: env::var("REDIS_PASSWORD").unwrap(),
        }
    }

    pub fn redis_url(&self) -> String {
        // encode password (để tránh lỗi @)
        let encoded = urlencoding::encode(&self.redis_password);

        format!(
            "redis://:{}@{}:{}",
            encoded,
            self.redis_host,
            self.redis_port
        )
    }
}