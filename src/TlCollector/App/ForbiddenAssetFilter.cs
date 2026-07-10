namespace TlCollector;

/// <summary>
/// Enforces the explicit exclusion list: movies, audio, meshes, animations,
/// and world geometry must never be exported by this tool.
/// </summary>
public static class ForbiddenAssetFilter
{
    private static readonly HashSet<string> ForbiddenExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        // Movies / video
        ".bik", ".bk2", ".mp4", ".webm", ".mov", ".avi", ".usm",
        // Audio (incl. Wwise)
        ".wem", ".bnk", ".awb", ".wav", ".ogg", ".mp3", ".opus", ".flac",
        // Maps / world geometry
        ".umap",
    };

    private static readonly HashSet<string> ForbiddenClassNames = new(StringComparer.OrdinalIgnoreCase)
    {
        // Movies / media
        "MediaTexture", "MediaPlayer", "MediaSource", "FileMediaSource",
        "StreamMediaSource", "BinkMediaPlayer", "BinkMediaTexture", "MovieTexture",
        // Audio
        "SoundWave", "SoundCue", "SoundClass", "SoundMix", "SoundAttenuation",
        "AkAudioEvent", "AkAudioBank", "AkMediaAsset", "AkAuxBus", "AkInitBank",
        // Meshes / models
        "StaticMesh", "SkeletalMesh", "Skeleton", "PhysicsAsset", "GeometryCollection",
        // Animations
        "AnimSequence", "AnimMontage", "AnimComposite", "AnimBlueprintGeneratedClass",
        "BlendSpace", "BlendSpace1D", "AimOffsetBlendSpace", "PoseAsset",
        // Worlds / levels
        "World", "Level", "LevelSequence",
    };

    private static readonly string[] ForbiddenPathSegments =
    {
        "/movies/", "/wwiseaudio/", "/wwise/", "/cinematics/",
    };

    public static bool IsForbiddenExtension(string path)
    {
        var ext = Path.GetExtension(path);
        return ext.Length > 0 && ForbiddenExtensions.Contains(ext);
    }

    public static bool IsForbiddenClass(string? exportClassName) =>
        !string.IsNullOrEmpty(exportClassName) && ForbiddenClassNames.Contains(exportClassName);

    public static bool IsForbiddenPath(string path)
    {
        var normalized = "/" + path.Replace('\\', '/').TrimStart('/').ToLowerInvariant();
        return ForbiddenPathSegments.Any(segment => normalized.Contains(segment));
    }

    /// <summary>Composite check used before any export is written to disk.</summary>
    public static bool IsAllowed(string path, string? exportClassName = null) =>
        !IsForbiddenExtension(path) && !IsForbiddenPath(path) && !IsForbiddenClass(exportClassName);
}
