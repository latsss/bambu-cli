const BaseCommand = require("../base/BaseCommand");
const CommandResult = require("../base/CommandResult");
const PrinterManager = require("../../services/printer/PrinterManager");

/**
 * Get printer version command
 * Retrieves the software version of a connected printer
 */
class VersionCommand extends BaseCommand {
    constructor() {
        super("version", "Get printer software version");
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
    }

    /**
     * Execute the version command
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @returns {Promise<Object>} Command result data
     */
    async run(args, options) {
        const printerManager = new PrinterManager();

        try {
            this.log(
                "info",
                `Getting version for printer: ${args.printerName}`
            );

            const version = await printerManager.getPrinterVersion(
                args.printerName
            );

            this.log(
                "success",
                `Retrieved version for ${args.printerName}: ${version}`
            );

            return {
                printer: args.printerName,
                version: version,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.log(
                "error",
                `Failed to get version for ${args.printerName}: ${error.message}`
            );
            throw error;
        } finally {
            printerManager.closeAllConnections();
        }
    }

    /**
     * Format successful command result
     * @param {Object} data - Result data
     * @returns {string} Formatted output
     */
    formatSuccess(data) {
        return `📋 Printer: ${data.printer}\n📦 Version: ${data.version}\n⏰ Retrieved: ${data.timestamp}`;
    }
}

module.exports = VersionCommand;
