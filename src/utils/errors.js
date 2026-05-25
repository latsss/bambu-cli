/**
 * Custom error class + formatter used by the CLI's top-level handlers.
 */

class BambuError extends Error {
    constructor(message, code = "UNKNOWN_ERROR", details = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.details = details;
        if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
    }
}

class ErrorHandler {
    /**
     * Format error for display. With verbose=true, includes stack + code.
     */
    static handleError(error, { verbose = false } = {}) {
        if (!error) return "❌ Unknown error";
        let message = error instanceof BambuError
            ? `❌ ${error.name}: ${error.message}`
            : `❌ Error: ${error.message || error}`;
        if (verbose) {
            if (error instanceof BambuError && error.code) message += `\nCode: ${error.code}`;
            if (error.stack) message += `\n\n${error.stack}`;
        }
        return message;
    }
}

module.exports = { BambuError, ErrorHandler };
