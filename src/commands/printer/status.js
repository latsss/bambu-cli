const BaseCommand = require("../base/BaseCommand");
const { getPrinter } = require("../../config/config");
const MqttService = require("../../services/connection/MqttService");

/**
 * Printer status command
 * Gets comprehensive printer status via MQTT pushall command
 */
class StatusCommand extends BaseCommand {
    constructor() {
        super("status", "Get comprehensive printer status");
        this.mqttService = new MqttService();
    }

    /**
     * Validate command arguments
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     */
    async validate(args, options) {
        if (!args.printerName) {
            throw new Error("Printer name is required");
        }

        // Validate printer exists in config
        try {
            getPrinter(args.printerName);
        } catch (error) {
            throw new Error(`Printer '${args.printerName}' not found in configuration`);
        }
    }

    /**
     * Execute the status command
     * @param {Object} args - Command arguments
     * @param {Object} options - Command options
     * @returns {Promise<Object>} Command result data
     */
    async run(args, options) {
        const config = getPrinter(args.printerName);

        try {
            this.log("info", `Connecting to printer: ${args.printerName} (${config.address})`);
            
            this.log("info", "Requesting comprehensive printer status");
            
            const response = await this.mqttService.getPrinterStatus(
                config.address,
                config.deviceId,
                config.accessCode
            );

            this.log("info", "Received printer status data");

            return {
                printer: args.printerName,
                status: response,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            this.log("error", `Failed to get printer status: ${error.message}`);
            throw error;
        }
    }

    /**
     * Format the command result for display
     * @param {Object} result - Command result
     * @returns {string} Formatted result
     */
    formatResult(result) {
        if (!result.success) {
            return `❌ Failed to get printer status: ${result.error.message}`;
        }

        const { printer, status } = result.data;
        const print = status.print;
        
        if (!print) {
            return `❌ Invalid status response from ${printer}`;
        }

        return this.formatStatus(printer, print);
    }

    /**
     * Format printer status for display
     * @param {string} printer - Printer name
     * @param {Object} print - Print status object
     * @returns {string} Formatted status
     */
    formatStatus(printer, print) {
        let output = `🖨️  Printer Status: ${printer}\n`;
        output += `═`.repeat(50) + `\n\n`;

        // Basic Status
        output += `📊 Basic Status:\n`;
        output += `   State: ${this.getStateIcon(print.gcode_state)} ${print.gcode_state}\n`;
        output += `   Online: ${print.online ? '🟢 Yes' : '🔴 No'}\n`;
        output += `   WiFi: ${print.wifi_signal || 'Unknown'}\n`;
        output += `   Lifecycle: ${print.lifecycle || 'Unknown'}\n`;
        if (print.subtask_name) {
            output += `   Current Job: ${print.subtask_name}\n`;
        }
        output += `\n`;

        // Temperatures
        output += `🌡️  Temperatures:\n`;
        output += `   Nozzle: ${print.nozzle_temper}°C / ${print.nozzle_target_temper}°C\n`;
        output += `   Bed: ${print.bed_temper}°C / ${print.bed_target_temper}°C\n`;
        if (print.chamber_temper !== undefined) {
            output += `   Chamber: ${print.chamber_temper}°C\n`;
        }
        output += `\n`;

        // Fans
        output += `💨 Fans:\n`;
        output += `   Part Cooling: ${print.cooling_fan_speed}%\n`;
        output += `   Heatbreak: ${print.heatbreak_fan_speed}%\n`;
        if (print.big_fan1_speed !== undefined) {
            output += `   Auxiliary: ${print.big_fan1_speed}%\n`;
        }
        if (print.big_fan2_speed !== undefined) {
            output += `   Chamber: ${print.big_fan2_speed}%\n`;
        }
        output += `\n`;

        // Print Progress (if printing or recently finished)
        if (print.gcode_state === "RUNNING" || print.gcode_state === "PAUSE" || 
            (print.gcode_state === "FINISH" && print.mc_percent > 0)) {
            output += `🖨️  Print Progress:\n`;
            if (print.gcode_file) {
                output += `   File: ${print.gcode_file}\n`;
            }
            output += `   Progress: ${print.mc_percent}%\n`;
            if (print.mc_remaining_time > 0) {
                output += `   Remaining Time: ${this.formatTime(print.mc_remaining_time)}\n`;
            }
            if (print.layer_num > 0 && print.total_layer_num > 0) {
                output += `   Layer: ${print.layer_num}/${print.total_layer_num}\n`;
            }
            output += `   Speed: ${print.spd_mag}% (Level ${print.spd_lvl})\n`;
            output += `\n`;
        }

        // AMS Status (if available)
        if (print.ams && print.ams.ams && print.ams.ams.length > 0) {
            output += `🎨 AMS Status:\n`;
            print.ams.ams.forEach((amsUnit, index) => {
                output += `   AMS ${index + 1}: ${amsUnit.humidity}% humidity, ${amsUnit.temp}°C\n`;
                if (amsUnit.tray && amsUnit.tray.length > 0) {
                    amsUnit.tray.forEach((tray, trayIndex) => {
                        if (tray.tray_type && tray.tray_type !== "") {
                            output += `     Tray ${trayIndex + 1}: ${tray.tray_type} (${tray.remain}g remaining)\n`;
                        }
                    });
                }
            });
            output += `\n`;
        }

        // External Spool (vt_tray)
        if (print.vt_tray && print.vt_tray.tray_type && print.vt_tray.tray_type !== "") {
            output += `🎯 External Spool:\n`;
            output += `   Type: ${print.vt_tray.tray_type}\n`;
            if (print.vt_tray.tray_sub_brands) {
                output += `   Brand: ${print.vt_tray.tray_sub_brands}\n`;
            }
            if (print.vt_tray.remain > 0) {
                output += `   Remaining: ${print.vt_tray.remain}g\n`;
            }
            output += `\n`;
        }

        // Lights
        if (print.lights_report && print.lights_report.length > 0) {
            output += `💡 Lights:\n`;
            print.lights_report.forEach(light => {
                const icon = light.mode === 'on' ? '🟡' : light.mode === 'flashing' ? '⚡' : '⚫';
                output += `   ${icon} ${light.node}: ${light.mode}\n`;
            });
            output += `\n`;
        }

        // Errors (if any)
        if (print.print_error !== 0 || (print.fail_reason && print.fail_reason !== "0")) {
            output += `⚠️  Issues:\n`;
            if (print.print_error !== 0) {
                output += `   Print Error: ${print.print_error}\n`;
            }
            if (print.fail_reason && print.fail_reason !== "0") {
                output += `   Fail Reason: ${print.fail_reason}\n`;
            }
            output += `\n`;
        }

        // HMS (Hardware Monitoring System) errors
        if (print.hms && print.hms.length > 0) {
            output += `🔧 HMS Errors:\n`;
            print.hms.forEach(hms => {
                output += `   ${hms.title}: ${hms.desc}\n`;
            });
            output += `\n`;
        }

        output += `═`.repeat(50) + `\n`;
        output += `📅 Last Updated: ${new Date().toLocaleString()}\n`;

        return output;
    }

    /**
     * Get state icon
     * @param {string} state - Printer state
     * @returns {string} State icon
     */
    getStateIcon(state) {
        const icons = {
            'IDLE': '🟢',
            'RUNNING': '🟡',
            'PRINTING': '🟡',
            'PAUSE': '🟠',
            'FINISH': '🟢',
            'FAILED': '🔴',
            'PREPARE': '🟡',
            'SLICING': '🟡'
        };
        return icons[state] || '❓';
    }

    /**
     * Format time in seconds to human readable format
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time
     */
    formatTime(seconds) {
        if (!seconds || seconds === 0) return 'Unknown';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
}

module.exports = StatusCommand; 