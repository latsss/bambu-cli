const BaseCommand = require("../base/BaseCommand");
const CommandResult = require("../base/CommandResult");
const {
    addToConfig,
    removeFromConfig,
    listPrinters,
    updateConfig,
    validatePrinterConfig,
} = require("../../config/config");

/**
 * Configuration management command
 * Handles adding, removing, listing, and updating printer configurations
 */
class ConfigCommand extends BaseCommand {
    constructor() {
        super("config", "Manage printer configurations");
        this.requiresPrinter = false;
        this.requiresConnection = false;
    }

    /**
     * Validate command arguments
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @throws {Error} If validation fails
     */
    async validate(args, options) {
        if (!args.action) {
            throw new Error(
                "Action is required (add, remove, list, update, validate)"
            );
        }

        const validActions = ["add", "remove", "list", "update", "validate"];
        if (!validActions.includes(args.action)) {
            throw new Error(
                `Invalid action. Must be one of: ${validActions.join(", ")}`
            );
        }

        // Validate action-specific requirements
        if (["add", "update"].includes(args.action)) {
            if (
                !args.name ||
                !args.address ||
                !args.deviceId ||
                !args.accessCode
            ) {
                throw new Error(
                    `${args.action} requires: name, address, deviceId, accessCode`
                );
            }
        }

        if (["remove", "validate"].includes(args.action)) {
            if (!args.name) {
                throw new Error(`${args.action} requires: name`);
            }
        }
    }

    /**
     * Execute the config command
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @returns {Promise<Object>} Command result data
     */
    async run(args, options) {
        try {
            switch (args.action) {
                case "add":
                    return await this.handleAdd(args);
                case "remove":
                    return await this.handleRemove(args);
                case "list":
                    return await this.handleList(args);
                case "update":
                    return await this.handleUpdate(args);
                case "validate":
                    return await this.handleValidate(args);
                default:
                    throw new Error(`Unknown action: ${args.action}`);
            }
        } catch (error) {
            this.log("error", `Config command failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle add action
     * @param {Object} args - Command arguments
     * @returns {Promise<Object>} Result data
     */
    async handleAdd(args) {
        this.log("info", `Adding printer: ${args.name}`);

        addToConfig(args.name, args.address, args.deviceId, args.accessCode);

        return {
            action: "add",
            printer: args.name,
            address: args.address,
            deviceId: args.deviceId,
            success: true,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Handle remove action
     * @param {Object} args - Command arguments
     * @returns {Promise<Object>} Result data
     */
    async handleRemove(args) {
        this.log("info", `Removing printer: ${args.name}`);

        removeFromConfig(args.name);

        return {
            action: "remove",
            printer: args.name,
            success: true,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Handle list action
     * @param {Object} args - Command arguments
     * @returns {Promise<Object>} Result data
     */
    async handleList(args) {
        this.log("info", "Listing configured printers");

        const printers = listPrinters();

        return {
            action: "list",
            printers: printers,
            count: Object.keys(printers).length,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Handle update action
     * @param {Object} args - Command arguments
     * @returns {Promise<Object>} Result data
     */
    async handleUpdate(args) {
        this.log("info", `Updating printer: ${args.name}`);

        updateConfig(args.name, args.address, args.deviceId, args.accessCode);

        return {
            action: "update",
            printer: args.name,
            address: args.address,
            deviceId: args.deviceId,
            success: true,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Handle validate action
     * @param {Object} args - Command arguments
     * @returns {Promise<Object>} Result data
     */
    async handleValidate(args) {
        this.log("info", `Validating printer: ${args.name}`);

        const config = {
            address: args.address,
            deviceId: args.deviceId,
            accessCode: args.accessCode,
        };

        const validation = validatePrinterConfig(config);

        return {
            action: "validate",
            printer: args.name,
            config: config,
            validation: validation,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Format successful command result
     * @param {Object} data - Result data
     * @returns {string} Formatted output
     */
    formatSuccess(data) {
        switch (data.action) {
            case "add":
                return `✅ Added printer: ${data.printer}\n📍 Address: ${data.address}\n🆔 Device ID: ${data.deviceId}`;

            case "remove":
                return `✅ Removed printer: ${data.printer}`;

            case "list":
                if (data.count === 0) {
                    return "📋 No printers configured";
                }
                let output = `📋 Configured printers (${data.count}):\n`;
                for (const [name, config] of Object.entries(data.printers)) {
                    output += `\n🔸 ${name}:\n`;
                    output += `   📍 Address: ${config.address}\n`;
                    output += `   🆔 Device ID: ${config.deviceId}\n`;
                }
                return output;

            case "update":
                return `✅ Updated printer: ${data.printer}\n📍 Address: ${data.address}\n🆔 Device ID: ${data.deviceId}`;

            case "validate":
                if (data.validation.valid) {
                    return `✅ Configuration valid for: ${data.printer}`;
                } else {
                    return `❌ Configuration invalid for: ${
                        data.printer
                    }\nErrors: ${data.validation.errors.join(", ")}`;
                }

            default:
                return JSON.stringify(data, null, 2);
        }
    }
}

module.exports = ConfigCommand;
