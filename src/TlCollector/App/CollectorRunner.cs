using System.Diagnostics;
using System.Reflection;
using CUE4Parse.Compression;
using CUE4Parse.Encryption.Aes;
using CUE4Parse.FileProvider;
using CUE4Parse.FileProvider.Objects;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse.UE4.Objects.Core.Misc;
using CUE4Parse.UE4.Versions;
using CUE4Parse_Conversion.Textures;
using Newtonsoft.Json;

namespace TlCollector;

public enum RunMode { Poc, Sample }

/// <summary>
/// Mounts the archives read-only and produces build-scoped outputs under
/// &lt;dataRoot&gt;\raw\&lt;steamBuild&gt;\collector\ plus a manifest under
/// &lt;dataRoot&gt;\manifests\&lt;steamBuild&gt;\. Re-running skips outputs whose
/// content hash is unchanged; per-package failures are recorded and never
/// abort the run.
/// </summary>
public sealed class CollectorRunner
{
    private readonly CollectorConfig _config;
    private readonly RunMode _mode;
    private readonly bool _dryRun;
    private readonly Action<string> _log;

    public CollectorRunner(CollectorConfig config, RunMode mode, bool dryRun, Action<string> log)
    {
        _config = config;
        _mode = mode;
        _dryRun = dryRun;
        _log = log;
    }

    public RunManifest Run()
    {
        var manifest = new RunManifest
        {
            ToolVersion = typeof(CollectorRunner).Assembly.GetName().Version?.ToString() ?? "0.0.0",
            Command = _mode == RunMode.Sample ? "sample" : "poc",
            Cue4ParseVersion = InformationalVersion(typeof(DefaultFileProvider).Assembly),
            Cue4ParseConversionVersion = InformationalVersion(typeof(TextureDecoder).Assembly),
            GameVersion = _config.GameVersion,
            ArchiveRoot = PathSafety.NormalizeDir(_config.GamePaksDirectory),
            DataRoot = PathSafety.NormalizeDir(_config.DataRoot),
            DryRun = _dryRun,
            StartedAtUtc = DateTime.UtcNow,
            TablePrefix = SamplePlan.TableDir,
        };

        // Build id: appmanifest is authoritative; refuse to run without one so
        // outputs from different builds can never mix.
        var (buildId, buildIdSource) = ResolveBuildId(manifest);
        manifest.SteamBuild = buildId;
        manifest.BuildIdSource = buildIdSource;
        var layout = new OutputLayout(_config.DataRoot, buildId);
        manifest.RawCollectorDirectory = layout.RawCollectorDir;
        manifest.ManifestDirectory = layout.ManifestDir;
        _log($"Build {buildId} (source: {buildIdSource}); collector output: {layout.RawCollectorDir}");

        var total = Stopwatch.StartNew();

        var integrityBefore = Timed(manifest, "integritySnapshotBefore",
            () => SourceIntegrity.Take(_config.GamePaksDirectory));
        _log($"Source snapshot: {integrityBefore.FileCount} files, {integrityBefore.TotalBytes:N0} bytes.");

        Timed(manifest, "initCompression", () => { InitCompression(manifest); return true; });

        var provider = Timed(manifest, "mountArchives", () => CreateProvider(manifest));
        try
        {
            manifest.MountedContainers = provider.MountedVfs.Count;
            manifest.MountedContainerNames = provider.MountedVfs
                .Select(v => v.Name).OrderBy(n => n, StringComparer.OrdinalIgnoreCase).ToList();
            _log($"Mounted {manifest.MountedContainers} containers; {provider.Files.Count} files visible.");

            manifest.TablePackageCount = Timed(manifest, "enumerateTables", () => provider.Files
                .Where(kv => kv.Key.StartsWith(SamplePlan.TableDir, StringComparison.OrdinalIgnoreCase))
                .Select(kv => kv.Value)
                .Where(f => f.IsUePackage)
                .Select(f => f.PathWithoutExtension)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Count());
            _log($"Found {manifest.TablePackageCount} table packages under {SamplePlan.TableDir}.");

            if (_mode == RunMode.Sample)
                RunSample(provider, layout, manifest);
            else
                RunPoc(provider, layout, manifest);
        }
        finally
        {
            provider.Dispose();
        }

        var integrityAfter = Timed(manifest, "integritySnapshotAfter",
            () => SourceIntegrity.Take(_config.GamePaksDirectory));
        var (unchanged, differences) = SourceIntegrity.Compare(integrityBefore, integrityAfter);
        manifest.SourceVerification = new SourceVerification
        {
            ArchiveDirectory = integrityBefore.Directory,
            Before = Summarize(integrityBefore),
            After = Summarize(integrityAfter),
            Unchanged = unchanged,
            Differences = differences.ToList(),
        };
        _log(unchanged
            ? "Source verification: game archive files are unchanged."
            : $"Source verification: {differences.Count} DIFFERENCES DETECTED — investigate immediately.");

        manifest.StageTimingsMs["total"] = total.ElapsedMilliseconds;
        manifest.FinishedAtUtc = DateTime.UtcNow;

        if (!_dryRun)
        {
            Directory.CreateDirectory(layout.ManifestDir);
            WriteChecked(layout.ManifestPath,
                System.Text.Encoding.UTF8.GetBytes(manifest.ToJson()), manifest.DataRoot);
            var verification = System.Text.Json.JsonSerializer.Serialize(
                manifest.SourceVerification, RunManifest.JsonOptions);
            WriteChecked(layout.VerificationPath,
                System.Text.Encoding.UTF8.GetBytes(verification), manifest.DataRoot);
            _log($"Manifest written to {layout.ManifestPath}");
        }

        return manifest;
    }

