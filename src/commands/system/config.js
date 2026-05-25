const BaseCommand = require("../base/BaseCommand");
const {
    addToConfig,
    removeFromConfig,
    listPrinters,
    updateConfig,
} = require("../../config/config");

class ConfigCommand extends BaseCommand {
    constructor() {
        super("config", "Manage printer configurations");
    }

    async validate(args) {
        const validActions = ["add", "remove", "list", "update"];
        if (!validActions.includes(args.action)) {
            throw new Error(`Invalid action. Must be one of: ${validActions.join(", ")}`);
        }
        if (["add", "update"].includes(args.action)) {
            if (!args.name || !args.address || !args.deviceId || !args.accessCode) {
                throw new Error(`${args.action} requires: name, address, deviceId, accessCode`);
            }
        }
        if (args.action === "remove" && !args.name) {
            throw new Error("remove requires: name");
        }
    }

    async run(args) {
        switch (args.action) {
            case "add":
                addToConfig(args.name, args.address, args.deviceId, args.accessCode);
                return { action: "add", printer: args.name, address: args.address, deviceId: args.deviceId };
            case "update":
                updateConfig(args.name, args.address, args.deviceId, args.accessCode);
                return { action: "update", printer: args.name, address: args.address, deviceId: args.deviceId };
            case "remove":
                removeFromConfig(args.name);
                return { action: "remove", printer: args.name };
            case "list":
                return { action: "list", printers: listPrinters() };
            default:
                throw new Error(`Unknown action: ${args.action}`);
        }
    }

    formatSuccess(data) {
        switch (data.action) {
            case "add":
                return `✅ Added printer: ${data.printer}\n📍 Address: ${data.address}\n🆔 Device ID: ${data.deviceId}`;
            case "update":
                return `✅ Updated printer: ${data.printer}\n📍 Address: ${data.address}\n🆔 Device ID: ${data.deviceId}`;
            case "remove":
                return `✅ Removed printer: ${data.printer}`;
            case "list": {
                const entries = Object.entries(data.printers);
                if (entries.length === 0) return "📋 No printers configured";
                let out = `📋 Configured printers (${entries.length}):\n`;
                for (const [name, cfg] of entries) {
                    out += `\n🔸 ${name}:\n`;
                    out += `   📍 Address: ${cfg.address}\n`;
                    out += `   🆔 Device ID: ${cfg.deviceId}\n`;
                }
                return out;
            }
            default:
                return JSON.stringify(data, null, 2);
        }
    }
}

module.exports = ConfigCommand;
