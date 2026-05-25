const BaseCommand = require("../base/BaseCommand");
const FtpService = require("../../services/file/FtpService");
const { getPrinter } = require("../../config/config");

function formatSize(bytes) {
    if (bytes == null) return "unknown";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes, i = 0;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(1)} ${units[i]}`;
}

class LsCommand extends BaseCommand {
    constructor() {
        super("ls", "List files and directories on printer");
        this.ftpService = new FtpService();
    }

    async validate(args) {
        if (!args.printerName) throw new Error("Printer name is required");
        getPrinter(args.printerName);
    }

    async run(args) {
        const cfg = getPrinter(args.printerName);
        const dir = args.path || "/";
        try {
            await this.ftpService.connect(cfg.address, cfg.accessCode);
            const files = await this.ftpService.listFiles(dir);
            return { printer: args.printerName, path: dir, files };
        } finally {
            if (this.ftpService.isConnected()) this.ftpService.close();
        }
    }

    formatSuccess(data) {
        let out = `📁 Files in ${data.path} on ${data.printer}:\n\n`;
        if (data.files.length === 0) {
            out += "   (empty directory)\n";
        } else {
            for (const f of data.files) {
                const icon = f.type === "directory" ? "📁" : "📄";
                const size = f.type === "file" ? ` (${formatSize(f.size)})` : "";
                const mod = f.modified ? ` - ${new Date(f.modified).toLocaleDateString()}` : "";
                out += `   ${icon} ${f.name}${size}${mod}\n`;
            }
        }
        out += `\nTotal: ${data.files.length} items`;
        return out;
    }
}

module.exports = LsCommand;