    // ------------------------------------------------------------------ modes

    private void RunPoc(DefaultFileProvider provider, OutputLayout layout, RunManifest manifest)
    {
        var tableFile = ResolveGameFile(provider, _config.TablePackage)
            ?? throw new InvalidOperationException($"Configured table package not found: {_config.TablePackage}");
        var textureFile = ResolveTextureFile(provider, manifest);

        if (_dryRun)
        {
            manifest.Warnings.Add("Dry run: no files were written.");
            AddPlanned(manifest, "raw-table", tableFile.Path, Path.Combine(layout.RawTablesDir, tableFile.Name), null);
            AddPlanned(manifest, "properties", tableFile.Path,
                Path.Combine(layout.PropertiesDir, tableFile.NameWithoutExtension + ".json"), null);
            if (textureFile is not null)
                AddPlanned(manifest, "texture", textureFile.Path,
                    Path.Combine(layout.TexturesDir, textureFile.NameWithoutExtension + ".png"), null);
            return;
        }

        Timed(manifest, "exportRawTable", () => { ExportRawPackage(provider, tableFile, layout.RawTablesDir, manifest, null); return true; });
        Timed(manifest, "exportProperties", () => { ExportProperties(provider, tableFile, layout.PropertiesDir, manifest, null); return true; });
        if (textureFile is not null)
            Timed(manifest, "exportTexture", () => { ExportTexture(provider, textureFile, layout.TexturesDir, manifest, null); return true; });
    }

