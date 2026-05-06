package config

import (
	"github.com/joho/godotenv"
	"log"
	"os"
)

type Config struct {
	GRPCPort    string
	MongoURI    string
	MongoDBName string
}

func LoadConfig() *Config {
	_ = godotenv.Load()
	return &Config{
		MongoURI:    mustGetEnv("MONGO_URI"),
		MongoDBName: mustGetEnv("MONGO_DB_NAME"),
		GRPCPort:    mustGetEnv("META_GRPC_PORT"),
	}
}

func mustGetEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatalf("Fatal: Missing env %s", key)
	}
	return value
}
