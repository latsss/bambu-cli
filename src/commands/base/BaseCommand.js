const CommandResult = require("./CommandResult");

class BaseCommand {
    constructor(name, description) {
        this.name = name;
        this.description = description;
    }

    async execute(args, options = {}) {
        try {
            await this.validate(args, options);
            const result = await this.run(args, options);
            return new CommandResult(true, result, null);
        } catch (error) {
            return new CommandResult(false, null, error);
        }
    }

    async validate(_args, _options) {
        // Override in subclasses.
    }

    async run(_args, _options) {
        throw new Error(`run() must be implemented by ${this.constructor.name}`);
    }

    /**
     * Format the command result for text display. Override formatSuccess() in subclasses
     * for the success path; failure path falls back to ErrorHandler-style output.
     */
    formatResult(result, options) {
        if (!result.success) return `❌ Error: ${result.error.message}`;
        return this.formatSuccess(result.data, options);
    }

    formatSuccess(data) {
        return JSON.stringify(data, null, 2);
    }

    log(level, message, data = {}) {
        const logger = require("../../utils/logger");
        logger[level](`[${this.name}] ${message}`, data);
    }
}

module.exports = BaseCommand;