    private void RunSample(DefaultFileProvider provider, OutputLayout layout, RunManifest manifest)
    {
        // Assemble the full plan: fixed tables + runtime-resolved entries.
        var entries = new List<SampleEntry>(SamplePlan.Tables);

        var locresFiles = provider.Files
            .Where(kv => kv.Key.EndsWith(".locres", StringComparison.OrdinalIgnoreCase)
                && kv.Key.Contains("/en/", StringComparison.OrdinalIgnoreCase))
            .OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
            .Select(kv => kv.Value)
            .ToList();
        foreach (var locres in locresFiles)
            entries.Add(new SampleEntry(locres.NameWithoutExtension + "-en", locres.Path,
                SampleKind.Localization, "English localization resource"));

        var difficult = provider.Files
            .Where(kv => kv.Key.StartsWith("TL/Content/ActionTree/", StringComparison.OrdinalIgnoreCase)
                && kv.Value.IsUePackage)
            .OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
            .Select(kv => kv.Value)
            .FirstOrDefault();
        if (difficult is not null)
            entries.Add(new SampleEntry("ActionTree-difficult-case", difficult.PathWithoutExtension,
                SampleKind.DifficultCase, "property-export stress test (no .usmap); failures are recorded, not fought"));
        else
            manifest.Warnings.Add("No package found under TL/Content/ActionTree/ for the difficult case.");

        var textureFile = ResolveTextureFile(provider, manifest);
        if (textureFile is not null)
            entries.Add(new SampleEntry(textureFile.NameWithoutExtension, textureFile.PathWithoutExtension,
                SampleKind.Texture, "approved 128x128 item icon"));

        // Forbidden-asset gate over the whole plan before any processing.
        var violations = SamplePlan.Validate(entries);
        if (violations.Count > 0)
            throw new InvalidOperationException("Sample plan refused: " + string.Join("; ", violations));

        _log($"Sample plan: {entries.Count} entries.");

        foreach (var entry in entries)
        {
            try
            {
                ProcessSampleEntry(provider, layout, manifest, entry);
            }
            catch (Exception ex)
            {
                // Per-package containment: record and continue.
                manifest.Errors.Add($"sample '{entry.Name}': {ex.Message}");
                manifest.Outputs.Add(new OutputRecord
                {
                    Kind = entry.Kind.ToString().ToLowerInvariant(),
                    SampleName = entry.Name,
                    PackagePath = entry.PackagePath,
                    Status = "failed",
                    Error = ex.Message,
                });
            }
        }

        if (_dryRun)
            manifest.Warnings.Add("Dry run: no files were written.");
    }

    private void ProcessSampleEntry(DefaultFileProvider provider, OutputLayout layout, RunManifest manifest, SampleEntry entry)
    {
        switch (entry.Kind)
        {
            case SampleKind.Table:
            case SampleKind.DifficultCase:
            {
                var file = ResolveGameFile(provider, entry.PackagePath)
                    ?? throw new InvalidOperationException($"Package not found: {entry.PackagePath}");
                if (_dryRun)
                {
                    AddPlanned(manifest, "raw-table", file.Path, Path.Combine(layout.RawTablesDir, file.Name), entry.Name);
                    AddPlanned(manifest, "properties", file.Path,
                        Path.Combine(layout.PropertiesDir, file.NameWithoutExtension + ".json"), entry.Name);
                    return;
                }
                ExportRawPackage(provider, file, layout.RawTablesDir, manifest, entry.Name);
                ExportProperties(provider, file, layout.PropertiesDir, manifest, entry.Name);
                break;
            }
            case SampleKind.Localization:
            {
                if (!provider.Files.TryGetValue(entry.PackagePath, out var file))
                    throw new InvalidOperationException($"Localization resource not found: {entry.PackagePath}");
                var outPath = Path.Combine(layout.LocalizationDir, "en", file.Name);
                if (_dryRun) { AddPlanned(manifest, "localization", file.Path, outPath, entry.Name); return; }
                var sw = Stopwatch.StartNew();
                if (!provider.TrySaveAsset(file, out var bytes))
                    throw new InvalidOperationException($"TrySaveAsset failed for {file.Path}");
                Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
                manifest.Outputs.Add(WriteOutput("localization", entry.Name, file.Path, outPath, bytes, sw, manifest));
                break;
            }
            case SampleKind.Texture:
            {
                var file = ResolveGameFile(provider, entry.PackagePath)
                    ?? throw new InvalidOperationException($"Texture package not found: {entry.PackagePath}");
                if (_dryRun)
                {
                    AddPlanned(manifest, "texture", file.Path,
                        Path.Combine(layout.TexturesDir, file.NameWithoutExtension + ".png"), entry.Name);
                    return;
                }
                ExportTexture(provider, file, layout.TexturesDir, manifest, entry.Name);
                break;
            }
        }
    }

    // ---------------------------------------------------------------- exports

