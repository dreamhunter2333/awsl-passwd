const STORAGE_LANGUAGE_KEY = 'wails-passwd-language';
const STORAGE_THEME_KEY = 'wails-passwd-theme';
const VIEW_ACCOUNTS = 'accounts';
const VIEW_SETTINGS = 'settings';
const translations = window.APP_I18N || {};

let currentLanguage = resolveInitialLanguage();
let currentTheme = resolveInitialTheme();
let currentView = VIEW_ACCOUNTS;
let accounts = [];
let storageInfo = null;
let securityInfo = createDefaultSecurityInfo();
let securityInfoLoadError = '';
let currentEditId = '';
let pendingDeleteId = '';
let otpTimerInterval = null;
let otpRefreshInterval = null;
let snackbarTimer = null;
let isLoadingAccounts = false;

document.addEventListener('DOMContentLoaded', async function () {
    applyTheme();
    bindEvents();
    applyTranslations();
    renderView();
    try {
        await initializeApp();
    } catch (error) {
        showSnackbar(normalizeError(error), 'error');
    }
    startOTPRefresh();
});

function bindEvents() {
    document.addEventListener('click', handleActionClick);
    document.getElementById('accountForm').addEventListener('submit', handleAccountSubmit);
    document.getElementById('emptyStateUnlockPassword').addEventListener('keydown', handleUnlockInputKeydown);
    window.addEventListener('click', handleWindowClick);
    window.addEventListener('keydown', handleKeydown);
}

function createDefaultSecurityInfo() {
    return {
        encrypted: false,
        unlocked: true
    };
}

function applySecurityInfo(nextSecurityInfo) {
    securityInfo = nextSecurityInfo || createDefaultSecurityInfo();
    securityInfoLoadError = '';
}

