const YAML = require("yaml");
const fs = require("fs");
const path = require("path");
const os = require("os");

const configFile =
    process.env.configFile?.replace("~", os.homedir) ||
    `${os.homedir}/.bambu-cli/config.yml`;

/**
 * Configuration management class
 * Handles printer configuration storage, validation, and management
 */
class ConfigManager {
    constructor() {
        this.configFile = configFile;
        this.config = this.loadConfig();
    }

    /**
     * Load configuration from file
     * @returns {Object} Configuration object
     */
    loadConfig() {
        if (!fs.existsSync(this.configFile)) {
            return {};
        }

        try {
            const content = fs.readFileSync(this.configFile).toString();
            return YAML.parse(content) || {};
        } catch (error) {
            console.error(` ❌ Error loading config: ${error.message}`);
            return {};
        }
    }

    /**
     * Save configuration to file
     * @param {Object} config - Configuration to save
     */
    saveConfig(config) {
        try {
            if (!fs.existsSync(path.dirname(this.configFile))) {
                fs.mkdirSync(path.dirname(this.configFile), {
                    recursive: true,
                });
            }
            fs.writeFileSync(this.configFile, YAML.stringify(config));
        } catch (error) {
            throw new Error(`Failed to save config: ${error.message}`);
        }
    }

    /**
     * Validate printer configuration
     * @param {Object} config - Printer configuration
     * @returns {Object} Validation result
     */
    validatePrinterConfig(config) {
        const errors = [];

        if (!config.address) {
            errors.push("Address is required");
        } else if (!this.isValidIpAddress(config.address)) {
            errors.push("Invalid IP address format");
        }

        if (!config.deviceId) {
            errors.push("Device ID is required");
        } else if (
            typeof config.deviceId !== "string" ||
            config.deviceId.length === 0
        ) {
            errors.push("Device ID must be a non-empty string");
        }

        if (!config.accessCode) {
            errors.push("Access code is required");
        } else if (
            typeof config.accessCode !== "string" ||
            config.accessCode.length === 0
        ) {
            errors.push("Access code must be a non-empty string");
        }

        return {
            valid: errors.length === 0,
            errors: errors,
        };
    }

    /**
     * Check if IP address is valid
     * @param {string} ip - IP address to validate
     * @returns {boolean} Valid IP address
     */
    isValidIpAddress(ip) {
        const ipRegex =
            /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return ipRegex.test(ip);
    }

    /**
     * Add printer to configuration
     * @param {string} name - Printer name
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @param {string} accessCode - Printer access code
     */
    addToConfig(name, address, deviceId, accessCode) {
        // Validate inputs
        if (!name || typeof name !== "string") {
            throw new Error("Printer name is required and must be a string");
        }

        const config = {
            address,
            deviceId,
            accessCode,
        };

        const validation = this.validatePrinterConfig(config);
        if (!validation.valid) {
            throw new Error(
                `Invalid printer configuration: ${validation.errors.join(", ")}`
            );
        }

        // Check if printer already exists
        if (Object.keys(this.config).includes(name)) {
            throw new Error(
                `Printer '${name}' is already present in config. Use 'update' subcommand instead`
            );
        }

        // Add printer to config
        this.config[name] = config;
        this.saveConfig(this.config);

        console.log(` ✅ Printer '${name}' added successfully`);
    }

    /**
     * Update existing printer configuration
     * @param {string} name - Printer name
     * @param {string} address - Printer IP address
     * @param {string} deviceId - Printer device ID
     * @param {string} accessCode - Printer access code
     */
    updateConfig(name, address, deviceId, accessCode) {
        if (!Object.keys(this.config).includes(name)) {
            throw new Error(
                `Printer '${name}' not found in config. Use 'add' subcommand instead`
            );
        }

        const config = {
            address,
            deviceId,
            accessCode,
        };

        const validation = this.validatePrinterConfig(config);
        if (!validation.valid) {
            throw new Error(
                `Invalid printer configuration: ${validation.errors.join(", ")}`
            );
        }

        this.config[name] = config;
        this.saveConfig(this.config);

        console.log(` ✅ Printer '${name}' updated successfully`);
    }

    /**
     * Remove printer from configuration
     * @param {string} name - Printer name
     */
    removeFromConfig(name) {
        if (!fs.existsSync(this.configFile)) {
            throw new Error("Config file not found");
        }

        if (!this.config || Object.keys(this.config).length === 0) {
            throw new Error("Config is empty or invalid");
        }

        if (!Object.keys(this.config).includes(name)) {
            throw new Error(`Printer '${name}' not found in config`);
        }

        delete this.config[name];
        this.saveConfig(this.config);

        console.log(` ✅ Printer '${name}' removed successfully`);
    }

