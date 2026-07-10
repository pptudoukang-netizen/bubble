'use strict';

/**
 * Cocos Creator 2.x MCP Server Panel
 * Uses Vue 3 + same template as 3.x, with IPC adapter layer
 */

const fs = require('fs');
const path = require('path');

let _panelPollingTimer = null;
let _app = null;

// Resolve package root reliably.
// `__dirname` is unreliable here because Cocos Creator 2.x loads this file
// via `eval()` in resource-mgr.js — `__dirname` then points at the editor's
// internal directory, not this plugin's panel/ folder.
const PKG_NAME = 'cocos2x-mcp-server';
const PKG_ROOT = (function () {
    // 1) Editor.url('packages://<name>') — official Cocos 2.x API, sync, returns absolute path
    try {
        if (typeof Editor !== 'undefined' && typeof Editor.url === 'function') {
            const p = Editor.url('packages://' + PKG_NAME);
            if (p && typeof p === 'string' && fs.existsSync(p)) return p;
        }
    } catch (e) { /* ignore */ }
    // 2) User-level packages directory
    try {
        const home = require('os').homedir();
        const guess = path.join(home, '.CocosCreator', 'packages', PKG_NAME);
        if (fs.existsSync(guess)) return guess;
    } catch (e) { /* ignore */ }
    // 3) Recover from the V8 error stack (Cocos sets sourceURL to the real file path)
    try {
        const stack = (new Error()).stack || '';
        const m = stack.match(/[\s(]([A-Za-z]:[\\\/][^():\n]*?[\\\/]panel[\\\/]index\.js)|[\s(](\/[^():\n]*?\/panel\/index\.js)/);
        const hit = m && (m[1] || m[2]);
        if (hit) return path.dirname(path.dirname(hit));
    } catch (e) { /* ignore */ }
    // 4) Fallback (may be wrong under eval, but better than crashing at module load)
    return path.join(__dirname, '..');
})();

// Load Vue 3 explicitly from our own node_modules. `require('vue')` is unreliable:
// Cocos Creator 2.x ships its own Vue (an old major version) inside the editor,
// and Node module resolution can pick that one up if our packaged node_modules/vue
// is missing or if resolution starts from the editor's directory under eval.
const Vue = (function () {
    const candidates = [
        path.join(PKG_ROOT, 'node_modules', 'vue', 'dist', 'vue.cjs.prod.js'),
        path.join(PKG_ROOT, 'node_modules', 'vue', 'dist', 'vue.cjs.js'),
        path.join(PKG_ROOT, 'node_modules', 'vue', 'index.js'),
    ];
    for (const p of candidates) {
        try {
            if (fs.existsSync(p)) {
                const v = require(p);
                if (v && typeof v.createApp === 'function') return v;
            }
        } catch (e) {
            try { Editor.warn('[MCP Panel] Vue load failed at ' + p + ': ' + e.message); } catch (e2) {}
        }
    }
    // Last-resort: bare require — may resolve to Cocos's bundled Vue
    try {
        const v = require('vue');
        if (v && typeof v.createApp === 'function') return v;
        try { Editor.error('[MCP Panel] require("vue") returned wrong Vue (no createApp). PKG_ROOT=' + PKG_ROOT); } catch (e3) {}
    } catch (e) {
        try { Editor.error('[MCP Panel] require("vue") failed: ' + e.message + '. PKG_ROOT=' + PKG_ROOT); } catch (e3) {}
    }
    return null;
})();
if (!Vue) {
    try { Editor.error('[MCP Panel] FATAL: Vue 3 not found. Plugin install may be incomplete (missing node_modules/vue). PKG_ROOT=' + PKG_ROOT); } catch (e) {}
}
const createApp = Vue && Vue.createApp;
const defineComponent = Vue && Vue.defineComponent;
const ref = Vue && Vue.ref;
const reactive = Vue && Vue.reactive;
const computed = Vue && Vue.computed;
const onMounted = Vue && Vue.onMounted;
const watch = Vue && Vue.watch;
const nextTick = Vue && Vue.nextTick;

// Load i18n
const i18nMessages = {};
const localeOrder = ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'ar'];
for (const lang of localeOrder) {
    try {
        i18nMessages[lang] = require(path.join(PKG_ROOT, 'i18n', lang + '.js'));
    } catch (e) { /* skip */ }
}

/**
 * 2.x IPC adapter: wraps Editor.Ipc.sendToMain as Promise
 * so Vue code can use `await ipc('message-name', ...args)`
 */
function ipc(message, ...args) {
    return new Promise((resolve, reject) => {
        try {
            Editor.log('[MCP Panel] ipc() called: ' + message + ' args count: ' + args.length);
            if (typeof Editor !== 'undefined' && Editor.Ipc && Editor.Ipc.sendToMain) {
                Editor.log('[MCP Panel] sendToMain: cocos2x-mcp-server:' + message);
                Editor.Ipc.sendToMain(`cocos2x-mcp-server:${message}`, ...args, (err, result) => {
                    Editor.log('[MCP Panel] sendToMain callback: err=' + err + ' result=' + JSON.stringify(result));
                    if (err) reject(err);
                    else resolve(result);
                });
            } else {
                const { ipcRenderer } = require('electron');
                const replyChannel = `cocos2x-mcp-server:${message}:reply:${Date.now()}`;
                ipcRenderer.once(replyChannel, (event, err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                });
                ipcRenderer.send(`cocos2x-mcp-server:${message}`, replyChannel, ...args);
                // Timeout after 10s
                setTimeout(() => reject(new Error('IPC timeout')), 10000);
            }
        } catch (e) {
            Editor.error('[MCP Panel] IPC error:', e.message);
            reject(e);
        }
    });
}

// Panel size config
const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 600;

Editor.Panel.extend({
    style: (function () {
        try { return fs.readFileSync(path.join(PKG_ROOT, 'static', 'style', 'default', 'index.css'), 'utf-8'); }
        catch (e) {
            try { Editor.warn('[MCP Panel] Failed to load style from ' + PKG_ROOT + ': ' + e.message); } catch (e2) {}
            return '';
        }
    })(),

    template: `
        <div class="mcp-server-panel">
            <div id="app">
                <mcp-server-app></mcp-server-app>
            </div>
        </div>
    `,

    ready() {
        const root = this.shadowRoot || this.root || this;
        const appEl = root.getElementById ? root.getElementById('app') : root.querySelector('#app');
        if (!appEl) {
            Editor.error('[MCP Panel] #app element not found');
            return;
        }

        // Debug: test IPC availability
        Editor.log('[MCP Panel] Editor.Ipc available: ' + !!(Editor && Editor.Ipc && Editor.Ipc.sendToMain));
        Editor.Ipc.sendToMain('cocos2x-mcp-server:get-machine-id', (err, mid) => {
            Editor.log('[MCP Panel] IPC test result: err=' + err + ' mid=' + mid);
        });

        const app = createApp({});
        app.config.compilerOptions.isCustomElement = (tag) => tag.startsWith('ui-');
        app.config.errorHandler = (err, vm, info) => {
            Editor.error('[MCP Panel] Vue error: ' + (err.message || err) + ' | info: ' + info);
            Editor.error('[MCP Panel] Vue stack: ' + (err.stack || ''));
        };

        // Load Vue template
        let vueTemplate = '';
        try {
            vueTemplate = fs.readFileSync(
                path.join(PKG_ROOT, 'static', 'template', 'vue', 'mcp-server-app.html'), 'utf-8'
            );
        } catch (e) {
            Editor.error('[MCP Panel] Failed to load Vue template:', e.message);
            return;
        }

        const MCP_EXTENSION_NAME = 'cocos2x-mcp-server';

        app.component('mcp-server-app', defineComponent({
            template: vueTemplate,
            setup() {
                // ===== Auth =====
                const dataLoaded = ref(false);
                const authChecked = ref(false);
                const isLicensed = ref(false);
                const authDisabled = ref(false);
                const showAuthPanel = ref(false);
                const showExpiryWarning = ref(false);
                const authEmail = ref('');
                const authCode = ref('');
                const authError = ref('');
                const authSuccess = ref('');
                const authLoading = ref(false);
                const authLang = ref('zh');
                const licenseInfo = ref(null);
                const machineId = ref('');

                // Expired alert
                const showExpiredAlert = ref(false);
                const confirmExpiredAlert = () => {
                    showExpiredAlert.value = false;
                    isLicensed.value = false;
                    licenseInfo.value = null;
                    showAuthPanel.value = true;
                    authError.value = '';
                    authSuccess.value = '';
                    authEmail.value = '';
                    authCode.value = '';
                };

                // Change code
                const showChangeCodeModal = ref(false);
                const newCode = ref('');
                const changeCodeError = ref('');
                const changeCodeLoading = ref(false);

                // Version update
                const showUpdateDialog = ref(false);
                const updateInfo = ref({ hasUpdate: false, latestVersion: '', changelog: '', downloadUrl: '', urgency: 'normal' });
                const updateChecking = ref(false);
                const currentPluginVersion = ref('');
                try {
                    const pkg = require(path.join(PKG_ROOT, 'package.json'));
                    currentPluginVersion.value = pkg.version || '';
                } catch (e) { /* ignore */ }

                const formatUpdateDate = (dateStr) => {
                    try { return new Date(dateStr).toLocaleDateString(authLang.value === 'zh' ? 'zh-CN' : authLang.value, { year: 'numeric', month: 'short', day: 'numeric' }); }
                    catch (e) { return dateStr; }
                };

                // i18n
                const t = (key, ...args) => {
                    const locale = authLang.value;
                    const messages = i18nMessages[locale] || i18nMessages['en'] || {};
                    const fallback = i18nMessages['en'] || {};
                    let text = messages[key] || fallback[key] || key;
                    args.forEach((arg, index) => { text = text.replace(`{${index}}`, String(arg)); });
                    return text;
                };

                // Auth methods
                const checkLicense = async () => {
                    try {
                        const result = await ipc('check-license');
                        if (result) {
                            isLicensed.value = result.licensed || false;
                            authDisabled.value = result.authDisabled || false;
                            licenseInfo.value = result.licenseInfo || null;
                            showAuthPanel.value = !result.licensed && !result.authDisabled;
                            Editor.log('[MCP Panel] checkLicense: licensed=' + isLicensed.value + ' showAuthPanel=' + showAuthPanel.value + ' authDisabled=' + authDisabled.value);
                            if (result.licenseInfo && result.licenseInfo.daysRemaining <= 7 && result.licenseInfo.daysRemaining > 0) {
                                showExpiryWarning.value = true;
                            }
                        }
                    } catch (e) {
                        Editor.warn('[MCP Panel] check-license error:', e);
                    }
                };

                const activateLicense = async () => {
                    Editor.log('[MCP Panel] activateLicense called, email=' + authEmail.value + ' code=' + authCode.value);
                    if (!authEmail.value || !authCode.value) {
                        authError.value = t('email_required');
                        return;
                    }
                    authError.value = '';
                    authLoading.value = true;
                    try {
                        const result = await ipc('activate-license', { email: authEmail.value, activationCode: authCode.value });
                        if (result && result.success) {
                            isLicensed.value = true;
                            licenseInfo.value = result.licenseInfo || null;
                            showAuthPanel.value = false;
                            authSuccess.value = t('activation_success');
                        } else {
                            const msg = (result && result.message) || '';
                            authError.value = msg.startsWith('err_') ? t(msg) || msg : (msg || t('err_activation_failed'));
                        }
                    } catch (e) {
                        authError.value = t('err_connection_failed');
                    } finally {
                        authLoading.value = false;
                    }
                };

                const deactivateLicense = async () => {
                    try {
                        await ipc('deactivate-license');
                        isLicensed.value = false;
                        licenseInfo.value = null;
                        showAuthPanel.value = true;
                        authError.value = '';
                        authSuccess.value = '';
                    } catch (e) {
                        Editor.warn('[MCP Panel] deactivate error:', e);
                    }
                };

                const onLangChange = (e) => {
                    authLang.value = e.target.value;
                };

                const changeLicenseCode = async () => {
                    if (!newCode.value) { changeCodeError.value = t('code_required'); return; }
                    changeCodeLoading.value = true;
                    changeCodeError.value = '';
                    try {
                        const result = await ipc('activate-license', { email: authEmail.value || (licenseInfo.value && licenseInfo.value.email) || '', activationCode: newCode.value });
                        if (result && result.success) {
                            isLicensed.value = true;
                            licenseInfo.value = result.licenseInfo || null;
                            showChangeCodeModal.value = false;
                            newCode.value = '';
                        } else {
                            isLicensed.value = false;
                            licenseInfo.value = null;
                            showAuthPanel.value = true;
                            showChangeCodeModal.value = false;
                            changeCodeError.value = (result && result.message) || t('activation_failed', '');
                        }
                    } catch (e) {
                        changeCodeError.value = e.message || t('activation_failed', '');
                    } finally {
                        changeCodeLoading.value = false;
                    }
                };

                const copyInviteCode = () => {
                    const code = licenseInfo.value && licenseInfo.value.inviteCode;
                    if (code) {
                        try { require('electron').clipboard.writeText(code); } catch (e) {}
                    }
                };

                // Computed
                const getMaskedEmail = computed(() => {
                    const email = (licenseInfo.value && licenseInfo.value.email) || '';
                    if (!email) return '';
                    const atIndex = email.indexOf('@');
                    if (atIndex <= 1) return email;
                    return email.charAt(0) + '***' + email.substring(atIndex);
                });

                const expiryColorClass = computed(() => {
                    const _li = licenseInfo.value;
                    const d = (_li && _li.daysRemaining != null) ? _li.daysRemaining : 9999;
                    if (d > 30) return 'expiry-green';
                    if (d > 7) return 'expiry-orange';
                    return 'expiry-red';
                });

                const localeOptions = localeOrder.map(code => ({
                    code,
                    label: { zh: '中文', en: 'EN', ja: '日本語', ko: '한국어', fr: 'FR', de: 'DE', es: 'ES', pt: 'PT', ru: 'RU', ar: 'AR' }[code] || code
                }));

                // ===== Server =====
                const serverRunning = ref(false);
                const serverPort = ref(4000);
                const serverClients = ref(0);
                const serverAutoStart = ref(false);
                const serverDebugLog = ref(false);
                const serverMaxConnections = ref(10);
                const configTimeout = ref(30000);

                // Settings object for template binding (v-model="settings.port" etc.)
                const settings = reactive({
                    port: 4000,
                    autoStart: false,
                    debugLog: false,
                    maxConnections: 10
                });

                const toggleServer = async () => {
                    try {
                        if (serverRunning.value) {
                            await ipc('stop-server');
                        } else {
                            await ipc('start-server');
                        }
                        setTimeout(async () => { await updateServerStatusOnly(); }, 500);
                    } catch (e) {
                        Editor.warn('[MCP Panel] toggle error:', e);
                    }
                };

                const saveSettings = async () => {
                    try {
                        await ipc('update-settings', {
                            port: settings.port,
                            autoStart: settings.autoStart,
                            enableDebugLog: settings.debugLog,
                            allowedOrigins: ['*'],
                            maxConnections: settings.maxConnections
                        });
                        setTimeout(async () => { await updateServerStatusOnly(); }, 500);
                    } catch (e) {
                        Editor.warn('[MCP Panel] save settings error:', e);
                    }
                };

                const updateServerStatusOnly = async () => {
                    try {
                        const result = await ipc('get-server-status');
                        if (result) {
                            serverRunning.value = result.running || false;
                            serverClients.value = result.clients || 0;
                            if (result.settings) {
                                serverPort.value = result.settings.port || 4000;
                                serverAutoStart.value = result.settings.autoStart || false;
                                serverDebugLog.value = result.settings.enableDebugLog || false;
                                serverMaxConnections.value = result.settings.maxConnections || 10;
                                // Sync settings reactive object for template v-model
                                settings.port = result.settings.port || 4000;
                                settings.autoStart = result.settings.autoStart || false;
                                settings.debugLog = result.settings.enableDebugLog || false;
                                settings.maxConnections = result.settings.maxConnections || 10;
                            }
                        }
                    } catch (e) { /* ignore */ }
                };

                // ===== Tools =====
                const availableTools = ref([]);
                const loadTools = async () => {
                    try {
                        const tools = await ipc('get-tools-list');
                        availableTools.value = tools || [];
                        // Populate tool manager with enabled-by-default tools
                        toolManagerTools.value = (tools || []).map(t => ({
                            name: t.name,
                            description: t.description || '',
                            category: 'cocos',
                            enabled: true
                        }));
                    } catch (e) { /* ignore */ }
                };

                // ===== Tabs =====
                const activeTab = ref('server');
                const switchTab = (tab) => { activeTab.value = tab; };

                // ===== Computed server properties =====
                const serverStatus = computed(() => serverRunning.value ? t('status_running') : t('status_stopped'));
                const statusClass = computed(() => serverRunning.value ? 'running' : 'stopped');
                const connectedClients = computed(() => serverClients.value);
                const httpUrl = computed(() => `http://127.0.0.1:${settings.port}/mcp`);
                const isProcessing = ref(false);
                const settingsChanged = ref(true); // always allow save in 2.x

                const copyUrl = () => {
                    try { require('electron').clipboard.writeText(httpUrl.value); } catch (e) {}
                };

                // ===== Tool Manager =====
                const toolManagerTools = ref([]);
                const toolCategories = computed(() => {
                    const cats = new Set();
                    toolManagerTools.value.forEach(t => cats.add(t.category || 'cocos'));
                    return Array.from(cats);
                });
                const totalTools = computed(() => toolManagerTools.value.length);
                const enabledTools = computed(() => toolManagerTools.value.filter(t => t.enabled).length);
                const disabledTools = computed(() => totalTools.value - enabledTools.value);

                const getToolsByCategory = (category) => {
                    return toolManagerTools.value.filter(t => (t.category || 'cocos') === category);
                };
                const getCategoryDisplayName = (category) => category;

                const updateToolStatus = (category, name, enabled) => {
                    const tool = toolManagerTools.value.find(t => t.name === name && (t.category || 'cocos') === category);
                    if (tool) tool.enabled = enabled;
                };

                const selectAllTools = () => { toolManagerTools.value.forEach(t => t.enabled = true); };
                const deselectAllTools = () => { toolManagerTools.value.forEach(t => t.enabled = false); };

                const toggleCategoryTools = (category, enabled) => {
                    getToolsByCategory(category).forEach(t => t.enabled = enabled);
                };

                const saveChanges = async () => {
                    try {
                        const enabledList = toolManagerTools.value.filter(t => t.enabled).map(t => ({ category: t.category || 'cocos', name: t.name }));
                        await ipc('update-enabled-tools', enabledList);
                    } catch (e) { Editor.warn('[MCP Panel] saveChanges error:', e); }
                };

                // ===== Config =====
                const cliScope = ref('user');
                const ideClients = ref([]);
                const cliClients = ref([]);
                const cliCommands = ref({ claude: '', gemini: '' });
                const configServerName = ref('CocosCreator2.x');
                const configServerUrl = computed(() => `http://127.0.0.1:${settings.port}/mcp`);
                const configLoading = ref({});
                const configLogs = ref([]);

                const addConfigLog = (message, type = 'info') => {
                    const time = new Date().toLocaleTimeString();
                    configLogs.value.unshift({ time, message, type });
                    if (configLogs.value.length > 50) configLogs.value.pop();
                };

                const formatConfigResultMessage = (result) => {
                    if (result && result.messageKey) {
                        return t(result.messageKey, ...((result.messageArgs || [])));
                    }
                    return (result && result.message) || t('config_operation_failed');
                };

                // 醒目弹框(2.x 优先 Editor.Dialog.messageBox,兜底 window.alert)
                const showConfigDialog = (title, detail) => {
                    try {
                        if (typeof Editor !== 'undefined' && Editor.Dialog && Editor.Dialog.messageBox) {
                            Editor.Dialog.messageBox({ type: 'warning', title: title, message: title, detail: String(detail || ''), buttons: ['OK'], default: 0 });
                            return;
                        }
                    } catch (e) {}
                    try { window.alert(title + '\n\n' + String(detail || '')); } catch (e) {}
                };

                const addToClient = async (clientType) => {
                    try {
                        const serverConfig = { serverName: configServerName.value, serverUrl: configServerUrl.value };
                        const result = await ipc('add-to-client', { clientType, serverConfig });
                        if (result && result.success) {
                            addConfigLog(result.message || `Added to ${clientType}`, 'success');
                            await loadConfigStatus();
                        } else {
                            const msg = formatConfigResultMessage(result);
                            addConfigLog(msg, 'error');
                            showConfigDialog(t('quick_config_dialog_title'), msg);
                        }
                    } catch (e) {
                        addConfigLog(`Failed: ${e.message}`, 'error');
                        showConfigDialog(t('quick_config_dialog_title'), e.message || String(e));
                    }
                };

                const removeFromClient = async (clientType) => {
                    try {
                        const result = await ipc('remove-from-client', { clientType, serverName: configServerName.value });
                        if (result && result.success) {
                            addConfigLog(result.message || `Removed from ${clientType}`, 'success');
                            await loadConfigStatus();
                        } else {
                            const msg = formatConfigResultMessage(result);
                            addConfigLog(msg, 'error');
                            showConfigDialog(t('delete_config'), msg);
                        }
                    } catch (e) {
                        addConfigLog(`Failed: ${e.message}`, 'error');
                        showConfigDialog(t('delete_config'), e.message || String(e));
                    }
                };

                const addToAllIDE = async () => {
                    try {
                        const serverConfig = { serverName: configServerName.value, serverUrl: configServerUrl.value };
                        await ipc('add-to-all-clients', serverConfig);
                        addConfigLog('Added to all IDE clients', 'success');
                        await loadConfigStatus();
                    } catch (e) { addConfigLog(`Failed: ${e.message}`, 'error'); }
                };

                const removeFromAllIDE = async () => {
                    try {
                        await ipc('remove-from-all-clients', configServerName.value);
                        addConfigLog('Removed from all IDE clients', 'success');
                        await loadConfigStatus();
                    } catch (e) { addConfigLog(`Failed: ${e.message}`, 'error'); }
                };

                const copyClientConfig = async (clientType) => {
                    try {
                        const serverConfig = { serverName: configServerName.value, serverUrl: configServerUrl.value };
                        const result = await ipc('generate-client-config', { clientType, serverConfig });
                        if (result && result.success && result.content) {
                            require('electron').clipboard.writeText(result.content);
                            addConfigLog(`Config copied for ${clientType}`, 'success');
                        }
                    } catch (e) { addConfigLog(`Copy failed: ${e.message}`, 'error'); }
                };

                const copyMachineId = () => {
                    try { require('electron').clipboard.writeText(machineId.value); } catch (e) {}
                };

                const manualCheckUpdate = async () => {
                    try {
                        updateChecking.value = true;
                        const result = await ipc('check-update', true);
                        if (result && result.hasUpdate) {
                            updateInfo.value = result;
                            showUpdateDialog.value = true;
                        }
                    } catch (e) { /* ignore */ }
                    finally { updateChecking.value = false; }
                };

                const skipUpdateVersion = async () => {
                    try {
                        if (updateInfo.value && updateInfo.value.latestVersion) {
                            await ipc('skip-update', updateInfo.value.latestVersion);
                        }
                    } catch (e) {}
                    showUpdateDialog.value = false;
                };

                // ===== Config Manager =====
                const refreshCLICommands = async () => {
                    try {
                        const serverConfig = { serverName: 'CocosCreator2.x', serverUrl: `http://127.0.0.1:${serverPort.value}/mcp`, scope: cliScope.value };
                        const result = await ipc('generate-cli-commands', serverConfig);
                        if (result && result.success && result.commands) {
                            cliCommands.value = {
                                claude: result.commands.claude || '',
                                gemini: result.commands.gemini || ''
                            };
                        }
                    } catch (e) { Editor.warn('[MCP Panel] refreshCLICommands error:', e); }
                };

                const configureClient = async (clientType, action) => {
                    try {
                        const serverConfig = { serverName: 'CocosCreator2.x', serverUrl: `http://127.0.0.1:${serverPort.value}/mcp` };
                        configLoading.value = { ...configLoading.value, [clientType]: true };
                        if (action === 'add') {
                            await ipc('add-to-client', { clientType, serverConfig });
                        } else if (action === 'remove') {
                            await ipc('remove-from-client', { clientType, serverName: 'CocosCreator2.x' });
                        }
                        await loadConfigStatus();
                    } catch (e) { Editor.warn('[MCP Panel] configureClient error:', e); }
                    finally { configLoading.value = { ...configLoading.value, [clientType]: false }; }
                };

                const openToolManager = () => { showToolManager.value = !showToolManager.value; };

                const loadConfigStatus = async () => {
                    try {
                        const result = await ipc('get-config-status', 'CocosCreator2.x');
                        if (result && result.success) {
                            const clients = result.clients || [];
                            ideClients.value = clients.filter(c => c.isAutoConfig);
                            cliClients.value = clients.filter(c => !c.isAutoConfig);
                        }
                    } catch (e) { /* ignore */ }
                };

                const loadToolManagerState = async () => {
                    try {
                        const result = await ipc('get-tool-manager-state');
                        if (result && result.success) {
                            const tools = result.availableTools || [];
                            toolManagerState.value = {
                                enabledCount: tools.filter(t => t.enabled).length,
                                totalCount: tools.length,
                                hasChanges: false
                            };
                        }
                    } catch (e) { /* ignore */ }
                };

                const checkForUpdate = async () => {
                    try {
                        updateChecking.value = true;
                        const result = await ipc('check-update', true);
                        if (result && result.hasUpdate) {
                            updateInfo.value = result;
                            showUpdateDialog.value = true;
                        }
                    } catch (e) { /* ignore */ }
                    finally { updateChecking.value = false; }
                };

                const dismissUpdate = () => { showUpdateDialog.value = false; };

                const openConfigFile = async (configPath) => {
                    try { await ipc('open-config-file', configPath); } catch (e) { /* ignore */ }
                };

                // ===== Mount =====
                onMounted(async () => {
                    // Non-blocking: fetch machine ID in background
                    ipc('get-machine-id').then(mid => { machineId.value = mid || ''; }).catch(() => {});

                    await checkLicense();
                    authChecked.value = true;
                    await updateServerStatusOnly();
                    await loadTools();
                    await loadConfigStatus();
                    await loadToolManagerState();
                    await refreshCLICommands();

                    dataLoaded.value = true;

                    // Check for updates (non-blocking)
                    checkForUpdate().catch(() => {});

                    // Poll status every 3 seconds + check device removal
                    _panelPollingTimer = setInterval(async () => {
                        await updateServerStatusOnly();
                        try {
                            const licResult = await ipc('check-license');
                            if (licResult && licResult.deviceRemovedMessage) {
                                isLicensed.value = false;
                                licenseInfo.value = null;
                                showAuthPanel.value = true;
                                authError.value = licResult.deviceRemovedMessage;
                                authSuccess.value = '';
                            }
                        } catch (e) {}
                    }, 3000);
                });

                return {
                    // i18n
                    t, dataLoaded, authChecked,
                    // Auth
                    isLicensed, authDisabled, showAuthPanel, showExpiryWarning,
                    authEmail, authCode, authError, authSuccess, authLoading, authLang,
                    licenseInfo, getMaskedEmail, expiryColorClass,
                    showExpiredAlert, confirmExpiredAlert,
                    dismissExpiryWarning: () => { showExpiryWarning.value = false; },
                    showChangeCodeModal, newCode, changeCodeError, changeCodeLoading,
                    changeLicenseCode, copyInviteCode,
                    showUpdateDialog, updateInfo, updateChecking, currentPluginVersion,
                    formatUpdateDate, dismissUpdate, manualCheckUpdate, skipUpdateVersion,
                    activateLicense, deactivateLicense, checkLicense, onLangChange,
                    machineId, copyMachineId, localeOptions,
                    // Tabs
                    activeTab, switchTab,
                    // Server
                    serverRunning, serverPort, serverClients, settings,
                    serverStatus, statusClass, connectedClients, httpUrl,
                    isProcessing, settingsChanged,
                    toggleServer, saveSettings, copyUrl,
                    configTimeout,
                    // Tools
                    availableTools, toolManagerTools,
                    toolCategories, totalTools, enabledTools, disabledTools,
                    getToolsByCategory, getCategoryDisplayName,
                    updateToolStatus, selectAllTools, deselectAllTools,
                    toggleCategoryTools, saveChanges,
                    loadToolManagerState,
                    // Config
                    configServerName, configServerUrl, cliScope,
                    ideClients, cliClients, cliCommands, configLogs,
                    copyCLICommand: (type) => {
                        const cmd = cliCommands.value[type];
                        if (cmd) { try { require('electron').clipboard.writeText(cmd); } catch (e) {} }
                    },
                    configLoading,
                    refreshCLICommands, addToClient, removeFromClient,
                    addToAllIDE, removeFromAllIDE,
                    copyClientConfig, openConfigFile,
                    loadConfigStatus
                };
            }
        }));

        try {
            app.mount(appEl);
            _app = app;
            Editor.log('[MCP Panel] Vue app mounted successfully');
            // Debug: check if content rendered
            setTimeout(() => {
                Editor.log('[MCP Panel] appEl innerHTML length: ' + (appEl.innerHTML || '').length);
                Editor.log('[MCP Panel] appEl first 200 chars: ' + (appEl.innerHTML || '').substring(0, 200));
            }, 2000);
        } catch (e) {
            Editor.error('[MCP Panel] Vue mount FAILED: ' + e.message);
            Editor.error('[MCP Panel] Stack: ' + e.stack);
        }
    },

    close() {
        if (_panelPollingTimer) {
            clearInterval(_panelPollingTimer);
            _panelPollingTimer = null;
        }
        if (_app) {
            _app.unmount();
            _app = null;
        }
    }
});
