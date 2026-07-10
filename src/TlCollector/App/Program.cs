namespace TlCollector;

/// <summary>
/// Entry point. Usage:
///   TlCollector [poc|sample] [--config &lt;path&gt;] [--output &lt;path&gt;] [--table &lt;packagePath&gt;]
///                [--texture &lt;packagePath&gt;] [--dry-run] [--json] [--verbose]
/// Data root resolution order: --output flag, TL_DATA_ROOT environment
/// variable, config file dataRoot. Refuses to run without one.
/// Exit codes: 0 success, 1 configuration/safety failure, 2 runtime failure.
/// </summary>
public static class Program
{
    public static int Main(string[] args)
    {
        var options = CliOptions.Parse(args);
        if (options.ShowHelp)
        {
            PrintHelp();
            return 0;
        }

        // In --json mode all human logging goes to stderr so stdout stays machine-readable.
        Action<string> log = options.Json
            ? message => Console.Error.WriteLine(message)
            : Console.WriteLine;

        CollectorConfig config;
        try
        {
            var configPath = options.ConfigPath ?? FindDefaultConfig()
                ?? throw new FileNotFoundException(
                    "No config.local.json found. Pass --config <path> or create one next to the project "
                    + "(see config.example.json).");
            config = CollectorConfig.Load(configPath);
            log($"Config loaded from {configPath}");
        }
        catch (Exception ex)
        {
            log($"Configuration error: {ex.Message}");
            return 1;
        }

        // Data root resolution: --output > TL_DATA_ROOT > config dataRoot.
        var envDataRoot = Environment.GetEnvironmentVariable("TL_DATA_ROOT");
        config.DataRoot = options.OutputRoot
            ?? (string.IsNullOrWhiteSpace(envDataRoot) ? config.DataRoot : envDataRoot);
        if (options.TablePackage is not null) config.TablePackage = options.TablePackage;
        if (options.TexturePackage is not null) config.TexturePackage = options.TexturePackage;

        var errors = config.Validate();
        if (errors.Count > 0)
        {
            foreach (var error in errors)
                log($"Refusing to run: {error}");
            return 1;
        }

        try
        {
            var manifest = new CollectorRunner(config, options.Mode, options.DryRun, log).Run();
            if (options.Json)
                Console.WriteLine(manifest.ToJson());
            else
                PrintSummary(manifest);
            return manifest.Errors.Count == 0 ? 0 : 2;
        }
        catch (Exception ex)
        {
            log($"Fatal: {ex.Message}");
            if (options.Verbose)
                log(ex.ToString());
            return 2;
        }
    }

    /// <summary>Walks up from the executable and the CWD looking for config.local.json.</summary>
    private static string? FindDefaultConfig()
    {
        foreach (var start in new[] { Directory.GetCurrentDirectory(), AppContext.BaseDirectory })
        {
            var dir = new DirectoryInfo(start);
            for (var i = 0; dir is not null && i < 8; i++, dir = dir.Parent)
            {
                var candidate = Path.Combine(dir.FullName, "config.local.json");
                if (File.Exists(candidate))
                    return candidate;
            }
        }
        return null;
    }

