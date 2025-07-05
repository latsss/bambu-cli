#!/usr/bin/env node

const { program } = require("commander");
const { name, description, version } = require("./package.json");
const logger = require("./src/utils/logger");
const { ErrorHandler } = require("./src/utils/errors");

// Import commands
const VersionCommand = require("./src/commands/system/version");
const ConfigCommand = require("./src/commands/system/config");
const FilamentCommand = require("./src/commands/filament/filament");
const { CommandCommand, StatusCommand, GetObjectsCommand, SkipCommand } = require("./src/commands/printer");
const { LsCommand, PullCommand } = require("./src/commands/file");

// Initialize logger
logger.info("Starting bambu-cli", { version: version });

program.name(name).description(description).version(version);

// Global error handling
process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", {
        error: error.message,
        stack: error.stack,
    });
    const message = ErrorHandler.handleError(error, { verbose: false });
    console.error(message);
    process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled rejection", { reason: reason, promise: promise });
    const message = ErrorHandler.handleError(reason, { verbose: false });
    console.error(message);
    process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", () => {
    logger.info("Received SIGINT, shutting down gracefully");
    process.exit(0);
});

process.on("SIGTERM", () => {
    logger.info("Received SIGTERM, shutting down gracefully");
    process.exit(0);
});

// Configuration commands
const configGroup = program
    .command("config")
    .description("Manage printer configurations");

configGroup
    .command("add")
    .description("Add a printer to configuration")
    .argument("<name>", "printer name")
    .argument("<address>", "printer's IP address")
    .argument("<device-id>", "printer's serial number")
    .argument("<access-code>", "printer's LAN mode access code")
    .action(async (name, address, deviceId, accessCode) => {
        try {
            const command = new ConfigCommand();
            const result = await command.execute({
                action: "add",
                name: name,
                address: address,
                deviceId: deviceId,
                accessCode: accessCode,
            });

            console.log(command.formatResult(result));

            if (!result.success) {
                process.exit(1);
            }
        } catch (error) {
            const message = ErrorHandler.handleError(error);
            console.error(message);
            process.exit(1);
        }
    });

configGroup
    .command("remove")
    .description("Remove a printer from configuration")
    .argument("<name>", "printer name")
    .action(async (name) => {
        try {
            const command = new ConfigCommand();
            const result = await command.execute({
                action: "remove",
                name: name,
            });

            console.log(command.formatResult(result));

            if (!result.success) {
                process.exit(1);
            }
        } catch (error) {
            const message = ErrorHandler.handleError(error);
            console.error(message);
            process.exit(1);
        }
    });

configGroup
    .command("list")
    .description("List all configured printers")
    .action(async () => {
        try {
            const command = new ConfigCommand();
            const result = await command.execute({
                action: "list",
            });

            console.log(command.formatResult(result));

            if (!result.success) {
                process.exit(1);
            }
        } catch (error) {
            const message = ErrorHandler.handleError(error);
            console.error(message);
            process.exit(1);
        }
    });

configGroup
    .command("update")
    .description("Update an existing printer configuration")
    .argument("<name>", "printer name")
    .argument("<address>", "printer's IP address")
    .argument("<device-id>", "printer's serial number")
    .argument("<access-code>", "printer's LAN mode access code")
    .action(async (name, address, deviceId, accessCode) => {
        try {
            const command = new ConfigCommand();
            const result = await command.execute({
                action: "update",
                name: name,
                address: address,
                deviceId: deviceId,
                accessCode: accessCode,
            });

            console.log(command.formatResult(result));

            if (!result.success) {
                process.exit(1);
            }
        } catch (error) {
            const message = ErrorHandler.handleError(error);
            console.error(message);
            process.exit(1);
        }
    });

// Add filament commands
const filamentCommand = new FilamentCommand();
const filamentGroup = program
    .command("filament")
    .description("Manage filament operations");

filamentGroup
    .command("unload <printerName>")
    .description("Unload filament from the printer")
    .action(async (printerName, options) => {
        try {
            const result = await filamentCommand.execute({
                action: "unload",
                printerName: printerName,
            });
            console.log(filamentCommand.formatResult(result));

            if (!result.success) {
                process.exit(1);
            }
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            process.exit(1);
        }
    });