function resolveInitialLanguage() {
    const savedLanguage = localStorage.getItem(STORAGE_LANGUAGE_KEY);
    if (savedLanguage && translations[savedLanguage]) {
        return savedLanguage;
    }

    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function resolveInitialTheme() {
    const savedTheme = localStorage.getItem(STORAGE_THEME_KEY);
    if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme;
    }

    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function t(key, values = {}) {
    let message = translations[currentLanguage]?.[key] ?? translations.zh?.[key] ?? key;
    Object.entries(values).forEach(([name, value]) => {
        message = message.replace(`{${name}}`, value);
    });
    return message;
}

function setLanguage(language) {
    if (!translations[language] || currentLanguage === language) {
        return;
    }

    currentLanguage = language;
    localStorage.setItem(STORAGE_LANGUAGE_KEY, language);
    applyTranslations();
}

function toggleLanguage() {
    setLanguage(currentLanguage === 'zh' ? 'en' : 'zh');
}

function setTheme(theme) {
    if (theme !== 'light' && theme !== 'dark') {
        return;
    }

    if (currentTheme === theme) {
        return;
    }

    currentTheme = theme;
    localStorage.setItem(STORAGE_THEME_KEY, theme);
    applyTheme();
    renderPreferences();
}

function toggleTheme() {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

function applyTheme() {
    document.documentElement.dataset.theme = currentTheme;
    renderHeaderControls();
}

function applyTranslations() {
    document.documentElement.lang = currentLanguage === 'zh' ? 'zh-CN' : 'en';
    document.title = t('documentTitle');

    document.querySelectorAll('[data-i18n]').forEach((element) => {
        element.textContent = t(element.dataset.i18n);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
        element.placeholder = t(element.dataset.i18nPlaceholder);
    });

    renderHeaderControls();
    updateAccountModalTitle();
    renderStats();
    renderStorageInfo();
    renderPreferences();
    renderSecurityInfo();
    renderEmptyState();
}

function renderHeaderControls() {
    const languageButton = document.getElementById('languageToggleButton');
    const languageLabel = document.getElementById('languageToggleLabel');
    const themeButton = document.getElementById('themeToggleButton');
    const themeIcon = document.getElementById('themeToggleIcon');
    const settingsButton = document.getElementById('settingsToggleButton');
    const settingsIcon = document.getElementById('settingsToggleIcon');
    const refreshButton = document.getElementById('refreshButton');

    if (languageLabel) {
        languageLabel.textContent = currentLanguage === 'zh' ? 'EN' : '中';
    }

    if (languageButton) {
        const nextLanguage = currentLanguage === 'zh' ? t('languageNameEn') : t('languageNameZh');
        languageButton.title = t('toggleLanguageAction', { language: nextLanguage });
        languageButton.setAttribute('aria-label', languageButton.title);
    }

    if (themeButton && themeIcon) {
        const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
        themeButton.title = targetTheme === 'dark' ? t('themeToDark') : t('themeToLight');
        themeButton.setAttribute('aria-label', themeButton.title);
        themeIcon.innerHTML = targetTheme === 'dark' ? getMoonIcon() : getSunIcon();
    }

    if (settingsButton && settingsIcon) {
        const onSettingsView = currentView === VIEW_SETTINGS;
        settingsButton.title = onSettingsView ? t('backToAccounts') : t('openSettings');
        settingsButton.setAttribute('aria-label', settingsButton.title);
        settingsButton.classList.toggle('active', onSettingsView);
        settingsIcon.innerHTML = onSettingsView ? getBackIcon() : getSettingsIcon();
    }

    if (refreshButton) {
        refreshButton.title = t('refresh');
        refreshButton.setAttribute('aria-label', refreshButton.title);
    }
}

function getMoonIcon() {
    return `
        <svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9.37 5.51A7.49 7.49 0 0 0 17.5 13.9 7.5 7.5 0 1 1 9.37 5.51Z"/>
        </svg>
    `;
}

function getSunIcon() {
    return `
        <svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.76 4.84 5.34 3.42 3.92 4.84l1.42 1.42 1.42-1.42Zm10.48 14.32-1.42 1.42 1.42 1.42 1.42-1.42-1.42-1.42ZM12 5a1 1 0 0 0 1-1V2a1 1 0 1 0-2 0v2a1 1 0 0 0 1 1Zm0 14a1 1 0 0 0-1 1v2a1 1 0 1 0 2 0v-2a1 1 0 0 0-1-1ZM4 11H2a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2Zm18 0h-2a1 1 0 1 0 0 2h2a1 1 0 1 0 0-2Zm-3.34-6.16 1.42-1.42-1.42-1.42-1.42 1.42 1.42 1.42ZM5.34 17.74l-1.42 1.42 1.42 1.42 1.42-1.42-1.42-1.42ZM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/>
        </svg>
    `;
}

function getSettingsIcon() {
    return `
        <svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.14 7.14 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.22-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.48a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.65-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.41 1.05.72 1.63.94l.36 2.54c.04.24.25.42.49.42h3.8c.24 0 .45-.18.49-.42l.36-2.54c.58-.22 1.13-.53 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"/>
        </svg>
    `;
}

function getBackIcon() {
    return `
        <svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="m20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2Z"/>
        </svg>
    `;
}

function renderView() {
    const accountsView = document.getElementById('accountsView');
    const settingsView = document.getElementById('settingsView');
    const onSettingsView = currentView === VIEW_SETTINGS;

    if (accountsView) {
        accountsView.hidden = onSettingsView;
    }

    if (settingsView) {
        settingsView.hidden = !onSettingsView;
    }

    renderHeaderControls();
}

function toggleSettingsView() {
    currentView = currentView === VIEW_SETTINGS ? VIEW_ACCOUNTS : VIEW_SETTINGS;
    renderView();
}

async function initializeApp() {
    await loadStorageInfo();
    await loadSecurityInfo();

    if (canAccessAccounts()) {
        await loadAccounts({ silentError: false });
        return;
    }

    accounts = [];
    renderAccounts();
    renderStats();
}

function canAccessAccounts() {
    if (securityInfoLoadError) {
        return false;
    }

    return !securityInfo.encrypted || securityInfo.unlocked;
}

async function handleActionClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) {
        return;
    }

    const action = actionTarget.dataset.action;

    if (action === 'toggle-language') {
        toggleLanguage();
        return;
    }

    if (action === 'toggle-theme') {
        toggleTheme();
        return;
    }

    if (action === 'toggle-settings') {
        toggleSettingsView();
        return;
    }

    if (action === 'show-add') {
        showAccountModal();
        return;
    }

    if (action === 'refresh') {
        await refreshAccounts();
        return;
    }

    if (action === 'select-config') {
        await selectConfigFile();
        return;
    }

    if (action === 'reset-config') {
        await resetConfigFile();
        return;
    }

    if (action === 'submit-security') {
        await submitSecurityAction();
        return;
    }

    if (action === 'unlock-security') {
        await unlockSecurity();
        return;
    }

    if (action === 'lock-security') {
        await lockSecurity();
        return;
    }

    if (action === 'edit-account') {
        showAccountModal(actionTarget.dataset.accountId);
        return;
    }

    if (action === 'request-delete') {
        showDeleteModal(actionTarget.dataset.accountId);
        return;
    }

    if (action === 'confirm-delete') {
        await performDelete();
        return;
    }

    if (action === 'copy') {
        await copyAccountField(actionTarget);
        return;
    }

    if (action === 'close-modal') {
        hideModal(actionTarget.dataset.modalId);
    }
}

