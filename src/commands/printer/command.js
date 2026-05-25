const BaseCommand = require("../base/BaseCommand");
const PrinterManager = require("../../services/printer/PrinterManager");

class CommandCommand extends BaseCommand {
    constructor() {
        super("command", "Send custom MQTT command to printer");
    }

    async validate(args) {
        if (!args.printerName) throw new Error("Printer name is required");
        if (!args.commandJson) throw new Error("Command JSON is required");
        try {
            JSON.parse(args.commandJson);
        } catch (err) {
            throw new Error(`Invalid JSON: ${err.message}`);
        }
    }

    async run(args, options = {}) {
        const pm = new PrinterManager();
        try {
            const response = await pm.sendCustomCommand(args.printerName, args.commandJson, {
                validateSequenceId: options.validateSequence !== false,
            });
            return {
                printer: args.printerName,
                command: JSON.parse(args.commandJson),
                response,
            };
        } finally {
            pm.closeAllConnections();
        }
    }

    formatSuccess(data) {
        return [
            `🔧 Custom command sent to ${data.printer}`,
            `📤 ${JSON.stringify(data.command, null, 2)}`,
            `📥 ${JSON.stringify(data.response, null, 2)}`,
        ].join("\n");
    }
}

module.exports = CommandCommand;
