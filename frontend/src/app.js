const STORAGE_LANGUAGE_KEY = 'wails-passwd-language';
const translations = window.APP_I18N || {};

let currentLanguage = resolveInitialLanguage();
let accounts = [];
let storageInfo = null;
let currentEditId = '';
let pendingDeleteId = '';
let otpTimerInterval = null;
let otpRefreshInterval = null;
let snackbarTimer = null;
let isLoadingAccounts = false;

document.addEventListener('DOMContentLoaded', async function () {
    bindEvents();
    applyTranslations();
    await initializeApp();
    startOTPRefresh();
});

function bindEvents() {
    document.addEventListener('click', handleActionClick);
    document.getElementById('accountForm').addEventListener('submit', handleAccountSubmit);
    window.addEventListener('click', handleWindowClick);
    window.addEventListener('keydown', handleKeydown);
}

function resolveInitialLanguage() {
    const savedLanguage = localStorage.getItem(STORAGE_LANGUAGE_KEY);
    if (savedLanguage && translations[savedLanguage]) {
        return savedLanguage;
    }

    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
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
    renderStorageInfo();
    renderAccounts();
    renderStats();
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

    renderLanguageButtons();
    updateAccountModalTitle();
}

function renderLanguageButtons() {
    document.querySelectorAll('[data-action="set-language"]').forEach((button) => {
        button.classList.toggle('active', button.dataset.language === currentLanguage);
    });
}

async function initializeApp() {
    await loadStorageInfo();
    await loadAccounts({ silentError: false });
}

async function handleActionClick(event) {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) {
        return;
    }

    const action = actionTarget.dataset.action;

    if (action === 'set-language') {
        setLanguage(actionTarget.dataset.language);
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

async function loadStorageInfo() {
    try {
        storageInfo = await window.go.main.App.GetStorageInfo();
    } catch (error) {
        console.error('load storage info failed:', error);
        storageInfo = null;
    }

    renderStorageInfo();
    renderStats();
}

function renderStorageInfo() {
    const storagePathElement = document.getElementById('storagePath');
    const defaultPathElement = document.getElementById('defaultStoragePath');
    const chipElement = document.getElementById('storageModeChip');
    const resetButton = document.getElementById('resetConfigButton');
    const storageModeValue = document.getElementById('storageModeValue');

    if (!storageInfo) {
        storagePathElement.textContent = t('storageLoading');
        defaultPathElement.textContent = t('storageLoading');
        chipElement.textContent = '-';
        chipElement.classList.remove('custom');
        storageModeValue.textContent = '-';
        resetButton.disabled = true;
        return;
    }

    storagePathElement.textContent = storageInfo.data_file_path;
    defaultPathElement.textContent = storageInfo.default_data_file_path;
    chipElement.textContent = storageInfo.using_default ? t('modeDefault') : t('modeCustom');
    chipElement.classList.toggle('custom', !storageInfo.using_default);
    storageModeValue.textContent = storageInfo.using_default ? t('modeDefault') : t('modeCustom');
    resetButton.disabled = storageInfo.using_default;
}

async function selectConfigFile() {
    try {
        const nextStorageInfo = await window.go.main.App.SelectConfigFile();
        if (!nextStorageInfo) {
            return;
        }

        storageInfo = nextStorageInfo;
        renderStorageInfo();

        const loaded = await loadAccounts({ silentError: false });
        if (!loaded) {
            return;
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

        const loaded = await loadAccounts({ silentError: false });
        if (!loaded) {
            return;
        }

        showSnackbar(t('fileReset'));
    } catch (error) {
        showSnackbar(`${t('fileResetFailed')}: ${normalizeError(error)}`, 'error');
    }
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
    document.getElementById('accountCount').textContent = String(accounts.length);
    document.getElementById('otpCount').textContent = String(accounts.filter((account) => account.otp_key).length);
    document.getElementById('recordsStatus').textContent = t('recordsStatus', {
        count: String(accounts.length)
    });

    if (!storageInfo) {
        document.getElementById('storageModeValue').textContent = '-';
        return;
    }

    document.getElementById('storageModeValue').textContent = storageInfo.using_default ? t('modeDefault') : t('modeCustom');
}

function renderAccounts() {
    const accountsList = document.getElementById('accountsList');
    const tableShell = document.getElementById('accountsTableShell');
    const emptyState = document.getElementById('emptyState');

    if (accounts.length === 0) {
        accountsList.innerHTML = '';
        tableShell.style.display = 'none';
        emptyState.style.display = 'grid';
        return;
    }

    tableShell.style.display = 'block';
    emptyState.style.display = 'none';
    accountsList.innerHTML = accounts.map(renderAccountRow).join('');
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
                    ${hasNotes ? renderCopyButton(account.id, 'notes') : ''}
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
                    <button class="icon-action" data-action="edit-account" data-account-id="${account.id}" title="${escapeHtml(t('editDialogTitle'))}">
                        <svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25Zm14.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.75 3.75 2.13-1.79Z"/>
                        </svg>
                    </button>
                    <button class="icon-action" data-action="request-delete" data-account-id="${account.id}" title="${escapeHtml(t('deleteConfirm'))}">
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
        <button class="icon-action" data-action="copy" data-account-id="${accountId}" data-copy-field="${field}">
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

    if (field === 'notes') {
        return account.notes;
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
    const label = refreshButton.querySelector('span');
    const originalLabel = t('refresh');

    refreshButton.disabled = true;
    label.textContent = `${originalLabel}...`;

    try {
        const loaded = await loadAccounts({ silentError: false });
        await loadStorageInfo();
        if (!loaded) {
            return;
        }

        showSnackbar(t('refreshed'));
    } finally {
        refreshButton.disabled = false;
        label.textContent = originalLabel;
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