function handleWindowClick(event) {
    const modal = event.target.closest('.modal');
    if (!modal || event.target !== modal) {
        return;
    }

    hideModal(modal.id);
}

function handleKeydown(event) {
    if (event.key !== 'Escape') {
        return;
    }

    hideModal('accountModal');
    hideModal('deleteModal');
}

function handleUnlockInputKeydown(event) {
    if (event.key !== 'Enter') {
        return;
    }

    event.preventDefault();
    unlockSecurity();
}

async function loadStorageInfo() {
    try {
        storageInfo = await window.go.main.App.GetStorageInfo();
    } catch (error) {
        console.error('load storage info failed:', error);
        storageInfo = null;
    }

    renderStorageInfo();
    renderStats();
    renderPreferences();
}

async function loadSecurityInfo() {
    try {
        applySecurityInfo(await window.go.main.App.GetSecurityInfo());
    } catch (error) {
        console.error('load security info failed:', error);
        securityInfo = createDefaultSecurityInfo();
        securityInfoLoadError = normalizeError(error);
        accounts = [];
        renderSecurityInfo();
        renderStats();
        renderAccounts();
        throw error;
    }

    accounts = [];
    renderSecurityInfo();
    renderStats();
    renderAccounts();
}

function renderStorageInfo() {
    const resetButton = document.getElementById('resetConfigButton');
    const currentMode = resolveStorageModeLabel();

    if (!storageInfo) {
        setText('storagePath', t('storageLoading'));
        setText('defaultStoragePath', t('storageLoading'));
        setText('storageModeChip', '-');
        setText('settingsStorageModeChip', '-');
        setText('currentStorageModeValue', '-');
        toggleModeChipState('storageModeChip', false);
        toggleModeChipState('settingsStorageModeChip', false);
        if (resetButton) {
            resetButton.disabled = true;
        }
        renderHeaderMeta();
        return;
    }

    setText('storagePath', storageInfo.data_file_path);
    setText('defaultStoragePath', storageInfo.default_data_file_path);
    setText('storageModeChip', currentMode);
    setText('settingsStorageModeChip', currentMode);
    setText('currentStorageModeValue', currentMode);
    toggleModeChipState('storageModeChip', !storageInfo.using_default);
    toggleModeChipState('settingsStorageModeChip', !storageInfo.using_default);

    if (resetButton) {
        resetButton.disabled = storageInfo.using_default;
    }

    renderHeaderMeta();
}

function toggleModeChipState(id, isCustom) {
    const chip = document.getElementById(id);
    if (!chip) {
        return;
    }

    chip.classList.toggle('custom', isCustom);
}

