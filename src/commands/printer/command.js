const BaseCommand = require("../base/BaseCommand");
const CommandResult = require("../base/CommandResult");
const PrinterManager = require("../../services/printer/PrinterManager");

/**
 * Custom MQTT command
 * Sends custom JSON commands to printers for testing and non-implemented features
 */
class CommandCommand extends BaseCommand {
    constructor() {
        super("command", "Send custom MQTT command to printer");
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
        if (!args.printerName) {
            throw new Error("Printer name is required");
        }

        if (!args.commandJson) {
            throw new Error("Command JSON is required");
        }

        // Validate JSON format
        try {
            JSON.parse(args.commandJson);
        } catch (error) {
            throw new Error(`Invalid JSON format: ${error.message}`);
        }
    }

    /**
     * Execute the custom command
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @returns {Promise<Object>} Command result data
     */
    async run(args, options) {
        try {
            this.log("info", `Sending custom command to printer: ${args.printerName}`);

            const printerManager = new PrinterManager();
            const response = await printerManager.sendCustomCommand(
                args.printerName,
                args.commandJson,
                options
            );

            return {
                printer: args.printerName,
                command: JSON.parse(args.commandJson),
                response: response,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.log("error", `Custom command failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Format successful command result
     * @param {Object} data - Result data
     * @returns {string} Formatted output
     */
    formatSuccess(data) {
        let output = `🔧 Custom command sent to printer: ${data.printer}\n`;
        output += `📤 Command: ${JSON.stringify(data.command, null, 2)}\n`;
        output += `📥 Response: ${JSON.stringify(data.response, null, 2)}\n`;
        output += `⏰ Timestamp: ${data.timestamp}`;

        return output;
    }
}

module.exports = CommandCommand; 