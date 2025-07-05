const BaseCommand = require("../base/BaseCommand");
const FtpService = require("../../services/file/FtpService");
const { getPrinter } = require("../../config/config");

/**
 * File listing command
 * Lists files and directories on the printer via FTP
 */
class LsCommand extends BaseCommand {
    constructor() {
        super("ls", "List files and directories on printer");
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

        // Validate printer exists in config
        try {
            getPrinter(args.printerName);
        } catch (error) {
            throw new Error(`Printer '${args.printerName}' not found in configuration`);
        }
    }

    /**
     * Execute the list command
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @returns {Promise<Object>} Command result data
     */
    async run(args, options) {
        const config = getPrinter(args.printerName);
        const path = args.path || "/";

        try {
            this.log("info", `Connecting to printer: ${args.printerName} (${config.address})`);
            
            // Connect to printer
            await this.ftpService.connect(config.address, config.accessCode);
            
            this.log("info", `Listing files in: ${path}`);
            
            // List files
            const files = await this.ftpService.listFiles(path);
            
            this.log("info", `Found ${files.length} items in ${path}`);

            return {
                printer: args.printerName,
                path: path,
                files: files,
                count: files.length,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.log("error", `Failed to list files: ${error.message}`);
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
            return `❌ Failed to list files: ${result.error.message}`;
        }

        const { printer, path, files, count } = result.data;
        
        let output = `📁 Files in ${path} on ${printer}:\n\n`;
        
        if (files.length === 0) {
            output += "   (empty directory)\n";
        } else {
            files.forEach(file => {
                const icon = file.type === 'directory' ? '📁' : '📄';
                const size = file.type === 'file' ? ` (${this.formatSize(file.size)})` : '';
                const modified = file.modified ? ` - ${file.modified.toLocaleDateString()}` : '';
                
                output += `   ${icon} ${file.name}${size}${modified}\n`;
            });
        }
        
        output += `\nTotal: ${count} items`;
        
        return output;
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

module.exports = LsCommand; 