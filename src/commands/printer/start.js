const BaseCommand = require("../base/BaseCommand");
const PrinterManager = require("../../services/printer/PrinterManager");

class StartCommand extends BaseCommand {
    constructor() {
        super("start", "Start a print from a file already on the printer");
    }

    async validate(args) {
        if (!args.printerName) throw new Error("Printer name is required");
        if (!args.file) throw new Error("Remote file path is required");
    }

    async run(args) {
        const pm = new PrinterManager();
        try {
            const response = await pm.startPrint(args.printerName, args.file);
            return { printer: args.printerName, file: args.file, response };
        } finally {
            pm.closeAllConnections();
        }
    }

    formatSuccess(data) {
        return `▶️  Started print on ${data.printer}: ${data.file}`;
    }
}

module.exports = StartCommand;
