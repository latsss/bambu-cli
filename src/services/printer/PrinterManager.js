const { getPrinter } = require("../../config/config");
const MqttService = require("../connection/MqttService");

/**
 * Printer management service
 * Handles printer lifecycle, state management, and provides unified interface for operations
 */
class PrinterManager {
    constructor() {
        this.mqttService = new MqttService();
        this.printerStates = new Map(); // Track printer states
        this.connectionPool = new Map(); // Connection pool for reuse
    }

    /**
     * Get printer configuration and validate it
     * @param {string} printerName - Name of the printer
     * @returns {Object} Printer configuration
     * @throws {Error} If printer not found or invalid
     */
    getPrinterConfig(printerName) {
        try {
            const config = getPrinter(printerName);

            // Validate required fields
            if (!config.address || !config.deviceId || !config.accessCode) {
                throw new Error(
                    `Invalid printer configuration for ${printerName}`
                );
            }

            return config;
        } catch (error) {
            throw new Error(
                `Printer '${printerName}' not found or invalid: ${error.message}`
            );
        }
    }

    /**
     * Test connection to a printer
     * @param {string} printerName - Name of the printer
     * @returns {Promise<boolean>} Connection success
     */
    async testConnection(printerName) {
        try {
            const config = this.getPrinterConfig(printerName);
            await this.mqttService.getPrinterVersion(
                config.address,
                config.deviceId,
                config.accessCode
            );
            return true;
        } catch (error) {
            throw new Error(
                `Connection test failed for ${printerName}: ${error.message}`
            );
        }
    }

    /**
     * Get printer status
     * @param {string} printerName - Name of the printer
     * @returns {Promise<Object>} Printer status
     */
    async getPrinterStatus(printerName) {
        const config = this.getPrinterConfig(printerName);

        try {
            const status = await this.mqttService.getPrinterStatus(
                config.address,
                config.deviceId,
                config.accessCode
            );

            // Update cached state
            this.printerStates.set(printerName, {
                ...status,
                lastUpdated: new Date(),
                online: true,
            });

            return status;
        } catch (error) {
            // Update state to offline
            this.printerStates.set(printerName, {
                online: false,
                lastUpdated: new Date(),
                error: error.message,
            });

            throw error;
        }
    }

    /**
     * Get printer version
     * @param {string} printerName - Name of the printer
     * @returns {Promise<string>} Software version
     */
    async getPrinterVersion(printerName) {
        const config = this.getPrinterConfig(printerName);

        return await this.mqttService.getPrinterVersion(
            config.address,
            config.deviceId,
            config.accessCode
        );
    }

    /**
     * Start a print job
     * @param {string} printerName - Name of the printer
     * @param {string} fileName - Name of the file to print
     * @returns {Promise<Object>} Print start response
     */
    async startPrint(printerName, fileName) {
        const config = this.getPrinterConfig(printerName);

        // Validate file name
        if (!fileName || typeof fileName !== "string") {
            throw new Error("Valid file name is required");
        }

        return await this.mqttService.startPrint(
            config.address,
            config.deviceId,
            config.accessCode,
            fileName
        );
    }

    /**
     * Stop a print job
     * @param {string} printerName - Name of the printer
     * @returns {Promise<Object>} Stop response
     */
    async stopPrint(printerName) {
        const config = this.getPrinterConfig(printerName);

        return await this.mqttService.stopPrint(
            config.address,
            config.deviceId,
            config.accessCode
        );
    }

    /**
     * Pause a print job
     * @param {string} printerName - Name of the printer
     * @returns {Promise<Object>} Pause response
     */
    async pausePrint(printerName) {
        const config = this.getPrinterConfig(printerName);

        return await this.mqttService.pausePrint(
            config.address,
            config.deviceId,
            config.accessCode
        );
    }

    /**
     * Resume a print job
     * @param {string} printerName - Name of the printer
     * @returns {Promise<Object>} Resume response
     */
    async resumePrint(printerName) {
        const config = this.getPrinterConfig(printerName);

        return await this.mqttService.resumePrint(
            config.address,
            config.deviceId,
            config.accessCode
        );
    }