    private void ExportRawPackage(DefaultFileProvider provider, GameFile file, string outDir, RunManifest manifest, string? sampleName)
    {
        var sw = Stopwatch.StartNew();
        if (!provider.TrySavePackage(file, out var parts) || parts.Count == 0)
            throw new InvalidOperationException($"TrySavePackage returned no data for {file.Path}.");

        Directory.CreateDirectory(outDir);
        foreach (var (partPath, bytes) in parts.OrderBy(p => p.Key, StringComparer.OrdinalIgnoreCase))
        {
            var fileName = Path.GetFileName(partPath.Replace('\\', '/'));
            if (!ForbiddenAssetFilter.IsAllowed(fileName))
                throw new InvalidOperationException($"Forbidden asset type blocked: {fileName}");
            var outPath = Path.Combine(outDir, fileName);
            manifest.Outputs.Add(WriteOutput("raw-table", sampleName, partPath, outPath, bytes, sw, manifest));
        }
    }

    private void ExportProperties(DefaultFileProvider provider, GameFile file, string outDir, RunManifest manifest, string? sampleName)
    {
        var sw = Stopwatch.StartNew();
        var result = new PropertyExportResult
        {
            SampleName = sampleName,
            PackagePath = file.Path,
            MappingsProvided = !string.IsNullOrWhiteSpace(_config.MappingsPath) && File.Exists(_config.MappingsPath),
        };
        manifest.PropertyExports.Add(result);
        try
        {
            var package = provider.LoadPackage(file);
            var serialized = new List<string>();
            var enumerationError = (string?)null;
            try
            {
                foreach (var export in package.GetExports())
                {
                    result.ExportCount++;
                    result.ExportClasses.Add(export.ExportType);
                    try
                    {
                        serialized.Add(JsonConvert.SerializeObject(export, Formatting.Indented));
                        result.SerializedCount++;
                    }
                    catch (Exception exportEx)
                    {
                        serialized.Add(JsonConvert.SerializeObject(new
                        {
                            name = export.Name,
                            exportType = export.ExportType,
                            serializationError = exportEx.Message,
                        }, Formatting.Indented));
                    }
                }
            }
            catch (Exception enumEx)
            {
                enumerationError = enumEx.Message;
            }

            Directory.CreateDirectory(outDir);
            var outPath = Path.Combine(outDir, file.NameWithoutExtension + ".json");
            var body = "[\n" + string.Join(",\n", serialized) + "\n]";
            var bytes = System.Text.Encoding.UTF8.GetBytes(body);

            result.Status = enumerationError is null && result.SerializedCount == result.ExportCount && result.ExportCount > 0
                ? "full"
                : result.SerializedCount > 0 ? "partial" : "failed";
            result.Error = enumerationError;
            if (result.ExportClasses.Contains("TLJsonDataTable"))
            {
                result.Note = "TLJsonDataTable is a custom NCSoft class: readable JSON exposes the table name and "
                    + "row schema, but full row payloads require the custom decoder planned for Milestone 3. "
                    + "The raw .uasset payload preserved alongside contains the complete data.";
            }

            var record = WriteOutput("properties", sampleName, file.Path, outPath, bytes, sw, manifest);
            if (result.Status == "failed")
                record.Status = "failed";
            manifest.Outputs.Add(record);
        }
        catch (Exception ex)
        {
            result.Status = "failed";
            result.Error = ex.Message;
            manifest.Errors.Add($"properties {file.Path}: {ex.Message}");
        }
    }

    private void ExportTexture(DefaultFileProvider provider, GameFile textureFile, string outDir, RunManifest manifest, string? sampleName)
    {
        var sw = Stopwatch.StartNew();
        var record = new OutputRecord { Kind = "texture", SampleName = sampleName, PackagePath = textureFile.Path };
        try
        {
            // Use the managed AssetRipper decoder: avoids a native detex.dll
            // download and keeps texture decoding fully deterministic.
            TextureDecoder.UseAssetRipperTextureDecoder = true;

            var package = provider.LoadPackage(textureFile);
            var texture = package.GetExports().OfType<UTexture2D>().FirstOrDefault()
                ?? throw new InvalidOperationException("No UTexture2D export found in the package.");
            if (!ForbiddenAssetFilter.IsAllowed(textureFile.Path, texture.ExportType))
                throw new InvalidOperationException($"Forbidden asset class blocked: {texture.ExportType}");

            var decoded = texture.Decode()
                ?? throw new InvalidOperationException("Texture decode returned null.");
            var png = decoded.Encode(ETextureFormat.Png, false, out _);

            Directory.CreateDirectory(outDir);
            var outPath = Path.Combine(outDir, textureFile.NameWithoutExtension + ".png");
            record = WriteOutput("texture", sampleName, textureFile.Path, outPath, png, sw, manifest);
            record.Width = decoded.Width;
            record.Height = decoded.Height;
            _log($"Texture: {outPath} ({decoded.Width}x{decoded.Height})");
        }
        catch (Exception ex)
        {
            record.Status = "failed";
            record.Error = ex.Message;
            record.DurationMs = sw.ElapsedMilliseconds;
            manifest.Errors.Add($"texture {textureFile.Path}: {ex.Message}");
        }
        manifest.Outputs.Add(record);
    }

