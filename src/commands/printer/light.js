const BaseCommand = require("../base/BaseCommand");
const PrinterManager = require("../../services/printer/PrinterManager");

const VALID_MODES = new Set(["on", "off", "flashing"]);

class LightCommand extends BaseCommand {
    constructor() {
        super("light", "Control printer light (work_light by default)");
    }

    async validate(args) {
        if (!args.printerName) throw new Error("Printer name is required");
        if (!VALID_MODES.has(args.mode)) {
            throw new Error(`mode must be one of: ${[...VALID_MODES].join(", ")}`);
        }
    }

    async run(args) {
        const node = args.node || "work_light";
        const pm = new PrinterManager();
        try {
            const response = await pm.setLight(args.printerName, node, args.mode);
            return { printer: args.printerName, node, mode: args.mode, response };
        } finally {
            pm.closeAllConnections();
        }
    }

    formatSuccess(data) {
        const icon = data.mode === "on" ? "💡" : data.mode === "flashing" ? "⚡" : "⚫";
        return `${icon} ${data.printer}: ${data.node} → ${data.mode}`;
    }
}

module.exports = LightCommand;
