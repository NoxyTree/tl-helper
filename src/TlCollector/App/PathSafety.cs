namespace TlCollector;

/// <summary>
/// Pure path-containment logic guarding the absolute safety boundary:
/// the collector must never be able to write inside the game installation,
/// and output must never escape the configured output root.
/// </summary>
public static class PathSafety
{
    /// <summary>Normalizes a path to an absolute form without a trailing separator.</summary>
    public static string NormalizeDir(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new ArgumentException("Path must not be empty.", nameof(path));
        return Path.TrimEndingDirectorySeparator(Path.GetFullPath(path));
    }

    /// <summary>True when <paramref name="candidate"/> equals <paramref name="root"/> or lies anywhere below it.</summary>
    public static bool IsSameOrContainedWithin(string candidate, string root)
    {
        var c = NormalizeDir(candidate);
        var r = NormalizeDir(root);
        if (string.Equals(c, r, StringComparison.OrdinalIgnoreCase))
            return true;
        return c.StartsWith(r + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)
            || c.StartsWith(r + Path.AltDirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Derives the game installation root from the Paks directory by trimming a trailing
    /// "TL\Content\Paks" (any separator style). Falls back to the Paks directory itself.
    /// </summary>
    public static string DeriveGameInstallRoot(string paksDirectory)
    {
        var full = NormalizeDir(paksDirectory);
        var marker = Path.DirectorySeparatorChar + Path.Combine("TL", "Content", "Paks");
        if (full.EndsWith(marker, StringComparison.OrdinalIgnoreCase))
            return full[..^marker.Length];
        return full;
    }

    /// <summary>
    /// Validates the configured output root against the game archive location.
    /// Returns a list of violations; an empty list means the configuration is safe.
    /// </summary>
    public static IReadOnlyList<string> ValidateOutputRoot(string outputRoot, string paksDirectory)
    {
        var errors = new List<string>();
        string output, paks, gameRoot;
        try
        {
            output = NormalizeDir(outputRoot);
            paks = NormalizeDir(paksDirectory);
            gameRoot = DeriveGameInstallRoot(paksDirectory);
        }
        catch (Exception ex)
        {
            return new[] { $"Invalid path in configuration: {ex.Message}" };
        }

        if (string.Equals(output, paks, StringComparison.OrdinalIgnoreCase))
            errors.Add("Output root must not equal the game archive directory.");
        if (IsSameOrContainedWithin(output, gameRoot))
            errors.Add($"Output root '{output}' resolves inside the game installation '{gameRoot}'. Refusing to run.");
        if (IsSameOrContainedWithin(gameRoot, output))
            errors.Add($"Output root '{output}' contains the game installation '{gameRoot}'. Refusing to run.");

        return errors;
    }

    /// <summary>
    /// True when a concrete output file path stays inside the output root.
    /// Every file write must pass through this check.
    /// </summary>
    public static bool IsWriteAllowed(string filePath, string outputRoot)
    {
        try
        {
            var dir = Path.GetDirectoryName(Path.GetFullPath(filePath));
            return dir is not null && IsSameOrContainedWithin(dir, outputRoot);
        }
        catch
        {
            return false;
        }
    }
}
