/**
 * Custom error classes for the bambu-cli application
 * Provides structured error handling with specific error types
 */

/**
 * Base error class for all application errors
 */
class BambuError extends Error {
    constructor(message, code = "UNKNOWN_ERROR", details = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.details = details;
        this.timestamp = new Date();

        // Maintains proper stack trace for where our error was thrown
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * Convert error to JSON
     * @returns {Object} JSON representation
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            details: this.details,
            timestamp: this.timestamp.toISOString(),
            stack: this.stack,
        };
    }
}

/**
 * Configuration related errors
 */
class ConfigError extends BambuError {
    constructor(message, details = {}) {
        super(message, "CONFIG_ERROR", details);
    }
}

/**
 * Printer connection errors
 */
class ConnectionError extends BambuError {
    constructor(message, details = {}) {
        super(message, "CONNECTION_ERROR", details);
    }
}

/**
 * MQTT communication errors
 */
class MqttError extends BambuError {
    constructor(message, details = {}) {
        super(message, "MQTT_ERROR", details);
    }
}

/**
 * File operation errors
 */
class FileError extends BambuError {
    constructor(message, details = {}) {
        super(message, "FILE_ERROR", details);
    }
}

/**
 * Validation errors
 */
class ValidationError extends BambuError {
    constructor(message, details = {}) {
        super(message, "VALIDATION_ERROR", details);
    }
}

/**
 * Command execution errors
 */
class CommandError extends BambuError {
    constructor(message, details = {}) {
        super(message, "COMMAND_ERROR", details);
    }
}

/**
 * Workflow execution errors
 */
class WorkflowError extends BambuError {
    constructor(message, details = {}) {
        super(message, "WORKFLOW_ERROR", details);
    }
}

/**
 * Error handling utilities
 */
class ErrorHandler {
    /**
     * Handle and format error for display
     * @param {Error} error - Error to handle
     * @param {Object} options - Handling options
     * @returns {string} Formatted error message
     */
    static handleError(error, options = {}) {
        const {
            verbose = false,
            showStack = false,
            includeDetails = true,
        } = options;

        let message = "";

        if (error instanceof BambuError) {
            message += `❌ ${error.name}: ${error.message}\n`;

            if (includeDetails && Object.keys(error.details).length > 0) {
                message += `Details: ${JSON.stringify(
                    error.details,
                    null,
                    2
                )}\n`;
            }

            if (verbose) {
                message += `Code: ${error.code}\n`;
                message += `Timestamp: ${error.timestamp.toISOString()}\n`;
            }
        } else {
            message += `❌ Error: ${error.message}\n`;
        }

        if (showStack && error.stack) {
            message += `\nStack trace:\n${error.stack}\n`;
        }

        return message.trim();
    }

    /**
     * Check if error is retryable
     * @param {Error} error - Error to check
     * @returns {boolean} True if error is retryable
     */
    static isRetryable(error) {
        if (error instanceof BambuError) {
            // Connection errors are usually retryable
            if (error.code === "CONNECTION_ERROR") {
                return true;
            }

            // MQTT timeout errors are retryable
            if (
                error.code === "MQTT_ERROR" &&
                error.message.includes("timeout")
            ) {
                return true;
            }
        }

        // Network-related errors are retryable
        if (
            error.code === "ECONNREFUSED" ||
            error.code === "ENOTFOUND" ||
            error.code === "ETIMEDOUT"
        ) {
            return true;
        }

        return false;
    }

    /**
     * Get retry delay for error
     * @param {Error} error - Error to get delay for
     * @param {number} attempt - Current attempt number
     * @returns {number} Delay in milliseconds
     */
    static getRetryDelay(error, attempt = 1) {
        const baseDelay = 1000; // 1 second
        const maxDelay = 30000; // 30 seconds

        // Exponential backoff with jitter
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        const jitter = Math.random() * 0.1 * delay; // 10% jitter

        return delay + jitter;
    }

    /**
     * Create error from network error
     * @param {Error} networkError - Network error
     * @param {string} context - Error context
     * @returns {ConnectionError} Formatted connection error
     */
    static fromNetworkError(networkError, context = "") {
        let message = `Network error: ${networkError.message}`;
        if (context) {
            message = `${context}: ${message}`;
        }

        return new ConnectionError(message, {
            originalError: networkError.message,
            code: networkError.code,
            context: context,
        });
    }

