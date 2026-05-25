const BaseCommand = require("../base/BaseCommand");
const PrinterManager = require("../../services/printer/PrinterManager");

class VersionCommand extends BaseCommand {
    constructor() {
        super("version", "Get printer software version");
    }

    async validate(args) {
        if (!args.printerName) throw new Error("Printer name is required");
    }

    async run(args) {
        const pm = new PrinterManager();
        try {
            const version = await pm.getPrinterVersion(args.printerName);
            return { printer: args.printerName, version };
        } finally {
            pm.closeAllConnections();
        }
    }

    formatSuccess(data) {
        return `📋 Printer: ${data.printer}\n📦 Version: ${data.version}`;
    }
}

module.exports = VersionCommand;
