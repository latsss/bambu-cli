const ftp = require("basic-ftp");
const { getPrinter } = require("../../config/config");
const { PassThrough } = require('stream');

/**
 * FTP service for communicating with Bambu Lab printers
 * Handles FTPS connection management and file operations
 */
class FtpService {
    constructor() {
        this.client = null;
        this.connected = false;
        this.currentPrinter = null;
    }

    /**
     * Connect to a printer via FTPS
     * @param {string} address - Printer IP address
     * @param {string} accessCode - Printer access code
     * @returns {Promise<void>}
     */
    async connect(address, accessCode) {
        if (this.connected && this.client) {
            return; // Already connected
        }

        this.client = new ftp.Client();
        this.client.ftp.verbose = false; // Set to true for debugging

        try {
            await this.client.access({
                host: address,
                port: 990,
                user: "bblp",
                password: accessCode,
                secure: "implicit",
                secureOptions: {
                    rejectUnauthorized: false // Allow self-signed certificates
                }
            });

            this.connected = true;
            this.currentPrinter = address;
        } catch (error) {
            this.client = null;
            this.connected = false;
            this.currentPrinter = null;
            throw new Error(`FTP connection failed: ${error.message}`);
        }
    }

    /**
     * List files in a directory
     * @param {string} path - Directory path (optional, defaults to root)
     * @returns {Promise<Array>} Array of file/directory objects
     */
    async listFiles(path = "/") {
        if (!this.connected || !this.client) {
            throw new Error("Not connected to printer");
        }

        try {
            const files = await this.client.list(path);
            return files.map(file => ({
                name: file.name,
                type: file.isDirectory ? 'directory' : 'file',
                size: file.size,
                modified: file.modifiedAt,
                permissions: file.permissions
            }));
        } catch (error) {
            throw new Error(`Failed to list files: ${error.message}`);
        }
    }

    /**
     * Get current working directory
     * @returns {Promise<string>} Current directory path
     */
    async getCurrentDirectory() {
        if (!this.connected || !this.client) {
            throw new Error("Not connected to printer");
        }

        try {
            return await this.client.pwd();
        } catch (error) {
            throw new Error(`Failed to get current directory: ${error.message}`);
        }
    }

    /**
     * Change directory
     * @param {string} path - Directory path to change to
     * @returns {Promise<void>}
     */
    async changeDirectory(path) {
        if (!this.connected || !this.client) {
            throw new Error("Not connected to printer");
        }

        try {
            await this.client.cd(path);
        } catch (error) {
            throw new Error(`Failed to change directory: ${error.message}`);
        }
    }

    /**
     * Download a file from the printer to a buffer
     * @param {string} remotePath - Remote file path on printer
     * @returns {Promise<Buffer>} File content as buffer
     */
    async downloadFileToBuffer(remotePath) {
        if (!this.connected || !this.client) {
            throw new Error("Not connected to printer");
        }

        try {
            const stream = new PassThrough();
            const chunks = [];
            stream.on('data', chunk => chunks.push(chunk));
            await this.client.downloadTo(stream, remotePath);
            // Wait for stream to end
            await new Promise((resolve, reject) => {
                stream.on('end', resolve);
                stream.on('error', reject);
            });
            return Buffer.concat(chunks);
        } catch (error) {
            throw new Error(`Failed to download file: ${error.message}`);
        }
    }

    /**
     * Download a file from the printer
     * @param {string} remotePath - Remote file path on printer
     * @param {string} localPath - Local file path to save to
     * @returns {Promise<void>}
     */
    async downloadFile(remotePath, localPath) {
        if (!this.connected || !this.client) {
            throw new Error("Not connected to printer");
        }

        try {
            await this.client.downloadTo(localPath, remotePath);
        } catch (error) {
            throw new Error(`Failed to download file: ${error.message}`);
        }
    }

    /**
     * Check if connected
     * @returns {boolean} Connection status
     */
    isConnected() {
        return this.connected && this.client !== null;
    }

    /**
     * Get current printer
     * @returns {string|null} Current printer address
     */
    getCurrentPrinter() {
        return this.currentPrinter;
    }

    /**
     * Close the FTP connection
     */
    close() {
        if (this.client) {
            this.client.close();
            this.client = null;
        }
        this.connected = false;
        this.currentPrinter = null;
    }
}

module.exports = FtpService; 