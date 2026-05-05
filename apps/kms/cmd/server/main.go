package main

import (
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"Music_Streaming_System/apps/kms/internal/config"
	"Music_Streaming_System/apps/kms/internal/repository"
	"Music_Streaming_System/apps/kms/internal/service"
	"Music_Streaming_System/packages/shared-proto/kms"

	"google.golang.org/grpc"
	"google.golang.org/grpc/keepalive"
	"google.golang.org/grpc/reflection"
)

func main() {
	cfg := config.LoadConfig()
	repo := repository.NewKeyRepository(cfg.RedisAddr, cfg.RedisPassword)

	serverOpts := []grpc.ServerOption{
		grpc.KeepaliveParams(keepalive.ServerParameters{
			MaxConnectionIdle: 5 * time.Minute,
			Time:              20 * time.Second,
			Timeout:           1 * time.Second,
		}),
	}

	s := grpc.NewServer(serverOpts...)
	kms.RegisterKeyManagementServiceServer(s, service.NewKMSService(repo))
	reflection.Register(s)

	lis, err := net.Listen("tcp", ":"+cfg.GRPCPort)
	if err != nil {
		log.Fatalf("Critical: Failed to listen: %v", err)
	}

	go func() {
		log.Printf("[KMS] Service live on %s", cfg.GRPCPort)
		if err := s.Serve(lis); err != nil {
			log.Printf("Error: Server crashed: %v", err)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	s.GracefulStop()
	repo.Close()
	log.Println("KMS Cleanly Offline")
}
