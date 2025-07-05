/**
 * Standardized result format for command execution
 * Provides consistent structure for success/failure responses
 */
class CommandResult {
    /**
     * Create a new command result
     * @param {boolean} success - Whether the command executed successfully
     * @param {Object} data - Result data (null if failed)
     * @param {Error} error - Error object (null if successful)
     */
    constructor(success, data, error) {
        this.success = success;
        this.data = data;
        this.error = error;
        this.timestamp = new Date();
    }

    /**
     * Create a successful result
     * @param {Object} data - Result data
     * @returns {CommandResult} Success result
     */
    static success(data) {
        return new CommandResult(true, data, null);
    }

    /**
     * Create a failed result
     * @param {Error|string} error - Error object or message
     * @returns {CommandResult} Failure result
     */
    static failure(error) {
        const errorObj = error instanceof Error ? error : new Error(error);
        return new CommandResult(false, null, errorObj);
    }

    /**
     * Check if the result is successful
     * @returns {boolean} True if successful
     */
    isSuccess() {
        return this.success;
    }

    /**
     * Check if the result is a failure
     * @returns {boolean} True if failed
     */
    isFailure() {
        return !this.success;
    }

    /**
     * Get the error message if failed
     * @returns {string|null} Error message or null
     */
    getErrorMessage() {
        return this.error ? this.error.message : null;
    }

    /**
     * Get the result data
     * @returns {Object|null} Result data or null
     */
    getData() {
        return this.data;
    }

    /**
     * Convert to JSON string
     * @returns {string} JSON representation
     */
    toJSON() {
        return JSON.stringify(
            {
                success: this.success,
                data: this.data,
                error: this.error
                    ? {
                          message: this.error.message,
                          stack: this.error.stack,
                      }
                    : null,
                timestamp: this.timestamp.toISOString(),
            },
            null,
            2
        );
    }

    /**
     * Create a result with additional metadata
     * @param {Object} metadata - Additional metadata
     * @returns {CommandResult} Result with metadata
     */
    withMetadata(metadata) {
        const result = new CommandResult(this.success, this.data, this.error);
        result.metadata = { ...this.metadata, ...metadata };
        return result;
    }
}

module.exports = CommandResult;
