package config

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
)

// BuildServerTLSConfig returns nil when TLS is deliberately disabled for a
// local/private-network deployment. Supplying a client CA enables mutual TLS:
// every gRPC client must then present a certificate issued by that CA.
func BuildServerTLSConfig(config GRPCTLSConfig) (*tls.Config, error) {
	if !config.Enabled {
		return nil, nil
	}

	certificate, err := tls.LoadX509KeyPair(config.CertFile, config.KeyFile)
	if err != nil {
		return nil, fmt.Errorf("load Meta gRPC TLS certificate: %w", err)
	}

	tlsConfig := &tls.Config{
		MinVersion:   tls.VersionTLS12,
		Certificates: []tls.Certificate{certificate},
		NextProtos:   []string{"h2"},
	}
	if config.ClientCAFile == "" {
		return tlsConfig, nil
	}

	clientCAPEM, err := os.ReadFile(config.ClientCAFile)
	if err != nil {
		return nil, fmt.Errorf("read Meta gRPC client CA: %w", err)
	}
	clientCAs := x509.NewCertPool()
	if !clientCAs.AppendCertsFromPEM(clientCAPEM) {
		return nil, fmt.Errorf("parse Meta gRPC client CA %q", config.ClientCAFile)
	}
	tlsConfig.ClientCAs = clientCAs
	tlsConfig.ClientAuth = tls.RequireAndVerifyClientCert
	return tlsConfig, nil
}
