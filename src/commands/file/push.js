const BaseCommand = require("../base/BaseCommand");
const FtpService = require("../../services/file/FtpService");
const { getPrinter } = require("../../config/config");
const fs = require("fs");
const path = require("path");

class PushCommand extends BaseCommand {
    constructor() {
        super("push", "Upload a local file to the printer");
        this.ftpService = new FtpService();
    }

    async validate(args) {
        if (!args.printerName) throw new Error("Printer name is required");
        if (!args.localPath) throw new Error("Local file path is required");
        getPrinter(args.printerName);
        if (!fs.existsSync(args.localPath)) {
            throw new Error(`Local file does not exist: ${args.localPath}`);
        }
        const stat = fs.statSync(args.localPath);
        if (!stat.isFile()) throw new Error(`Not a regular file: ${args.localPath}`);
    }

    async run(args) {
        const cfg = getPrinter(args.printerName);
        const remotePath = args.remotePath || `/${path.basename(args.localPath)}`;
        const size = fs.statSync(args.localPath).size;
        try {
            await this.ftpService.connect(cfg.address, cfg.accessCode);
            this.log("info", `Uploading ${args.localPath} (${size}B) -> ${remotePath}`);
            await this.ftpService.uploadFile(args.localPath, remotePath);
            return { printer: args.printerName, localPath: args.localPath, remotePath, size };
        } finally {
            if (this.ftpService.isConnected()) this.ftpService.close();
        }
    }

    formatSuccess(data) {
        return `✅ Uploaded to ${data.printer}:\n   💾 Local:  ${data.localPath}\n   📄 Remote: ${data.remotePath}\n   📏 Size:   ${data.size} bytes\n`;
    }
}

module.exports = PushCommand;
