const BaseCommand = require("../base/BaseCommand");
const FtpService = require("../../services/file/FtpService");
const { getPrinter } = require("../../config/config");
const fs = require("fs");
const path = require("path");

/**
 * Resolve a user-supplied local destination path with a basic sandbox:
 * relative paths must stay within the current working directory unless
 * `allowOutside` is true. Absolute paths are passed through (user opt-in).
 */
function resolveLocalPath(remotePath, localPath, { allowOutside = false } = {}) {
    if (!localPath || localPath === ".") {
        return path.resolve(path.basename(remotePath));
    }
    if (path.isAbsolute(localPath)) return localPath;
    const resolved = path.resolve(localPath);
    if (!allowOutside) {
        const cwd = path.resolve(process.cwd());
        const rel = path.relative(cwd, resolved);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
            throw new Error(
                `Refusing to write outside cwd: ${resolved}\n` +
                `Pass --allow-outside or provide an absolute path to opt in.`
            );
        }
    }
    return resolved;
}

class PullCommand extends BaseCommand {
    constructor() {
        super("pull", "Download file from printer");
        this.ftpService = new FtpService();
    }

    async validate(args) {
        if (!args.printerName) throw new Error("Printer name is required");
        if (!args.remotePath) throw new Error("Remote file path is required");
        getPrinter(args.printerName);
    }

    async run(args, options = {}) {
        const cfg = getPrinter(args.printerName);
        const localPath = resolveLocalPath(args.remotePath, args.localPath, {
            allowOutside: options.allowOutside === true,
        });

        const localDir = path.dirname(localPath);
        if (!fs.existsSync(localDir)) {
            throw new Error(`Local directory does not exist: ${localDir}`);
        }

        try {
            await this.ftpService.connect(cfg.address, cfg.accessCode);
            this.log("info", `Downloading ${args.remotePath} -> ${localPath}`);
            await this.ftpService.downloadFile(args.remotePath, localPath);
            const size = fs.statSync(localPath).size;
            return { printer: args.printerName, remotePath: args.remotePath, localPath, size };
        } finally {
            if (this.ftpService.isConnected()) this.ftpService.close();
        }
    }

    formatSuccess(data) {
        return `✅ Downloaded from ${data.printer}:\n   📄 Remote: ${data.remotePath}\n   💾 Local:  ${data.localPath}\n   📏 Size:   ${data.size} bytes\n`;
    }
}

module.exports = PullCommand;
module.exports.resolveLocalPath = resolveLocalPath;