    private static void PrintSummary(RunManifest manifest)
    {
        Console.WriteLine();
        Console.WriteLine($"=== tl-collector {manifest.Command} {(manifest.DryRun ? "(dry run)" : "")} ===");
        Console.WriteLine($"Archive root:        {manifest.ArchiveRoot}");
        Console.WriteLine($"Build:               {manifest.SteamBuild} (source: {manifest.BuildIdSource})");
        Console.WriteLine($"Collector output:    {manifest.RawCollectorDirectory}");
        Console.WriteLine($"Mounted containers:  {manifest.MountedContainers}");
        Console.WriteLine($"Table packages:      {manifest.TablePackageCount} under {manifest.TablePrefix}");
        foreach (var output in manifest.Outputs)
        {
            var size = output.Bytes > 0 ? $" {output.Bytes:N0} bytes" : "";
            var dims = output.Width is not null ? $" {output.Width}x{output.Height}" : "";
            var name = output.SampleName is null ? "" : $" [{output.SampleName}]";
            Console.WriteLine($"  [{output.Status}]{name} {output.Kind}: {output.OutputPath}{size}{dims}");
        }
        foreach (var propertyExport in manifest.PropertyExports)
        {
            Console.WriteLine($"Property export {propertyExport.PackagePath}: {propertyExport.Status} "
                + $"({propertyExport.SerializedCount}/{propertyExport.ExportCount} exports)"
                + (propertyExport.Error is null ? "" : $" error: {propertyExport.Error}"));
        }
        if (manifest.SourceVerification is not null)
            Console.WriteLine($"Source unchanged:    {manifest.SourceVerification.Unchanged}");
        foreach (var warning in manifest.Warnings)
            Console.WriteLine($"Warning: {warning}");
        foreach (var error in manifest.Errors)
            Console.WriteLine($"Error: {error}");
        Console.WriteLine($"Total time:          {manifest.StageTimingsMs.GetValueOrDefault("total")} ms");
    }

    private static void PrintHelp()
    {
        Console.WriteLine("""
            tl-collector — read-only Throne and Liberty archive collector

            Usage:
              TlCollector [poc|sample] [options]

            Commands:
              poc        One table + properties + one texture (default)
              sample     Fixed representative sample: 10 tables (equipment, skills,
                         passives, buffs, recipes, loot, runes), English .locres,
                         one icon texture, and one property-export-difficult case

            Options:
              --config <path>    Path to config.local.json (default: search upward from CWD/exe)
              --output <path>    Data root override (else TL_DATA_ROOT env var, else config dataRoot)
              --table <pkg>      Override the poc table package (path without extension)
              --texture <pkg>    Override the texture package (path without extension)
              --dry-run          Mount, enumerate, and report; write nothing
              --json             Emit the run manifest as JSON on stdout (logs go to stderr)
              --verbose          Print full exception details on failure
              --help             Show this help

            Outputs are build-scoped: <dataRoot>\raw\<steamBuild>\collector\... and
            <dataRoot>\manifests\<steamBuild>\. The build id comes from the Steam
            appmanifest (or config) and the tool refuses to run without one.

            Safety: archives are opened strictly read-only; the tool refuses to run if the
            data root resolves inside the game installation. The AES key is read at runtime
            from a local ignored file and never written to any output.
            """);
    }
}

public sealed class CliOptions
{
    public RunMode Mode { get; private set; } = RunMode.Poc;
    public string? ConfigPath { get; private set; }
    public string? OutputRoot { get; private set; }
    public string? TablePackage { get; private set; }
    public string? TexturePackage { get; private set; }
    public bool DryRun { get; private set; }
    public bool Json { get; private set; }
    public bool Verbose { get; private set; }
    public bool ShowHelp { get; private set; }

    public static CliOptions Parse(string[] args)
    {
        var options = new CliOptions();
        for (var i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "poc": options.Mode = RunMode.Poc; break;
                case "sample": options.Mode = RunMode.Sample; break;
                case "--config": options.ConfigPath = Next(args, ref i, "--config"); break;
                case "--output": options.OutputRoot = Next(args, ref i, "--output"); break;
                case "--table": options.TablePackage = Next(args, ref i, "--table"); break;
                case "--texture": options.TexturePackage = Next(args, ref i, "--texture"); break;
                case "--dry-run": options.DryRun = true; break;
                case "--json": options.Json = true; break;
                case "--verbose": options.Verbose = true; break;
                case "--help" or "-h" or "/?": options.ShowHelp = true; break;
                default:
                    Console.Error.WriteLine($"Unknown argument: {args[i]}");
                    options.ShowHelp = true;
                    break;
            }
        }
        return options;
    }

    private static string Next(string[] args, ref int i, string name)
    {
        if (i + 1 >= args.Length)
            throw new ArgumentException($"{name} requires a value.");
        return args[++i];
    }
}