// Printer commands
program
    .command("version")
    .description("Get printer software version")
    .argument("<printer>", "printer name")
    .action(async (printer) => {
        try {
            const command = new VersionCommand();
            const result = await command.execute({
                printerName: printer,
            });

            console.log(command.formatResult(result));

            if (!result.success) {
                process.exit(1);
            }
        } catch (error) {
            const message = ErrorHandler.handleError(error);
            console.error(message);
            process.exit(1);
        }
    });

// Custom MQTT command
program
    .command("command")
    .description("Send custom MQTT command to printer")
    .argument("<printer>", "printer name")
    .argument("<json>", "JSON command to send")
    .option("--no-validate-sequence", "Disable sequence ID validation")
    .action(async (printer, json, options) => {
        try {
            const command = new CommandCommand();
            const result = await command.execute({
                printerName: printer,
                commandJson: json,
            }, {
                validateSequenceId: options.validateSequence
            });

            console.log(command.formatResult(result));

            if (!result.success) {
                process.exit(1);
            }
        } catch (error) {
            const message = ErrorHandler.handleError(error);
            console.error(message);
            process.exit(1);
        }
    });

// Printer status command
program
    .command("status")
    .description("Get comprehensive printer status")
    .argument("<printer>", "printer name")
    .action(async (printer) => {
        try {
            const command = new StatusCommand();
            const result = await command.execute({
                printerName: printer,
            });

            console.log(command.formatResult(result));

            if (!result.success) {
                process.exit(1);
            }
        } catch (error) {
            const message = ErrorHandler.handleError(error);
            console.error(message);
            process.exit(1);
        }
    });

// Get objects command
program
    .command("get-objects")
    .description("Get object information from current print")
    .argument("<printer>", "printer name")
    .option("--colored", "Use colored output for visual representation")
    .action(async (printer, options) => {
        try {
            const command = new GetObjectsCommand();
            const result = await command.execute({
                printerName: printer,
            });

            console.log(command.formatResult(result, options));

            if (!result.success) {
                process.exit(1);
            }
        } catch (error) {
            const message = ErrorHandler.handleError(error);
            console.error(message);
            process.exit(1);
        }
    });

// Skip objects command
program
    .command("skip")
    .description("Skip objects during printing")
    .argument("<printer>", "printer name")
    .argument("<objectIds...>", "object IDs to skip (space-separated)")
    .action(async (printer, objectIds) => {
        try {
            const command = new SkipCommand();
            const result = await command.execute({
                printerName: printer,
                objectIds: objectIds,
            });

            console.log(command.formatResult(result));

            if (!result.success) {
                process.exit(1);
            }
        } catch (error) {
            const message = ErrorHandler.handleError(error);
            console.error(message);
            process.exit(1);
        }
    });

// File system commands
const fsGroup = program
    .command("fs")
    .description("File system operations on printer");

fsGroup
    .command("ls")
    .description("List files and directories on printer")
    .argument("<printer>", "printer name")
    .argument("[path]", "directory path (default: /)")
    .action(async (printer, path) => {
        try {
            const command = new LsCommand();
            const result = await command.execute({
                printerName: printer,
                path: path,
            });

            console.log(command.formatResult(result));

            if (!result.success) {
                process.exit(1);
            }
        } catch (error) {
            const message = ErrorHandler.handleError(error);
            console.error(message);
            process.exit(1);
        }
    });

fsGroup
    .command("pull")
    .description("Download file from printer")
    .argument("<printer>", "printer name")
    .argument("<remote-path>", "remote file path on printer")
    .argument("[local-path]", "local file path (default: filename only)")
    .action(async (printer, remotePath, localPath) => {
        try {
            const command = new PullCommand();
            const result = await command.execute({
                printerName: printer,
                remotePath: remotePath,
                localPath: localPath,
            });

            console.log(command.formatResult(result));

            if (!result.success) {
                process.exit(1);
            }
        } catch (error) {
            const message = ErrorHandler.handleError(error);
            console.error(message);
            process.exit(1);
        }
    });

// Parse command line arguments
program.parse(process.argv);

// If no command provided, show help
if (!process.argv.slice(2).length) {
    program.outputHelp();
}
