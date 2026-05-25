const BaseCommand = require("../base/BaseCommand");
const PrinterManager = require("../../services/printer/PrinterManager");
const { getPrinter } = require("../../config/config");

/**
 * Subscribe to a printer's report topic and stream updates until Ctrl+C.
 * Output is one line per event (JSON when --json, otherwise a brief summary).
 */
class MonitorCommand extends BaseCommand {
    constructor() {
        super("monitor", "Stream live status updates from the printer");
    }

    async validate(args) {
        if (!args.printerName) throw new Error("Printer name is required");
        getPrinter(args.printerName); // throws if missing
    }

    async run(args, options = {}) {
        const cfg = getPrinter(args.printerName);
        const pm = new PrinterManager();
        const mqtt = pm.mqttService;
        const client = await mqtt.connect(cfg.address, cfg.deviceId, cfg.accessCode);

        const json = !!options.json;
        const writeLine = (s) => process.stdout.write(s + "\n");

        const unsubscribe = await mqtt.streamReports(client, cfg.deviceId, (payload) => {
            if (json) {
                writeLine(JSON.stringify(payload));
                return;
            }
            const p = payload.print;
            if (p) {
                const parts = [new Date().toISOString(), p.gcode_state ?? "?"];
                if (p.mc_percent !== undefined) parts.push(`${p.mc_percent}%`);
                if (p.nozzle_temper !== undefined) parts.push(`N:${p.nozzle_temper}°`);
                if (p.bed_temper !== undefined) parts.push(`B:${p.bed_temper}°`);
                if (p.layer_num !== undefined && p.total_layer_num !== undefined) {
                    parts.push(`L:${p.layer_num}/${p.total_layer_num}`);
                }
                writeLine(parts.join(" | "));
            } else if (payload.info) {
                writeLine(`${new Date().toISOString()} info: ${JSON.stringify(payload.info)}`);
            }
        });

        // Trigger an initial pushall so we see state immediately.
        try {
            await mqtt.publish(client, `device/${cfg.deviceId}/request`, {
                pushing: { sequence_id: "0", command: "pushall", version: 1, push_target: 1 },
            });
        } catch {
            // ignore — periodic reports will arrive anyway
        }

        return new Promise((resolve) => {
            const shutdown = () => {
                unsubscribe();
                pm.closeAllConnections();
                resolve({ printer: args.printerName, stopped: true });
            };
            process.once("SIGINT", shutdown);
            process.once("SIGTERM", shutdown);
        });
    }

    formatSuccess() {
        return "👋 Monitor stopped";
    }
}

module.exports = MonitorCommand;