    /// <summary>
    /// Single write funnel: containment check on every write, and unchanged
    /// outputs (identical SHA-256 already on disk) are skipped for
    /// deterministic, resumable runs.
    /// </summary>
    private OutputRecord WriteOutput(string kind, string? sampleName, string packagePath,
        string outPath, byte[] bytes, Stopwatch sw, RunManifest manifest)
    {
        var hash = HashUtil.Sha256Hex(bytes);
        var record = new OutputRecord
        {
            Kind = kind,
            SampleName = sampleName,
            PackagePath = packagePath,
            OutputPath = outPath,
            Bytes = bytes.Length,
            Sha256 = hash,
            DurationMs = sw.ElapsedMilliseconds,
        };

        if (File.Exists(outPath) && HashUtil.Sha256HexOfFile(outPath) == hash)
        {
            record.Status = "skipped-unchanged";
            _log($"Skipped unchanged: {outPath}");
            return record;
        }

        WriteChecked(outPath, bytes, manifest.DataRoot);
        record.Status = "ok";
        _log($"Written: {outPath} ({bytes.Length:N0} bytes)");
        return record;
    }

    private static void WriteChecked(string path, byte[] bytes, string dataRoot)
    {
        if (!PathSafety.IsWriteAllowed(path, dataRoot))
            throw new InvalidOperationException($"Refusing to write outside the data root: {path}");
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllBytes(path, bytes);
    }

    private static void AddPlanned(RunManifest manifest, string kind, string packagePath, string outPath, string? sampleName) =>
        manifest.Outputs.Add(new OutputRecord
        {
            Kind = kind,
            SampleName = sampleName,
            PackagePath = packagePath,
            OutputPath = outPath,
            Status = "skipped(dry-run)",
        });

    // ---------------------------------------------------------------- helpers

    private (string BuildId, string Source) ResolveBuildId(RunManifest manifest)
    {
        string? fromAcf = null;
        if (!string.IsNullOrWhiteSpace(_config.SteamAppManifestPath))
        {
            fromAcf = SteamAppManifest.LoadBuildId(_config.SteamAppManifestPath);
            if (fromAcf is null)
                manifest.Warnings.Add($"Could not read buildid from {_config.SteamAppManifestPath}.");
        }
        if (fromAcf is not null)
        {
            if (!string.IsNullOrWhiteSpace(_config.SteamBuild) && _config.SteamBuild != fromAcf)
                manifest.Warnings.Add(
                    $"Configured steamBuild {_config.SteamBuild} differs from appmanifest buildid {fromAcf}; using the appmanifest value.");
            return (fromAcf, "appmanifest");
        }
        if (!string.IsNullOrWhiteSpace(_config.SteamBuild))
            return (_config.SteamBuild, "config");
        throw new InvalidOperationException(
            "No Steam build id available (steamAppManifestPath or steamBuild). Refusing to run without a build id "
            + "so outputs from different builds never mix.");
    }

    private static string InformationalVersion(Assembly assembly) =>
        assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion
        ?? assembly.GetName().Version?.ToString() ?? "unknown";

    private static IntegritySummary Summarize(SourceIntegrity.Snapshot s) => new()
    {
        FileCount = s.FileCount,
        TotalBytes = s.TotalBytes,
        TakenAtUtc = s.TakenAtUtc,
    };

