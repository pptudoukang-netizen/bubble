"use strict";

const { MCPServer } = require("./mcp-server");
const {
  readSettings,
  saveSettings
} = require("./settings");
const { getStableMachineId } = require("./auth/device-identity");
const { ToolManager } = require("./tools/tool-manager");
const {
  generateCLICommand,
  generateJSONConfig,
  generateTOMLConfig
} = require("./mcp-client-configs");

let mcpServer = null;
let toolManager = null;

function reply(event, err, data) {
  if (event && typeof event.reply === "function") {
    event.reply(err || null, data);
  }
}

function getToolManager() {
  if (!toolManager) toolManager = new ToolManager();
  return toolManager;
}

function getServer(settings) {
  if (!mcpServer) {
    mcpServer = new MCPServer(settings || readSettings());
    mcpServer.licenseValid = () => true;
  }
  return mcpServer;
}

function localLicenseInfo() {
  return {
    email: "local-dev",
    licenseType: "local-development",
    daysRemaining: 36500,
    expiryDate: "2099-12-31",
    isActive: true
  };
}

function getServerConfig(input) {
  const settings = readSettings();
  const serverName = (input && input.serverName) || "CocosCreator2.x";
  const serverUrl = (input && input.serverUrl) || `http://127.0.0.1:${settings.port || 4000}/mcp`;
  return Object.assign({}, input || {}, { serverName, serverUrl });
}

function safeGenerateConfig(clientType, serverConfig) {
  try {
    if (clientType === "codex-cli") {
      return generateTOMLConfig(clientType, serverConfig, "streamable-http");
    }
    return generateJSONConfig(clientType, serverConfig, "streamable-http");
  } catch (err) {
    return JSON.stringify({ mcpServers: { [serverConfig.serverName]: { url: serverConfig.serverUrl } } }, null, 2);
  }
}

module.exports = {
  messages: {
    open(event) {
      Editor.Panel.open("cocos2x-mcp-server");
      reply(event, null);
    },

    "start-server"(event) {
      const server = getServer();
      server.start()
        .then(() => {
          console.log("[MCP] Server started successfully");
          reply(event, null, { success: true });
        })
        .catch((err) => {
          console.error("[MCP] Failed to start server:", err.message);
          reply(event, null, { success: false, message: err.message });
        });
    },

    "stop-server"(event) {
      if (mcpServer) {
        mcpServer.stop();
        console.log("[MCP] Server stopped");
      }
      reply(event, null, { success: true });
    },

    "get-server-status"(event) {
      const status = mcpServer ? mcpServer.getStatus() : { running: false, port: readSettings().port || 4000, clients: 0 };
      reply(event, null, Object.assign({}, status, { settings: readSettings() }));
    },

    "get-server-settings"(event) {
      reply(event, null, readSettings());
    },

    "update-settings"(event, settings) {
      console.log("[MCP] Updating settings:", JSON.stringify(settings));
      saveSettings(settings);
      const wasRunning = mcpServer && mcpServer.getStatus().running;
      if (mcpServer) mcpServer.stop();
      mcpServer = new MCPServer(settings);
      mcpServer.licenseValid = () => true;
      if (wasRunning) {
        mcpServer.start().catch((err) => console.error("[MCP] Failed to restart:", err.message));
      }
      reply(event, null, { success: true, settings: mcpServer.getSettings() });
    },

    "get-tools-list"(event) {
      reply(event, null, getToolManager().getAvailableTools());
    },

    "get-tool-manager-state"(event) {
      reply(event, null, getToolManager().getToolManagerState());
    },

    "update-enabled-tools"(event, enabledTools) {
      try {
        if (mcpServer && typeof mcpServer.updateEnabledTools === "function") {
          mcpServer.updateEnabledTools(enabledTools || []);
        }
        reply(event, null, { success: true });
      } catch (err) {
        reply(event, null, { success: false, message: err.message });
      }
    },

    "check-license"(event) {
      reply(event, null, {
        licensed: true,
        licenseInfo: localLicenseInfo(),
        authDisabled: true,
        deviceRemovedMessage: null
      });
    },

    "activate-license"(event) {
      reply(event, null, { success: true, licenseInfo: localLicenseInfo() });
    },

    "deactivate-license"(event) {
      reply(event, null, { success: true, authDisabled: true });
    },

    "get-machine-id"(event) {
      try {
        reply(event, null, getStableMachineId());
      } catch (err) {
        reply(event, null, "local-dev-machine");
      }
    },

    "check-update"(event) {
      reply(event, null, {
        hasUpdate: false,
        latestVersion: "",
        changelog: "",
        downloadUrl: "",
        releaseDate: "",
        urgency: "normal",
        minVersion: ""
      });
    },

    "generate-cli-commands"(event, config) {
      const serverConfig = getServerConfig(config);
      const scope = (config && config.scope) || "user";
      const commandFor = (clientType) => generateCLICommand({
        clientType,
        serverConfig,
        transport: "streamable-http",
        scope
      });
      reply(event, null, {
        success: true,
        commands: {
          claude: commandFor("claude-cli"),
          gemini: commandFor("gemini-cli"),
          codex: commandFor("codex-cli")
        }
      });
    },

    "generate-client-config"(event, payload) {
      const clientType = payload && payload.clientType;
      const serverConfig = getServerConfig(payload && payload.serverConfig);
      reply(event, null, {
        success: true,
        content: safeGenerateConfig(clientType || "cursor", serverConfig)
      });
    },

    "add-to-client"(event) {
      reply(event, null, { success: true, message: "Local development build: config write skipped." });
    },

    "remove-from-client"(event) {
      reply(event, null, { success: true, message: "Local development build: config remove skipped." });
    },

    "add-to-all-clients"(event) {
      reply(event, null, { success: true });
    },

    "remove-from-all-clients"(event) {
      reply(event, null, { success: true });
    }
  },

  load() {
    try {
      console.log("[MCP] Cocos 2.x MCP Server extension loading (local JS server)...");
      process.on("uncaughtException", (err) => {
        console.error("[MCP] Uncaught exception (server kept alive):", err.message);
      });
      process.on("unhandledRejection", (reason) => {
        console.error("[MCP] Unhandled rejection (server kept alive):", (reason && reason.message) || reason);
      });

      getToolManager();
      const settings = readSettings();
      console.log("[MCP] Settings:", JSON.stringify(settings));
      mcpServer = new MCPServer(settings);
      mcpServer.licenseValid = () => true;
      console.log("[MCP] MCPServer created successfully");

      if (settings.autoStart) {
        mcpServer.start().catch((err) => {
          console.error("[MCP] AutoStart failed:", err.message);
        });
      } else {
        console.log("[MCP] Server ready. Open the MCP Server panel to start.");
      }
    } catch (err) {
      console.error("[MCP] FATAL: Extension load failed:", err.message);
      console.error("[MCP] Stack:", err.stack);
    }
  },

  unload() {
    if (mcpServer) {
      mcpServer.stop();
      mcpServer = null;
    }
    toolManager = null;
    console.log("[MCP] Extension unloaded");
  }
};
