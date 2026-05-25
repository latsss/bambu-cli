const BaseCommand = require("../base/BaseCommand");
const PrinterManager = require("../../services/printer/PrinterManager");

class SkipCommand extends BaseCommand {
    constructor() {
        super("skip", "Skip objects during printing");
    }

    async validate(args) {
        if (!args.printerName) throw new Error("Printer name is required");
        if (!Array.isArray(args.objectIds) || args.objectIds.length === 0) {
            throw new Error("Object IDs are required");
        }
        args.objectIds = args.objectIds.map((id, i) => {
            const n = parseInt(id, 10);
            if (Number.isNaN(n)) throw new Error(`Invalid object ID at index ${i}: must be a number`);
            return n;
        });
    }

    async run(args) {
        const pm = new PrinterManager();
        try {
            const result = await pm.skipObjects(args.printerName, args.objectIds);
            return { printer: args.printerName, objectIds: args.objectIds, result };
        } finally {
            pm.closeAllConnections();
        }
    }

    formatSuccess(data) {
        return `✅ Skipped objects on ${data.printer}: ${data.objectIds.join(", ")}`;
    }
}

module.exports = SkipCommand;
