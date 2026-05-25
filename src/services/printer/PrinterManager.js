const { getPrinter } = require("../../config/config");
const MqttService = require("../connection/MqttService");

/**
 * Thin facade over MqttService that resolves a printer name to its config.
 * Always close connections via closeAllConnections() in a finally block.
 */
class PrinterManager {
    constructor() {
        this.mqttService = new MqttService();
    }

    getPrinterConfig(printerName) {
        const config = getPrinter(printerName);
        if (!config.address || !config.deviceId || !config.accessCode) {
            throw new Error(`Invalid printer configuration for '${printerName}'`);
        }
        return config;
    }

    async getPrinterStatus(printerName) {
        const { address, deviceId, accessCode } = this.getPrinterConfig(printerName);
        return this.mqttService.getPrinterStatus(address, deviceId, accessCode);
    }

    async getPrinterVersion(printerName) {
        const { address, deviceId, accessCode } = this.getPrinterConfig(printerName);
        return this.mqttService.getPrinterVersion(address, deviceId, accessCode);
    }

    async startPrint(printerName, fileName) {
        if (!fileName || typeof fileName !== "string") {
            throw new Error("Valid file name is required");
        }
        const { address, deviceId, accessCode } = this.getPrinterConfig(printerName);
        return this.mqttService.startPrint(address, deviceId, accessCode, fileName);
    }

    async stopPrint(printerName) {
        const { address, deviceId, accessCode } = this.getPrinterConfig(printerName);
        return this.mqttService.stopPrint(address, deviceId, accessCode);
    }

    async pausePrint(printerName) {
        const { address, deviceId, accessCode } = this.getPrinterConfig(printerName);
        return this.mqttService.pausePrint(address, deviceId, accessCode);
    }

    async resumePrint(printerName) {
        const { address, deviceId, accessCode } = this.getPrinterConfig(printerName);
        return this.mqttService.resumePrint(address, deviceId, accessCode);
    }

    async unloadFilament(printerName) {
        const { address, deviceId, accessCode } = this.getPrinterConfig(printerName);
        return this.mqttService.unloadFilament(address, deviceId, accessCode);
    }

    async setLight(printerName, node, mode) {
        const { address, deviceId, accessCode } = this.getPrinterConfig(printerName);
        return this.mqttService.setLight(address, deviceId, accessCode, node, mode);
    }

    async skipObjects(printerName, objectIds) {
        const { address, deviceId, accessCode } = this.getPrinterConfig(printerName);
        return this.mqttService.skipObjects(address, deviceId, accessCode, objectIds);
    }

    async sendCustomCommand(printerName, commandJson, options = {}) {
        const { address, deviceId, accessCode } = this.getPrinterConfig(printerName);
        let command;
        try {
            command = typeof commandJson === "string" ? JSON.parse(commandJson) : commandJson;
        } catch (error) {
            throw new Error(`Invalid JSON command: ${error.message}`);
        }
        if (!command || typeof command !== "object") {
            throw new Error("Command must be a valid JSON object");
        }
        return this.mqttService.sendCustomCommand(address, deviceId, accessCode, command, options);
    }

    closeAllConnections() {
        this.mqttService.closeAllConnections();
    }
}

module.exports = PrinterManager;
