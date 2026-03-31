package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"golang.org/x/crypto/argon2"
)

var ErrVaultLocked = errors.New("数据文件已加密，请先解锁")

const (
	encryptionFormatVersion = 1
)

// SecurityInfo 当前数据文件的安全状态
type SecurityInfo struct {
	Encrypted bool `json:"encrypted"`
	Unlocked  bool `json:"unlocked"`
}

// VaultKDFConfig 密钥派生配置
type VaultKDFConfig struct {
	Name    string `json:"name"`
	Salt    string `json:"salt"`
	Time    uint32 `json:"time"`
	Memory  uint32 `json:"memory"`
	Threads uint8  `json:"threads"`
	KeyLen  uint32 `json:"key_len"`
}

// VaultCipherConfig 密文配置
type VaultCipherConfig struct {
	Name  string `json:"name"`
	Nonce string `json:"nonce"`
	Data  string `json:"data"`
}

// EncryptedVaultFile 加密后的文件结构
type EncryptedVaultFile struct {
	Version   int               `json:"version"`
	Encrypted bool              `json:"encrypted"`
	KDF       VaultKDFConfig    `json:"kdf"`
	Cipher    VaultCipherConfig `json:"cipher"`
}

func (pm *PasswordManager) GetSecurityInfo() (SecurityInfo, error) {
	encrypted, err := pm.isEncryptedFile()
	if err != nil {
		return SecurityInfo{
			Encrypted: true,
			Unlocked:  false,
		}, err
	}

	if !encrypted && len(pm.sessionKey) > 0 {
		pm.clearSecuritySession()
	}

	return SecurityInfo{
		Encrypted: encrypted,
		Unlocked:  !encrypted || len(pm.sessionKey) > 0,
	}, nil
}

func (pm *PasswordManager) EnableEncryption(password string) error {
	if password == "" {
		return fmt.Errorf("主密码不能为空")
	}

	encrypted, err := pm.isEncryptedFile()
	if err != nil {
		return err
	}
	if encrypted {
		return fmt.Errorf("当前文件已启用加密")
	}

	accounts, err := pm.loadAccounts()
	if err != nil {
		return err
	}

	kdfConfig, err := newVaultKDFConfig()
	if err != nil {
		return err
	}

	key, err := deriveKey(password, kdfConfig)
	if err != nil {
		return err
	}

	encryptedData, err := encryptAccounts(accounts, key, kdfConfig)
	if err != nil {
		return err
	}

	if err := os.WriteFile(pm.getDataFile(), encryptedData, 0600); err != nil {
		return fmt.Errorf("保存加密账号文件失败: %w", err)
	}

	pm.sessionKey = key
	pm.kdfConfig = &kdfConfig

	return nil
}

func (pm *PasswordManager) DisableEncryption(password string) error {
	if password == "" {
		return fmt.Errorf("主密码不能为空")
	}

	payload, err := pm.readEncryptedVaultFile()
	if err != nil {
		return err
	}

	key, err := deriveKey(password, payload.KDF)
	if err != nil {
		return err
	}

	accounts, err := decryptAccounts(*payload, key)
	if err != nil {
		return fmt.Errorf("主密码错误或文件已损坏")
	}

	plainData, err := json.MarshalIndent(accounts, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化账号数据失败: %w", err)
	}

	if err := os.WriteFile(pm.getDataFile(), plainData, 0600); err != nil {
		return fmt.Errorf("保存账号文件失败: %w", err)
	}

	pm.clearSecuritySession()
	return nil
}

func (pm *PasswordManager) Unlock(password string) error {
	if password == "" {
		return fmt.Errorf("主密码不能为空")
	}

	payload, err := pm.readEncryptedVaultFile()
	if err != nil {
		return err
	}

	key, err := deriveKey(password, payload.KDF)
	if err != nil {
		return err
	}

	if _, err := decryptAccounts(*payload, key); err != nil {
		return fmt.Errorf("主密码错误或文件已损坏")
	}

	pm.sessionKey = key
	pm.kdfConfig = &payload.KDF

	return nil
}

func (pm *PasswordManager) Lock() {
	pm.clearSecuritySession()
}

func (pm *PasswordManager) clearSecuritySession() {
	for i := range pm.sessionKey {
		pm.sessionKey[i] = 0
	}

	pm.sessionKey = nil
	pm.kdfConfig = nil
}

func (pm *PasswordManager) marshalAccountsForStorage(accounts []Account) ([]byte, error) {
	encrypted, err := pm.isEncryptedFile()
	if err != nil {
		return nil, err
	}

	if !encrypted {
		if len(pm.sessionKey) > 0 {
			pm.clearSecuritySession()
		}

		data, marshalErr := json.MarshalIndent(accounts, "", "  ")
		if marshalErr != nil {
			return nil, fmt.Errorf("序列化账号数据失败: %v", marshalErr)
		}

		return data, nil
	}

	if len(pm.sessionKey) > 0 && pm.kdfConfig != nil {
		encryptedData, encryptErr := encryptAccounts(accounts, pm.sessionKey, *pm.kdfConfig)
		if encryptErr != nil {
			return nil, encryptErr
		}

		return encryptedData, nil
	}

	return nil, ErrVaultLocked
}

