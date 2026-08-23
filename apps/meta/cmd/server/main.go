package main

import (
	"context"
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
	"google.golang.org/grpc/credentials"
)

// Keep this aligned with API and Rust Worker. The validated metadata payload
// can exceed gRPC's 4 MiB default for long tracks with dense seek tables.
const maxMetadataGRPCMessageBytes = 8 * 1024 * 1024

func main() {
	cfg := config.LoadConfig()
	tlsConfig, err := config.BuildServerTLSConfig(cfg.GRPCTLS)
	if err != nil {
		log.Fatalf("Failed to configure Meta gRPC TLS: %v", err)
	}

	connectCtx, connectCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer connectCancel()

	client, err := mongo.Connect(connectCtx, options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}

	db := client.Database(cfg.MongoDBName)
	log.Printf("Connected to MongoDB: %s", cfg.MongoDBName)

	indexCtx, indexCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer indexCancel()
	repo, err := repository.NewMetadataRepository(indexCtx, db)
	if err != nil {
		log.Fatalf("Failed to ensure MongoDB metadata indexes: %v", err)
	}
	log.Println("MongoDB metadata indexes are ready")
	metaServer := service.NewMetadataServer(repo)

	lis, err := net.Listen("tcp", cfg.GRPCListenAddr)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	grpcOptions := []grpc.ServerOption{
		grpc.UnaryInterceptor(service.InternalAuthInterceptor(cfg.InternalGRPCToken)),
		grpc.MaxRecvMsgSize(maxMetadataGRPCMessageBytes),
		grpc.MaxSendMsgSize(maxMetadataGRPCMessageBytes),
	}
	if tlsConfig != nil {
		grpcOptions = append(grpcOptions, grpc.Creds(credentials.NewTLS(tlsConfig)))
		log.Printf("Metadata gRPC TLS enabled (mTLS: %t)", cfg.GRPCTLS.ClientCAFile != "")
	} else {
		log.Println("WARNING: Metadata gRPC TLS is disabled; deploy only behind a private network policy")
	}
	grpcServer := grpc.NewServer(grpcOptions...)
	pb.RegisterMetadataServiceServer(grpcServer, metaServer)

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("Metadata Service is running at %s", cfg.GRPCListenAddr)
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
