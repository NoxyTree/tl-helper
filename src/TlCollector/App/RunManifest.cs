using System.Text.Json;
using System.Text.Json.Serialization;

namespace TlCollector;

public sealed class OutputRecord
{
    public string Kind { get; set; } = "";              // raw-table | properties | texture | localization | raw-package
    public string? SampleName { get; set; }             // sample entry this output belongs to
    public string PackagePath { get; set; } = "";       // internal package/file path inside the archives
    public string OutputPath { get; set; } = "";        // absolute path on disk
    public long Bytes { get; set; }
    public string Sha256 { get; set; } = "";
    public long DurationMs { get; set; }
    public string Status { get; set; } = "ok";          // ok | skipped-unchanged | failed | skipped(dry-run)
    public string? Error { get; set; }
    public int? Width { get; set; }                     // textures only
    public int? Height { get; set; }
}

public sealed class PropertyExportResult
{
    public string? SampleName { get; set; }
    public string PackagePath { get; set; } = "";
    public string Status { get; set; } = "";            // full | partial | failed | skipped(dry-run)
    public int ExportCount { get; set; }
    public int SerializedCount { get; set; }
    public List<string> ExportClasses { get; set; } = new();
    public bool MappingsProvided { get; set; }
    public string? Note { get; set; }
    public string? Error { get; set; }
}

public sealed class IntegritySummary
{
    public int FileCount { get; set; }
    public long TotalBytes { get; set; }
    public DateTime TakenAtUtc { get; set; }
}

public sealed class SourceVerification
{
    public string ArchiveDirectory { get; set; } = "";
    public IntegritySummary Before { get; set; } = new();
    public IntegritySummary After { get; set; } = new();
    public bool Unchanged { get; set; }
    public List<string> Differences { get; set; } = new();
}

public sealed class RunManifest
{
    public string Tool { get; set; } = "tl-collector";
    public string ToolVersion { get; set; } = "";
    public string Command { get; set; } = "poc";        // poc | sample
    public string Cue4ParseVersion { get; set; } = "";
    public string Cue4ParseConversionVersion { get; set; } = "";
    public string? GameVersion { get; set; }
    public string? SteamBuild { get; set; }
    public string BuildIdSource { get; set; } = "";     // appmanifest | config
    public string ArchiveRoot { get; set; } = "";
    public string DataRoot { get; set; } = "";
    public string RawCollectorDirectory { get; set; } = "";
    public string ManifestDirectory { get; set; } = "";
    public bool DryRun { get; set; }
    public DateTime StartedAtUtc { get; set; }
    public DateTime FinishedAtUtc { get; set; }
    public int MountedContainers { get; set; }
    public List<string> MountedContainerNames { get; set; } = new();
    public int TablePackageCount { get; set; }
    public string TablePrefix { get; set; } = "";
    public List<OutputRecord> Outputs { get; set; } = new();
    public List<PropertyExportResult> PropertyExports { get; set; } = new();
    public SourceVerification? SourceVerification { get; set; }
    public Dictionary<string, long> StageTimingsMs { get; set; } = new();
    public List<string> Errors { get; set; } = new();
    public List<string> Warnings { get; set; } = new();

    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public string ToJson() => JsonSerializer.Serialize(this, JsonOptions);
}