function resolveStorageModeLabel() {
    if (!storageInfo) {
        return '-';
    }

    return storageInfo.using_default ? t('modeDefault') : t('modeCustom');
}

function renderPreferences() {
    setText('currentLanguageValue', currentLanguage === 'zh' ? t('languageNameZh') : t('languageNameEn'));
    setText('currentThemeValue', currentTheme === 'dark' ? t('themeDark') : t('themeLight'));
    setText('currentStorageModeValue', resolveStorageModeLabel());
}

function renderSecurityInfo() {
    const statusChip = document.getElementById('securityStatusChip');
    const addButton = document.getElementById('addAccountButton');
    const accountLockButton = document.getElementById('accountLockButton');

    if (statusChip) {
        statusChip.textContent = resolveSecurityStatusLabel();
        statusChip.classList.toggle('custom', !securityInfoLoadError && securityInfo.encrypted && securityInfo.unlocked);
    }

    if (addButton) {
        addButton.disabled = !canAccessAccounts();
    }

    if (accountLockButton) {
        accountLockButton.hidden = securityInfoLoadError || !securityInfo.encrypted || !securityInfo.unlocked;
    }

    renderSecurityForm();
}

function renderSecurityForm() {
    const passwordField = document.getElementById('securityPasswordField');
    const confirmField = document.getElementById('securityPasswordConfirmField');
    const passwordLabel = document.getElementById('securityPasswordLabel');
    const submitButton = document.getElementById('securitySubmitButton');
    const submitLabel = document.getElementById('securitySubmitLabel');

    if (!passwordField || !confirmField || !passwordLabel || !submitButton || !submitLabel) {
        return;
    }

    if (securityInfoLoadError) {
        passwordField.hidden = true;
        confirmField.hidden = true;
        submitButton.hidden = true;
        return;
    }

    const enabling = !securityInfo.encrypted;
    const disabling = securityInfo.encrypted;

    passwordField.hidden = false;
    confirmField.hidden = !enabling;
    submitButton.hidden = false;

    if (enabling) {
        passwordLabel.textContent = t('securityPasswordNew');
        submitLabel.textContent = t('enableEncryptionAction');
        return;
    }

    if (disabling) {
        passwordLabel.textContent = t('securityPasswordCurrent');
        submitLabel.textContent = t('disableEncryptionAction');
    }
}

function resolveSecurityStatusLabel() {
    if (securityInfoLoadError) {
        return t('securityStatusError');
    }

    if (!securityInfo.encrypted) {
        return t('securityStatusPlain');
    }

    if (securityInfo.unlocked) {
        return t('securityStatusUnlocked');
    }

    return t('securityStatusLocked');
}

function resetSecurityInputs() {
    document.getElementById('securityPassword').value = '';
    document.getElementById('securityPasswordConfirm').value = '';
    document.getElementById('emptyStateUnlockPassword').value = '';
}

function renderHeaderMeta() {
    const headerMeta = document.getElementById('headerMeta');
    if (!headerMeta) {
        return;
    }

    if (!storageInfo) {
        headerMeta.textContent = t('headerMetaLoading');
        return;
    }

    if (securityInfoLoadError) {
        headerMeta.textContent = t('headerMetaError', {
            mode: resolveStorageModeLabel()
        });
        return;
    }

    if (!canAccessAccounts()) {
        headerMeta.textContent = t('headerMetaLocked', {
            mode: resolveStorageModeLabel()
        });
        return;
    }

    headerMeta.textContent = t('headerMeta', {
        count: String(accounts.length),
        otp: String(getOTPEnabledCount()),
        mode: resolveStorageModeLabel()
    });
}

