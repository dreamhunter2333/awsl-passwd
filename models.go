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
	ID              string `json:"id"`
	Name            string `json:"name"`
	Password        string `json:"password"`
	OTPCode         string `json:"otp_code"`          // 当前OTP验证码
	OTPKey          string `json:"otp_key"`           // OTP密钥
	OTPRemaining    int    `json:"otp_remaining"`     // OTP剩余时间(秒)
	Notes           string `json:"notes"`
	Created         int64  `json:"created"`
	Updated         int64  `json:"updated"`
}

// PasswordManager 密码管理器
type PasswordManager struct {
	dataDir string
}

// NewPasswordManager 创建密码管理器实例
func NewPasswordManager() *PasswordManager {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		panic(fmt.Sprintf("无法获取用户目录: %v", err))
	}
	
	dataDir := filepath.Join(homeDir, ".wails-passwd")
	
	// 确保目录存在
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		panic(fmt.Sprintf("无法创建数据目录: %v", err))
	}
	
	return &PasswordManager{
		dataDir: dataDir,
	}
}

// getDataFile 获取数据文件路径
func (pm *PasswordManager) getDataFile() string {
	return filepath.Join(pm.dataDir, "accounts.json")
}

// loadAccounts 从文件加载账号列表
func (pm *PasswordManager) loadAccounts() ([]Account, error) {
	filePath := pm.getDataFile()
	
	// 如果文件不存在，返回空列表
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		return []Account{}, nil
	}
	
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("读取账号文件失败: %v", err)
	}
	
	var accounts []Account
	if err := json.Unmarshal(data, &accounts); err != nil {
		return nil, fmt.Errorf("解析账号数据失败: %v", err)
	}
	
	return accounts, nil
}

// saveAccounts 保存账号列表到文件
func (pm *PasswordManager) saveAccounts(accounts []Account) error {
	data, err := json.MarshalIndent(accounts, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化账号数据失败: %v", err)
	}
	
	filePath := pm.getDataFile()
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