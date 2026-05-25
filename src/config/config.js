const YAML = require("yaml");
const fs = require("fs");
const path = require("path");
const os = require("os");

function resolveConfigPath() {
    const home = os.homedir();
    const envPath = process.env.BAMBU_CLI_CONFIG || process.env.configFile;
    if (envPath) return envPath.startsWith("~") ? path.join(home, envPath.slice(1)) : envPath;
    return path.join(home, ".bambu-cli", "config.yml");
}

const configFile = resolveConfigPath();

class ConfigManager {
    constructor() {
        this.configFile = configFile;
        this.config = this.loadConfig();
    }

    loadConfig() {
        if (!fs.existsSync(this.configFile)) return {};
        try {
            const content = fs.readFileSync(this.configFile, "utf8");
            return YAML.parse(content) || {};
        } catch (error) {
            // Don't swallow silently — surface so the user knows their config is unreadable.
            throw new Error(`Failed to load config at ${this.configFile}: ${error.message}`);
        }
    }

    saveConfig(config) {
        const dir = path.dirname(this.configFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        // 0600: only the owner can read (access codes live in here).
        fs.writeFileSync(this.configFile, YAML.stringify(config), { mode: 0o600 });
        try {
            fs.chmodSync(this.configFile, 0o600);
        } catch {
            // best-effort on platforms that don't support chmod
        }
    }

    validatePrinterConfig(config) {
        const errors = [];
        if (!config.address) errors.push("Address is required");
        else if (!this.isValidIpAddress(config.address)) errors.push("Invalid IP address format");

        if (!config.deviceId || typeof config.deviceId !== "string") {
            errors.push("Device ID must be a non-empty string");
        }
        if (!config.accessCode || typeof config.accessCode !== "string") {
            errors.push("Access code must be a non-empty string");
        }
        return { valid: errors.length === 0, errors };
    }

    isValidIpAddress(ip) {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }

    addToConfig(name, address, deviceId, accessCode) {
        if (!name || typeof name !== "string") {
            throw new Error("Printer name is required and must be a string");
        }
        const entry = { address, deviceId, accessCode };
        const validation = this.validatePrinterConfig(entry);
        if (!validation.valid) {
            throw new Error(`Invalid printer configuration: ${validation.errors.join(", ")}`);
        }
        if (this.config[name]) {
            throw new Error(`Printer '${name}' is already present in config. Use 'update' subcommand instead`);
        }
        this.config[name] = entry;
        this.saveConfig(this.config);
    }

    updateConfig(name, address, deviceId, accessCode) {
        if (!this.config[name]) {
            throw new Error(`Printer '${name}' not found in config. Use 'add' subcommand instead`);
        }
        const entry = { address, deviceId, accessCode };
        const validation = this.validatePrinterConfig(entry);
        if (!validation.valid) {
            throw new Error(`Invalid printer configuration: ${validation.errors.join(", ")}`);
        }
        this.config[name] = entry;
        this.saveConfig(this.config);
    }

    removeFromConfig(name) {
        if (!this.config[name]) {
            throw new Error(`Printer '${name}' not found in config`);
        }
        delete this.config[name];
        this.saveConfig(this.config);
    }

    getPrinter(name) {
        if (!this.config[name]) {
            throw new Error(`Printer '${name}' not found in config. Check spelling or add it.`);
        }
        return { ...this.config[name], name };
    }

    listPrinters() {
        return this.config;
    }

    getConfigFilePath() {
        return this.configFile;
    }
}

const configManager = new ConfigManager();

module.exports = {
    ConfigManager,
    configManager,
    addToConfig: (name, address, deviceId, accessCode) => configManager.addToConfig(name, address, deviceId, accessCode),
    removeFromConfig: (name) => configManager.removeFromConfig(name),
    updateConfig: (name, address, deviceId, accessCode) => configManager.updateConfig(name, address, deviceId, accessCode),
    getPrinter: (name) => configManager.getPrinter(name),
    listPrinters: () => configManager.listPrinters(),
};
