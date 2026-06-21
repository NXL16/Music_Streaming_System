package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"Music_Streaming_System/apps/wallet/internal/config"
	deliveryGRPC "Music_Streaming_System/apps/wallet/internal/delivery/grpc"
	deliveryHTTP "Music_Streaming_System/apps/wallet/internal/delivery/http"
	"Music_Streaming_System/apps/wallet/internal/repository"
	"Music_Streaming_System/apps/wallet/internal/service"
	walletpb "Music_Streaming_System/packages/shared-proto/wallet"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
)

func main() {
	cfg := config.LoadConfig()

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Không thể kết nối Database: %v", err)
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Fatalf("Database không phản hồi (Ping failed): %v", err)
	}

	repo := repository.NewPostgresRepository(db)
	walletService := service.NewWalletService(repo, db, cfg)

	grpcHandler := deliveryGRPC.NewWalletGRPCHandler(walletService)
	httpHandler := deliveryHTTP.NewMomoHTTPHandler(walletService)

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	grpcServer := grpc.NewServer()
	walletpb.RegisterWalletServiceServer(grpcServer, grpcHandler)

	go func() {
		listener, err := net.Listen("tcp", cfg.GRPCPort)
		if err != nil {
			log.Fatalf("Lỗi khởi chạy gRPC Server: %v", err)
		}
		fmt.Printf("[gRPC] Wallet Service đang chạy tại port %s\n", cfg.GRPCPort)
		if err := grpcServer.Serve(listener); err != nil {
			log.Printf("gRPC Server đã đóng: %v", err)
		}
	}()

	gin.SetMode(gin.ReleaseMode)
	router := gin.Default()

	router.POST("/v1/wallet/webhook/momo", httpHandler.HandleWebhook)

	httpServer := &http.Server{
		Addr:    cfg.HTTPPort,
		Handler: router,
	}

	go func() {
		fmt.Printf("[HTTP] Webhook Server đang chạy tại port %s\n", cfg.HTTPPort)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Lỗi khởi chạy HTTP Server: %v", err)
		}
	}()

	<-stopChan
	fmt.Println("\nĐang tắt các dịch vụ của Wallet Service...")

	grpcServer.GracefulStop()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("Lỗi khi tắt HTTP Server: %v", err)
	}

	db.Close()
	fmt.Println("Wallet Service đã tắt")
}
