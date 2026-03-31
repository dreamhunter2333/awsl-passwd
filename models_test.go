package main

import (
	"errors"
	"os"
	"testing"
)

func TestPasswordManagerEncryptionRoundTrip(t *testing.T) {
	t.Parallel()

	manager := newPasswordManagerWithConfigDir(t.TempDir())
	accounts := []Account{
		{
			ID:       "1",
			Name:     "demo",
			Password: "secret",
			OTPKey:   "otp",
			Notes:    "note",
			Created:  1,
			Updated:  1,
		},
	}

	if err := manager.saveAccounts(accounts); err != nil {
		t.Fatalf("save plain accounts: %v", err)
	}

	if err := manager.EnableEncryption("pass123"); err != nil {
		t.Fatalf("enable encryption: %v", err)
	}

	info, err := manager.GetSecurityInfo()
	if err != nil {
		t.Fatalf("get security info after enable: %v", err)
	}
	if !info.Encrypted || !info.Unlocked {
		t.Fatalf("unexpected security info after enable: %+v", info)
	}

	loadedAccounts, err := manager.loadAccounts()
	if err != nil {
		t.Fatalf("load encrypted accounts: %v", err)
	}
	if len(loadedAccounts) != 1 || loadedAccounts[0].Password != "secret" {
		t.Fatalf("unexpected encrypted account payload: %+v", loadedAccounts)
	}

	manager.Lock()
	if _, err := manager.loadAccounts(); !errors.Is(err, ErrVaultLocked) {
		t.Fatalf("expected locked error, got: %v", err)
	}

	if err := manager.Unlock("pass123"); err != nil {
		t.Fatalf("unlock encrypted file: %v", err)
	}

	if err := manager.DisableEncryption("pass123"); err != nil {
		t.Fatalf("disable encryption: %v", err)
	}

	info, err = manager.GetSecurityInfo()
	if err != nil {
		t.Fatalf("get security info after disable: %v", err)
	}
	if info.Encrypted || !info.Unlocked {
		t.Fatalf("unexpected security info after disable: %+v", info)
	}

	loadedAccounts, err = manager.loadAccounts()
	if err != nil {
		t.Fatalf("load plain accounts: %v", err)
	}
	if len(loadedAccounts) != 1 || loadedAccounts[0].Name != "demo" {
		t.Fatalf("unexpected plain account payload: %+v", loadedAccounts)
	}
}

func TestGetSecurityInfoReturnsErrorForCorruptedEncryptedFile(t *testing.T) {
	t.Parallel()

	manager := newPasswordManagerWithConfigDir(t.TempDir())
	if err := os.WriteFile(manager.getDataFile(), []byte(`{"encrypted":true,"cipher":{}}`), 0600); err != nil {
		t.Fatalf("write corrupted file: %v", err)
	}

	info, err := manager.GetSecurityInfo()
	if err == nil {
		t.Fatal("expected security info error for corrupted encrypted file")
	}

	if !info.Encrypted || info.Unlocked {
		t.Fatalf("unexpected security info for corrupted file: %+v", info)
	}
}

func TestClearSecuritySessionWipesKeyMaterial(t *testing.T) {
	t.Parallel()

	manager := newPasswordManagerWithConfigDir(t.TempDir())
	key := []byte{1, 2, 3, 4}
	manager.sessionKey = key

	manager.clearSecuritySession()

	if manager.sessionKey != nil {
		t.Fatal("expected session key to be cleared")
	}

	for i, value := range key {
		if value != 0 {
			t.Fatalf("expected key byte %d to be wiped, got %d", i, value)
		}
	}
}

func TestSaveAccountsDoesNotReEncryptWhenFileBecomesPlaintext(t *testing.T) {
	t.Parallel()

	manager := newPasswordManagerWithConfigDir(t.TempDir())
	if err := manager.saveAccounts([]Account{{ID: "1", Name: "a"}}); err != nil {
		t.Fatalf("save plain accounts: %v", err)
	}

	if err := manager.EnableEncryption("pass123"); err != nil {
		t.Fatalf("enable encryption: %v", err)
	}

	if _, err := manager.loadAccounts(); err != nil {
		t.Fatalf("load encrypted accounts: %v", err)
	}

	if err := os.WriteFile(manager.getDataFile(), []byte("[]"), 0600); err != nil {
		t.Fatalf("rewrite plaintext file: %v", err)
	}

	if err := manager.saveAccounts([]Account{{ID: "2", Name: "b"}}); err != nil {
		t.Fatalf("save replacement accounts: %v", err)
	}

	data, err := os.ReadFile(manager.getDataFile())
	if err != nil {
		t.Fatalf("read final file: %v", err)
	}

	_, encrypted, err := parseEncryptedVaultFile(data)
	if err != nil {
		t.Fatalf("parse final file: %v", err)
	}

	if encrypted {
		t.Fatalf("file unexpectedly re-encrypted: %s", string(data))
	}
}