func (pm *PasswordManager) readDataFile() ([]byte, error) {
	filePath := pm.getDataFile()
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return nil, nil
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("读取账号文件失败: %v", err)
	}

	return data, nil
}

func (pm *PasswordManager) isEncryptedFile() (bool, error) {
	data, err := pm.readDataFile()
	if err != nil {
		return false, err
	}

	if len(data) == 0 {
		return false, nil
	}

	_, encrypted, err := parseEncryptedVaultFile(data)
	return encrypted, err
}

func (pm *PasswordManager) readEncryptedVaultFile() (*EncryptedVaultFile, error) {
	data, err := pm.readDataFile()
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return nil, fmt.Errorf("当前文件未启用加密")
	}

	payload, encrypted, err := parseEncryptedVaultFile(data)
	if err != nil {
		return nil, err
	}
	if !encrypted {
		return nil, fmt.Errorf("当前文件未启用加密")
	}

	return payload, nil
}

func parseEncryptedVaultFile(data []byte) (*EncryptedVaultFile, bool, error) {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return nil, false, nil
	}

	var preview struct {
		Encrypted bool `json:"encrypted"`
	}
	if err := json.Unmarshal(trimmed, &preview); err != nil {
		if looksLikeEncryptedPayload(trimmed) {
			return nil, false, fmt.Errorf("解析加密账号数据失败: %w", err)
		}

		return nil, false, nil
	}
	if !preview.Encrypted {
		return nil, false, nil
	}

	var payload EncryptedVaultFile
	if err := json.Unmarshal(trimmed, &payload); err != nil {
		return nil, false, fmt.Errorf("解析加密账号数据失败: %w", err)
	}

	if err := validateEncryptedVaultFile(payload); err != nil {
		return nil, false, err
	}

	return &payload, true, nil
}

func validateEncryptedVaultFile(payload EncryptedVaultFile) error {
	if payload.KDF.Name == "" || payload.KDF.Salt == "" {
		return fmt.Errorf("加密账号文件缺少密钥派生配置")
	}

	if payload.Cipher.Name == "" || payload.Cipher.Nonce == "" || payload.Cipher.Data == "" {
		return fmt.Errorf("加密账号文件缺少密文配置")
	}

	return nil
}

func looksLikeEncryptedPayload(data []byte) bool {
	return bytes.Contains(data, []byte(`"encrypted"`)) ||
		bytes.Contains(data, []byte(`"kdf"`)) ||
		bytes.Contains(data, []byte(`"cipher"`)) ||
		bytes.Contains(data, []byte(`"version"`))
}

func newVaultKDFConfig() (VaultKDFConfig, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return VaultKDFConfig{}, fmt.Errorf("生成盐值失败: %w", err)
	}

	return VaultKDFConfig{
		Name:    "argon2id",
		Salt:    base64.StdEncoding.EncodeToString(salt),
		Time:    1,
		Memory:  64 * 1024,
		Threads: 4,
		KeyLen:  32,
	}, nil
}

func deriveKey(password string, config VaultKDFConfig) ([]byte, error) {
	if config.Name != "argon2id" {
		return nil, fmt.Errorf("不支持的密钥派生算法: %s", config.Name)
	}

	salt, err := base64.StdEncoding.DecodeString(config.Salt)
	if err != nil {
		return nil, fmt.Errorf("解析盐值失败: %w", err)
	}

	key := argon2.IDKey([]byte(password), salt, config.Time, config.Memory, config.Threads, config.KeyLen)
	return key, nil
}

func encryptAccounts(accounts []Account, key []byte, config VaultKDFConfig) ([]byte, error) {
	plainData, err := json.Marshal(accounts)
	if err != nil {
		return nil, fmt.Errorf("序列化账号数据失败: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("创建加密器失败: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("初始化加密模式失败: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, fmt.Errorf("生成随机数失败: %w", err)
	}

	ciphertext := gcm.Seal(nil, nonce, plainData, nil)
	payload := EncryptedVaultFile{
		Version:   encryptionFormatVersion,
		Encrypted: true,
		KDF:       config,
		Cipher: VaultCipherConfig{
			Name:  "aes-256-gcm",
			Nonce: base64.StdEncoding.EncodeToString(nonce),
			Data:  base64.StdEncoding.EncodeToString(ciphertext),
		},
	}

	data, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("序列化加密文件失败: %w", err)
	}

	return data, nil
}

func decryptAccounts(payload EncryptedVaultFile, key []byte) ([]Account, error) {
	if payload.Cipher.Name != "aes-256-gcm" {
		return nil, fmt.Errorf("不支持的加密算法: %s", payload.Cipher.Name)
	}

	nonce, err := base64.StdEncoding.DecodeString(payload.Cipher.Nonce)
	if err != nil {
		return nil, fmt.Errorf("解析随机数失败: %w", err)
	}

	ciphertext, err := base64.StdEncoding.DecodeString(payload.Cipher.Data)
	if err != nil {
		return nil, fmt.Errorf("解析密文失败: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("创建解密器失败: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("初始化解密模式失败: %w", err)
	}

	plainData, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, err
	}

	var accounts []Account
	if err := json.Unmarshal(plainData, &accounts); err != nil {
		return nil, fmt.Errorf("解析解密后的账号数据失败: %w", err)
	}

	return accounts, nil
}
