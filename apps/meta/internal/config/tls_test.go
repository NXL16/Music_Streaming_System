package config

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestBuildServerTLSConfigDisabled(t *testing.T) {
	tlsConfig, err := BuildServerTLSConfig(GRPCTLSConfig{})
	if err != nil {
		t.Fatalf("BuildServerTLSConfig returned error: %v", err)
	}
	if tlsConfig != nil {
		t.Fatal("expected nil config when TLS is disabled")
	}
}

func TestBuildServerTLSConfigEnablesMutualTLSWhenClientCAConfigured(t *testing.T) {
	dir := t.TempDir()
	caCertificate, caKey := createCertificateAuthority(t)
	serverCertificate, serverKey := createLeafCertificate(t, caCertificate, caKey)
	caFile := writePEM(t, dir, "ca.pem", "CERTIFICATE", caCertificate.Raw)
	certificateFile := writePEM(t, dir, "server.pem", "CERTIFICATE", serverCertificate.Raw)
	keyFile := writePEM(t, dir, "server-key.pem", "RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(serverKey))

	tlsConfig, err := BuildServerTLSConfig(GRPCTLSConfig{
		Enabled:      true,
		CertFile:     certificateFile,
		KeyFile:      keyFile,
		ClientCAFile: caFile,
	})
	if err != nil {
		t.Fatalf("BuildServerTLSConfig returned error: %v", err)
	}
	if tlsConfig.MinVersion != tls.VersionTLS12 {
		t.Fatalf("MinVersion = %d, want TLS 1.2", tlsConfig.MinVersion)
	}
	if tlsConfig.ClientAuth != tls.RequireAndVerifyClientCert {
		t.Fatalf("ClientAuth = %d, want RequireAndVerifyClientCert", tlsConfig.ClientAuth)
	}
	if tlsConfig.ClientCAs == nil || len(tlsConfig.Certificates) != 1 {
		t.Fatal("expected both server and client certificate trust to be configured")
	}
}

func createCertificateAuthority(t *testing.T) (*x509.Certificate, *rsa.PrivateKey) {
	t.Helper()
	key := generateKey(t)
	template := certificateTemplate("Meta Test CA")
	template.IsCA = true
	template.BasicConstraintsValid = true
	template.KeyUsage = x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatalf("create CA certificate: %v", err)
	}
	certificate, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse CA certificate: %v", err)
	}
	return certificate, key
}

func createLeafCertificate(
	t *testing.T,
	issuer *x509.Certificate,
	issuerKey *rsa.PrivateKey,
) (*x509.Certificate, *rsa.PrivateKey) {
	t.Helper()
	key := generateKey(t)
	template := certificateTemplate("metadata.internal")
	template.DNSNames = []string{"metadata.internal"}
	template.KeyUsage = x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment
	template.ExtKeyUsage = []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}
	der, err := x509.CreateCertificate(rand.Reader, template, issuer, &key.PublicKey, issuerKey)
	if err != nil {
		t.Fatalf("create server certificate: %v", err)
	}
	certificate, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatalf("parse server certificate: %v", err)
	}
	return certificate, key
}

func certificateTemplate(commonName string) *x509.Certificate {
	return &x509.Certificate{
		SerialNumber: big.NewInt(time.Now().UnixNano()),
		Subject:      pkix.Name{CommonName: commonName},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
	}
}

func generateKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}
	return key
}

func writePEM(t *testing.T, dir, name, blockType string, bytes []byte) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, pem.EncodeToMemory(&pem.Block{Type: blockType, Bytes: bytes}), 0o600); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return path
}
