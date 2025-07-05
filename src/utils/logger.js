const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Logging system for bambu-cli
 * Provides structured logging with different levels and output formats
 */
class Logger {
    constructor(options = {}) {
        this.level = options.level || this.getLogLevel();
        this.format = options.format || "text"; // 'text' or 'json'
        this.output = options.output || "console"; // 'console', 'file', or 'both'
        this.logFile = options.logFile || this.getDefaultLogFile();
        this.includeTimestamp = options.includeTimestamp !== false;
        this.includeLevel = options.includeLevel !== false;
        this.includeContext = options.includeContext !== false;

        // Create log directory if needed
        if (this.output === "file" || this.output === "both") {
            this.ensureLogDirectory();
        }

        // Log levels in order of severity
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
            trace: 4,
        };
    }

    /**
     * Get log level from environment or default
     * @returns {string} Log level
     */
    getLogLevel() {
        return process.env.LOG_LEVEL || "info";
    }

    /**
     * Get default log file path
     * @returns {string} Log file path
     */
    getDefaultLogFile() {
        const logDir = path.join(os.homedir(), ".bambu-cli", "logs");
        const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
        return path.join(logDir, `bambu-cli-${date}.log`);
    }

    /**
     * Ensure log directory exists
     */
    ensureLogDirectory() {
        const logDir = path.dirname(this.logFile);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
    }

    /**
     * Check if log level should be output
     * @param {string} level - Log level to check
     * @returns {boolean} True if should output
     */
    shouldLog(level) {
        return this.levels[level] <= this.levels[this.level];
    }

    /**
     * Format log message
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {string} context - Log context
     * @returns {string} Formatted log message
     */
    formatMessage(level, message, data = {}, context = "") {
        const timestamp = this.includeTimestamp ? new Date().toISOString() : "";

        if (this.format === "json") {
            return this.formatJson(level, message, data, context, timestamp);
        } else {
            return this.formatText(level, message, data, context, timestamp);
        }
    }

    /**
     * Format log message as text
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {string} context - Log context
     * @param {string} timestamp - Timestamp
     * @returns {string} Formatted text message
     */
    formatText(level, message, data, context, timestamp) {
        let parts = [];

        if (timestamp) {
            parts.push(`[${timestamp}]`);
        }

        if (this.includeLevel) {
            const levelEmoji = this.getLevelEmoji(level);
            parts.push(`${levelEmoji} [${level.toUpperCase()}]`);
        }

        if (this.includeContext && context) {
            parts.push(`[${context}]`);
        }

        parts.push(message);

        let result = parts.join(" ");

        // Add data if present
        if (data && Object.keys(data).length > 0) {
            if (typeof data === "object") {
                result += `\n${JSON.stringify(data, null, 2)}`;
            } else {
                result += ` ${data}`;
            }
        }

        return result;
    }

    /**
     * Format log message as JSON
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {string} context - Log context
     * @param {string} timestamp - Timestamp
     * @returns {string} Formatted JSON message
     */
    formatJson(level, message, data, context, timestamp) {
        const logEntry = {
            timestamp: timestamp || new Date().toISOString(),
            level: level.toUpperCase(),
            message: message,
            data: data,
            context: context || null,
        };

        return JSON.stringify(logEntry);
    }

    /**
     * Get emoji for log level
     * @param {string} level - Log level
     * @returns {string} Emoji
     */
    getLevelEmoji(level) {
        const emojis = {
            error: "❌",
            warn: "⚠️",
            info: "ℹ️",
            debug: "🔍",
            trace: "🔬",
        };
        return emojis[level] || "📝";
    }

    /**
     * Write log message to console
     * @param {string} message - Formatted message
     * @param {string} level - Log level
     */
    writeToConsole(message, level) {
        const stream = level === "error" ? process.stderr : process.stdout;
        stream.write(message + "\n");
    }

    /**
     * Write log message to file
     * @param {string} message - Formatted message
     */
    writeToFile(message) {
        try {
            fs.appendFileSync(this.logFile, message + "\n");
        } catch (error) {
            // Fallback to console if file write fails
            console.error(`Failed to write to log file: ${error.message}`);
            console.error(`Log message: ${message}`);
        }
    }

    /**
     * Log message
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {string} context - Log context
     */
    log(level, message, data = {}, context = "") {
        if (!this.shouldLog(level)) {
            return;
        }

        const formattedMessage = this.formatMessage(
            level,
            message,
            data,
            context
        );

        if (this.output === "console" || this.output === "both") {
            this.writeToConsole(formattedMessage, level);
        }

        if (this.output === "file" || this.output === "both") {
            this.writeToFile(formattedMessage);
        }
    }

    /**
     * Log error message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {string} context - Log context
     */
    error(message, data = {}, context = "") {
        this.log("error", message, data, context);
    }

    /**
     * Log warning message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {string} context - Log context
     */
    warn(message, data = {}, context = "") {
        this.log("warn", message, data, context);
    }

    /**
     * Log info message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {string} context - Log context
     */
    info(message, data = {}, context = "") {
        this.log("info", message, data, context);
    }

    /**
     * Log debug message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {string} context - Log context
     */
    debug(message, data = {}, context = "") {
        this.log("debug", message, data, context);
    }

    /**
     * Log trace message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {string} context - Log context
     */
    trace(message, data = {}, context = "") {
        this.log("trace", message, data, context);
    }

    /**
     * Log success message
     * @param {string} message - Log message
     * @param {Object} data - Additional data
     * @param {string} context - Log context
     */
    success(message, data = {}, context = "") {
        this.log("info", `✅ ${message}`, data, context);
    }

    /**
     * Log command execution
     * @param {string} command - Command name
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     */
    logCommand(command, args = {}, options = {}) {
        this.info(
            `Executing command: ${command}`,
            {
                args: args,
                options: options,
            },
            "COMMAND"
        );
    }

    /**
     * Log command result
     * @param {string} command - Command name
     * @param {Object} result - Command result
     * @param {number} duration - Execution duration in ms
     */
    logCommandResult(command, result, duration = 0) {
        const level = result.success ? "info" : "error";
        const message = result.success
            ? `Command completed successfully: ${command}`
            : `Command failed: ${command}`;

        this.log(
            level,
            message,
            {
                duration: duration,
                result: result.data,
                error: result.error ? result.error.message : null,
            },
            "COMMAND"
        );
    }

    /**
     * Log printer operation
     * @param {string} printer - Printer name
     * @param {string} operation - Operation name
     * @param {Object} data - Operation data
     * @param {string} level - Log level
     */
    logPrinterOperation(printer, operation, data = {}, level = "info") {
        this.log(
            level,
            `Printer operation: ${operation}`,
            {
                printer: printer,
                ...data,
            },
            "PRINTER"
        );
    }

    /**
     * Log connection event
     * @param {string} printer - Printer name
     * @param {string} event - Connection event
     * @param {Object} data - Event data
     */
    logConnectionEvent(printer, event, data = {}) {
        this.info(
            `Connection event: ${event}`,
            {
                printer: printer,
                ...data,
            },
            "CONNECTION"
        );
    }

    /**
     * Get log file path
     * @returns {string} Log file path
     */
    getLogFilePath() {
        return this.logFile;
    }

    /**
     * Set log level
     * @param {string} level - New log level
     */
    setLevel(level) {
        if (this.levels.hasOwnProperty(level)) {
            this.level = level;
        } else {
            throw new Error(`Invalid log level: ${level}`);
        }
    }

    /**
     * Set output destination
     * @param {string} output - Output destination
     */
    setOutput(output) {
        if (["console", "file", "both"].includes(output)) {
            this.output = output;
            if (this.output === "file" || this.output === "both") {
                this.ensureLogDirectory();
            }
        } else {
            throw new Error(`Invalid output destination: ${output}`);
        }
    }

    /**
     * Set log format
     * @param {string} format - Log format
     */
    setFormat(format) {
        if (["text", "json"].includes(format)) {
            this.format = format;
        } else {
            throw new Error(`Invalid log format: ${format}`);
        }
    }

    /**
     * Clear log file
     */
    clearLogFile() {
        if (fs.existsSync(this.logFile)) {
            fs.unlinkSync(this.logFile);
        }
    }

    /**
     * Get log file size
     * @returns {number} File size in bytes
     */
    getLogFileSize() {
        if (fs.existsSync(this.logFile)) {
            return fs.statSync(this.logFile).size;
        }
        return 0;
    }

    /**
     * Rotate log file if it's too large
     * @param {number} maxSize - Maximum file size in bytes
     */
    rotateLogFile(maxSize = 10 * 1024 * 1024) {
        // 10MB default
        if (this.getLogFileSize() > maxSize) {
            const backupFile = this.logFile + ".backup";
            if (fs.existsSync(this.logFile)) {
                fs.renameSync(this.logFile, backupFile);
            }
        }
    }
}

// Create default logger instance
const logger = new Logger();

// Export logger instance and class
module.exports = logger;
module.exports.Logger = Logger;
