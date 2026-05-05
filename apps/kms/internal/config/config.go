package config

import (
	"github.com/joho/godotenv"
	"log"
	"os"
)

type Config struct {
	RedisAddr     string
	RedisPassword string
	GRPCPort      string
}

func LoadConfig() *Config {
	_ = godotenv.Load()
	return &Config{
		RedisAddr:     mustGetEnv("REDIS_HOST") + ":" + mustGetEnv("REDIS_PORT"),
		RedisPassword: mustGetEnv("REDIS_PASSWORD"),
		GRPCPort:      mustGetEnv("GRPC_PORT"),
	}
}

func mustGetEnv(key string) string {
	value := os.Getenv(key)
	if value == "" {
		log.Fatalf("Fatal: Missing env %s", key)
	}
	return value
}
