package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/pquerna/otp/totp"
)

// Account 账号信息结构
type Account struct {
	ID       string `json:"id"`
	Name     string `json:"name"`     // 账号名
	Password string `json:"password"` // 密码
	OTPKey   string `json:"otp_key"`  // OTP密钥
	Notes    string `json:"notes"`    // 备注
	Created  int64  `json:"created"`  // 创建时间
	Updated  int64  `json:"updated"`  // 更新时间
}

// AccountResponse 返回给前端的账号信息
type AccountResponse struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Password     string `json:"password"`
	OTPCode      string `json:"otp_code"`      // 当前OTP验证码
	OTPKey       string `json:"otp_key"`       // OTP密钥
	OTPRemaining int    `json:"otp_remaining"` // OTP剩余时间(秒)
	Notes        string `json:"notes"`
	Created      int64  `json:"created"`
	Updated      int64  `json:"updated"`
}

// StorageInfo 当前存储配置
type StorageInfo struct {
	DataFilePath        string `json:"data_file_path"`
	DefaultDataFilePath string `json:"default_data_file_path"`
	UsingDefault        bool   `json:"using_default"`
}

// AppSettings 应用设置
type AppSettings struct {
	DataFilePath string `json:"data_file_path"`
}

// PasswordManager 密码管理器
type PasswordManager struct {
	configDir    string
	dataFilePath string
	sessionKey   []byte
	kdfConfig    *VaultKDFConfig
}

// NewPasswordManager 创建密码管理器实例
func NewPasswordManager() *PasswordManager {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		panic(fmt.Sprintf("无法获取用户目录: %v", err))
	}

	configDir := filepath.Join(homeDir, ".wails-passwd")

	return newPasswordManagerWithConfigDir(configDir)
}

func newPasswordManagerWithConfigDir(configDir string) *PasswordManager {

	// 确保目录存在
	if err := os.MkdirAll(configDir, 0700); err != nil {
		panic(fmt.Sprintf("无法创建数据目录: %v", err))
	}

	manager := &PasswordManager{
		configDir: configDir,
	}

	if err := manager.loadConfiguredDataFile(); err != nil {
		fmt.Printf("加载存储设置失败，已回退到默认路径: %v\n", err)
		manager.dataFilePath = manager.getDefaultDataFile()
	}

	return manager
}

// getDefaultDataFile 获取默认数据文件路径
func (pm *PasswordManager) getDefaultDataFile() string {
	return filepath.Join(pm.configDir, "accounts.json")
}

// getSettingsFile 获取设置文件路径
func (pm *PasswordManager) getSettingsFile() string {
	return filepath.Join(pm.configDir, "settings.json")
}

// getDataFile 获取数据文件路径
func (pm *PasswordManager) getDataFile() string {
	if pm.dataFilePath != "" {
		return pm.dataFilePath
	}

	return pm.getDefaultDataFile()
}

// GetStorageInfo 返回当前存储配置
func (pm *PasswordManager) GetStorageInfo() StorageInfo {
	defaultPath := pm.getDefaultDataFile()
	dataFilePath := pm.getDataFile()

	return StorageInfo{
		DataFilePath:        dataFilePath,
		DefaultDataFilePath: defaultPath,
		UsingDefault:        dataFilePath == defaultPath,
	}
}

// SetDataFile 设置数据文件路径并持久化
func (pm *PasswordManager) SetDataFile(dataFilePath string) error {
	normalizedPath, err := pm.normalizeDataFilePath(dataFilePath)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(normalizedPath), 0700); err != nil {
		return fmt.Errorf("创建数据文件目录失败: %w", err)
	}

	settings := AppSettings{}
	if normalizedPath != pm.getDefaultDataFile() {
		settings.DataFilePath = normalizedPath
	}

	if err := pm.saveSettings(settings); err != nil {
		return err
	}

	pm.clearSecuritySession()
	pm.dataFilePath = normalizedPath
	return nil
}

// ResetDataFile 重置为默认数据文件路径
func (pm *PasswordManager) ResetDataFile() error {
	return pm.SetDataFile(pm.getDefaultDataFile())
}