    private T Timed<T>(RunManifest manifest, string stage, Func<T> action)
    {
        var sw = Stopwatch.StartNew();
        try { return action(); }
        finally { manifest.StageTimingsMs[stage] = sw.ElapsedMilliseconds; }
    }

    private void InitCompression(RunManifest manifest)
    {
        var oodlePath = _config.OodleDllPath;
        if (!string.IsNullOrWhiteSpace(oodlePath) && File.Exists(oodlePath))
        {
            OodleHelper.Initialize(oodlePath);
            _log($"Oodle loaded from {oodlePath}");
        }
        else
        {
            if (_dryRun)
                throw new InvalidOperationException(
                    "Oodle DLL not found and downloads are disabled in dry-run. Configure oodleDllPath.");
            var toolsDir = Path.Combine(PathSafety.NormalizeDir(_config.DataRoot), "cache", "tools");
            Directory.CreateDirectory(toolsDir);
            var target = Path.Combine(toolsDir, OodleHelper.OodleFileName);
            if (!File.Exists(target) && !OodleHelper.DownloadOodleDll(ref target!))
                throw new InvalidOperationException("Failed to obtain the Oodle native library.");
            OodleHelper.Initialize(target);
            manifest.Warnings.Add($"Oodle DLL downloaded to {target}.");
        }

        var zlibPath = _config.ZlibDllPath;
        if (!string.IsNullOrWhiteSpace(zlibPath) && File.Exists(zlibPath))
        {
            ZlibHelper.Initialize(zlibPath);
            _log($"zlib-ng loaded from {zlibPath}");
        }
        else
        {
            manifest.Warnings.Add("zlib-ng DLL not configured; continuing without it (only needed for zlib-compressed blocks).");
        }
    }

    private DefaultFileProvider CreateProvider(RunManifest manifest)
    {
        var versions = new VersionContainer(EGame.GAME_ThroneAndLiberty);
        var provider = new DefaultFileProvider(
            _config.GamePaksDirectory, SearchOption.TopDirectoryOnly, versions, StringComparer.OrdinalIgnoreCase);

        if (!string.IsNullOrWhiteSpace(_config.MappingsPath) && File.Exists(_config.MappingsPath))
        {
            provider.MappingsContainer = new FileUsmapTypeMappingsProvider(_config.MappingsPath);
            _log($"Mappings loaded from {_config.MappingsPath}");
        }

        provider.Initialize();
        provider.SubmitKey(new FGuid(), new FAesKey(_config.ResolveAesKey()));
        try { provider.Mount(); } catch { /* remaining unencrypted readers only; SubmitKey already mounted keyed ones */ }
        try { provider.PostMount(); } catch (Exception ex) { manifest.Warnings.Add($"PostMount: {ex.Message}"); }
        return provider;
    }

    private static GameFile? ResolveGameFile(DefaultFileProvider provider, string packagePath)
    {
        foreach (var candidate in new[] { packagePath, packagePath + ".uasset", packagePath + ".umap" })
        {
            if (provider.Files.TryGetValue(candidate, out var file))
                return file;
        }
        return provider.Files
            .Where(kv => kv.Value.IsUePackage
                && string.Equals(kv.Value.PathWithoutExtension, packagePath, StringComparison.OrdinalIgnoreCase))
            .Select(kv => kv.Value)
            .FirstOrDefault();
    }

    private GameFile? ResolveTextureFile(DefaultFileProvider provider, RunManifest manifest)
    {
        if (!string.IsNullOrWhiteSpace(_config.TexturePackage))
        {
            var explicitFile = ResolveGameFile(provider, _config.TexturePackage);
            if (explicitFile is not null)
                return explicitFile;
            manifest.Warnings.Add($"Configured texturePackage not found: {_config.TexturePackage}; falling back to prefix search.");
        }

        var prefix = _config.TextureSearchPrefix;
        var file = provider.Files
            .Where(kv => kv.Key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && kv.Value.IsUePackage)
            .OrderBy(kv => kv.Key, StringComparer.OrdinalIgnoreCase)
            .Select(kv => kv.Value)
            .FirstOrDefault();
        if (file is null)
            manifest.Warnings.Add($"No texture package found under {prefix}.");
        return file;
    }
}
