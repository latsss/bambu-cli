/**
 * Base command class that all commands should extend
 * Provides common functionality for command execution, error handling, and result formatting
 */
const CommandResult = require("./CommandResult");

class BaseCommand {
    constructor(name, description) {
        this.name = name;
        this.description = description;
        this.requiresPrinter = false;
        this.requiresConnection = false;
    }

    /**
     * Execute the command
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @returns {Promise<CommandResult>} Command execution result
     */
    async execute(args, options = {}) {
        try {
            // Validate arguments
            await this.validate(args, options);

            // Execute the command logic
            const result = await this.run(args, options);

            return new CommandResult(true, result, null);
        } catch (error) {
            return new CommandResult(false, null, error);
        }
    }

    /**
     * Validate command arguments and options
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @throws {Error} If validation fails
     */
    async validate(args, options) {
        // Override in subclasses for specific validation
    }

    /**
     * Run the actual command logic
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @returns {Promise<Object>} Command result data
     * @throws {Error} If command execution fails
     */
    async run(args, options) {
        throw new Error("run() method must be implemented by subclasses");
    }

    /**
     * Get printer configuration if required
     * @param {string} printerName - Name of the printer
     * @returns {Object} Printer configuration
     */
    getPrinter(printerName) {
        if (!this.requiresPrinter) {
            throw new Error(`Command ${this.name} does not require a printer`);
        }

        const { getPrinter } = require("../../config/config");
        return getPrinter(printerName);
    }

    /**
     * Format the command result for display
     * @param {CommandResult} result - Command result
     * @returns {string} Formatted output
     */
    formatResult(result) {
        if (!result.success) {
            return `❌ Error: ${result.error.message}`;
        }

        return this.formatSuccess(result.data);
    }

    /**
     * Format successful command result
     * @param {Object} data - Result data
     * @returns {string} Formatted output
     */
    formatSuccess(data) {
        return JSON.stringify(data, null, 2);
    }

    /**
     * Log command execution
     * @param {string} level - Log level (info, warn, error)
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     */
    log(level, message, data = {}) {
        const logger = require("../../utils/logger");
        logger[level](message, data, this.name.toUpperCase());
    }
}

module.exports = BaseCommand;
