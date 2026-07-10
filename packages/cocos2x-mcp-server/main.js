'use strict';

var mcpServer = null;

module.exports = {
    messages: {
        'open': function (event) {
            Editor.Panel.open('cocos2x-mcp-server');
        },

        'start-server': function (event) {
            if (!mcpServer) {
                Editor.warn('[MCP] Server not initialized');
                if (event.reply) event.reply(new Error('Server not initialized'));
                return;
            }
            mcpServer.start().then(function () {
                Editor.log('[MCP] Server started successfully');
                if (event.reply) event.reply(null, { success: true });
            }).catch(function (err) {
                Editor.error('[MCP] Failed to start server: ' + err.message);
                if (event.reply) event.reply(null, { success: false, message: err.message });
            });
        },

        'stop-server': function (event) {
            if (mcpServer) {
                mcpServer.stop();
                Editor.log('[MCP] Server stopped');
            }
            if (event.reply) event.reply(null, { success: true });
        },

        'get-server-status': function (event) {
            var settings_mod = require('./dist/settings');
            var status = mcpServer ? mcpServer.getStatus() : { running: false, port: 0, clients: 0 };
            var settings = mcpServer ? mcpServer.getSettings() : settings_mod.readSettings();
            if (event.reply) event.reply(null, Object.assign({}, status, { settings: settings }));
        },

        'update-settings': function (event, settings) {
            try {
                var settings_mod = require('./dist/settings');
                var MCPServerClass = require('./dist/mcp-server').MCPServer;
                Editor.log('[MCP] Updating settings: ' + JSON.stringify(settings));
                settings_mod.saveSettings(settings);

                if (mcpServer) {
                    var wasRunning = mcpServer.getStatus().running;
                    mcpServer.stop();
                    mcpServer = new MCPServerClass(settings);
                    if (wasRunning) {
                        mcpServer.start().catch(function (err) {
                            Editor.error('[MCP] Failed to restart: ' + err.message);
                        });
                    }
                } else {
                    mcpServer = new MCPServerClass(settings);
                }
                if (event.reply) event.reply(null, { success: true, settings: mcpServer.getSettings() });
            } catch (err) {
                Editor.error('[MCP] update-settings error: ' + err.message);
                if (event.reply) event.reply(err);
            }
        },

        'get-server-settings': function (event) {
            var settings_mod = require('./dist/settings');
            var settings = mcpServer ? mcpServer.getSettings() : settings_mod.readSettings();
            if (event.reply) event.reply(null, settings);
        },

        'get-tools-list': function (event) {
            var tools = mcpServer ? mcpServer.getAvailableTools() : [];
            if (event.reply) event.reply(null, tools);
        }
    },

    load: function () {
        Editor.log('[MCP] === load() start ===');
        try {
            Editor.log('[MCP] Step 1: require settings...');
            var settings_mod = require('./dist/settings');
            Editor.log('[MCP] Step 1: OK');
        } catch (e) {
            Editor.error('[MCP] Step 1 FAILED: ' + e.message);
            Editor.error(e.stack);
            return;
        }
        try {
            Editor.log('[MCP] Step 2: require mcp-server...');
            var MCPServerClass = require('./dist/mcp-server').MCPServer;
            Editor.log('[MCP] Step 2: OK, MCPServer=' + typeof MCPServerClass);
        } catch (e) {
            Editor.error('[MCP] Step 2 FAILED: ' + e.message);
            Editor.error(e.stack);
            return;
        }
        try {
            var settings = settings_mod.readSettings();
            Editor.log('[MCP] Step 3: Settings loaded: port=' + settings.port);
            mcpServer = new MCPServerClass(settings);
            Editor.log('[MCP] Step 4: MCPServer created OK');
        } catch (e) {
            Editor.error('[MCP] Step 3-4 FAILED: ' + e.message);
            Editor.error(e.stack);
            return;
        }
        Editor.log('[MCP] === load() done, server ready ===');
    },

    unload: function () {
        if (mcpServer) {
            mcpServer.stop();
            mcpServer = null;
        }
        Editor.log('[MCP] Extension unloaded');
    }
};
