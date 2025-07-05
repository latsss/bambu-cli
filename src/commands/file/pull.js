const BaseCommand = require("../base/BaseCommand");
const FtpService = require("../../services/file/FtpService");
const { getPrinter } = require("../../config/config");
const fs = require("fs");
const path = require("path");

/**
 * File download command
 * Downloads files from the printer via FTP
 */
class PullCommand extends BaseCommand {
    constructor() {
        super("pull", "Download file from printer");
        this.ftpService = new FtpService();
    }

    /**
     * Validate command arguments
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     */
    async validate(args, options) {
        if (!args.printerName) {
            throw new Error("Printer name is required");
        }

        if (!args.remotePath) {
            throw new Error("Remote file path is required");
        }

        // Validate printer exists in config
        try {
            getPrinter(args.printerName);
        } catch (error) {
            throw new Error(`Printer '${args.printerName}' not found in configuration`);
        }

        // Validate local path
        if (args.localPath) {
            const localDir = path.dirname(args.localPath);
            if (localDir !== '.' && !fs.existsSync(localDir)) {
                throw new Error(`Local directory does not exist: ${localDir}`);
            }
        }
    }

    /**
     * Execute the pull command
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @returns {Promise<Object>} Command result data
     */
    async run(args, options) {
        const config = getPrinter(args.printerName);
        const remotePath = args.remotePath;
        
        // Determine local path
        let localPath;
        if (!args.localPath || args.localPath === '.') {
            // Use remote filename in current directory
            localPath = path.basename(remotePath);
        } else if (path.isAbsolute(args.localPath)) {
            // Absolute path
            localPath = args.localPath;
        } else {
            // Relative path
            localPath = path.resolve(args.localPath);
        }

        try {
            this.log("info", `Connecting to printer: ${args.printerName} (${config.address})`);
            
            // Connect to printer
            await this.ftpService.connect(config.address, config.accessCode);
            
            this.log("info", `Downloading file: ${remotePath} -> ${localPath}`);
            
            // Download file
            await this.ftpService.downloadFile(remotePath, localPath);
            
            // Get file stats for result
            const stats = fs.statSync(localPath);
            
            this.log("info", `Downloaded ${this.formatSize(stats.size)} to ${localPath}`);

            return {
                printer: args.printerName,
                remotePath: remotePath,
                localPath: localPath,
                size: stats.size,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.log("error", `Failed to download file: ${error.message}`);
            throw error;
        } finally {
            // Close the FTP connection after command completion
            if (this.ftpService.isConnected()) {
                this.ftpService.close();
            }
        }
    }

    /**
     * Format the command result for display
     * @param {Object} result - Command result
     * @returns {string} Formatted result
     */
    formatResult(result) {
        if (!result.success) {
            return `❌ Failed to download file: ${result.error.message}`;
        }

        const { printer, remotePath, localPath, size } = result.data;
        
        return `✅ Downloaded file from ${printer}:\n\n` +
               `   📄 Remote: ${remotePath}\n` +
               `   💾 Local:  ${localPath}\n` +
               `   📏 Size:   ${this.formatSize(size)}\n`;
    }

    /**
     * Format file size in human readable format
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size
     */
    formatSize(bytes) {
        if (bytes === undefined || bytes === null) return 'unknown';
        
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
}

module.exports = PullCommand; 