#!/usr/bin/env node

const { program, Option } = require("commander");
const { name, description, version } = require("./package.json");
const logger = require("./src/utils/logger");
const { ErrorHandler } = require("./src/utils/errors");

const ConfigCommand = require("./src/commands/system/config");
const VersionCommand = require("./src/commands/system/version");
const FilamentCommand = require("./src/commands/filament/filament");
const {
    CommandCommand,
    StatusCommand,
    GetObjectsCommand,
    SkipCommand,
    PrintControlCommand,
    StartCommand,
    LightCommand,
    MonitorCommand,
} = require("./src/commands/printer");
const { LsCommand, PullCommand, PushCommand } = require("./src/commands/file");

// --- Global error handling ----------------------------------------------------

function dieOnFatal(label, err) {
    logger.error(label, { error: err && err.message, stack: err && err.stack });
    process.stderr.write(ErrorHandler.handleError(err, { verbose: program.opts().verbose }) + "\n");
    process.exit(1);
}

process.on("uncaughtException", (err) => dieOnFatal("Uncaught exception", err));
process.on("unhandledRejection", (reason) => dieOnFatal("Unhandled rejection", reason));
process.on("SIGINT", () => { logger.debug("SIGINT"); process.exit(130); });
process.on("SIGTERM", () => { logger.debug("SIGTERM"); process.exit(143); });

// --- Helper: standard command runner -----------------------------------------

/**
 * Wrap a BaseCommand into a Commander action. `mapArgs` receives the same
 * positional args Commander passes (including the final Command instance) and
 * returns the args object the command expects.
 */
function runCommand(CommandClass, mapArgs = () => ({})) {
    return async (...cliArgs) => {
        const cmdInstance = cliArgs[cliArgs.length - 1];
        const localOpts = typeof cmdInstance.opts === "function" ? cmdInstance.opts() : {};
        const globalOpts = program.opts();
        const args = mapArgs(...cliArgs);
        const command = new CommandClass();

        let result;
        try {
            result = await command.execute(args, { ...localOpts, json: globalOpts.json });
        } catch (err) {
            // execute() catches its own errors, so this only fires for truly unexpected ones.
            process.stderr.write(ErrorHandler.handleError(err, { verbose: globalOpts.verbose }) + "\n");
            process.exit(1);
        }

        if (globalOpts.json) {
            process.stdout.write(JSON.stringify({
                success: result.success,
                data: result.data ?? null,
                error: result.error ? { name: result.error.name, message: result.error.message } : null,
            }, null, 2) + "\n");
        } else {
            const text = command.formatResult(result, { ...localOpts, json: false });
            process.stdout.write(text + "\n");
        }

        if (!result.success) process.exit(1);
    };
}

// --- Program & global flags ---------------------------------------------------

program
    .name(name)
    .description(description)
    .version(version)
    .option("-v, --verbose", "verbose logging (sets log level to debug)")
    .option("-q, --quiet", "quiet logging (only errors)")
    .option("--json", "machine-readable JSON output (writes to stdout)")
    .option("--no-color", "disable colored output")
    .hook("preAction", () => {
        const opts = program.opts();
        if (opts.verbose) logger.setLevel("debug");
        else if (opts.quiet) logger.setLevel("error");
        if (opts.color === false) process.env.NO_COLOR = "1";
    });

program.addHelpText("after", `
Examples:
  $ bambu-cli config add my-a1 192.168.1.42 01S00A1234567890 12345678
  $ bambu-cli status my-a1
  $ bambu-cli status --all --json
  $ bambu-cli pause my-a1
  $ bambu-cli monitor my-a1
  $ bambu-cli light my-a1 on
  $ bambu-cli fs ls my-a1 /
  $ bambu-cli fs push my-a1 ./model.3mf
  $ bambu-cli skip my-a1 1993 1994
`);

// --- config ------------------------------------------------------------------

const configGroup = program.command("config").description("Manage printer configurations");

configGroup.command("add")
    .description("Add a printer to configuration")
    .argument("<name>")
    .argument("<address>", "printer IP address")
    .argument("<device-id>")
    .argument("<access-code>")
    .action(runCommand(ConfigCommand, (name, address, deviceId, accessCode) => ({
        action: "add", name, address, deviceId, accessCode,
    })));

configGroup.command("update")
    .description("Update an existing printer configuration")
    .argument("<name>")
    .argument("<address>")
    .argument("<device-id>")
    .argument("<access-code>")
    .action(runCommand(ConfigCommand, (name, address, deviceId, accessCode) => ({
        action: "update", name, address, deviceId, accessCode,
    })));

configGroup.command("remove")
    .description("Remove a printer from configuration")
    .argument("<name>")
    .action(runCommand(ConfigCommand, (name) => ({ action: "remove", name })));

