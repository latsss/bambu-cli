const BaseCommand = require("../base/BaseCommand");
const { getPrinter } = require("../../config/config");
const MqttService = require("../../services/connection/MqttService");
const FtpService = require("../../services/file/FtpService");
const ThreeMFParser = require("../../utils/3mf-parser");
const fs = require("fs");
const path = require("path");
const os = require("os");

/**
 * Get objects command
 * Downloads and parses the current 3MF file to extract object information
 */
class GetObjectsCommand extends BaseCommand {
    constructor() {
        super("get-objects", "Get object information from current print");
        this.mqttService = new MqttService();
        this.ftpService = new FtpService();
        this.parser = new ThreeMFParser();
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
     * Execute the get-objects command
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @returns {Promise<Object>} Command result data
     */
    async run(args, options) {
        const config = getPrinter(args.printerName);
        let tempFilePath = null;

        try {
            this.log("info", `Connecting to printer: ${args.printerName} (${config.address})`);
            
            // Step 1: Get current print status to determine 3MF filename
            this.log("info", "Getting current print status");
            const status = await this.mqttService.getPrinterStatus(
                config.address,
                config.deviceId,
                config.accessCode
            );

            const print = status.print;
            if (!print.gcode_file || print.gcode_state === "IDLE") {
                throw new Error("No active print job found");
            }

            const filename = print.gcode_file;
            this.log("info", `Current print file: ${filename}`);

            // Step 2: Download 3MF file via FTP to temp location
            this.log("info", "Connecting to printer via FTP");
            await this.ftpService.connect(config.address, config.accessCode);
            
            // Create temp file path
            tempFilePath = path.join(os.tmpdir(), `bambu-cli-${Date.now()}-${path.basename(filename)}`);
            
            this.log("info", `Downloading 3MF file: ${filename}`);
            await this.ftpService.downloadFile(filename, tempFilePath);
            
            const stats = fs.statSync(tempFilePath);
            this.log("info", `Downloaded ${this.formatSize(stats.size)}`);

            // Step 3-8: Read file into buffer and parse 3MF file
            this.log("info", "Reading file into memory");
            const fileBuffer = fs.readFileSync(tempFilePath);
            
            this.log("info", "Parsing 3MF file");
            const objectInfo = await this.parser.parseFromBuffer(fileBuffer);

            this.log("info", `Found ${objectInfo.totalObjects} objects`);

            return {
                printer: args.printerName,
                filename: filename,
                objectInfo: objectInfo,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.log("error", `Failed to get objects: ${error.message}`);
            throw error;
        } finally {
            // Clean up temp file
            if (tempFilePath && fs.existsSync(tempFilePath)) {
                try {
                    fs.unlinkSync(tempFilePath);
                    this.log("info", "Cleaned up temporary file");
                } catch (cleanupError) {
                    this.log("warn", `Failed to clean up temp file: ${cleanupError.message}`);
                }
            }
            
            // Close connections
            this.mqttService.closeAllConnections();
            if (this.ftpService.isConnected()) {
                this.ftpService.close();
            }
        }
    }

    /**
     * Format the command result for display
     * @param {Object} result - Command result
     * @param {Object} options - Command options
     * @returns {string} Formatted result
     */
    formatResult(result, options = {}) {
        if (!result.success) {
            return `❌ Failed to get objects: ${result.error.message}`;
        }

        const { printer, filename, objectInfo } = result.data;
        
        let output = `📦 Objects in ${filename} on ${printer}\n`;
        output += `═`.repeat(60) + `\n\n`;
        
        output += `📋 File Information:\n`;
        output += `   Filename: ${objectInfo.filename}\n`;
        output += `   Plate Index: ${objectInfo.plateIndex}\n`;
        output += `   Total Objects: ${objectInfo.totalObjects}\n\n`;

        if (objectInfo.objects.length === 0) {
            output += `   No objects found in the file.\n\n`;
        } else {
                    output += `🔍 Object Details:\n`;
        objectInfo.objects.forEach((obj, index) => {
            output += `   Object ${obj.id}: ${obj.name}\n`;
            
            if (obj.boundingBox) {
                output += `     Bounding Box:\n`;
                output += `       Min: [${obj.boundingBox.min.join(', ')}]\n`;
                output += `       Max: [${obj.boundingBox.max.join(', ')}]\n`;
                output += `       Size: [${obj.boundingBox.size.join(', ')}]\n`;
            }
            
            if (obj.area) {
                output += `     Area: ${obj.area.toFixed(2)} mm²\n`;
            }
            
            if (obj.layer_height) {
                output += `     Layer Height: ${obj.layer_height.toFixed(2)} mm\n`;
            }
            

            
            output += `\n`;
        });
        
        // Add visual representation
        output += `📐 Visual Layout:\n`;
        const visual = this.parser.generateVisualRepresentation(objectInfo.objects, 60, 15, options.colored);
        output += visual + `\n`;
        }

        output += `═`.repeat(60) + `\n`;
        output += `📅 Last Updated: ${new Date().toLocaleString()}\n`;

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

module.exports = GetObjectsCommand; 