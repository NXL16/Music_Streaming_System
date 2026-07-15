package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
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
	cfg := config.LoadConfig()

	connectCtx, connectCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer connectCancel()

	client, err := mongo.Connect(connectCtx, options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}

	db := client.Database(cfg.MongoDBName)
	log.Printf("Connected to MongoDB: %s", cfg.MongoDBName)

	repo := repository.NewMetadataRepository(db)
	metaServer := service.NewMetadataServer(repo)

	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", cfg.GRPCPort))
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterMetadataServiceServer(grpcServer, metaServer)

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("Metadata Service is running on port: %s", cfg.GRPCPort)
		if err := grpcServer.Serve(lis); err != nil {
			log.Printf("gRPC Server stopped: %v", err)
		}
	}()

	<-stopChan
	log.Println("Shutting down Metadata Service...")

	grpcServer.GracefulStop()

	disconnectCtx, disconnectCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer disconnectCancel()
	if err := client.Disconnect(disconnectCtx); err != nil {
		log.Printf("Error disconnecting MongoDB: %v", err)
	}

	log.Println("Metadata Service stopped")
}