async function selectConfigFile() {
    try {
        const nextStorageInfo = await window.go.main.App.SelectConfigFile();
        if (!nextStorageInfo) {
            return;
        }

        storageInfo = nextStorageInfo;
        renderStorageInfo();
        await loadSecurityInfo();

        if (canAccessAccounts()) {
            const loaded = await loadAccounts({ silentError: false });
            if (!loaded) {
                return;
            }
        } else {
            accounts = [];
            renderAccounts();
            renderStats();
        }

        showSnackbar(t('fileChanged'));
    } catch (error) {
        showSnackbar(`${t('fileChangeFailed')}: ${normalizeError(error)}`, 'error');
    }
}

async function resetConfigFile() {
    if (!storageInfo || storageInfo.using_default) {
        return;
    }

    try {
        storageInfo = await window.go.main.App.ResetConfigFile();
        renderStorageInfo();
        await loadSecurityInfo();

        if (canAccessAccounts()) {
            const loaded = await loadAccounts({ silentError: false });
            if (!loaded) {
                return;
            }
        } else {
            accounts = [];
            renderAccounts();
            renderStats();
        }

        showSnackbar(t('fileReset'));
    } catch (error) {
        showSnackbar(`${t('fileResetFailed')}: ${normalizeError(error)}`, 'error');
    }
}

async function submitSecurityAction() {
    const password = document.getElementById('securityPassword').value;
    const confirmPassword = document.getElementById('securityPasswordConfirm').value;

    const enabling = !securityInfo.encrypted;
    const disabling = securityInfo.encrypted;

    if (!password) {
        showSnackbar(t('securityPasswordRequired'), 'error');
        return;
    }

    try {
        if (enabling) {
            if (password !== confirmPassword) {
                showSnackbar(t('securityPasswordMismatch'), 'error');
                return;
            }

            applySecurityInfo(await window.go.main.App.EnableEncryption(password));
            resetSecurityInputs();
            renderSecurityInfo();
            await loadAccounts({ silentError: false });
            showSnackbar(t('securityEnableSuccess'));
            return;
        }

        if (disabling) {
            applySecurityInfo(await window.go.main.App.DisableEncryption(password));
            resetSecurityInputs();
            renderSecurityInfo();
            await loadAccounts({ silentError: false });
            showSnackbar(t('securityDisableSuccess'));
            return;
        }

        resetSecurityInputs();
        renderSecurityInfo();
    } catch (error) {
        const errorMessage = normalizeError(error);
        resetSecurityInputs();

        try {
            await loadSecurityInfo();

            if (canAccessAccounts()) {
                await loadAccounts({ silentError: true });
            }
        } catch (refreshError) {
            console.error('reload security info failed:', refreshError);
        }

        showSnackbar(errorMessage, 'error');
    }
}

async function unlockSecurity() {
    const password = document.getElementById('emptyStateUnlockPassword').value;
    if (!password) {
        showSnackbar(t('securityPasswordRequired'), 'error');
        return;
    }

    try {
        applySecurityInfo(await window.go.main.App.UnlockDataFile(password));
        resetSecurityInputs();
        renderSecurityInfo();
        await loadAccounts({ silentError: false });
        showSnackbar(t('securityUnlockSuccess'));
    } catch (error) {
        const errorMessage = normalizeError(error);
        resetSecurityInputs();

        try {
            await loadSecurityInfo();
            if (canAccessAccounts()) {
                await loadAccounts({ silentError: true });
            }
        } catch (refreshError) {
            console.error('reload security info failed:', refreshError);
        }

        showSnackbar(errorMessage, 'error');
    }
}

async function lockSecurity() {
    applySecurityInfo(await window.go.main.App.LockDataFile());
    accounts = [];
    resetSecurityInputs();
    renderSecurityInfo();
    renderAccounts();
    renderStats();
    showSnackbar(t('securityLockSuccess'));
}

