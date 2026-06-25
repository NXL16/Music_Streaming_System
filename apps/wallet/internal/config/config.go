package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL string
	SecretKey   string
	GRPCPort    string
	HTTPPort    string

	// ====== CONFIG FOR MOMO ======
	MomoPartnerCode string
	MomoAccessKey   string
	MomoSecretKey   string
	MomoAPIURL      string
	MomoRedirectURL string
	MomoNotifyURL   string

	// ====== CONFIG FOR NF BANK ======
	NFBankPartnerCode string
	NFBankAccessKey   string
	NFBankSecretKey   string
	NFBankAPIURL      string
	NFBankRedirectURL string
	NFBankNotifyURL   string
}

func LoadConfig() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("Không tìm thấy file .env")
	}

	cfg := &Config{
		DatabaseURL: os.Getenv("DATABASE_URL"),
		SecretKey:   os.Getenv("SECRET_KEY"),
		GRPCPort:    os.Getenv("GRPC_PORT"),
		HTTPPort:    os.Getenv("HTTP_PORT"),

		// Map MoMo Config
		MomoPartnerCode: os.Getenv("MOMO_PARTNER_CODE"),
		MomoAccessKey:   os.Getenv("MOMO_ACCESS_KEY"),
		MomoSecretKey:   os.Getenv("MOMO_SECRET_KEY"),
		MomoAPIURL:      os.Getenv("MOMO_API_URL"),
		MomoRedirectURL: os.Getenv("MOMO_REDIRECT_URL"),
		MomoNotifyURL:   os.Getenv("MOMO_NOTIFY_URL"),

		// Map NF Bank Config
		NFBankPartnerCode: os.Getenv("NFBANK_PARTNER_CODE"),
		NFBankAccessKey:   os.Getenv("NFBANK_ACCESS_KEY"),
		NFBankSecretKey:   os.Getenv("NFBANK_SECRET_KEY"),
		NFBankAPIURL:      os.Getenv("NFBANK_API_URL"),
		NFBankRedirectURL: os.Getenv("NFBANK_REDIRECT_URL"),
		NFBankNotifyURL:   os.Getenv("NFBANK_NOTIFY_URL"),
	}

	// Validation
	if cfg.DatabaseURL == "" {
		log.Fatal("Lỗi cấu hình: DATABASE_URL không được để trống")
	}
	if cfg.SecretKey == "" {
		log.Fatal("Lỗi cấu hình: SECRET_KEY không được để trống (cần dùng để mã hóa chữ ký dữ liệu ví)")
	}

	// MoMo Check
	if cfg.MomoSecretKey == "" || cfg.MomoAccessKey == "" || cfg.MomoPartnerCode == "" {
		log.Println("[WARNING] Một số cấu hình MoMo đang bị để trống. Hãy kiểm tra lại nếu sử dụng cổng nạp tiền!")
	}

	// NF Bank Check
	if cfg.NFBankSecretKey == "" || cfg.NFBankAccessKey == "" || cfg.NFBankPartnerCode == "" {
		log.Println("[WARNING] Một số cấu hình NF Bank đang bị để trống. Hãy kiểm tra lại nếu sử dụng cổng nạp tiền!")
	}

	return cfg
}
