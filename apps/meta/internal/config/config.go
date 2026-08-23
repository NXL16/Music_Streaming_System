package config

import (
	"github.com/joho/godotenv"
	"log"
	"os"
	"strings"
)

type Config struct {
	GRPCListenAddr    string
	MongoURI          string
	MongoDBName       string
	InternalGRPCToken string
	GRPCTLS           GRPCTLSConfig
}

type GRPCTLSConfig struct {
	Enabled      bool
	CertFile     string
	KeyFile      string
	ClientCAFile string
}

func LoadConfig() *Config {
	_ = godotenv.Load()
	return &Config{
		MongoURI:          mustGetEnv("MONGO_URI"),
		MongoDBName:       mustGetEnv("MONGO_DB_NAME"),
		GRPCListenAddr:    grpcListenAddr(),
		InternalGRPCToken: mustGetSecretEnv("INTERNAL_GRPC_TOKEN"),
		GRPCTLS:           loadGRPCTLSConfig(),
	}
}

// META_GRPC_LISTEN_ADDR makes the exposed network interface explicit. The
// legacy port setting remains a loopback-only fallback for local development.
func grpcListenAddr() string {
	if address := strings.TrimSpace(os.Getenv("META_GRPC_LISTEN_ADDR")); address != "" {
		return address
	}
	return "127.0.0.1:" + mustGetEnv("META_GRPC_PORT")
}

func loadGRPCTLSConfig() GRPCTLSConfig {
	enabled := optionalBoolEnv("META_GRPC_TLS_ENABLED", false)
	if !enabled {
		return GRPCTLSConfig{}
	}

	return GRPCTLSConfig{
		Enabled:      true,
		CertFile:     mustGetEnv("META_GRPC_TLS_CERT_FILE"),
		KeyFile:      mustGetEnv("META_GRPC_TLS_KEY_FILE"),
		ClientCAFile: strings.TrimSpace(os.Getenv("META_GRPC_TLS_CLIENT_CA_FILE")),
	}
}

func mustGetEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatalf("Fatal: Missing env %s", key)
	}
	return value
}

func mustGetSecretEnv(key string) string {
	value := mustGetEnv(key)
	if len(value) < 32 {
		log.Fatalf("Fatal: %s must be at least 32 characters", key)
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
		log.Fatalf("Fatal: %s must be true or false", key)
		return fallback
	}
}
