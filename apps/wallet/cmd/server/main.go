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
	"Music_Streaming_System/apps/wallet/internal/database"
	deliveryGRPC "Music_Streaming_System/apps/wallet/internal/delivery/grpc"
	deliveryHTTP "Music_Streaming_System/apps/wallet/internal/delivery/http"
	"Music_Streaming_System/apps/wallet/internal/repository"
	"Music_Streaming_System/apps/wallet/internal/service"
	walletpb "Music_Streaming_System/packages/shared-proto/wallet"

	"github.com/gin-gonic/gin"
	_ "github.com/lib/pq"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

const maxWebhookBodyBytes int64 = 64 * 1024

func main() {
	cfg := config.LoadConfig()
	tlsConfig, err := config.BuildServerTLSConfig(cfg.GRPCTLS)
	if err != nil {
		log.Fatalf("Không thể cấu hình Wallet gRPC TLS: %v", err)
	}

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
	defer db.Close()

	migrationCtx, migrationCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer migrationCancel()
	if err := database.ApplyMigrations(migrationCtx, db); err != nil {
		log.Fatalf("Không thể áp dụng Wallet migrations: %v", err)
	}
	log.Println("Wallet database migrations are up to date")

	repo := repository.NewPostgresRepository(db)
	walletService := service.NewWalletService(repo, db, cfg)

	grpcHandler := deliveryGRPC.NewWalletGRPCHandler(walletService)

	momoHandler := deliveryHTTP.NewMomoHTTPHandler(walletService)
	nfbankHandler := deliveryHTTP.NewNFBankHandler(walletService, cfg)

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	grpcOptions := []grpc.ServerOption{
		grpc.UnaryInterceptor(deliveryGRPC.InternalAuthInterceptor(cfg.InternalGRPCToken)),
	}
	if tlsConfig != nil {
		grpcOptions = append(grpcOptions, grpc.Creds(credentials.NewTLS(tlsConfig)))
		log.Printf("Wallet gRPC TLS enabled (mTLS: %t)", cfg.GRPCTLS.ClientCAFile != "")
	} else {
		if cfg.AllowInsecureBind {
			log.Println("WARNING: Wallet gRPC TLS is disabled with an explicitly allowed non-loopback bind; deploy only behind a verified private network policy")
		} else {
			log.Println("WARNING: Wallet gRPC TLS is disabled; listener is restricted to loopback")
		}
	}
	grpcServer := grpc.NewServer(grpcOptions...)
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
	router.Use(func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxWebhookBodyBytes)
		c.Next()
	})

	router.POST("/v1/wallet/webhook/momo", momoHandler.HandleWebhook)
	router.POST("/v1/wallet/webhook/nfbank", nfbankHandler.HandleWebhook)

	httpServer := &http.Server{
		Addr:              cfg.HTTPPort,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
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

	fmt.Println("Wallet Service đã tắt")
}