    /**
     * Create error from MQTT error
     * @param {Error} mqttError - MQTT error
     * @param {string} context - Error context
     * @returns {MqttError} Formatted MQTT error
     */
    static fromMqttError(mqttError, context = "") {
        let message = `MQTT error: ${mqttError.message}`;
        if (context) {
            message = `${context}: ${message}`;
        }

        return new MqttError(message, {
            originalError: mqttError.message,
            context: context,
        });
    }

    /**
     * Create error from validation failure
     * @param {Array<string>} errors - Validation errors
     * @param {string} context - Validation context
     * @returns {ValidationError} Formatted validation error
     */
    static fromValidationErrors(errors, context = "") {
        const message = `Validation failed: ${errors.join(", ")}`;

        return new ValidationError(message, {
            errors: errors,
            context: context,
        });
    }

    /**
     * Log error with appropriate level
     * @param {Error} error - Error to log
     * @param {string} level - Log level
     */
    static logError(error, level = "error") {
        const logger = require("./logger");
        const message = this.handleError(error, { verbose: true });
        logger[level](message);
    }

    /**
     * Wrap async function with error handling
     * @param {Function} fn - Function to wrap
     * @param {string} context - Error context
     * @returns {Function} Wrapped function
     */
    static wrapAsync(fn, context = "") {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                if (error instanceof BambuError) {
                    throw error;
                }

                // Convert generic errors to appropriate types
                if (
                    error.message.includes("connect") ||
                    error.message.includes("network")
                ) {
                    throw this.fromNetworkError(error, context);
                }

                if (
                    error.message.includes("mqtt") ||
                    error.message.includes("MQTT")
                ) {
                    throw this.fromMqttError(error, context);
                }

                // Default to generic error
                throw new BambuError(error.message, "UNKNOWN_ERROR", {
                    originalError: error.message,
                    context: context,
                });
            }
        };
    }
}

/**
 * Error codes enumeration
 */
const ErrorCodes = {
    // Configuration errors
    CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",
    CONFIG_INVALID: "CONFIG_INVALID",
    PRINTER_NOT_FOUND: "PRINTER_NOT_FOUND",
    PRINTER_INVALID: "PRINTER_INVALID",

    // Connection errors
    CONNECTION_FAILED: "CONNECTION_FAILED",
    CONNECTION_TIMEOUT: "CONNECTION_TIMEOUT",
    CONNECTION_REFUSED: "CONNECTION_REFUSED",

    // MQTT errors
    MQTT_CONNECT_FAILED: "MQTT_CONNECT_FAILED",
    MQTT_PUBLISH_FAILED: "MQTT_PUBLISH_FAILED",
    MQTT_SUBSCRIBE_FAILED: "MQTT_SUBSCRIBE_FAILED",
    MQTT_TIMEOUT: "MQTT_TIMEOUT",

    // File errors
    FILE_NOT_FOUND: "FILE_NOT_FOUND",
    FILE_UPLOAD_FAILED: "FILE_UPLOAD_FAILED",
    FILE_DOWNLOAD_FAILED: "FILE_DOWNLOAD_FAILED",
    FILE_INVALID: "FILE_INVALID",

    // Validation errors
    VALIDATION_FAILED: "VALIDATION_FAILED",
    INVALID_INPUT: "INVALID_INPUT",
    MISSING_REQUIRED: "MISSING_REQUIRED",

    // Command errors
    COMMAND_FAILED: "COMMAND_FAILED",
    COMMAND_TIMEOUT: "COMMAND_TIMEOUT",
    COMMAND_INVALID: "COMMAND_INVALID",

    // Workflow errors
    WORKFLOW_FAILED: "WORKFLOW_FAILED",
    WORKFLOW_TIMEOUT: "WORKFLOW_TIMEOUT",
    STEP_FAILED: "STEP_FAILED",
};

module.exports = {
    BambuError,
    ConfigError,
    ConnectionError,
    MqttError,
    FileError,
    ValidationError,
    CommandError,
    WorkflowError,
    ErrorHandler,
    ErrorCodes,
};