async function loadAccounts(options = {}) {
    if (isLoadingAccounts) {
        return false;
    }

    isLoadingAccounts = true;

    try {
        accounts = await window.go.main.App.GetAccounts() || [];
        renderAccounts();
        renderStats();
        return true;
    } catch (error) {
        console.error('load accounts failed:', error);
        accounts = [];

        if (normalizeError(error) === '数据文件已加密，请先解锁') {
            applySecurityInfo({
                encrypted: true,
                unlocked: false
            });
            renderSecurityInfo();
            renderAccounts();
            renderStats();
            return false;
        }

        renderAccounts();
        renderStats();

        if (!options.silentError) {
            showSnackbar(`${t('loadFailed')}: ${normalizeError(error)}`, 'error');
        }

        return false;
    } finally {
        isLoadingAccounts = false;
    }
}

function renderStats() {
    if (securityInfoLoadError) {
        setText('recordsStatus', t('securityStatusError'));
        setText('otpStatus', t('openSettings'));
    } else if (!canAccessAccounts()) {
        setText('recordsStatus', t('securityStatusLocked'));
        setText('otpStatus', t('unlockVault'));
    } else {
        setText('recordsStatus', t('recordsStatus', {
            count: String(accounts.length)
        }));
        setText('otpStatus', t('otpStatus', {
            count: String(getOTPEnabledCount())
        }));
    }

    if (!storageInfo) {
        setText('storageModeChip', '-');
        setText('settingsStorageModeChip', '-');
        setText('currentStorageModeValue', '-');
    }

    renderHeaderMeta();
}

function getOTPEnabledCount() {
    return accounts.filter((account) => account.otp_key).length;
}

function renderAccounts() {
    const accountsList = document.getElementById('accountsList');
    const tableShell = document.getElementById('accountsTableShell');
    const emptyState = document.getElementById('emptyState');

    if (!canAccessAccounts()) {
        accountsList.innerHTML = '';
        tableShell.style.display = 'none';
        emptyState.style.display = 'grid';
        renderEmptyState();
        return;
    }

    if (accounts.length === 0) {
        accountsList.innerHTML = '';
        tableShell.style.display = 'none';
        emptyState.style.display = 'grid';
        renderEmptyState();
        return;
    }

    tableShell.style.display = 'block';
    emptyState.style.display = 'none';
    accountsList.innerHTML = accounts.map(renderAccountRow).join('');
}

function renderEmptyState() {
    const title = document.getElementById('emptyStateTitle');
    const subtitle = document.getElementById('emptyStateSubtitle');
    const action = document.getElementById('emptyStateAction');
    const unlockPanel = document.getElementById('emptyStateUnlock');
    const unlockButton = document.getElementById('emptyStateUnlockButton');

    if (!title || !subtitle || !action || !unlockPanel || !unlockButton) {
        return;
    }

    unlockButton.textContent = t('unlockVault');

    if (securityInfoLoadError) {
        unlockPanel.hidden = true;
        action.hidden = false;
        title.textContent = t('fileErrorTitle');
        subtitle.textContent = t('fileErrorSubtitle', {
            error: securityInfoLoadError
        });
        action.textContent = t('openSettings');
        action.dataset.action = 'toggle-settings';
        return;
    }

    if (!canAccessAccounts()) {
        unlockPanel.hidden = false;
        action.hidden = true;
        title.textContent = t('lockedTitle');
        subtitle.textContent = t('lockedSubtitleInline');
        return;
    }

    unlockPanel.hidden = true;
    action.hidden = false;
    title.textContent = t('emptyTitle');
    subtitle.textContent = t('emptySubtitle');
    action.textContent = t('addFirstAccount');
    action.dataset.action = 'show-add';
}