configGroup.command("list")
    .description("List all configured printers")
    .action(runCommand(ConfigCommand, () => ({ action: "list" })));

// --- printer info / control --------------------------------------------------

program.command("version")
    .description("Get printer software version")
    .argument("<printer>")
    .action(runCommand(VersionCommand, (printer) => ({ printerName: printer })));

program.command("status")
    .description("Get comprehensive printer status")
    .argument("[printer]", "printer name (omit with --all)")
    .option("--all", "query every configured printer")
    .action(runCommand(StatusCommand, (printer, opts) => ({
        printerName: printer, all: !!opts.all,
    })));

program.command("monitor")
    .description("Stream live status updates from the printer until Ctrl+C")
    .argument("<printer>")
    .action(runCommand(MonitorCommand, (printer) => ({ printerName: printer })));

program.command("pause")
    .description("Pause the current print job")
    .argument("<printer>")
    .action(runCommand(class extends PrintControlCommand { constructor() { super("pause"); } },
        (printer) => ({ printerName: printer })));

program.command("resume")
    .description("Resume a paused print job")
    .argument("<printer>")
    .action(runCommand(class extends PrintControlCommand { constructor() { super("resume"); } },
        (printer) => ({ printerName: printer })));

program.command("stop")
    .description("Stop the current print job")
    .argument("<printer>")
    .action(runCommand(class extends PrintControlCommand { constructor() { super("stop"); } },
        (printer) => ({ printerName: printer })));

program.command("start")
    .description("Start a print from a file already on the printer")
    .argument("<printer>")
    .argument("<file>", "remote file path on the printer")
    .action(runCommand(StartCommand, (printer, file) => ({ printerName: printer, file })));

program.command("light")
    .description("Control printer LED")
    .argument("<printer>")
    .argument("<mode>", "on | off | flashing")
    .option("--node <node>", "LED node (work_light or chamber_light)", "work_light")
    .action(runCommand(LightCommand, (printer, mode, opts) => ({
        printerName: printer, mode, node: opts.node,
    })));

program.command("get-objects")
    .description("Get object information from current print")
    .argument("[printer]", "printer name (omit when using --file)")
    .option("--file <path>", "read objects from a local .3mf/.gcode.3mf file instead of fetching from the printer")
    .option("--borders", "render objects as bounding-box rectangles instead of the 3MF's top-down silhouettes (the default)")
    .action(runCommand(GetObjectsCommand, (printer) => ({ printerName: printer })));

program.command("skip")
    .description("Skip objects during printing")
    .argument("<printer>")
    .argument("<objectIds...>", "object IDs to skip (space-separated)")
    .action(runCommand(SkipCommand, (printer, objectIds) => ({
        printerName: printer, objectIds,
    })));

program.command("command")
    .description("Send custom MQTT command to printer")
    .argument("<printer>")
    .argument("<json>", "JSON command to send")
    .addOption(new Option("--no-validate-sequence", "do not match response by sequence_id"))
    .action(runCommand(CommandCommand, (printer, json) => ({
        printerName: printer, commandJson: json,
    })));

// --- filament ----------------------------------------------------------------

const filamentGroup = program.command("filament").description("Manage filament operations");

filamentGroup.command("unload")
    .description("Unload filament from the printer")
    .argument("<printer>")
    .action(runCommand(FilamentCommand, (printer) => ({
        action: "unload", printerName: printer,
    })));

// --- fs ----------------------------------------------------------------------

const fsGroup = program.command("fs").description("File system operations on printer");

fsGroup.command("ls")
    .description("List files and directories on printer")
    .argument("<printer>")
    .argument("[path]", "directory path (default: /)")
    .action(runCommand(LsCommand, (printer, p) => ({ printerName: printer, path: p })));

fsGroup.command("pull")
    .description("Download file from printer")
    .argument("<printer>")
    .argument("<remote-path>", "remote file path on printer")
    .argument("[local-path]", "local file path (default: filename only)")
    .option("--allow-outside", "allow writing outside the current working directory")
    .action(runCommand(PullCommand, (printer, remotePath, localPath) => ({
        printerName: printer, remotePath, localPath,
    })));

fsGroup.command("push")
    .description("Upload a local file to the printer")
    .argument("<printer>")
    .argument("<local-path>", "local file to upload")
    .argument("[remote-path]", "remote path on printer (default: /<basename>)")
    .action(runCommand(PushCommand, (printer, localPath, remotePath) => ({
        printerName: printer, localPath, remotePath,
    })));

// --- parse --------------------------------------------------------------------

program.parseAsync(process.argv).catch((err) => dieOnFatal("Commander error", err));

if (!process.argv.slice(2).length) program.outputHelp();
