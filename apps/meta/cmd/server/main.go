package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"time"

	"Music_Streaming_System/apps/meta/internal/config"
	"Music_Streaming_System/apps/meta/internal/repository"
	"Music_Streaming_System/apps/meta/internal/service"
	pb "Music_Streaming_System/packages/shared-proto/metadata"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"google.golang.org/grpc"
)

func main() {
	// 1. Load config
	cfg := config.LoadConfig()

	// 2. Kết nối MongoDB
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}
	defer client.Disconnect(ctx)

	db := client.Database(cfg.MongoDBName)
	log.Printf("Connected to MongoDB: %s", cfg.MongoDBName)

	// 3. Khởi tạo Repository và Service
	repo := repository.NewMetadataRepository(db)
	metaServer := service.NewMetadataServer(repo)

	// 4. Khởi tạo gRPC Server
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", cfg.GRPCPort))
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterMetadataServiceServer(grpcServer, metaServer)

	log.Printf("Metadata Service is running on port: %s", cfg.GRPCPort)
	if err := grpcServer.Serve(lis); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}