    /**
     * Get printer configuration
     * @param {string} name - Printer name
     * @returns {Object} Printer configuration
     */
    getPrinter(name) {
        if (!fs.existsSync(this.configFile)) {
            throw new Error("Config file not found");
        }

        if (!this.config || Object.keys(this.config).length === 0) {
            throw new Error("Config is empty or invalid");
        }

        if (!Object.keys(this.config).includes(name)) {
            throw new Error(
                `Printer '${name}' not found in config. Check spelling or add it.`
            );
        }

        return {
            ...this.config[name],
            name: name,
        };
    }

    /**
     * List all configured printers
     * @returns {Object} All printer configurations
     */
    listPrinters() {
        return this.config;
    }

    /**
     * Get printer names
     * @returns {Array<string>} Array of printer names
     */
    getPrinterNames() {
        return Object.keys(this.config);
    }

    /**
     * Check if printer exists
     * @param {string} name - Printer name
     * @returns {boolean} True if printer exists
     */
    hasPrinter(name) {
        return Object.keys(this.config).includes(name);
    }

    /**
     * Get configuration file path
     * @returns {string} Configuration file path
     */
    getConfigFilePath() {
        return this.configFile;
    }

    /**
     * Backup configuration
     * @param {string} backupPath - Backup file path
     */
    backupConfig(backupPath) {
        try {
            fs.copyFileSync(this.configFile, backupPath);
            console.log(` ✅ Configuration backed up to: ${backupPath}`);
        } catch (error) {
            throw new Error(`Failed to backup config: ${error.message}`);
        }
    }

    /**
     * Restore configuration from backup
     * @param {string} backupPath - Backup file path
     */
    restoreConfig(backupPath) {
        try {
            if (!fs.existsSync(backupPath)) {
                throw new Error("Backup file not found");
            }

            fs.copyFileSync(backupPath, this.configFile);
            this.config = this.loadConfig();
            console.log(` ✅ Configuration restored from: ${backupPath}`);
        } catch (error) {
            throw new Error(`Failed to restore config: ${error.message}`);
        }
    }

    /**
     * Export configuration to JSON
     * @returns {string} JSON string
     */
    exportToJson() {
        return JSON.stringify(this.config, null, 2);
    }

    /**
     * Import configuration from JSON
     * @param {string} jsonData - JSON configuration data
     */
    importFromJson(jsonData) {
        try {
            const importedConfig = JSON.parse(jsonData);

            // Validate imported config
            for (const [name, config] of Object.entries(importedConfig)) {
                const validation = this.validatePrinterConfig(config);
                if (!validation.valid) {
                    throw new Error(
                        `Invalid configuration for printer '${name}': ${validation.errors.join(
                            ", "
                        )}`
                    );
                }
            }

            this.config = importedConfig;
            this.saveConfig(this.config);
            console.log(` ✅ Configuration imported successfully`);
        } catch (error) {
            throw new Error(`Failed to import configuration: ${error.message}`);
        }
    }
}

// Create singleton instance
const configManager = new ConfigManager();

// Export functions for backward compatibility
module.exports.addToConfig = (name, address, deviceId, accessCode) => {
    configManager.addToConfig(name, address, deviceId, accessCode);
};

module.exports.removeFromConfig = (name) => {
    configManager.removeFromConfig(name);
};

module.exports.getPrinter = (name) => {
    return configManager.getPrinter(name);
};

// Export new methods
module.exports.updateConfig = (name, address, deviceId, accessCode) => {
    configManager.updateConfig(name, address, deviceId, accessCode);
};

module.exports.listPrinters = () => {
    return configManager.listPrinters();
};

module.exports.getPrinterNames = () => {
    return configManager.getPrinterNames();
};

module.exports.hasPrinter = (name) => {
    return configManager.hasPrinter(name);
};

module.exports.validatePrinterConfig = (config) => {
    return configManager.validatePrinterConfig(config);
};

module.exports.backupConfig = (backupPath) => {
    configManager.backupConfig(backupPath);
};

module.exports.restoreConfig = (backupPath) => {
    configManager.restoreConfig(backupPath);
};

module.exports.exportToJson = () => {
    return configManager.exportToJson();
};

module.exports.importFromJson = (jsonData) => {
    configManager.importFromJson(jsonData);
};

// Export the manager instance for advanced usage
module.exports.ConfigManager = ConfigManager;
module.exports.configManager = configManager;
