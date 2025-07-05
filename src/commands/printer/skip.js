const BaseCommand = require("../base/BaseCommand");
const CommandResult = require("../base/CommandResult");
const PrinterManager = require("../../services/printer/PrinterManager");

/**
 * Skip objects command
 * Skips specified objects during printing
 */
class SkipCommand extends BaseCommand {
    constructor() {
        super("skip", "Skip objects during printing");
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

        if (!args.objectIds || !Array.isArray(args.objectIds) || args.objectIds.length === 0) {
            throw new Error("Object IDs array is required and cannot be empty");
        }

        // Convert string object IDs to numbers and validate
        args.objectIds = args.objectIds.map((id, index) => {
            const numId = parseInt(id, 10);
            if (isNaN(numId)) {
                throw new Error(`Invalid object ID at index ${index}: must be a valid number`);
            }
            return numId;
        });
    }

    /**
     * Execute the skip command
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @returns {Promise<Object>} Command result data
     */
    async run(args, options) {
        const printerManager = new PrinterManager();

        try {
            this.log(
                "info",
                `Skipping objects ${args.objectIds.join(', ')} on printer: ${args.printerName}`
            );

            const result = await printerManager.skipObjects(
                args.printerName,
                args.objectIds
            );

            this.log(
                "success",
                `Successfully sent skip command for objects ${args.objectIds.join(', ')} on ${args.printerName}`
            );

            return {
                printer: args.printerName,
                objectIds: args.objectIds,
                result: result,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            this.log(
                "error",
                `Failed to skip objects on ${args.printerName}: ${error.message}`
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
        return `✅ Successfully skipped objects on ${data.printer}\n📦 Object IDs: ${data.objectIds.join(', ')}\n⏰ Sent: ${data.timestamp}`;
    }
}

module.exports = SkipCommand; 