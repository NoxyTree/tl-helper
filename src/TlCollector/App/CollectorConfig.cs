using System.Text.Json;
using System.Text.Json.Serialization;

namespace TlCollector;

/// <summary>
/// Local collector configuration. Loaded from a git-ignored JSON file
/// (config.local.json). The AES key itself must never appear in committed
/// files; it is resolved at runtime from <see cref="AesKeySource"/>.
/// </summary>
public sealed class CollectorConfig
{
    public string GamePaksDirectory { get; set; } = "";

    /// <summary>
    /// Data root (e.g. D:\TL_Data). Resolution order applied by the CLI:
    /// --output flag, TL_DATA_ROOT environment variable, then this value.
    /// </summary>
    public string DataRoot { get; set; } = "";

    /// <summary>Optional Steam appmanifest_*.acf path; its buildid takes precedence over steamBuild.</summary>
    public string? SteamAppManifestPath { get; set; }

    /// <summary>Direct key value. Only for local ignored config; prefer <see cref="AesKeySource"/>.</summary>
    public string? AesKey { get; set; }

    /// <summary>Path to a local JSON file containing an "aes_key" (or "aesKey") field.</summary>
    public string? AesKeySource { get; set; }

    public string? OodleDllPath { get; set; }
    public string? ZlibDllPath { get; set; }

    /// <summary>Optional .usmap mappings file for UE5 unversioned properties.</summary>
    public string? MappingsPath { get; set; }

    public string? GameVersion { get; set; }
    public string? SteamBuild { get; set; }

    /// <summary>Package path (no extension) of the table to export in the PoC.</summary>
    public string TablePackage { get; set; } = "TL/Content/Game/Client/Table/TLRuneInfo";

    /// <summary>Approved texture prefix to pick the PoC Texture2D from.</summary>
    public string TextureSearchPrefix { get; set; } = "TL/Content/Image/Icon/Item_128/";

    /// <summary>Optional explicit texture package path (no extension).</summary>
    public string? TexturePackage { get; set; }

    private static readonly JsonSerializerOptions LoadOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };

    public static CollectorConfig Load(string path)
    {
        if (!File.Exists(path))
            throw new FileNotFoundException($"Config file not found: {path}", path);
        var config = JsonSerializer.Deserialize<CollectorConfig>(File.ReadAllText(path), LoadOptions)
            ?? throw new InvalidOperationException($"Config file is empty or invalid: {path}");
        return config;
    }

    public IReadOnlyList<string> Validate()
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(GamePaksDirectory))
            errors.Add("gamePaksDirectory is required.");
        if (string.IsNullOrWhiteSpace(DataRoot))
            errors.Add("dataRoot is required (via --output, the TL_DATA_ROOT environment variable, or the config file).");
        if (string.IsNullOrWhiteSpace(AesKey) && string.IsNullOrWhiteSpace(AesKeySource))
            errors.Add("Either aesKey or aesKeySource must be configured.");
        if (errors.Count == 0)
            errors.AddRange(PathSafety.ValidateOutputRoot(DataRoot, GamePaksDirectory));
        return errors;
    }

    /// <summary>
    /// Resolves the AES key at runtime. The returned value must never be logged,
    /// written to any output file, or included in manifests.
    /// </summary>
    public string ResolveAesKey()
    {
        if (!string.IsNullOrWhiteSpace(AesKey))
            return NormalizeAesKey(AesKey);

        if (!string.IsNullOrWhiteSpace(AesKeySource))
        {
            if (!File.Exists(AesKeySource))
                throw new FileNotFoundException($"aesKeySource file not found: {AesKeySource}", AesKeySource);
            using var doc = JsonDocument.Parse(File.ReadAllText(AesKeySource));
            foreach (var field in new[] { "aes_key", "aesKey", "AesKey" })
            {
                if (doc.RootElement.ValueKind == JsonValueKind.Object
                    && doc.RootElement.TryGetProperty(field, out var el)
                    && el.ValueKind == JsonValueKind.String
                    && !string.IsNullOrWhiteSpace(el.GetString()))
                {
                    return NormalizeAesKey(el.GetString()!);
                }
            }
            throw new InvalidOperationException($"No aes_key field found in {AesKeySource}.");
        }

        throw new InvalidOperationException("No AES key configured (aesKey or aesKeySource).");
    }

    /// <summary>Normalizes a hex AES key to 0x-prefixed form and validates its shape.</summary>
    public static string NormalizeAesKey(string raw)
    {
        var key = raw.Trim();
        if (!key.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
            key = "0x" + key;
        var hex = key[2..];
        if (hex.Length != 64 || !hex.All(Uri.IsHexDigit))
            throw new InvalidOperationException("AES key must be 64 hex characters (optionally 0x-prefixed).");
        return "0x" + hex;
    }
}
