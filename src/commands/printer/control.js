const BaseCommand = require("../base/BaseCommand");
const PrinterManager = require("../../services/printer/PrinterManager");

const ACTIONS = {
    pause: { emoji: "⏸️ ", method: "pausePrint", past: "Paused" },
    resume: { emoji: "▶️ ", method: "resumePrint", past: "Resumed" },
    stop: { emoji: "⏹️ ", method: "stopPrint", past: "Stopped" },
};

class PrintControlCommand extends BaseCommand {
    constructor(action) {
        if (!ACTIONS[action]) throw new Error(`Unknown print control action: ${action}`);
        super(action, `${action} the current print job`);
        this.action = action;
    }

    async validate(args) {
        if (!args.printerName) throw new Error("Printer name is required");
    }

    async run(args) {
        const pm = new PrinterManager();
        try {
            const response = await pm[ACTIONS[this.action].method](args.printerName);
            return { printer: args.printerName, action: this.action, response };
        } finally {
            pm.closeAllConnections();
        }
    }

    formatSuccess(data) {
        const meta = ACTIONS[data.action];
        return `${meta.emoji} ${meta.past} print on ${data.printer}`;
    }
}

module.exports = PrintControlCommand;
