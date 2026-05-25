const BaseCommand = require("../base/BaseCommand");
const PrinterManager = require("../../services/printer/PrinterManager");
const { listPrinters } = require("../../config/config");

class StatusCommand extends BaseCommand {
    constructor() {
        super("status", "Get comprehensive printer status");
    }

    async validate(args) {
        if (!args.all && !args.printerName) {
            throw new Error("Printer name is required (or pass --all)");
        }
    }

    async run(args) {
        if (args.all) {
            const names = Object.keys(listPrinters());
            if (names.length === 0) return { all: true, results: [] };
            const results = await Promise.all(names.map(async (name) => {
                const pm = new PrinterManager();
                try {
                    const status = await pm.getPrinterStatus(name);
                    return { printer: name, ok: true, status };
                } catch (error) {
                    return { printer: name, ok: false, error: error.message };
                } finally {
                    pm.closeAllConnections();
                }
            }));
            return { all: true, results };
        }

        const pm = new PrinterManager();
        try {
            const status = await pm.getPrinterStatus(args.printerName);
            return { printer: args.printerName, status };
        } finally {
            pm.closeAllConnections();
        }
    }

    formatSuccess(data) {
        if (data.all) {
            if (data.results.length === 0) return "📋 No printers configured";
            return data.results
                .map((r) => r.ok ? this.formatStatus(r.printer, r.status.print) : `❌ ${r.printer}: ${r.error}`)
                .join("\n\n");
        }
        const print = data.status && data.status.print;
        if (!print) return `❌ Invalid status response from ${data.printer}`;
        return this.formatStatus(data.printer, print);
    }

    formatStatus(printer, print) {
        const line = "═".repeat(50);
        let out = `🖨️  Printer Status: ${printer}\n${line}\n\n`;

        out += `📊 Basic Status:\n`;
        out += `   State: ${this.getStateIcon(print.gcode_state)} ${print.gcode_state ?? "Unknown"}\n`;
        if (print.online !== undefined) out += `   Online: ${print.online ? "🟢 Yes" : "🔴 No"}\n`;
        if (print.wifi_signal !== undefined) out += `   WiFi: ${print.wifi_signal}\n`;
        if (print.lifecycle) out += `   Lifecycle: ${print.lifecycle}\n`;
        if (print.subtask_name) out += `   Current Job: ${print.subtask_name}\n`;
        out += "\n";

        const tempLine = (label, cur, target) => {
            if (cur === undefined && target === undefined) return null;
            const c = cur !== undefined ? `${cur}°C` : "—";
            const t = target !== undefined ? ` / ${target}°C` : "";
            return `   ${label}: ${c}${t}\n`;
        };
        const temps = [
            tempLine("Nozzle", print.nozzle_temper, print.nozzle_target_temper),
            tempLine("Bed", print.bed_temper, print.bed_target_temper),
            print.chamber_temper !== undefined ? `   Chamber: ${print.chamber_temper}°C\n` : null,
        ].filter(Boolean);
        if (temps.length) out += `🌡️  Temperatures:\n${temps.join("")}\n`;

        const fans = [
            print.cooling_fan_speed !== undefined ? `   Part Cooling: ${print.cooling_fan_speed}%\n` : null,
            print.heatbreak_fan_speed !== undefined ? `   Heatbreak: ${print.heatbreak_fan_speed}%\n` : null,
            print.big_fan1_speed !== undefined ? `   Auxiliary: ${print.big_fan1_speed}%\n` : null,
            print.big_fan2_speed !== undefined ? `   Chamber: ${print.big_fan2_speed}%\n` : null,
        ].filter(Boolean);
        if (fans.length) out += `💨 Fans:\n${fans.join("")}\n`;

        const isPrinting = print.gcode_state === "RUNNING" || print.gcode_state === "PAUSE" ||
            (print.gcode_state === "FINISH" && print.mc_percent > 0);
        if (isPrinting) {
            out += `🖨️  Print Progress:\n`;
            if (print.gcode_file) out += `   File: ${print.gcode_file}\n`;
            if (print.mc_percent !== undefined) out += `   Progress: ${print.mc_percent}%\n`;
            if (print.mc_remaining_time > 0) out += `   Remaining: ${this.formatTime(print.mc_remaining_time)}\n`;
            if (print.layer_num > 0 && print.total_layer_num > 0) {
                out += `   Layer: ${print.layer_num}/${print.total_layer_num}\n`;
            }
            if (print.spd_mag !== undefined) out += `   Speed: ${print.spd_mag}% (Level ${print.spd_lvl})\n`;
            out += "\n";
        }

        if (print.ams && Array.isArray(print.ams.ams) && print.ams.ams.length > 0) {
            out += `🎨 AMS Status:\n`;
            print.ams.ams.forEach((unit, i) => {
                out += `   AMS ${i + 1}: ${unit.humidity ?? "?"}% humidity, ${unit.temp ?? "?"}°C\n`;
                if (Array.isArray(unit.tray)) {
                    unit.tray.forEach((tray, ti) => {
                        if (tray.tray_type) {
                            out += `     Tray ${ti + 1}: ${tray.tray_type} (${tray.remain ?? "?"}g remaining)\n`;
                        }
                    });
                }
            });
            out += "\n";
        }

        if (print.vt_tray && print.vt_tray.tray_type) {
            out += `🎯 External Spool:\n`;
            out += `   Type: ${print.vt_tray.tray_type}\n`;
            if (print.vt_tray.tray_sub_brands) out += `   Brand: ${print.vt_tray.tray_sub_brands}\n`;
            if (print.vt_tray.remain > 0) out += `   Remaining: ${print.vt_tray.remain}g\n`;
            out += "\n";
        }

        if (Array.isArray(print.lights_report) && print.lights_report.length > 0) {
            out += `💡 Lights:\n`;
            print.lights_report.forEach((light) => {
                const icon = light.mode === "on" ? "🟡" : light.mode === "flashing" ? "⚡" : "⚫";
                out += `   ${icon} ${light.node}: ${light.mode}\n`;
            });
            out += "\n";
        }

        if (print.print_error !== undefined && print.print_error !== 0) {
            out += `⚠️  Print Error: ${print.print_error}\n\n`;
        }
        if (Array.isArray(print.hms) && print.hms.length > 0) {
            out += `🔧 HMS Errors:\n`;
            print.hms.forEach((h) => { out += `   ${h.attr ?? ""} ${h.code ?? ""}\n`; });
            out += "\n";
        }

        out += `${line}\n📅 Fetched: ${new Date().toLocaleString()}\n`;
        return out;
    }

    getStateIcon(state) {
        return {
            IDLE: "🟢", RUNNING: "🟡", PRINTING: "🟡", PAUSE: "🟠",
            FINISH: "🟢", FAILED: "🔴", PREPARE: "🟡", SLICING: "🟡",
        }[state] || "❓";
    }

    formatTime(seconds) {
        if (!seconds) return "Unknown";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }
}

module.exports = StatusCommand;