    /**
     * Load filament
     * @param {string} printerName - Name of the printer
     * @param {string} target - Target temperature (optional)
     * @returns {Promise<Object>} Load filament response
     */
    async loadFilament(printerName, target = null) {
        const config = this.getPrinterConfig(printerName);

        return await this.mqttService.loadFilament(
            config.address,
            config.deviceId,
            config.accessCode,
            target
        );
    }

    /**
     * Unload filament
     * @param {string} printerName - Name of the printer
     * @returns {Promise<Object>} Unload filament response
     */
    async unloadFilament(printerName) {
        const config = this.getPrinterConfig(printerName);

        return await this.mqttService.unloadFilament(
            config.address,
            config.deviceId,
            config.accessCode
        );
    }

    /**
     * Get cached printer state
     * @param {string} printerName - Name of the printer
     * @returns {Object|null} Cached state or null
     */
    getCachedState(printerName) {
        return this.printerStates.get(printerName) || null;
    }

    /**
     * Check if printer is online
     * @param {string} printerName - Name of the printer
     * @returns {boolean} Online status
     */
    isPrinterOnline(printerName) {
        const state = this.getCachedState(printerName);
        return state ? state.online : false;
    }

    /**
     * Get all printer states
     * @returns {Object} Map of printer states
     */
    getAllPrinterStates() {
        const states = {};
        for (const [name, state] of this.printerStates) {
            states[name] = state;
        }
        return states;
    }

    /**
     * Clear cached state for a printer
     * @param {string} printerName - Name of the printer
     */
    clearCachedState(printerName) {
        this.printerStates.delete(printerName);
    }

    /**
     * Clear all cached states
     */
    clearAllCachedStates() {
        this.printerStates.clear();
    }

    /**
     * Get MQTT service instance
     * @returns {MqttService} MQTT service
     */
    getMqttService() {
        return this.mqttService;
    }

    /**
     * Close all connections
     */
    closeAllConnections() {
        this.mqttService.closeAllConnections();
    }

    /**
     * Validate printer configuration
     * @param {Object} config - Printer configuration
     * @returns {boolean} Valid configuration
     */
    validateConfig(config) {
        return (
            config &&
            config.address &&
            config.deviceId &&
            config.accessCode &&
            typeof config.address === "string" &&
            typeof config.deviceId === "string" &&
            typeof config.accessCode === "string"
        );
    }

    /**
     * Get printer information summary
     * @param {string} printerName - Name of the printer
     * @returns {Promise<Object>} Printer information
     */
    async getPrinterInfo(printerName) {
        const config = this.getPrinterConfig(printerName);
        const state = this.getCachedState(printerName);

        const info = {
            name: printerName,
            address: config.address,
            deviceId: config.deviceId,
            online: state ? state.online : false,
            lastUpdated: state ? state.lastUpdated : null,
        };

        // Try to get current status if online
        if (info.online) {
            try {
                const status = await this.getPrinterStatus(printerName);
                info.status = status;
            } catch (error) {
                info.status = { error: error.message };
                info.online = false;
            }
        }

        return info;
    }

    /**
     * Skip objects during printing
     * @param {string} printerName - Name of the printer
     * @param {Array} objectIds - Array of object IDs to skip
     * @returns {Promise<Object>} Skip response
     */
    async skipObjects(printerName, objectIds) {
        const config = this.getPrinterConfig(printerName);

        return await this.mqttService.skipObjects(
            config.address,
            config.deviceId,
            config.accessCode,
            objectIds
        );
    }

    /**
     * Send custom MQTT command to printer
     * @param {string} printerName - Name of the printer
     * @param {string} commandJson - JSON string containing the command
     * @param {Object} options - Command options
     * @returns {Promise<Object>} Command response
     */
    async sendCustomCommand(printerName, commandJson, options = {}) {
        const config = this.getPrinterConfig(printerName);

        // Parse and validate the command JSON
        let command;
        try {
            command = JSON.parse(commandJson);
        } catch (error) {
            throw new Error(`Invalid JSON command: ${error.message}`);
        }

        // Validate command structure
        if (!command || typeof command !== 'object') {
            throw new Error("Command must be a valid JSON object");
        }

        return await this.mqttService.sendCustomCommand(
            config.address,
            config.deviceId,
            config.accessCode,
            command,
            options
        );
    }
}

module.exports = PrinterManager;
