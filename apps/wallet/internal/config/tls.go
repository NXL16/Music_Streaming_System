package config

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"
)

// BuildServerTLSConfig returns nil only for a deliberately private local
// deployment. Supplying a client CA enables mutual TLS for every gRPC caller.
func BuildServerTLSConfig(config GRPCTLSConfig) (*tls.Config, error) {
	if !config.Enabled {
		return nil, nil
	}

	certificate, err := tls.LoadX509KeyPair(config.CertFile, config.KeyFile)
	if err != nil {
		return nil, fmt.Errorf("load Wallet gRPC TLS certificate: %w", err)
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
		return nil, fmt.Errorf("read Wallet gRPC client CA: %w", err)
	}
	clientCAs := x509.NewCertPool()
	if !clientCAs.AppendCertsFromPEM(clientCAPEM) {
		return nil, fmt.Errorf("parse Wallet gRPC client CA %q", config.ClientCAFile)
	}
	tlsConfig.ClientCAs = clientCAs
	tlsConfig.ClientAuth = tls.RequireAndVerifyClientCert
	return tlsConfig, nil
}
