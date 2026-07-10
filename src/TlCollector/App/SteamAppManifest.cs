using System.Text.RegularExpressions;

namespace TlCollector;

/// <summary>
/// Minimal read-only parser for Steam appmanifest_*.acf files.
/// Only the buildid is needed; the file is Valve KeyValues text.
/// </summary>
public static partial class SteamAppManifest
{
    [GeneratedRegex("\"buildid\"\\s*\"(\\d+)\"", RegexOptions.IgnoreCase)]
    private static partial Regex BuildIdPattern();

    /// <summary>Extracts the buildid from acf content, or null when absent.</summary>
    public static string? ParseBuildId(string acfContent)
    {
        var match = BuildIdPattern().Match(acfContent);
        return match.Success ? match.Groups[1].Value : null;
    }

    public static string? LoadBuildId(string acfPath) =>
        File.Exists(acfPath) ? ParseBuildId(File.ReadAllText(acfPath)) : null;
}