// loadConfiguredDataFile 加载已保存的数据文件路径
func (pm *PasswordManager) loadConfiguredDataFile() error {
	settings, err := pm.loadSettings()
	if err != nil {
		return err
	}

	if settings.DataFilePath == "" {
		pm.dataFilePath = pm.getDefaultDataFile()
		return nil
	}

	normalizedPath, err := pm.normalizeDataFilePath(settings.DataFilePath)
	if err != nil {
		return err
	}

	pm.dataFilePath = normalizedPath
	return nil
}

// loadSettings 读取应用设置
func (pm *PasswordManager) loadSettings() (*AppSettings, error) {
	settingsFile := pm.getSettingsFile()
	if _, err := os.Stat(settingsFile); err != nil {
		if os.IsNotExist(err) {
			return &AppSettings{}, nil
		}

		return nil, fmt.Errorf("读取设置文件状态失败: %w", err)
	}

	data, err := os.ReadFile(settingsFile)
	if err != nil {
		return nil, fmt.Errorf("读取设置文件失败: %w", err)
	}

	if len(data) == 0 {
		return &AppSettings{}, nil
	}

	var settings AppSettings
	if err := json.Unmarshal(data, &settings); err != nil {
		return nil, fmt.Errorf("解析设置文件失败: %w", err)
	}

	return &settings, nil
}

// saveSettings 保存应用设置
func (pm *PasswordManager) saveSettings(settings AppSettings) error {
	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化设置失败: %w", err)
	}

	if err := os.WriteFile(pm.getSettingsFile(), data, 0600); err != nil {
		return fmt.Errorf("保存设置文件失败: %w", err)
	}

	return nil
}

// normalizeDataFilePath 规范化数据文件路径
func (pm *PasswordManager) normalizeDataFilePath(dataFilePath string) (string, error) {
	if dataFilePath == "" {
		return "", fmt.Errorf("数据文件路径不能为空")
	}

	cleanedPath := filepath.Clean(dataFilePath)
	if filepath.IsAbs(cleanedPath) {
		return cleanedPath, nil
	}

	absolutePath, err := filepath.Abs(cleanedPath)
	if err != nil {
		return "", fmt.Errorf("解析数据文件绝对路径失败: %w", err)
	}

	return absolutePath, nil
}

// loadAccounts 从文件加载账号列表
func (pm *PasswordManager) loadAccounts() ([]Account, error) {
	data, err := pm.readDataFile()
	if err != nil {
		return nil, err
	}

	if len(data) == 0 {
		return []Account{}, nil
	}

	payload, encrypted, err := parseEncryptedVaultFile(data)
	if err != nil {
		return nil, err
	}

	if encrypted {
		if len(pm.sessionKey) == 0 {
			return nil, ErrVaultLocked
		}

		accounts, decryptErr := decryptAccounts(*payload, pm.sessionKey)
		if decryptErr != nil {
			pm.clearSecuritySession()
			return nil, ErrVaultLocked
		}

		pm.kdfConfig = &payload.KDF
		return accounts, nil
	}

	var accounts []Account
	if err := json.Unmarshal(data, &accounts); err != nil {
		return nil, fmt.Errorf("解析账号数据失败: %v", err)
	}

	return accounts, nil
}

// saveAccounts 保存账号列表到文件
func (pm *PasswordManager) saveAccounts(accounts []Account) error {
	filePath := pm.getDataFile()
	if err := os.MkdirAll(filepath.Dir(filePath), 0700); err != nil {
		return fmt.Errorf("创建账号文件目录失败: %w", err)
	}

	data, err := pm.marshalAccountsForStorage(accounts)
	if err != nil {
		return err
	}

	if err := os.WriteFile(filePath, data, 0600); err != nil {
		return fmt.Errorf("保存账号文件失败: %v", err)
	}

	return nil
}

// generateOTPCode 生成当前时刻的OTP验证码
func (pm *PasswordManager) generateOTPCode(key string) (string, error) {
	if key == "" {
		return "", nil
	}

	code, err := totp.GenerateCode(key, time.Now())
	if err != nil {
		return "", fmt.Errorf("生成OTP验证码失败: %v", err)
	}

	return code, nil
}

// getOTPRemaining 获取OTP剩余有效时间(秒)
func (pm *PasswordManager) getOTPRemaining() int {
	now := time.Now().Unix()
	// TOTP默认周期是30秒
	remaining := 30 - (now % 30)
	return int(remaining)
}

// generateID 生成唯一ID
func (pm *PasswordManager) generateID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}