function renderAccountRow(account) {
    const hasPassword = Boolean(account.password);
    const hasNotes = Boolean(account.notes);
    const hasOTP = Boolean(account.otp_code);

    return `
        <tr>
            <td>
                <div class="field-block">
                    <div class="field-text">${escapeHtml(account.name)}</div>
                    ${renderCopyButton(account.id, 'name')}
                </div>
            </td>
            <td>
                <div class="field-block">
                    <div class="field-text mono ${hasPassword ? '' : 'field-placeholder'}">${escapeHtml(account.password || t('notSet'))}</div>
                    ${hasPassword ? renderCopyButton(account.id, 'password') : ''}
                </div>
            </td>
            <td>
                <div class="field-block">
                    <div class="field-text ${hasNotes ? '' : 'field-placeholder'}">${escapeHtml(account.notes || t('noNotes'))}</div>
                </div>
            </td>
            <td>
                ${hasOTP ? `
                    <div class="otp-box">
                        <div class="otp-code">
                            <span>${escapeHtml(account.otp_code)}</span>
                            ${renderCopyButton(account.id, 'otp')}
                        </div>
                        <div class="otp-timer" data-role="otp-timer" data-account-id="${account.id}" data-remaining="${account.otp_remaining || 0}">
                            ${account.otp_remaining || 0}s
                        </div>
                    </div>
                ` : `<span class="field-placeholder">${t('otpDisabled')}</span>`}
            </td>
            <td>
                <div class="row-actions">
                    <button class="icon-action" data-action="edit-account" data-account-id="${account.id}" title="${escapeHtml(t('editDialogTitle'))}" type="button">
                        <svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-1.79Z"/>
                        </svg>
                    </button>
                    <button class="icon-action" data-action="request-delete" data-account-id="${account.id}" title="${escapeHtml(t('deleteConfirm'))}" type="button">
                        <svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V7H6v12Zm3.46-7.12 1.41-1.41L12 11.59l1.12-1.12 1.41 1.41L13.41 13l1.12 1.12-1.41 1.41L12 14.41l-1.12 1.12-1.41-1.41L10.59 13l-1.13-1.12ZM15.5 4l-1-1h-5l-1 1H5v2h14V4Z"/>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function renderCopyButton(accountId, field) {
    return `
        <button class="icon-action" data-action="copy" data-account-id="${accountId}" data-copy-field="${field}" type="button">
            <svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1Zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2Zm0 16H8V7h11v14Z"/>
            </svg>
        </button>
    `;
}

async function copyAccountField(button) {
    const account = accounts.find((item) => item.id === button.dataset.accountId);
    if (!account) {
        return;
    }

    const field = button.dataset.copyField;
    const value = resolveCopyValue(account, field);
    if (!value) {
        return;
    }

    try {
        await navigator.clipboard.writeText(value);
    } catch (error) {
        try {
            const textArea = document.createElement('textarea');
            textArea.value = value;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
        } catch (fallbackError) {
            showSnackbar(normalizeError(fallbackError), 'error');
            return;
        }
    }

    showCopyFeedback(button);
    showSnackbar(t('copied'));
}

function resolveCopyValue(account, field) {
    if (field === 'name') {
        return account.name;
    }

    if (field === 'password') {
        return account.password;
    }

    if (field === 'otp') {
        return account.otp_code;
    }

    return '';
}

function showCopyFeedback(button) {
    const originalMarkup = button.innerHTML;
    button.classList.add('copied');
    button.innerHTML = `
        <svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4Z"/>
        </svg>
    `;

    window.setTimeout(() => {
        button.classList.remove('copied');
        button.innerHTML = originalMarkup;
    }, 1200);
}

function showAccountModal(accountId = '') {
    const form = document.getElementById('accountForm');
    form.reset();
    currentEditId = '';
    document.getElementById('accountId').value = '';

    if (accountId) {
        const account = accounts.find((item) => item.id === accountId);
        if (!account) {
            return;
        }

        currentEditId = accountId;
        document.getElementById('accountId').value = accountId;
        document.getElementById('accountName').value = account.name;
        document.getElementById('accountPassword').value = account.password || '';
        document.getElementById('accountOTPKey').value = account.otp_key || '';
        document.getElementById('accountNotes').value = account.notes || '';
    }

    updateAccountModalTitle();
    showModal('accountModal');
}

function updateAccountModalTitle() {
    const titleElement = document.getElementById('accountModalTitle');
    if (!titleElement) {
        return;
    }

    titleElement.textContent = currentEditId ? t('editDialogTitle') : t('addDialogTitle');
}

function showDeleteModal(accountId) {
    pendingDeleteId = accountId;
    showModal('deleteModal');
}

function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        return;
    }

    modal.style.display = 'flex';
}

function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) {
        return;
    }

    modal.style.display = 'none';

    if (modalId === 'deleteModal') {
        pendingDeleteId = '';
    }
}

async function handleAccountSubmit(event) {
    event.preventDefault();

    const name = document.getElementById('accountName').value.trim();
    const password = document.getElementById('accountPassword').value;
    const otpKey = document.getElementById('accountOTPKey').value.trim();
    const notes = document.getElementById('accountNotes').value.trim();
    const accountId = document.getElementById('accountId').value;

    if (!name) {
        showSnackbar(t('selectNameFirst'), 'error');
        return;
    }

    try {
        if (accountId) {
            await window.go.main.App.UpdateAccount(accountId, name, password, notes, otpKey);
        } else {
            await window.go.main.App.CreateAccount(name, password, notes, otpKey);
        }

        const loaded = await loadAccounts({ silentError: false });
        if (!loaded) {
            return;
        }

        hideModal('accountModal');
        showSnackbar(t('saveSuccess'));
    } catch (error) {
        showSnackbar(`${t('saveFailed')}: ${normalizeError(error)}`, 'error');
    }
}

async function performDelete() {
    if (!pendingDeleteId) {
        return;
    }

    try {
        await window.go.main.App.DeleteAccount(pendingDeleteId);
        hideModal('deleteModal');

        const loaded = await loadAccounts({ silentError: false });
        if (!loaded) {
            return;
        }

        showSnackbar(t('deleteSuccess'));
    } catch (error) {
        showSnackbar(`${t('deleteFailed')}: ${normalizeError(error)}`, 'error');
    }
}

async function refreshAccounts() {
    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.classList.add('spinning');
    }

    try {
        await loadStorageInfo();
        await loadSecurityInfo();

        if (canAccessAccounts()) {
            const loaded = await loadAccounts({ silentError: false });
            if (!loaded) {
                return;
            }
        } else {
            accounts = [];
            renderAccounts();
            renderStats();
        }

        showSnackbar(t('refreshed'));
    } catch (error) {
        showSnackbar(normalizeError(error), 'error');
    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.classList.remove('spinning');
        }
    }
}

function startOTPRefresh() {
    if (!otpTimerInterval) {
        otpTimerInterval = window.setInterval(updateOTPTimers, 1000);
    }

    if (!otpRefreshInterval) {
        otpRefreshInterval = window.setInterval(() => {
            loadAccounts({ silentError: true });
        }, 30000);
    }
}

function updateOTPTimers() {
    document.querySelectorAll('[data-role="otp-timer"]').forEach((timerElement) => {
        const currentRemaining = Number(timerElement.dataset.remaining || 0);
        if (currentRemaining <= 1) {
            timerElement.dataset.remaining = '0';
            timerElement.textContent = '0s';
            loadAccounts({ silentError: true });
            return;
        }

        const nextRemaining = currentRemaining - 1;
        timerElement.dataset.remaining = String(nextRemaining);
        timerElement.textContent = `${nextRemaining}s`;
    });
}

function showSnackbar(message, tone = 'default') {
    const snackbar = document.getElementById('snackbar');
    snackbar.textContent = message;
    snackbar.className = `snackbar show${tone === 'error' ? ' error' : ''}`;

    if (snackbarTimer) {
        window.clearTimeout(snackbarTimer);
    }

    snackbarTimer = window.setTimeout(() => {
        snackbar.className = 'snackbar';
    }, 2400);
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (!element) {
        return;
    }

    element.textContent = value;
}

function normalizeError(error) {
    if (!error) {
        return '';
    }

    if (typeof error === 'string') {
        return error;
    }

    if (error.message) {
        return error.message;
    }

    try {
        return JSON.stringify(error);
    } catch (stringifyError) {
        return String(error);
    }
}

function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value);
    return element.innerHTML;
}
