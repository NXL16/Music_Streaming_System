package config

import (
	"log"
	"net"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DatabaseURL       string
	SecretKey         string
	GRPCPort          string
	HTTPPort          string
	InternalGRPCToken string
	GRPCTLS           GRPCTLSConfig
	AllowInsecureBind bool

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
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		SecretKey:         os.Getenv("SECRET_KEY"),
		GRPCPort:          os.Getenv("GRPC_PORT"),
		HTTPPort:          os.Getenv("HTTP_PORT"),
		InternalGRPCToken: os.Getenv("INTERNAL_GRPC_TOKEN"),
		GRPCTLS:           loadGRPCTLSConfig(),
		AllowInsecureBind: optionalBoolEnv("WALLET_GRPC_ALLOW_INSECURE_BIND", false),

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
		NFBankAPIURL:      firstEnv("NFBANK_API_BASE_URL", "NFBANK_API_URL"),
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
	if cfg.GRPCPort == "" || cfg.HTTPPort == "" {
		log.Fatal("Lỗi cấu hình: GRPC_PORT và HTTP_PORT không được để trống")
	}
	if len(cfg.InternalGRPCToken) < 32 {
		log.Fatal("Lỗi cấu hình: INTERNAL_GRPC_TOKEN phải có ít nhất 32 ký tự")
	}
	if !cfg.GRPCTLS.Enabled && !cfg.AllowInsecureBind && !isLoopbackListenAddr(cfg.GRPCPort) {
		log.Fatal("Lỗi cấu hình: Wallet gRPC không có TLS chỉ được bind loopback; bật TLS/mTLS hoặc set WALLET_GRPC_ALLOW_INSECURE_BIND=true sau khi xác nhận private network policy")
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

func firstEnv(keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}

func isLoopbackListenAddr(address string) bool {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return false
	}
	if strings.EqualFold(host, "localhost") {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

type GRPCTLSConfig struct {
	Enabled      bool
	CertFile     string
	KeyFile      string
	ClientCAFile string
}

func loadGRPCTLSConfig() GRPCTLSConfig {
	if !optionalBoolEnv("WALLET_GRPC_TLS_ENABLED", false) {
		return GRPCTLSConfig{}
	}

	return GRPCTLSConfig{
		Enabled:      true,
		CertFile:     mustGetEnv("WALLET_GRPC_TLS_CERT_FILE"),
		KeyFile:      mustGetEnv("WALLET_GRPC_TLS_KEY_FILE"),
		ClientCAFile: strings.TrimSpace(os.Getenv("WALLET_GRPC_TLS_CLIENT_CA_FILE")),
	}
}

func mustGetEnv(key string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		log.Fatalf("Lỗi cấu hình: %s không được để trống", key)
	}
	return value
}

func optionalBoolEnv(key string, fallback bool) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	switch value {
	case "true":
		return true
	case "false":
		return false
	default:
		log.Fatalf("Lỗi cấu hình: %s phải là true hoặc false", key)
		return fallback
	}
}
