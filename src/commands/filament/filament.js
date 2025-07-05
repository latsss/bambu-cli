const BaseCommand = require("../base/BaseCommand");
const CommandResult = require("../base/CommandResult");
const PrinterManager = require("../../services/printer/PrinterManager");

/**
 * Filament management command
 * Handles loading and unloading filament operations
 */
class FilamentCommand extends BaseCommand {
    constructor() {
        super("filament", "Manage filament operations");
        this.requiresPrinter = true;
        this.requiresConnection = true;
    }

    /**
     * Validate command arguments
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @throws {Error} If validation fails
     */
    async validate(args, options) {
        if (!args.action) {
            throw new Error("Action is required (unload)");
        }

        const validActions = ["unload"];
        if (!validActions.includes(args.action)) {
            throw new Error(
                `Invalid action. Must be one of: ${validActions.join(", ")}`
            );
        }

        if (!args.printerName) {
            throw new Error("Printer name is required");
        }
    }

    /**
     * Execute the filament command
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @returns {Promise<Object>} Command result data
     */
    async run(args, options) {
        try {
            switch (args.action) {
                case "unload":
                    return await this.handleUnload(args);
                default:
                    throw new Error(`Unknown action: ${args.action}`);
            }
        } catch (error) {
            this.log("error", `Filament command failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handle unload action
     * @param {Object} args - Command arguments
     * @returns {Promise<Object>} Result data
     */
    async handleUnload(args) {
        this.log("info", `Unloading filament for printer: ${args.printerName}`);

        const printerManager = new PrinterManager();
        const response = await printerManager.unloadFilament(args.printerName);

        return {
            action: "unload",
            printer: args.printerName,
            response: response,
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Format successful command result
     * @param {Object} data - Result data
     * @returns {string} Formatted output
     */
    formatSuccess(data) {
        const actionEmoji = "📤";
        const actionText = "Unloading";

        let output = `${actionEmoji} ${actionText} filament for printer: ${data.printer}\n`;
        output += `⏰ Timestamp: ${data.timestamp}`;

        return output;
    }
}

module.exports = FilamentCommand;
