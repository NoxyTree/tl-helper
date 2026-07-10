namespace TlCollector;

/// <summary>
/// Build-scoped output layout under the data root:
///   &lt;dataRoot&gt;\raw\&lt;steamBuild&gt;\collector\...   (raw tables, properties, textures, localization)
///   &lt;dataRoot&gt;\manifests\&lt;steamBuild&gt;\...        (manifest.json, verification.json)
/// The build id is stamped into every path so records from different Steam
/// builds can never mix.
/// </summary>
public sealed class OutputLayout
{
    public string DataRoot { get; }
    public string BuildId { get; }

    public OutputLayout(string dataRoot, string buildId)
    {
        if (string.IsNullOrWhiteSpace(dataRoot))
            throw new ArgumentException("Data root must not be empty.", nameof(dataRoot));
        if (string.IsNullOrWhiteSpace(buildId) || !buildId.All(char.IsAsciiDigit))
            throw new ArgumentException(
                $"Steam build id must be a non-empty numeric string, got '{buildId}'. "
                + "A valid build id is required so outputs from different builds never mix.",
                nameof(buildId));
        DataRoot = PathSafety.NormalizeDir(dataRoot);
        BuildId = buildId;
    }

    public string RawCollectorDir => Path.Combine(DataRoot, "raw", BuildId, "collector");
    public string RawTablesDir => Path.Combine(RawCollectorDir, "raw-tables");
    public string PropertiesDir => Path.Combine(RawCollectorDir, "properties");
    public string TexturesDir => Path.Combine(RawCollectorDir, "textures");
    public string LocalizationDir => Path.Combine(RawCollectorDir, "localization");
    public string ManifestDir => Path.Combine(DataRoot, "manifests", BuildId);
    public string ManifestPath => Path.Combine(ManifestDir, "manifest.json");
    public string VerificationPath => Path.Combine(ManifestDir, "verification.json");

    public IEnumerable<string> AllOutputDirs =>
        new[] { RawTablesDir, PropertiesDir, TexturesDir, LocalizationDir, ManifestDir };
}
