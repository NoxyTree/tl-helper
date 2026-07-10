namespace TlCollector;

/// <summary>
/// Records file sizes and timestamps of the game archive directory before and
/// after a run so the manifest can prove the source was not modified.
/// Deliberately avoids hashing: the Paks directory is ~74 GB and metadata
/// comparison is what the plan requires.
/// </summary>
public static class SourceIntegrity
{
    public sealed record FileStamp(string RelativePath, long Length, DateTime LastWriteTimeUtc);

    public sealed record Snapshot(
        string Directory,
        DateTime TakenAtUtc,
        int FileCount,
        long TotalBytes,
        IReadOnlyList<FileStamp> Files);

    public static Snapshot Take(string directory)
    {
        var root = PathSafety.NormalizeDir(directory);
        var files = System.IO.Directory
            .EnumerateFiles(root, "*", SearchOption.AllDirectories)
            .Select(f =>
            {
                var info = new FileInfo(f);
                return new FileStamp(Path.GetRelativePath(root, f), info.Length, info.LastWriteTimeUtc);
            })
            .OrderBy(s => s.RelativePath, StringComparer.OrdinalIgnoreCase)
            .ToList();
        return new Snapshot(root, DateTime.UtcNow, files.Count, files.Sum(f => f.Length), files);
    }

    public static (bool Unchanged, IReadOnlyList<string> Differences) Compare(Snapshot before, Snapshot after)
    {
        var differences = new List<string>();
        var beforeMap = before.Files.ToDictionary(f => f.RelativePath, StringComparer.OrdinalIgnoreCase);
        var afterMap = after.Files.ToDictionary(f => f.RelativePath, StringComparer.OrdinalIgnoreCase);

        foreach (var (path, b) in beforeMap)
        {
            if (!afterMap.TryGetValue(path, out var a))
            {
                differences.Add($"missing after run: {path}");
            }
            else if (a.Length != b.Length || a.LastWriteTimeUtc != b.LastWriteTimeUtc)
            {
                differences.Add(
                    $"changed: {path} (size {b.Length} -> {a.Length}, mtime {b.LastWriteTimeUtc:O} -> {a.LastWriteTimeUtc:O})");
            }
        }

        foreach (var path in afterMap.Keys.Where(p => !beforeMap.ContainsKey(p)))
            differences.Add($"new after run: {path}");

        return (differences.Count == 0, differences);
    }
}
